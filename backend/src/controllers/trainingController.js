const Training = require('../models/Training');
const TrainingNeed = require('../models/TrainingNeed');
const Employee = require('../models/Employee');
const notificationService = require('../services/notificationService');
const { headedDepartments } = require('../services/departmentScope');
const { CAPABILITIES } = require('../config/permissions');

// A programme at or above this estimated cost needs the Employer's sign-off
// after the HR Manager approves it, on top of an explicit `isStrategic` flag
// an HR Expert can set regardless of cost. Never a mandatory step otherwise.
const EMPLOYER_APPROVAL_COST_THRESHOLD = Number(process.env.TRAINING_EMPLOYER_APPROVAL_THRESHOLD) || 50000;

/**
 * Training management.
 *
 * Lifecycle:
 *   proposed (HR Expert)
 *     -> HR Expert reviews: returned_for_correction (Send Back, with a
 *        mandatory reason - the Expert's only corrective action) OR forwards
 *        (pending_approval)
 *     -> HR Manager decides: approved | rejected (rejection requires a reason)
 *        - if requiresEmployerApproval, "approved" first passes through
 *          pending_employer_approval instead of unlocking directly (see
 *          trainingController.decideTraining / decideTrainingEmployer)
 *     -> open -> in_progress -> completed
 *
 * Mirrors the Leave / Employee Request / Job Requisition workflows: a
 * terminal reject is reserved for the HR Manager, and nobody may decide on
 * (or forward for decision) a proposal they are personally responsible for
 * raising or reviewing themselves. All records are scoped to the
 * organization that owns them.
 */

const pushHistory = (training, status, userId, note = '') => {
    training.history.push({ status, changedBy: userId, changedAt: new Date(), note });
};

