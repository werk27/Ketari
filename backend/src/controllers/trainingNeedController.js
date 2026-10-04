const mongoose = require('mongoose');
const TrainingNeed = require('../models/TrainingNeed');
const Employee = require('../models/Employee');
const Configuration = require('../models/Configuration');
const notificationService = require('../services/notificationService');
const { headedDepartments } = require('../services/departmentScope');
const { resolveActingForDelegators } = require('../services/delegationCapabilities');
const { CAPABILITIES, userCan } = require('../config/permissions');

/**
 * Training Need / personal interest request workflow.
 *
 * submitted -> (returned_for_correction <-> submitted, HR Expert review)
 *            -> validated -> program_created (an HR Expert prepared the
 *               actual Training Program from it - see
 *               trainingController.createTraining's `sourceNeed` handling)
 *
 * Mirrors the Job Requisition workflow's separation of duties and
 * department-head scoping, adapted for Training.
 */

const recordAudit = (need, action, userId, note = '') => {
    need.auditTrail.push({ action, by: userId, at: new Date(), note });
};

/** Load a training need and confirm the caller's organization owns it. */
const findScopedNeed = async (id, req) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return { error: { code: 404, message: 'Training need not found' } };
    }
    const need = await TrainingNeed.findById(id);
    if (!need) return { error: { code: 404, message: 'Training need not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    if (!need.employer || need.employer.toString() !== employerId) {
        return { error: { code: 403, message: 'This training need belongs to another organization' } };
    }

    return { need };
};

/** HR Expert/Manager/Employer see the whole organization's needs; everyone else sees only their own. */
const seesWholeOrganization = (user) => (
    userCan(user, CAPABILITIES.TRAINING_VIEW) || userCan(user, CAPABILITIES.TRAINING_RECORD)
);

/**
 * Validate the department against the organization's own Configuration -
 * never free text - mirroring requisitionController.resolveDepartmentAndPosition.
 */
const resolveDepartment = async (req, departmentId) => {
    const config = await Configuration.findOne({ employer: req.employerId });
    if (!config || !Array.isArray(config.departments) || config.departments.length === 0) {
        return { error: 'Your organization has no configured departments yet.' };
    }
    const department = config.departments.id(departmentId);
    if (!department) {
        return { error: 'Department must be one of your organization\'s configured departments.' };
    }
    if (department.status === 'inactive') {
        return { error: 'Department must be one of your organization\'s active departments.' };
    }
    return {
        department: department._id,
        departmentName: department.name,
        departmentManager: department.manager || null
    };
};

/**
 * Who may originate a department Training Need: the department's assigned
 * head, or their active delegate covering TRAINING_NEED_CREATE. Mirrors
 * requisitionController.resolveRequisitionAuthorization.
 */
const authorizeDepartmentNeed = async (req, departmentManagerId) => {
    if (!departmentManagerId) {
        return 'Only this department\'s assigned Department Head may raise a training need for it.';
    }
    if (departmentManagerId.toString() === req.user.id) return null;

    const actingFor = await resolveActingForDelegators(req.user, CAPABILITIES.TRAINING_NEED_CREATE);
    if (actingFor.includes(departmentManagerId.toString())) return null;

    return 'Only this department\'s assigned Department Head may raise a training need for it.';
};

