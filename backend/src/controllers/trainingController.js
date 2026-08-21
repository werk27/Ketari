const Training = require('../models/Training');
const Employee = require('../models/Employee');

/**
 * Training management.
 *
 * Lifecycle (spec §14):
 *   need assessment -> interest -> selection -> scheduling -> participation -> evaluation
 *
 * HR Expert records and schedules; HR Manager approves. All records are scoped
 * to the organization that owns them.
 */

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

// @desc    Propose a training programme
// @route   POST /api/training
// @access  Private (HR Expert)
exports.createTraining = async (req, res) => {
    try {
        const { status: _ignored, employer: _ignoredEmployer, ...safeBody } = req.body;

        const training = await Training.create({
            ...safeBody,
            employer: req.employerId,
            proposedBy: req.user.id,
            // A new programme always starts as a proposal awaiting manager approval.
            status: 'proposed'
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

// @desc    Approve or reject a proposed training programme
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

        const { training, error } = await findScopedTraining(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (training.status !== 'proposed') {
            return res.status(400).json({
                success: false,
                message: `Only a proposed training can be decided (current status: ${training.status})`
            });
        }

        // Separation of duties: the proposer cannot approve their own programme.
        if (training.proposedBy && training.proposedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve a training programme you proposed yourself'
            });
        }

        training.status = outcome === 'approved' ? 'approved' : 'rejected';
        training.approvedBy = req.user.id;
        training.approvedAt = new Date();
        training.decisionReason = reason || '';
        await training.save();

        res.status(200).json({ success: true, message: `Training ${outcome}`, data: training });
    } catch (error) {
        console.error('Decide Training Error:', error);
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