/** Load a training programme and confirm the caller's organization owns it. */
const findScopedTraining = async (trainingId, req) => {
    const training = await Training.findById(trainingId);
    if (!training) return { error: { code: 404, message: 'Training not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const recordEmployerId = training.employer ? training.employer.toString() : null;

    if (!recordEmployerId || recordEmployerId !== employerId) {
        return { error: { code: 403, message: 'This training belongs to another organization' } };
    }

    return { training };
};

// @desc    Propose a training programme, optionally prepared from a
//          validated Training Need (see req.body.sourceNeed)
// @route   POST /api/training
// @access  Private (HR Expert)
exports.createTraining = async (req, res) => {
    try {
        const {
            status: _ignored, employer: _ignoredEmployer, sourceNeed, department: _ignoredDept,
            departmentName: _ignoredDeptName, estimatedCost, isStrategic, ...safeBody
        } = req.body;

        let need = null;
        let department = null;
        let departmentName = '';

        if (sourceNeed) {
            need = await TrainingNeed.findById(sourceNeed);
            if (!need || !need.employer || need.employer.toString() !== req.employerId.toString()) {
                return res.status(404).json({ success: false, message: 'Training need not found' });
            }
            if (need.status !== 'validated') {
                return res.status(400).json({
                    success: false,
                    message: `Only a validated training need can be prepared into a programme (current status: ${need.status})`
                });
            }
            department = need.department;
            departmentName = need.departmentName;
        }

        const cost = estimatedCost !== undefined && estimatedCost !== null && estimatedCost !== ''
            ? Number(estimatedCost) : (need ? need.estimatedCost : null);
        const requiresEmployerApproval = !!isStrategic || (typeof cost === 'number' && cost >= EMPLOYER_APPROVAL_COST_THRESHOLD);

        const training = await Training.create({
            ...safeBody,
            employer: req.employerId,
            department,
            departmentName,
            sourceNeed: need ? need._id : null,
            estimatedCost: cost,
            isStrategic: !!isStrategic,
            requiresEmployerApproval,
            proposedBy: req.user.id,
            // A new programme always starts as a proposal awaiting HR Expert
            // review - it is not yet ready for the HR Manager to see.
            status: 'proposed'
        });
        pushHistory(training, 'proposed', req.user.id,
            need ? `Training prepared from validated need "${need.title}"` : 'Training proposed');
        await training.save();

        if (need) {
            need.status = 'program_created';
            need.linkedTraining = training._id;
            need.auditTrail.push({
                action: 'program_created', by: req.user.id, at: new Date(),
                note: `Training Program "${training.title}" prepared from this need`
            });
            await need.save();
        }

        await notificationService.notifyRoles({
            employer: req.employerId,
            roles: ['hr_expert'],
            type: 'training_assigned',
            title: 'New training proposal awaiting review',
            message: `"${training.title}" needs to be reviewed and forwarded for approval.`,
            link: '/hr-expert/training'
        });

        res.status(201).json({ success: true, data: training });
    } catch (error) {
        console.error('Create Training Error:', error);
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

// @desc    The organization's training programmes
// @route   GET /api/training
// @access  Private (organization members)
exports.getTrainings = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;

        const trainings = await Training.find(query)
            .populate('participants.employee', 'employeeId personalInfo')
            .populate('proposedBy', 'name')
            .populate('approvedBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: trainings.length, data: trainings });
    } catch (error) {
        console.error('Get Trainings Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Training programmes the signed-in user takes part in
// @route   GET /api/training/me
// @access  Private
exports.getMyTrainings = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) return res.status(200).json({ success: true, data: [] });

        const trainings = await Training.find({ 'participants.employee': employee._id })
            .sort({ startDate: -1 });

        // Surface only this employee's own participation record.
        const data = trainings.map(training => {
            const participation = training.participants
                .find(p => p.employee.toString() === employee._id.toString());
            return {
                _id: training._id,
                title: training.title,
                type: training.type,
                startDate: training.startDate,
                endDate: training.endDate,
                location: training.location,
                status: training.status,
                participation
            };
        });

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get My Trainings Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert reviews and forwards a proposal for HR Manager approval
// @route   PUT /api/training/:id/process
// @access  Private (HR Expert)
exports.processTraining = async (req, res) => {
    try {
        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (training.status !== 'proposed') {
            return res.status(400).json({
                success: false,
                message: `Only a proposed training can be forwarded for approval (current status: ${training.status})`
            });
        }

        training.status = 'pending_approval';
        training.processedBy = req.user.id;
        training.processedAt = new Date();
        pushHistory(training, 'pending_approval', req.user.id, req.body.note || 'Reviewed and forwarded for approval');
        await training.save();

        await notificationService.notifyRoles({
            employer: training.employer,
            roles: ['hr_manager'],
            type: 'training_assigned',
            title: 'Training Approval Required',
            message: `"${training.title}"${training.departmentName ? ` (${training.departmentName})` : ''} was prepared by `
                + `${req.user.name} and needs your approval.`,
            link: '/hr-manager/training'
        });

        res.status(200).json({ success: true, message: 'Training forwarded for HR Manager approval', data: training });
    } catch (error) {
        console.error('Process Training Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Send a proposed training programme back to the proposer for
//          correction ("Send Back") - the HR Expert's only corrective
//          action; a terminal reject is reserved for the HR Manager.
// @route   PUT /api/training/:id/return
// @access  Private (HR Expert)
exports.returnTraining = async (req, res) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({
                success: false,
                message: 'A note is required so the proposer knows what to correct'
            });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (training.status !== 'proposed') {
            return res.status(400).json({
                success: false,
                message: `Only a proposed training can be returned (current status: ${training.status})`
            });
        }

        training.status = 'returned_for_correction';
        training.returnReason = note.trim();
        training.processedBy = req.user.id;
        training.processedAt = new Date();
        pushHistory(training, 'returned_for_correction', req.user.id, note.trim());
        await training.save();

        if (training.proposedBy) {
            await notificationService.notify({
                user: training.proposedBy,
                employer: training.employer,
                type: 'training_returned',
                title: 'Training proposal needs correction',
                message: `Your proposal "${training.title}" was sent back: ${note.trim()}`,
                link: '/hr-expert/training'
            });
        }

        res.status(200).json({ success: true, message: 'Training returned to the proposer', data: training });
    } catch (error) {
        console.error('Return Training Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Correct and resubmit a training proposal returned for correction
// @route   PUT /api/training/:id/resubmit
// @access  Private (the proposer)
exports.resubmitTraining = async (req, res) => {
    try {
        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // Identity-bound on purpose: only the person who proposed it may
        // correct and resubmit it, mirroring Leave/EmployeeRequest.
        if (!training.proposedBy || training.proposedBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the proposer can resubmit this training programme' });
        }

        if (training.status !== 'returned_for_correction') {
            return res.status(400).json({
                success: false,
                message: `Only a training returned for correction can be resubmitted (current status: ${training.status})`
            });
        }

        const editable = [
            'title', 'type', 'description', 'duration', 'durationUnit', 'startDate', 'endDate',
            'provider', 'trainer', 'location', 'maxParticipants', 'targetSkills'
        ];
        editable.forEach(field => {
            if (req.body[field] !== undefined) training[field] = req.body[field];
        });

        training.status = 'proposed';
        training.returnReason = '';
        pushHistory(training, 'proposed', req.user.id, req.body.note || 'Corrected and resubmitted');
        await training.save();

        await notificationService.notifyRoles({
            employer: training.employer,
            roles: ['hr_expert'],
            type: 'training_assigned',
            title: 'Corrected training proposal resubmitted',
            message: `${req.user.name} corrected and resubmitted the proposal "${training.title}".`,
            link: '/hr-expert/training'
        });

        res.status(200).json({ success: true, message: 'Resubmitted for HR Expert review', data: training });
    } catch (error) {
        console.error('Resubmit Training Error:', error);
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

// @desc    Approve or reject a training programme forwarded for approval
// @route   PUT /api/training/:id/decision
// @access  Private (HR Manager)
exports.decideTraining = async (req, res) => {
    try {
        const { outcome, reason } = req.body;

        if (!['approved', 'rejected'].includes(outcome)) {
            return res.status(400).json({
                success: false,
                message: 'Outcome must be either approved or rejected'
            });
        }
        if (outcome === 'rejected' && (!reason || !reason.trim())) {
            return res.status(400).json({
                success: false,
                message: 'A reason is required when rejecting a training proposal'
            });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (training.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: `Only a training forwarded for approval can be decided (current status: ${training.status})`
            });
        }

        // Separation of duties: neither the proposer nor whoever reviewed
        // and forwarded it may be the one who decides on it.
        if (training.proposedBy && training.proposedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve a training programme you proposed yourself'
            });
        }
        if (training.processedBy && training.processedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve a training programme you reviewed yourself'
            });
        }

        training.status = outcome === 'approved' ? 'approved' : 'rejected';
        training.approvedBy = req.user.id;
        training.approvedAt = new Date();
        training.decisionReason = reason || '';

        // A high-cost or explicitly strategic programme needs the Employer's
        // sign-off on top of the HR Manager's - it is not yet fully
        // "approved" (i.e. schedulable) until that happens. Rejection is
        // still terminal here; there is nothing further to approve.
        if (outcome === 'approved' && training.requiresEmployerApproval) {
            training.status = 'pending_employer_approval';
        }

        pushHistory(training, training.status, req.user.id, reason || `Training ${outcome}`);
        await training.save();

        const notifyTarget = training.processedBy || training.proposedBy;
        if (notifyTarget) {
            const awaitingEmployer = training.status === 'pending_employer_approval';
            await notificationService.notify({
                user: notifyTarget,
                employer: training.employer,
                type: 'training_decision',
                title: awaitingEmployer ? 'Training approved by HR Manager' : (outcome === 'approved' ? 'Training approved' : 'Training rejected'),
                message: outcome === 'approved'
                    ? (awaitingEmployer
                        ? `"${training.title}" was approved by the HR Manager and now needs the Employer's sign-off before it can open.`
                        : `"${training.title}" was approved and can now be opened for registration.`)
                    : `"${training.title}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
                link: '/hr-expert/training'
            });
        }

        if (training.status === 'pending_employer_approval') {
            await notificationService.notifyRoles({
                employer: training.employer,
                roles: ['employer'],
                type: 'training_assigned',
                title: 'Training programme awaiting your approval',
                message: `"${training.title}" was approved by the HR Manager and needs your sign-off (estimated cost/strategic threshold).`,
                link: '/employer/training'
            });
        }

        res.status(200).json({ success: true, message: `Training ${outcome}`, data: training });
    } catch (error) {
        console.error('Decide Training Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Employer's final sign-off on a training programme whose cost or
//          strategic flag crossed the organization's threshold
// @route   PUT /api/training/:id/employer-decision
// @access  Private (Employer)
exports.decideTrainingEmployer = async (req, res) => {
    try {
        const { outcome, reason } = req.body;

        if (!['approved', 'rejected'].includes(outcome)) {
            return res.status(400).json({ success: false, message: 'Outcome must be either approved or rejected' });
        }
        if (outcome === 'rejected' && (!reason || !reason.trim())) {
            return res.status(400).json({ success: false, message: 'A reason is required when rejecting a training proposal' });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (training.status !== 'pending_employer_approval') {
            return res.status(400).json({
                success: false,
                message: `Only a training awaiting Employer approval can be decided here (current status: ${training.status})`
            });
        }

        training.status = outcome === 'approved' ? 'approved' : 'rejected';
        training.employerDecisionBy = req.user.id;
        training.employerDecisionAt = new Date();
        training.employerDecisionReason = reason || '';
        pushHistory(training, training.status, req.user.id, reason || `Employer ${outcome} the training`);
        await training.save();

        const notifyTarget = training.processedBy || training.proposedBy;
        if (notifyTarget) {
            await notificationService.notify({
                user: notifyTarget,
                employer: training.employer,
                type: 'training_decision',
                title: outcome === 'approved' ? 'Training approved by Employer' : 'Training rejected by Employer',
                message: outcome === 'approved'
                    ? `"${training.title}" received Employer sign-off and can now be opened for registration.`
                    : `"${training.title}" was rejected by the Employer.${reason ? ` Reason: ${reason}` : ''}`,
                link: '/hr-expert/training'
            });
        }

        res.status(200).json({ success: true, message: `Training ${outcome}`, data: training });
    } catch (error) {
        console.error('Decide Training Employer Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Open an approved training for registration / move it through its lifecycle
// @route   PUT /api/training/:id/status
// @access  Private (HR Expert)
exports.updateTrainingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['open', 'in_progress', 'completed', 'cancelled'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(', ')}`
            });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // Scheduling may only begin once a manager has approved the programme.
        if (status === 'open' && training.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Training must be approved by an HR Manager before it opens for registration'
            });
        }

        training.status = status;
        pushHistory(training, status, req.user.id, req.body.note || `Status updated to ${status}`);
        await training.save();

        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Update Training Status Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Register the signed-in user for a training programme
// @route   POST /api/training/:id/register
// @access  Private
exports.registerTraining = async (req, res) => {
    try {
        const training = await Training.findById(req.params.id);
        if (!training) {
            return res.status(404).json({ success: false, message: 'Training not found' });
        }

        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) {
            return res.status(404).json({ success: false, message: 'No employee record found for your account' });
        }

        // Registration never crosses an organization boundary.
        if (!training.employer || !employee.employer
            || training.employer.toString() !== employee.employer.toString()) {
            return res.status(403).json({
                success: false,
                message: 'This training belongs to another organization'
            });
        }

        if (training.status !== 'open') {
            return res.status(400).json({
                success: false,
                message: `This training is not open for registration (status: ${training.status})`
            });
        }

        if (training.participants.some(p => p.employee.toString() === employee._id.toString())) {
            return res.status(400).json({ success: false, message: 'Already registered' });
        }

        if (training.maxParticipants && training.participants.length >= training.maxParticipants) {
            return res.status(400).json({ success: false, message: 'This training is fully booked' });
        }

        training.participants.push({ employee: employee._id });
        await training.save();

        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Register Training Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Record participation outcome and evaluation
// @route   PUT /api/training/:id/participants/:employeeId
// @access  Private (HR Expert)
exports.evaluateParticipant = async (req, res) => {
    try {
        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const participant = training.participants
            .find(p => p.employee.toString() === req.params.employeeId);

        if (!participant) {
            return res.status(404).json({ success: false, message: 'Participant not found on this training' });
        }

        const { completed, rating, comment, certificate } = req.body;

        if (completed !== undefined) {
            participant.completed = completed;
            participant.completionDate = completed ? new Date() : null;
        }
        if (certificate !== undefined) participant.certificate = certificate;
        if (rating !== undefined || comment !== undefined) {
            participant.feedback = {
                rating: rating !== undefined ? rating : participant.feedback?.rating,
                comment: comment !== undefined ? comment : participant.feedback?.comment
            };
        }

        await training.save();

        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Evaluate Participant Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/** Employees under one of the given department ids, for capacity/eligibility checks. */
const employeesInDepartments = (departmentIds) => Employee.find({
    'employmentInfo.department': { $in: departmentIds }
}).select('_id employer');

// @desc    Department Head nominates one of their own department's
//          employees as a participant on an already-approved programme
// @route   PUT /api/training/:id/nominate
// @access  Private (Department Head)
exports.nominateParticipant = async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'employeeId is required' });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!['approved', 'open'].includes(training.status)) {
            return res.status(400).json({
                success: false,
                message: 'Participants may only be nominated once the programme is approved'
            });
        }

        const employee = await Employee.findById(employeeId).select('employer employmentInfo.department');
        if (!employee || !employee.employer || employee.employer.toString() !== req.employerId.toString()) {
            return res.status(404).json({ success: false, message: 'Employee not found in your organization' });
        }

        const departments = await headedDepartments(req.user, req.employerId, undefined, CAPABILITIES.TRAINING_NOMINATE);
        const heads = employee.employmentInfo && employee.employmentInfo.department
            && departments.some(d => d._id.toString() === employee.employmentInfo.department.toString());
        if (!heads) {
            return res.status(403).json({
                success: false,
                message: 'You may only nominate employees from a department you head'
            });
        }

        if (training.participants.some(p => p.employee.toString() === employeeId)) {
            return res.status(400).json({ success: false, message: 'Already a participant' });
        }
        if (training.maxParticipants && training.participants.length >= training.maxParticipants) {
            return res.status(400).json({ success: false, message: 'This training is fully booked' });
        }

        training.participants.push({ employee: employeeId, nominatedBy: req.user.id });
        await training.save();

        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Nominate Participant Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert directly adds a participant (verifies eligibility and
//          finalizes the list, on top of self-registration/nomination)
// @route   POST /api/training/:id/participants
// @access  Private (HR Expert)
exports.addParticipant = async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'employeeId is required' });
        }

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!['approved', 'open'].includes(training.status)) {
            return res.status(400).json({
                success: false,
                message: 'Participants may only be added once the programme is approved'
            });
        }

        const employee = await Employee.findById(employeeId).select('employer');
        if (!employee || !employee.employer || employee.employer.toString() !== req.employerId.toString()) {
            return res.status(404).json({ success: false, message: 'Employee not found in your organization' });
        }

        if (training.participants.some(p => p.employee.toString() === employeeId)) {
            return res.status(400).json({ success: false, message: 'Already a participant' });
        }
        if (training.maxParticipants && training.participants.length >= training.maxParticipants) {
            return res.status(400).json({ success: false, message: 'This training is fully booked' });
        }

        training.participants.push({ employee: employeeId, nominatedBy: req.user.id });
        await training.save();

        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Add Participant Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert removes a participant (correcting eligibility before
//          the training starts)
// @route   DELETE /api/training/:id/participants/:employeeId
// @access  Private (HR Expert)
exports.removeParticipant = async (req, res) => {
    try {
        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const before = training.participants.length;
        training.participants = training.participants
            .filter(p => p.employee.toString() !== req.params.employeeId);

        if (training.participants.length === before) {
            return res.status(404).json({ success: false, message: 'Participant not found on this training' });
        }

        await training.save();
        res.status(200).json({ success: true, data: training });
    } catch (error) {
        console.error('Remove Participant Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Open training programmes the signed-in employee can self-register
//          for (not already joined) - the "browse" list, separate from
//          /training/me's own participation history.
// @route   GET /api/training/available
// @access  Private (training:participate)
exports.getAvailableTrainings = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id }).select('_id employer');
        if (!employee || !employee.employer) return res.status(200).json({ success: true, data: [] });

        const trainings = await Training.find({
            employer: employee.employer,
            status: 'open',
            'participants.employee': { $ne: employee._id }
        })
            .select('title type description duration durationUnit startDate endDate location provider maxParticipants participants')
            .sort({ startDate: 1 });

        const data = trainings
            .filter(t => !t.maxParticipants || t.participants.length < t.maxParticipants)
            .map(t => ({
                _id: t._id, title: t.title, type: t.type, description: t.description,
                duration: t.duration, durationUnit: t.durationUnit, startDate: t.startDate, endDate: t.endDate,
                location: t.location, provider: t.provider,
                seatsRemaining: t.maxParticipants ? t.maxParticipants - t.participants.length : null
            }));

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Available Trainings Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Training programmes relevant to a Department Head's own
//          department(s) - by originating department, or by having
//          participants from it - for their own oversight, never another
//          department's.
// @route   GET /api/training/department
// @access  Private (Department Head)
exports.getDepartmentTrainings = async (req, res) => {
    try {
        const departmentIds = req.headedDepartmentIds || [];
        if (departmentIds.length === 0) return res.status(200).json({ success: true, data: [] });

        const deptEmployees = await employeesInDepartments(departmentIds);
        const employeeIds = deptEmployees.map(e => e._id);

        const trainings = await Training.find({
            employer: req.employerId,
            $or: [
                { department: { $in: departmentIds } },
                { 'participants.employee': { $in: employeeIds } }
            ]
        })
            .populate('participants.employee', 'employeeId personalInfo employmentInfo.department')
            .sort({ startDate: -1 });

        // Trim participants down to this head's own department(s) so they
        // never see another department's roster through a shared programme.
        const employeeIdSet = new Set(employeeIds.map(id => id.toString()));
        const data = trainings.map(t => {
            const obj = t.toObject();
            obj.participants = obj.participants.filter(p => p.employee && employeeIdSet.has(p.employee._id.toString()));
            return obj;
        });

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Department Trainings Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
