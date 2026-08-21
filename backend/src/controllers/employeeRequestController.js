const EmployeeRequest = require('../models/EmployeeRequest');
const Employee = require('../models/Employee');

/**
 * Employee Requests (break-year, resignation, transfer, termination, promotion).
 *
 * Workflow (spec §12 / §32):
 *   submitted -> processing (HR Expert) -> approved | rejected (HR Manager) -> completed
 *
 * The person who processes a request may never be the person who approves it.
 */

const recordHistory = (request, status, userId, note = '') => {
    request.history.push({ status, changedBy: userId, changedAt: new Date(), note });
};

/** Resolve (or create) the employee record backing the signed-in user. */
const resolveEmployeeForUser = async (user) => {
    let employee = await Employee.findOne({ user: user.id });
    if (employee) return employee;

    if (!user.employer) return null;

    const count = await Employee.countDocuments({ employer: user.employer });
    const [firstName, ...rest] = (user.name || 'Employee').split(' ');

    return Employee.create({
        user: user.id,
        employer: user.employer,
        employeeId: `EMP${String(count + 1).padStart(4, '0')}`,
        personalInfo: { firstName: firstName || 'Employee', lastName: rest.join(' ') || '-' },
        contactInfo: { email: user.email || '' },
        employmentInfo: { employmentStatus: 'active', hireDate: new Date() }
    });
};

/** Load a request and confirm the caller's organization owns it. */
const findScopedRequest = async (requestId, req) => {
    const request = await EmployeeRequest.findById(requestId)
        .populate('employee', 'employeeId personalInfo user');

    if (!request) return { error: { code: 404, message: 'Request not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    if (!request.employer || request.employer.toString() !== employerId) {
        return { error: { code: 403, message: 'This request belongs to another organization' } };
    }

    return { request };
};

// @desc    Raise an employee request
// @route   POST /api/requests
// @access  Private (any organization member)
exports.createRequest = async (req, res) => {
    try {
        const { type, title, description, reason, startDate, endDate, details } = req.body;

        const allowedTypes = ['break_year', 'resignation', 'transfer', 'termination', 'promotion', 'other'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `Request type must be one of: ${allowedTypes.join(', ')}`
            });
        }

        if (!title) {
            return res.status(400).json({ success: false, message: 'A request title is required' });
        }

        const employee = await resolveEmployeeForUser(req.user);
        if (!employee) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not linked to an organization, so requests cannot be raised'
            });
        }

        const request = new EmployeeRequest({
            employee: employee._id,
            raisedBy: req.user.id,
            employer: employee.employer,
            type,
            title,
            description: description || '',
            reason: reason || '',
            startDate: startDate || null,
            endDate: endDate || null,
            details: details || {},
            status: 'submitted'
        });

        recordHistory(request, 'submitted', req.user.id, 'Request submitted');
        await request.save();

        res.status(201).json({ success: true, data: request });
    } catch (error) {
        console.error('Create Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The organization's employee requests
// @route   GET /api/requests
// @access  Private (request:view)
exports.getRequests = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;
        if (req.query.type) query.type = req.query.type;

        const requests = await EmployeeRequest.find(query)
            .populate('employee', 'employeeId personalInfo')
            .populate('raisedBy', 'name email')
            .populate('processedBy', 'name')
            .populate('decidedBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: requests.length, data: requests });
    } catch (error) {
        console.error('Get Requests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The signed-in user's own requests
// @route   GET /api/requests/me
// @access  Private
exports.getMyRequests = async (req, res) => {
    try {
        const requests = await EmployeeRequest.find({ raisedBy: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        console.error('Get My Requests Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Process a request and forward it for approval
// @route   PUT /api/requests/:id/process
// @access  Private (HR Expert)
exports.processRequest = async (req, res) => {
    try {
        const { request, error } = await findScopedRequest(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (request.status !== 'submitted') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted request can be processed (current status: ${request.status})`
            });
        }

        request.status = 'processing';
        request.processedBy = req.user.id;
        request.processedAt = new Date();
        request.processingNote = req.body.note || '';
        recordHistory(request, 'processing', req.user.id, req.body.note || 'Forwarded for approval');
        await request.save();

        res.status(200).json({
            success: true,
            message: 'Request forwarded for HR Manager approval',
            data: request
        });
    } catch (error) {
        console.error('Process Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve or reject an employee request
// @route   PUT /api/requests/:id/decision
// @access  Private (HR Manager)
exports.decideRequest = async (req, res) => {
    try {
        const { outcome, reason } = req.body;

        if (!['approved', 'rejected'].includes(outcome)) {
            return res.status(400).json({
                success: false,
                message: 'Outcome must be either approved or rejected'
            });
        }

        if (outcome === 'rejected' && !reason) {
            return res.status(400).json({
                success: false,
                message: 'A reason is required when rejecting a request'
            });
        }

        const { request, error } = await findScopedRequest(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!['submitted', 'processing'].includes(request.status)) {
            return res.status(400).json({
                success: false,
                message: `This request has already been ${request.status}`
            });
        }

        // Separation of duties: never decide on your own request, and never
        // approve a request you personally processed.
        if (request.raisedBy && request.raisedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot decide on your own request'
            });
        }
        if (request.processedBy && request.processedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve a request you processed yourself'
            });
        }

        request.status = outcome;
        request.decidedBy = req.user.id;
        request.decidedAt = new Date();
        request.decisionReason = reason || '';
        recordHistory(request, outcome, req.user.id, reason || `Request ${outcome}`);
        await request.save();

        res.status(200).json({ success: true, message: `Request ${outcome}`, data: request });
    } catch (error) {
        console.error('Decide Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Mark an approved request as completed
// @route   PUT /api/requests/:id/complete
// @access  Private (HR Expert)
exports.completeRequest = async (req, res) => {
    try {
        const { request, error } = await findScopedRequest(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (request.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Only an approved request can be completed'
            });
        }

        request.status = 'completed';
        recordHistory(request, 'completed', req.user.id, req.body.note || 'Request completed');
        await request.save();

        res.status(200).json({ success: true, message: 'Request completed', data: request });
    } catch (error) {
        console.error('Complete Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Cancel own request
// @route   PUT /api/requests/:id/cancel
// @access  Private
exports.cancelRequest = async (req, res) => {
    try {
        const request = await EmployeeRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        if (request.raisedBy.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only cancel your own request' });
        }

        if (!['submitted', 'processing'].includes(request.status)) {
            return res.status(400).json({
                success: false,
                message: `This request can no longer be cancelled (status: ${request.status})`
            });
        }

        request.status = 'cancelled';
        recordHistory(request, 'cancelled', req.user.id, 'Cancelled by requester');
        await request.save();

        res.status(200).json({ success: true, message: 'Request cancelled', data: request });
    } catch (error) {
        console.error('Cancel Request Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
