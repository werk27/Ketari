const Complaint = require('../models/Complaint');
const Employee = require('../models/Employee');

/**
 * Complaint and feedback management (spec §18).
 *
 * Covers both workplace grievances raised by staff and recruitment-process
 * feedback raised by candidates.
 *
 * Workflow:
 *   submitted -> under_review -> investigating -> responded -> resolved
 *
 * Candidates have no employee record, so the complainant is tracked on the user
 * account. A previous version tried to fabricate an Employee here and crashed
 * with a validation error because the required employee number was missing.
 */

const RECRUITMENT_CATEGORIES = ['recruitment', 'interview', 'technical'];

const ALLOWED_STATUSES = ['under_review', 'investigating', 'responded', 'resolved', 'rejected'];

/** Load a complaint and confirm the caller may act on it. */
const findScopedComplaint = async (complaintId, req) => {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return { error: { code: 404, message: 'Complaint not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const recordEmployerId = complaint.employer ? complaint.employer.toString() : null;

    if (!recordEmployerId || recordEmployerId !== employerId) {
        return { error: { code: 403, message: 'This complaint belongs to another organization' } };
    }

    return { complaint };
};

/** Load a complaint that belongs to no organization (platform-level feedback). */
const findUnassignedComplaint = async (complaintId) => {
    const complaint = await Complaint.findById(complaintId);
    if (!complaint) return { error: { code: 404, message: 'Complaint not found' } };

    if (complaint.employer) {
        return {
            error: {
                code: 403,
                message: 'This complaint belongs to an organization and must be handled by its HR team'
            }
        };
    }

    return { complaint };
};

/**
 * Apply a workflow transition. Shared by the organization and platform routes so
 * both enforce the same validation, self-adjudication guard and history trail.
 */
const applyStatusTransition = (complaint, { status, resolution, assignedTo }, req) => {
    // Nobody adjudicates their own complaint.
    if (complaint.raisedBy && complaint.raisedBy.toString() === req.user.id) {
        return { error: { code: 403, message: 'You cannot handle a complaint you raised yourself' } };
    }

    if (status === 'resolved' && !resolution) {
        return { error: { code: 400, message: 'A resolution note is required when resolving a complaint' } };
    }

    complaint.status = status;
    if (status === 'resolved') {
        complaint.resolution = resolution;
        complaint.resolvedDate = new Date();
    }
    if (assignedTo) complaint.assignedTo = assignedTo;

    complaint.history.push({
        action: status,
        note: resolution || `Status updated to ${status}`,
        user: req.user.id
    });

    return { complaint };
};

// @desc    Submit a complaint or feedback
// @route   POST /api/complaints
// @access  Private (any authenticated user)
exports.createComplaint = async (req, res) => {
    try {
        const { title, description, priority } = req.body;
        const type = req.body.category || req.body.type;

        if (!title || !description || !type) {
            return res.status(400).json({
                success: false,
                message: 'Title, type and description are required'
            });
        }

        // Staff complaints link to an employee record; candidate feedback does not.
        const employee = await Employee.findOne({ user: req.user.id });

        const isCandidate = req.user.role === 'candidate';
        const category = isCandidate
            ? (RECRUITMENT_CATEGORIES.includes(req.body.complaintCategory)
                ? req.body.complaintCategory
                : 'recruitment')
            : 'employee';

        const complaint = await Complaint.create({
            raisedBy: req.user.id,
            employee: employee ? employee._id : null,
            // Candidate feedback may not belong to a specific organization.
            employer: employee ? employee.employer : (req.user.employer || null),
            category,
            title,
            type,
            description,
            priority: priority || 'medium',
            status: 'submitted',
            history: [{
                action: 'submitted',
                note: 'Complaint submitted',
                user: req.user.id
            }]
        });

        res.status(201).json({ success: true, data: complaint });
    } catch (error) {
        console.error('Create Complaint Error:', error);
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

// @desc    The organization's complaints
// @route   GET /api/complaints
// @access  Private (complaint:view)
exports.getComplaints = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;
        if (req.query.category) query.category = req.query.category;

        const complaints = await Complaint.find(query)
            .populate('raisedBy', 'name email role')
            .populate('employee', 'employeeId personalInfo')
            .populate('assignedTo', 'name')
            .populate('history.user', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: complaints.length, data: complaints });
    } catch (error) {
        console.error('Get Complaints Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Complaints without an owning organization (platform-level feedback)
// @route   GET /api/complaints/unassigned
// @access  Private (System Administrator)
exports.getUnassignedComplaints = async (req, res) => {
    try {
        const complaints = await Complaint.find({ employer: null })
            .populate('raisedBy', 'name email role')
            .populate('history.user', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: complaints.length, data: complaints });
    } catch (error) {
        console.error('Get Unassigned Complaints Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    The signed-in user's own complaints
// @route   GET /api/complaints/me
// @access  Private
exports.getMyComplaints = async (req, res) => {
    try {
        const complaints = await Complaint.find({ raisedBy: req.user.id })
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: complaints });
    } catch (error) {
        console.error('Get My Complaints Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update complaint status
// @route   PUT /api/complaints/:id/status
// @access  Private (complaint:handle)
exports.updateComplaintStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`
            });
        }

        const { complaint, error } = await findScopedComplaint(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const { error: transitionError } = applyStatusTransition(complaint, req.body, req);
        if (transitionError) {
            return res.status(transitionError.code).json({
                success: false,
                message: transitionError.message
            });
        }

        await complaint.save();

        res.status(200).json({ success: true, data: complaint });
    } catch (error) {
        console.error('Update Complaint Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Move platform-level feedback through its workflow
// @route   PUT /api/complaints/unassigned/:id/status
// @access  Private (System Administrator)
exports.updateUnassignedComplaintStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`
            });
        }

        const { complaint, error } = await findUnassignedComplaint(req.params.id);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const { error: transitionError } = applyStatusTransition(complaint, req.body, req);
        if (transitionError) {
            return res.status(transitionError.code).json({
                success: false,
                message: transitionError.message
            });
        }

        await complaint.save();

        res.status(200).json({ success: true, data: complaint });
    } catch (error) {
        console.error('Update Unassigned Complaint Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
