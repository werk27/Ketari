const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const JobRequisition = require('../models/JobRequisition');
const Configuration = require('../models/Configuration');
const Job = require('../models/Job');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const { buildFieldsFromRequisition } = require('../services/requisitionSync');
const { headedDepartments } = require('../services/departmentScope');
const { CAPABILITIES, userCan } = require('../config/permissions');

/**
 * Job Requisition / Manpower Request workflow.
 *
 * draft -> submitted -> (returned <-> submitted, HR Expert review) -> pending_approval
 *        -> approved | rejected (HR Manager) -> job_created (vacancy created, see jobController)
 *
 * Separation of duties: an HR Manager may never approve/reject a requisition
 * it raised or processed itself (mirrors employeeRequestController).
 */

const ESSENTIAL_FIELDS = [
    'department', 'departmentName', 'position', 'positionTitle', 'numberOfPositions',
    'requestType', 'employmentType', 'level', 'education', 'experience',
    'skills', 'languages', 'licenses', 'responsibilities', 'competencies',
    'startDate', 'salary', 'reason'
];

const recordAudit = (requisition, action, userId, note = '') => {
    requisition.auditTrail.push({ action, by: userId, at: new Date(), note });
};

const requestValidationErrors = (req) => {
    const errors = validationResult(req);
    return errors.isEmpty() ? [] : errors.array();
};

/** Load a requisition and confirm the caller's organization owns it. */
const findScopedRequisition = async (id, req) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return { error: { code: 404, message: 'Requisition not found' } };
    }
    const requisition = await JobRequisition.findById(id);
    if (!requisition) return { error: { code: 404, message: 'Requisition not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    if (!requisition.employer || requisition.employer.toString() !== employerId) {
        return { error: { code: 403, message: 'This requisition belongs to another organization' } };
    }

    return { requisition };
};

/**
 * Whether the caller sees the organization's whole requisition pipeline, or
 * only the departments they head.
 *
 * HR Expert (process), HR Manager (approve) and the Employer (who owns the
 * organization and may raise for any department) work across the organization
 * - that is their job. Everyone else reaches this module solely as a
 * Department Head, and a Department Head has no business reading another
 * department's staffing plans, headcount or salaries.
 */
const seesWholeOrganization = (user) => (
    user.role === 'employer'
    || userCan(user, CAPABILITIES.REQUISITION_PROCESS)
    || userCan(user, CAPABILITIES.REQUISITION_APPROVE)
);

/**
 * The departments a department-head-only caller is limited to, or null when
 * they legitimately see everything. An empty array means "heads nothing", and
 * callers must treat that as "sees no requisitions at all" rather than "no
 * filter".
 */
const visibleDepartmentIds = async (req) => {
    if (seesWholeOrganization(req.user)) return null;
    const departments = await headedDepartments(req.user, req.employerId);
    return departments.map(d => d._id);
};

/**
 * Where a requisition notification should send its recipient.
 *
 * The workspace routes are role-prefixed, so a single hard-coded
 * '/hr-expert/requisitions' link 404s for the Department Head who raised the
 * requisition and for the Employer - the two people most likely to be told
 * about it.
 */
const requisitionLinkFor = (userId) => notificationService.linkForUser(userId, 'requisitions');

/**
 * Validate the department (and optional position) against the organization's
 * own Configuration - the department must never be free text, and can never
 * belong to another organization. Also surfaces the department's assigned
 * Department Head (see resolveRequisitionAuthorization below).
 */
const resolveDepartmentAndPosition = async (req, body) => {
    const config = await Configuration.findOne({ employer: req.employerId });
    if (!config || !Array.isArray(config.departments) || config.departments.length === 0) {
        return { error: 'Your organization has no configured departments yet. Add one in Configuration first.' };
    }

    const department = config.departments.id(body.department);
    if (!department) {
        return { error: 'Department must be one of your organization\'s configured departments.' };
    }
    if (department.status === 'inactive') {
        return { error: 'Department must be one of your organization\'s active departments.' };
    }

    let position = null;
    let positionTitle = (body.positionTitle || '').trim();
    if (body.position) {
        position = (config.positions || []).id(body.position);
        if (!position) {
            return { error: 'Position must be one of your organization\'s configured positions.' };
        }
        if (position.status === 'inactive') {
            return { error: 'Position must be one of the selected department\'s active positions.' };
        }
        if (String(position.department) !== String(department._id)) {
            return { error: 'Position must belong to the selected department.' };
        }
        positionTitle = position.title;
    }

    if (!positionTitle) {
        return { error: 'A position/job title is required.' };
    }

    return {
        department: department._id,
        departmentName: department.name,
        departmentManager: department.manager || null,
        position: position ? position._id : null,
        positionTitle
    };
};