// @desc    Raise a Training Need (Department Head) or personal Training
//          Interest request (any employee)
// @route   POST /api/training-needs
// @access  Private (training_need:create)
exports.createNeed = async (req, res) => {
    try {
        const { origin, department, title, trainingType, description, proposedParticipants, urgency, estimatedCost } = req.body;

        if (!['department', 'personal'].includes(origin)) {
            return res.status(400).json({ success: false, message: 'origin must be either "department" or "personal"' });
        }
        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'A title is required' });
        }
        const allowedTypes = ['technical', 'soft_skills', 'leadership', 'compliance', 'other'];
        if (!allowedTypes.includes(trainingType)) {
            return res.status(400).json({ success: false, message: `Training type must be one of: ${allowedTypes.join(', ')}` });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ success: false, message: 'A description/justification is required' });
        }

        let departmentId = null;
        let departmentName = '';

        if (origin === 'department') {
            if (!department) {
                return res.status(400).json({ success: false, message: 'Department is required for an organizational training need' });
            }
            const resolved = await resolveDepartment(req, department);
            if (resolved.error) {
                return res.status(400).json({ success: false, message: resolved.error });
            }
            const authError = await authorizeDepartmentNeed(req, resolved.departmentManager);
            if (authError) {
                return res.status(403).json({ success: false, message: authError });
            }
            departmentId = resolved.department;
            departmentName = resolved.departmentName;
        } else {
            // Personal interest request: department is a snapshot for
            // reporting context only, taken from the requester's own
            // employee record when available. Never an authorization check.
            const ownEmployee = await Employee.findOne({ user: req.user.id }).select('employmentInfo.department');
            if (ownEmployee && ownEmployee.employmentInfo && ownEmployee.employmentInfo.department) {
                const config = await Configuration.findOne({ employer: req.employerId }).select('departments');
                const dept = config && config.departments.id(ownEmployee.employmentInfo.department);
                if (dept) {
                    departmentId = dept._id;
                    departmentName = dept.name;
                }
            }
        }

        const need = new TrainingNeed({
            employer: req.employerId,
            origin,
            department: departmentId,
            departmentName,
            title: title.trim(),
            trainingType,
            description: description.trim(),
            proposedParticipants: Array.isArray(proposedParticipants) ? proposedParticipants : [],
            urgency: ['low', 'normal', 'high'].includes(urgency) ? urgency : 'normal',
            estimatedCost: estimatedCost !== undefined && estimatedCost !== null && estimatedCost !== '' ? Number(estimatedCost) : null,
            requestedBy: req.user.id,
            status: 'submitted'
        });

        recordAudit(need, 'submitted', req.user.id,
            origin === 'department' ? `Department training need submitted for ${departmentName}` : 'Personal training interest submitted');
        await need.save();

        await notificationService.notifyRoles({
            employer: req.employerId,
            roles: ['hr_expert'],
            type: 'training_assigned',
            title: origin === 'department' ? 'New training need awaiting review' : 'New personal training interest',
            message: `"${need.title}" needs to be reviewed.`,
            link: '/hr-expert/training'
        });

        res.status(201).json({ success: true, data: need });
    } catch (error) {
        console.error('Create Training Need Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(e => e.message)
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The organization's training needs, or (for a plain requester) their own
// @route   GET /api/training-needs
// @access  Private (training_need:view / training:view)
exports.getNeeds = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;

        if (!seesWholeOrganization(req.user)) {
            const departments = await headedDepartments(req.user, req.employerId, undefined, CAPABILITIES.TRAINING_NEED_CREATE);
            const departmentIds = departments.map(d => d._id.toString());

            query.$or = [
                { requestedBy: req.user.id },
                ...(departmentIds.length > 0 ? [{ origin: 'department', department: { $in: departmentIds } }] : [])
            ];
        }

        const needs = await TrainingNeed.find(query)
            .populate('requestedBy', 'name role')
            .populate('processedBy', 'name')
            .populate('proposedParticipants', 'employeeId personalInfo')
            .populate('linkedTraining', 'title status')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: needs.length, data: needs });
    } catch (error) {
        console.error('Get Training Needs Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    A single training need
// @route   GET /api/training-needs/:id
// @access  Private (training_need:view / training:view)
exports.getNeed = async (req, res) => {
    try {
        const { need, error } = await findScopedNeed(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (!seesWholeOrganization(req.user) && need.requestedBy.toString() !== req.user.id) {
            const isHead = await headedDepartments(req.user, req.employerId, undefined, CAPABILITIES.TRAINING_NEED_CREATE);
            const heads = isHead.some(d => need.department && d._id.toString() === need.department.toString());
            if (!heads) {
                return res.status(403).json({ success: false, message: 'You may not view this training need' });
            }
        }

        await need.populate('requestedBy', 'name role');
        await need.populate('processedBy', 'name');
        await need.populate('proposedParticipants', 'employeeId personalInfo');
        await need.populate('linkedTraining', 'title status');

        res.status(200).json({ success: true, data: need });
    } catch (error) {
        console.error('Get Training Need Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert validates a submitted training need
// @route   PUT /api/training-needs/:id/process
// @access  Private (HR Expert)
exports.processNeed = async (req, res) => {
    try {
        const { need, error } = await findScopedNeed(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (need.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted training need can be validated (current status: ${need.status})`
            });
        }

        need.status = 'validated';
        need.processedBy = req.user.id;
        need.processedAt = new Date();
        recordAudit(need, 'validated', req.user.id, req.body.note || 'Validated');
        await need.save();

        res.status(200).json({ success: true, message: 'Training need validated', data: need });
    } catch (error) {
        console.error('Process Training Need Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert returns an incomplete/incorrect training need for correction
// @route   PUT /api/training-needs/:id/return
// @access  Private (HR Expert)
exports.returnNeed = async (req, res) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, message: 'A note is required so the requester knows what to correct' });
        }

        const { need, error } = await findScopedNeed(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (need.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted training need can be returned (current status: ${need.status})`
            });
        }

        need.status = 'returned_for_correction';
        need.returnReason = note.trim();
        need.processedBy = req.user.id;
        need.processedAt = new Date();
        recordAudit(need, 'returned_for_correction', req.user.id, note.trim());
        await need.save();

        await notificationService.notify({
            user: need.requestedBy,
            employer: need.employer,
            type: 'training_returned',
            title: 'Training need needs correction',
            message: `Your training need "${need.title}" was sent back: ${note.trim()}`,
            link: need.origin === 'department' ? '/employee/training-needs' : '/employee/training'
        });

        res.status(200).json({ success: true, message: 'Training need returned to the requester', data: need });
    } catch (error) {
        console.error('Return Training Need Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Correct and resubmit a training need returned for correction
// @route   PUT /api/training-needs/:id/resubmit
// @access  Private (the requester)
exports.resubmitNeed = async (req, res) => {
    try {
        const { need, error } = await findScopedNeed(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (!need.requestedBy || need.requestedBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the requester can resubmit this training need' });
        }
        if (need.status !== 'returned_for_correction') {
            return res.status(400).json({
                success: false,
                message: `Only a training need returned for correction can be resubmitted (current status: ${need.status})`
            });
        }

        const editable = ['title', 'trainingType', 'description', 'proposedParticipants', 'urgency', 'estimatedCost'];
        editable.forEach(field => {
            if (req.body[field] !== undefined) need[field] = req.body[field];
        });

        need.status = 'submitted';
        need.returnReason = '';
        recordAudit(need, 'submitted', req.user.id, req.body.note || 'Corrected and resubmitted');
        await need.save();

        await notificationService.notifyRoles({
            employer: need.employer,
            roles: ['hr_expert'],
            type: 'training_assigned',
            title: 'Corrected training need resubmitted',
            message: `${req.user.name} corrected and resubmitted the training need "${need.title}".`,
            link: '/hr-expert/training'
        });

        res.status(200).json({ success: true, message: 'Resubmitted for HR Expert review', data: need });
    } catch (error) {
        console.error('Resubmit Training Need Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(e => e.message)
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
