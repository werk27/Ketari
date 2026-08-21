const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Configuration = require('../models/Configuration');

/**
 * Leave management.
 *
 * Workflow (spec §11 / §32):
 *   submitted -> under review (HR Expert records/forwards) -> approved | rejected (HR Manager)
 *
 * Leave allowances come from configurable leave-type policy data, never from
 * hard-coded day counts.
 */

const PENDING_STATUSES = ['pending', 'under_review'];

/** Resolve (or create) the employee record backing the signed-in user. */
const resolveEmployeeForUser = async (user) => {
    let employee = await Employee.findOne({ user: user.id });
    if (employee) return employee;

    if (!user.employer) return null;

    // Staff who have an account but no HR record yet get one on first use,
    // so leave can be requested without waiting for manual data entry.
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

/** Load a leave request and confirm the caller's organization owns it. */
const findScopedLeave = async (leaveId, req) => {
    const leave = await Leave.findById(leaveId).populate('employee', 'employer user personalInfo employeeId');
    if (!leave) return { error: { code: 404, message: 'Leave request not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const recordEmployerId = leave.employer
        ? leave.employer.toString()
        : (leave.employee && leave.employee.employer ? leave.employee.employer.toString() : null);

    if (!recordEmployerId || recordEmployerId !== employerId) {
        return { error: { code: 403, message: 'This leave request belongs to another organization' } };
    }

    return { leave };
};

// @desc    Submit a leave request
// @route   POST /api/leaves
// @access  Private (any organization member)
exports.createLeave = async (req, res) => {
    try {
        const { leaveType, startDate, endDate, reason } = req.body;

        if (!leaveType || !startDate || !endDate || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Leave type, start date, end date and reason are required'
            });
        }

        if (new Date(endDate) < new Date(startDate)) {
            return res.status(400).json({
                success: false,
                message: 'The end date cannot be before the start date'
            });
        }

        const employee = await resolveEmployeeForUser(req.user);
        if (!employee) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not linked to an organization, so leave cannot be requested'
            });
        }

        // Day count is derived server-side rather than trusted from the client.
        const days = Math.floor(
            (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        ) + 1;

        const leave = await Leave.create({
            employee: employee._id,
            employer: employee.employer,
            leaveTypeName: leaveType,
            startDate,
            endDate,
            totalDays: days,
            reason,
            status: 'pending'
        });

        res.status(201).json({ success: true, data: leave });
    } catch (error) {
        console.error('Create Leave Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get the organization's leave requests
// @route   GET /api/leaves
// @access  Private (leave:view)
exports.getLeaves = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;

        const leaves = await Leave.find(query)
            .populate({ path: 'employee', select: 'employeeId personalInfo user' })
            .populate('approvedBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: leaves.length, data: leaves });
    } catch (error) {
        console.error('Get Leaves Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get the signed-in user's own leave requests
// @route   GET /api/leaves/me
// @access  Private
exports.getMyLeaves = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) {
            return res.status(200).json({ success: true, data: [] });
        }

        const leaves = await Leave.find({ employee: employee._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: leaves });
    } catch (error) {
        console.error('Get My Leaves Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Record/forward a leave request for manager review
// @route   PUT /api/leaves/:id/process
// @access  Private (HR Expert)
exports.processLeave = async (req, res) => {
    try {
        const { leave, error } = await findScopedLeave(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!PENDING_STATUSES.includes(leave.status)) {
            return res.status(400).json({
                success: false,
                message: `Only a pending leave request can be processed (current status: ${leave.status})`
            });
        }

        leave.status = 'under_review';
        leave.processedBy = req.user.id;
        leave.processedAt = new Date();
        if (req.body.note) leave.processingNote = req.body.note;
        await leave.save();

        res.status(200).json({
            success: true,
            message: 'Leave request forwarded for HR Manager approval',
            data: leave
        });
    } catch (error) {
        console.error('Process Leave Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve or reject a leave request
// @route   PUT /api/leaves/:id/status
// @access  Private (HR Manager)
exports.updateLeaveStatus = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status must be either approved or rejected'
            });
        }

        if (status === 'rejected' && !rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'A reason is required when rejecting a leave request'
            });
        }

        const { leave, error } = await findScopedLeave(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (['approved', 'rejected', 'cancelled'].includes(leave.status)) {
            return res.status(400).json({
                success: false,
                message: `This leave request has already been ${leave.status}`
            });
        }

        // Separation of duties: nobody decides on their own leave request.
        const requesterUserId = leave.employee && leave.employee.user
            ? leave.employee.user.toString()
            : null;
        if (requesterUserId === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve your own leave request'
            });
        }

        leave.status = status;
        leave.approvedBy = req.user.id;
        leave.approvedDate = new Date();
        if (status === 'rejected') leave.rejectionReason = rejectionReason;
        await leave.save();

        res.status(200).json({ success: true, data: leave });
    } catch (error) {
        console.error('Update Leave Status Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Cancel own leave request
// @route   PUT /api/leaves/:id/cancel
// @access  Private
exports.cancelLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id).populate('employee', 'user');
        if (!leave) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        const ownerId = leave.employee && leave.employee.user ? leave.employee.user.toString() : null;
        if (ownerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only cancel your own leave request' });
        }

        if (['approved', 'rejected', 'cancelled'].includes(leave.status)) {
            return res.status(400).json({
                success: false,
                message: `This request can no longer be cancelled (status: ${leave.status})`
            });
        }

        leave.status = 'cancelled';
        await leave.save();

        res.status(200).json({ success: true, message: 'Leave request cancelled', data: leave });
    } catch (error) {
        console.error('Cancel Leave Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Leave balance for the signed-in user, based on configured policy
// @route   GET /api/leaves/balance
// @access  Private
exports.getLeaveBalance = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) {
            return res.status(200).json({ success: true, balances: [] });
        }

        // Allowances are policy data, never hard-coded values.
        const config = await Configuration.findOne({ employer: employee.employer })
            || await Configuration.findOne({ employer: null })
            || await Configuration.findOne();
        const leaveTypes = (config && config.leaveTypes) ? config.leaveTypes : [];

        const yearStart = new Date(new Date().getFullYear(), 0, 1);
        const approved = await Leave.find({
            employee: employee._id,
            status: 'approved',
            startDate: { $gte: yearStart }
        });

        const balances = leaveTypes
            .filter(type => type.status !== 'inactive')
            .map(type => {
                const used = approved
                    .filter(l => l.leaveTypeName === type.name)
                    .reduce((sum, l) => sum + (l.totalDays || 0), 0);
                const entitlement = type.daysPerYear || 0;
                return {
                    leaveType: type.name,
                    entitlement,
                    used,
                    remaining: Math.max(entitlement - used, 0),
                    paid: type.paid !== false
                };
            });

        res.status(200).json({ success: true, balances });
    } catch (error) {
        console.error('Leave Balance Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