/**
 * Who may originate a Job Requisition for a given department:
 *   - the Employer (org owner - can raise for any department)
 *   - the Department Head: the specific user assigned as that department's
 *     `manager` in Configuration (see configController's department validator)
 *
 * HR Expert is deliberately excluded here even though it holds broad
 * `requisition:create`-adjacent responsibilities elsewhere - its role is to
 * REVIEW a requisition someone else originated (requisition:process), never
 * to be both the requester and the reviewer of its own request.
 */
const resolveRequisitionAuthorization = (req, departmentManagerId) => {
    if (req.user.role === 'employer') return null;

    if (!departmentManagerId || departmentManagerId.toString() !== req.user.id) {
        return 'Only the Employer or this department\'s assigned Department Head may raise a requisition for it.';
    }

    return null;
};

// @desc    Raise a job requisition (draft, or submitted directly)
// @route   POST /api/requisitions
// @access  Private (Employer, or the Department Head of the target department)
exports.createRequisition = async (req, res) => {
    try {
        const validationErrors = requestValidationErrors(req);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: validationErrors.map(e => e.msg).join(', '),
                errors: validationErrors
            });
        }

        const {
            numberOfPositions, requestType, employmentType, level, education, experience,
            skills, languages, licenses, responsibilities, competencies, startDate,
            salary, reason, submitForApproval
        } = req.body;

        const resolved = await resolveDepartmentAndPosition(req, req.body);
        if (resolved.error) {
            return res.status(400).json({ success: false, message: resolved.error });
        }

        const authError = resolveRequisitionAuthorization(req, resolved.departmentManager);
        if (authError) {
            return res.status(403).json({ success: false, message: authError });
        }

        const allowedRequestTypes = ['new_position', 'replacement', 'additional_headcount'];
        if (!allowedRequestTypes.includes(requestType)) {
            return res.status(400).json({
                success: false,
                message: `Request type must be one of: ${allowedRequestTypes.join(', ')}`
            });
        }

        const allowedLevels = ['Beginner', 'Junior', 'Intermediate', 'Senior'];
        if (!allowedLevels.includes(level)) {
            return res.status(400).json({
                success: false,
                message: `Required level must be one of: ${allowedLevels.join(', ')}`
            });
        }

        const amount = Number(salary?.amount);
        if (!salary || !amount || Number.isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'A positive, fixed salary amount is required' });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'A reason/justification for hiring is required' });
        }

        const headcount = Number(numberOfPositions ?? 1);
        if (!Number.isInteger(headcount) || headcount < 1) {
            return res.status(400).json({
                success: false,
                message: 'Number of employees required must be at least 1'
            });
        }

        if (!startDate) {
            return res.status(400).json({ success: false, message: 'A required start date is required' });
        }

        const shouldSubmit = submitForApproval === true || req.body.action === 'submit';

        const requisition = new JobRequisition({
            employer: req.employerId,
            department: resolved.department,
            departmentName: resolved.departmentName,
            position: resolved.position,
            positionTitle: resolved.positionTitle,
            numberOfPositions: headcount,
            requestType,
            employmentType: employmentType || 'Full-Time',
            level,
            education: education || '',
            experience: experience || '',
            skills: skills || [],
            languages: languages || [],
            licenses: licenses || [],
            responsibilities: responsibilities || [],
            competencies: competencies || [],
            startDate,
            salary: { amount, currency: salary.currency || 'ETB', period: salary.period || 'monthly' },
            reason: reason.trim(),
            requestedBy: req.user.id,
            status: shouldSubmit ? 'submitted' : 'draft'
        });

        recordAudit(requisition, requisition.status, req.user.id, shouldSubmit ? 'Requisition submitted' : 'Draft created');
        await requisition.save();

        if (shouldSubmit) {
            await notificationService.notifyRoles({
                employer: req.employerId,
                roles: ['hr_expert'],
                type: 'requisition_submitted',
                title: 'New job requisition',
                message: `A requisition for ${requisition.numberOfPositions} × "${requisition.positionTitle}" (${requisition.departmentName}) needs review.`,
                link: '/hr-expert/requisitions'
            });
        }

        res.status(201).json({ success: true, data: requisition });
    } catch (error) {
        console.error('Create Requisition Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Invalid requisition data'
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The organization's job requisitions
// @route   GET /api/requisitions
// @access  Private (requisition:view)
exports.getRequisitions = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;
        if (req.query.department) query.department = req.query.department;

        // A Department Head reaches this module only through the department(s)
        // they head. Without this they saw every submitted requisition in the
        // organization - other departments' headcount plans, salaries and
        // justifications included.
        const departmentIds = await visibleDepartmentIds(req);
        if (departmentIds) {
            const allowed = req.query.department
                ? departmentIds.filter(id => String(id) === String(req.query.department))
                : departmentIds;
            query.department = { $in: allowed };
        }

        // An Employer/HR Expert who only raises requisitions does not need to
        // see other requesters' private drafts; everything past 'draft' is
        // organization-wide so HR can pick up the work.
        if (req.query.mine === 'true') {
            query.requestedBy = req.user.id;
        } else if (req.user.role !== 'hr_manager') {
            query.$or = [{ status: { $ne: 'draft' } }, { requestedBy: req.user.id }];
        }

        const requisitions = await JobRequisition.find(query)
            .populate('requestedBy', 'name email role')
            .populate('processedBy', 'name email')
            .populate('decidedBy', 'name email')
            .populate('linkedJob', 'title status')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: requisitions.length, data: requisitions });
    } catch (error) {
        console.error('Get Requisitions Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get a single requisition
// @route   GET /api/requisitions/:id
// @access  Private (requisition:view)
exports.getRequisition = async (req, res) => {
    try {
        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        // Same department boundary as the list: knowing an id must not reveal
        // a requisition the list would never have shown.
        const departmentIds = await visibleDepartmentIds(req);
        if (departmentIds && !departmentIds.some(id => String(id) === String(requisition.department))) {
            return res.status(403).json({
                success: false,
                message: 'This requisition belongs to a department you do not head'
            });
        }

        await requisition.populate([
            { path: 'requestedBy', select: 'name email role' },
            { path: 'processedBy', select: 'name email' },
            { path: 'decidedBy', select: 'name email' },
            { path: 'linkedJob', select: 'title status' },
            { path: 'auditTrail.by', select: 'name email role' }
        ]);

        res.status(200).json({ success: true, data: requisition });
    } catch (error) {
        console.error('Get Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Edit a requisition (draft/returned/rejected only, by its requester)
// @route   PUT /api/requisitions/:id
// @access  Private (Employer, HR Expert - the requester)
exports.updateRequisition = async (req, res) => {
    try {
        const validationErrors = requestValidationErrors(req);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: validationErrors.map(e => e.msg).join(', '),
                errors: validationErrors
            });
        }

        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.requestedBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the requester can edit this requisition' });
        }

        if (!['draft', 'returned', 'rejected'].includes(requisition.status)) {
            return res.status(400).json({
                success: false,
                message: `A requisition with status "${requisition.status}" can no longer be edited directly. `
                    + 'Approved requisitions require the amendment workflow.'
            });
        }

        if (req.body.department || req.body.position) {
            const resolved = await resolveDepartmentAndPosition(req, { ...requisition.toObject(), ...req.body });
            if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });

            // Re-check authorization if the department is actually changing -
            // a Department Head may edit their own draft, but never reassign
            // it to a department they do not head.
            if (String(resolved.department) !== String(requisition.department)) {
                const authError = resolveRequisitionAuthorization(req, resolved.departmentManager);
                if (authError) return res.status(403).json({ success: false, message: authError });
            }

            requisition.department = resolved.department;
            requisition.departmentName = resolved.departmentName;
            requisition.position = resolved.position;
            requisition.positionTitle = resolved.positionTitle;
        }

        const editable = ESSENTIAL_FIELDS.filter(f => !['department', 'departmentName', 'position', 'positionTitle'].includes(f));
        editable.forEach(field => {
            if (req.body[field] !== undefined) requisition[field] = req.body[field];
        });

        const wasReturnedOrRejected = ['returned', 'rejected'].includes(requisition.status);
        if (wasReturnedOrRejected) {
            requisition.status = 'draft';
            requisition.returnReason = '';
            requisition.rejectionReason = '';
            recordAudit(requisition, 'draft', req.user.id, 'Edited after feedback; back to draft for resubmission');
        } else {
            recordAudit(requisition, 'draft', req.user.id, 'Draft updated');
        }

        await requisition.save();
        res.status(200).json({ success: true, data: requisition });
    } catch (error) {
        console.error('Update Requisition Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Invalid requisition data'
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Submit a draft/returned/rejected requisition for HR review
// @route   PUT /api/requisitions/:id/submit
// @access  Private (the requester)
exports.submitRequisition = async (req, res) => {
    try {
        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.requestedBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the requester can submit this requisition' });
        }

        if (!['draft', 'returned', 'rejected'].includes(requisition.status)) {
            return res.status(400).json({
                success: false,
                message: `Only a draft, returned or rejected requisition can be submitted (current status: ${requisition.status})`
            });
        }

        requisition.status = 'submitted';
        requisition.returnReason = '';
        requisition.rejectionReason = '';
        recordAudit(requisition, 'submitted', req.user.id, 'Submitted for HR review');
        await requisition.save();

        await notificationService.notifyRoles({
            employer: requisition.employer,
            roles: ['hr_expert'],
            type: 'requisition_submitted',
            title: 'New job requisition',
            message: `A requisition for ${requisition.numberOfPositions} × "${requisition.positionTitle}" (${requisition.departmentName}) needs review.`,
            link: '/hr-expert/requisitions'
        });

        res.status(200).json({ success: true, message: 'Requisition submitted for HR review', data: requisition });
    } catch (error) {
        console.error('Submit Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Return a submitted requisition to the requester for correction
// @route   PUT /api/requisitions/:id/return
// @access  Private (HR Expert)
exports.returnRequisition = async (req, res) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, message: 'A note is required so the requester knows what to correct' });
        }

        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted requisition can be returned (current status: ${requisition.status})`
            });
        }

        requisition.status = 'returned';
        requisition.returnReason = note.trim();
        requisition.processedBy = req.user.id;
        requisition.processedAt = new Date();
        recordAudit(requisition, 'returned', req.user.id, note.trim());
        await requisition.save();

        await notificationService.notify({
            user: requisition.requestedBy,
            employer: requisition.employer,
            type: 'requisition_returned',
            title: 'Requisition needs correction',
            message: `Your requisition for "${requisition.positionTitle}" was returned: ${note.trim()}`,
            link: await requisitionLinkFor(requisition.requestedBy)
        });

        res.status(200).json({ success: true, message: 'Requisition returned to the requester', data: requisition });
    } catch (error) {
        console.error('Return Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Answer an HR request for clarification on a returned requisition
// @route   PUT /api/requisitions/:id/clarify
// @access  Private (the requester - typically the Department Head)
//
// HR returning a requisition asks a question; before this the only way to
// answer was to edit the requisition back into a draft and resubmit it, which
// buried the answer and made a wording query look like a change of
// requirements. This records the reply on the audit trail and hands the
// requisition straight back to HR Expert review - the same next step as a
// resubmission, so the workflow is answered rather than bypassed.
exports.respondToClarification = async (req, res) => {
    try {
        const validationErrors = requestValidationErrors(req);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: validationErrors.map(e => e.msg).join(', '),
                errors: validationErrors
            });
        }

        const { response } = req.body;
        if (!response || !response.trim()) {
            return res.status(400).json({ success: false, message: 'Please write a response for HR' });
        }

        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.requestedBy.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Only the requester can respond to this clarification'
            });
        }

        if (requisition.status !== 'returned') {
            return res.status(400).json({
                success: false,
                message: `Only a returned requisition is awaiting clarification (current status: ${requisition.status})`
            });
        }

        requisition.status = 'submitted';
        requisition.returnReason = '';
        recordAudit(requisition, 'submitted', req.user.id, `Clarification: ${response.trim()}`);
        await requisition.save();

        await notificationService.notifyRoles({
            employer: requisition.employer,
            roles: ['hr_expert'],
            type: 'requisition_submitted',
            title: 'Clarification received',
            message: `The requester answered your query on "${requisition.positionTitle}" (${requisition.departmentName}): ${response.trim()}`,
            link: '/hr-expert/requisitions'
        });

        res.status(200).json({
            success: true,
            message: 'Your response was sent back to HR for review',
            data: requisition
        });
    } catch (error) {
        console.error('Respond To Clarification Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Prepare a reviewed requisition and forward it to HR Manager for approval
// @route   PUT /api/requisitions/:id/prepare
// @access  Private (HR Expert)
exports.prepareRequisition = async (req, res) => {
    try {
        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted requisition can be forwarded for approval (current status: ${requisition.status})`
            });
        }

        requisition.status = 'pending_approval';
        requisition.processedBy = req.user.id;
        requisition.processedAt = new Date();
        recordAudit(requisition, 'pending_approval', req.user.id, req.body.note || 'Reviewed and forwarded for approval');
        await requisition.save();

        await notificationService.notifyRoles({
            employer: requisition.employer,
            roles: ['hr_manager'],
            type: 'requisition_pending_approval',
            title: 'Requisition awaiting approval',
            message: `A requisition for "${requisition.positionTitle}" (${requisition.departmentName}) was forwarded for your approval.`,
            link: '/hr-manager/requisitions'
        });

        res.status(200).json({ success: true, message: 'Requisition forwarded for HR Manager approval', data: requisition });
    } catch (error) {
        console.error('Prepare Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve or reject a requisition
// @route   PUT /api/requisitions/:id/decision
// @access  Private (HR Manager)
exports.decideRequisition = async (req, res) => {
    try {
        const { outcome, reason } = req.body;

        if (!['approved', 'rejected'].includes(outcome)) {
            return res.status(400).json({ success: false, message: 'Outcome must be either approved or rejected' });
        }
        if (outcome === 'rejected' && (!reason || !reason.trim())) {
            return res.status(400).json({ success: false, message: 'A reason is required when rejecting a requisition' });
        }

        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (requisition.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: `Only a requisition pending approval can be decided (current status: ${requisition.status})`
            });
        }

        // Separation of duties: never decide on a requisition you raised or processed yourself.
        if (requisition.requestedBy.toString() === req.user.id) {
            return res.status(403).json({ success: false, message: 'You cannot decide on your own requisition' });
        }
        if (requisition.processedBy && requisition.processedBy.toString() === req.user.id) {
            return res.status(403).json({ success: false, message: 'You cannot approve a requisition you processed yourself' });
        }

        requisition.status = outcome;
        requisition.decidedBy = req.user.id;
        requisition.decidedAt = new Date();
        requisition.rejectionReason = outcome === 'rejected' ? reason.trim() : '';
        recordAudit(requisition, outcome, req.user.id, reason || `Requisition ${outcome}`);
        await requisition.save();

        // Re-approving an amendment to a requisition that already created a
        // vacancy: sync the essential fields into that vacancy now, rather
        // than leaving it silently out of date. Its publication status
        // (draft/published/...) is left untouched.
        if (outcome === 'approved' && requisition.linkedJob) {
            const linkedJob = await Job.findById(requisition.linkedJob);
            if (linkedJob) {
                const fields = buildFieldsFromRequisition(requisition);
                const existingRequirements = linkedJob.requirements?.toObject
                    ? linkedJob.requirements.toObject()
                    : (linkedJob.requirements || {});
                Object.assign(linkedJob, fields, {
                    requirements: { ...existingRequirements, ...fields.requirements }
                });
                linkedJob.statusHistory.push({
                    status: linkedJob.status,
                    changedBy: req.user.id,
                    changedAt: new Date(),
                    note: 'Essential fields synced from a re-approved requisition amendment'
                });
                await linkedJob.save();
            }
            requisition.status = 'job_created';
            await requisition.save();
        }

        const notifyTarget = requisition.processedBy || requisition.requestedBy;
        await notificationService.notify({
            user: notifyTarget,
            employer: requisition.employer,
            type: outcome === 'approved' ? 'requisition_approved' : 'requisition_rejected',
            title: outcome === 'approved' ? 'Requisition approved' : 'Requisition rejected',
            message: outcome === 'approved'
                ? `The requisition for "${requisition.positionTitle}" was approved. A vacancy can now be created from it.`
                : `The requisition for "${requisition.positionTitle}" was rejected.${reason ? ` Reason: ${reason.trim()}` : ''}`,
            link: await requisitionLinkFor(notifyTarget)
        });
        if (requisition.requestedBy.toString() !== String(notifyTarget)) {
            await notificationService.notify({
                user: requisition.requestedBy,
                employer: requisition.employer,
                type: outcome === 'approved' ? 'requisition_approved' : 'requisition_rejected',
                title: outcome === 'approved' ? 'Requisition approved' : 'Requisition rejected',
                message: outcome === 'approved'
                    ? `Your requisition for "${requisition.positionTitle}" was approved.`
                    : `Your requisition for "${requisition.positionTitle}" was rejected.${reason ? ` Reason: ${reason.trim()}` : ''}`,
                link: await requisitionLinkFor(requisition.requestedBy)
            });
        }

        res.status(200).json({
            success: true,
            message: outcome === 'approved' ? 'Requisition approved' : 'Requisition rejected',
            data: requisition
        });
    } catch (error) {
        console.error('Decide Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Request an amendment to an approved requisition's essential requirements
// @route   PUT /api/requisitions/:id/amend
// @access  Private (HR Expert)
exports.amendRequisition = async (req, res) => {
    try {
        const validationErrors = requestValidationErrors(req);
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                message: validationErrors.map(e => e.msg).join(', '),
                errors: validationErrors
            });
        }

        const { requisition, error } = await findScopedRequisition(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (!['approved', 'job_created'].includes(requisition.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only an approved requisition (or one already used to create a job) can be amended'
            });
        }

        if (req.body.department || req.body.position) {
            const resolved = await resolveDepartmentAndPosition(req, { ...requisition.toObject(), ...req.body });
            if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });
            requisition.department = resolved.department;
            requisition.departmentName = resolved.departmentName;
            requisition.position = resolved.position;
            requisition.positionTitle = resolved.positionTitle;
        }

        const editable = ESSENTIAL_FIELDS.filter(f => !['department', 'departmentName', 'position', 'positionTitle'].includes(f));
        editable.forEach(field => {
            if (req.body[field] !== undefined) requisition[field] = req.body[field];
        });

        const wasJobCreated = requisition.status === 'job_created';
        requisition.status = 'pending_approval';
        requisition.decidedBy = null;
        requisition.decidedAt = null;
        requisition.rejectionReason = '';
        recordAudit(
            requisition,
            'pending_approval',
            req.user.id,
            req.body.note || (wasJobCreated
                ? 'Amendment requested for an already-created vacancy; re-approval required before the vacancy updates'
                : 'Amendment requested; re-approval required')
        );
        await requisition.save();

        await notificationService.notifyRoles({
            employer: requisition.employer,
            roles: ['hr_manager'],
            type: 'requisition_pending_approval',
            title: 'Requisition amendment awaiting approval',
            message: `An amendment to "${requisition.positionTitle}" (${requisition.departmentName}) needs your approval.`,
            link: '/hr-manager/requisitions'
        });

        res.status(200).json({ success: true, message: 'Amendment submitted for re-approval', data: requisition });
    } catch (error) {
        console.error('Amend Requisition Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports.ESSENTIAL_FIELDS = ESSENTIAL_FIELDS;
