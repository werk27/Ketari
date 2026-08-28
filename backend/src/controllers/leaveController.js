const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Configuration = require('../models/Configuration');
const notificationService = require('../services/notificationService');

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

// Annual Leave entitlement scales with tenure: 21 days in the first year,
// +1 day per completed year of service, capped at 30 days.
const ANNUAL_LEAVE_BASE_DAYS = 21;
const ANNUAL_LEAVE_MAX_DAYS = 30;

/**
 * Whole years of service completed by the employee as of today, using an
 * exact calendar comparison (not an average day-length division, which
 * drifts by a day right around each anniversary).
 */
const yearsOfService = (hireDate) => {
    if (!hireDate) return 0;
    const hire = new Date(hireDate);
    const now = new Date();
    let years = now.getFullYear() - hire.getFullYear();
    const anniversaryPassedThisYear =
        now.getMonth() > hire.getMonth()
        || (now.getMonth() === hire.getMonth() && now.getDate() >= hire.getDate());
    if (!anniversaryPassedThisYear) years -= 1;
    return Math.max(years, 0);
};

/** Tenure-based Annual Leave entitlement: 21 -> 22 -> ... -> capped at 30. */
const calculateAnnualLeaveEntitlement = (hireDate) => {
    return Math.min(ANNUAL_LEAVE_BASE_DAYS + yearsOfService(hireDate), ANNUAL_LEAVE_MAX_DAYS);
};

// Sick Leave pay tiers (Labour Proclamation 1156/2019 Art. 83-84), expressed
// as cumulative day counts within the 12-month entitlement: the first 30
// days are full pay, the next 60 (days 31-90) are half pay, and the
// remaining 90 (days 91-180) are unpaid but job-protected.
const SICK_LEAVE_PAY_TIERS = [
    { cumulativeUpTo: 30, pay: 'fullPayDays' },
    { cumulativeUpTo: 90, pay: 'halfPayDays' },
    { cumulativeUpTo: 180, pay: 'unpaidDays' }
];

/**
 * Split a Sick Leave request's days across the statutory pay tiers, given
 * how many Sick Leave days the employee already used this year *before*
 * this request. A request that itself spans more than one tier (e.g. it
 * starts within the full-pay allowance and runs into the half-pay one) is
 * divided accordingly rather than assigned a single pay rate.
 */
const splitSickLeavePayTiers = (usedBeforeThisRequest, requestedDays) => {
    const breakdown = { fullPayDays: 0, halfPayDays: 0, unpaidDays: 0 };
    let cursor = Math.max(usedBeforeThisRequest, 0);
    let remaining = requestedDays;

    for (const tier of SICK_LEAVE_PAY_TIERS) {
        if (remaining <= 0) break;
        const capacityLeftInTier = Math.max(tier.cumulativeUpTo - cursor, 0);
        if (capacityLeftInTier <= 0) continue;

        const daysInThisTier = Math.min(capacityLeftInTier, remaining);
        breakdown[tier.pay] += daysInThisTier;
        cursor += daysInThisTier;
        remaining -= daysInThisTier;
    }

    // Any days beyond the 180-day cap have no defined tier; they should
    // already have been rejected by the balance check before reaching here.
    return breakdown;
};

/**
 * Compute the signed-in employee's balance for every configured leave type:
 * entitlement (tenure-based for Annual Leave, policy-configured otherwise),
 * days used so far this calendar year, and days remaining.
 * Shared by the balance endpoint and by leave-request validation, so both
 * always agree on how much leave someone has left.
 */
const getEmployeeLeaveBalances = async (employee) => {
    // Allowances are policy data, never hard-coded values.
    const config = await Configuration.findOne({ employer: employee.employer })
        || await Configuration.findOne({ employer: null })
        || await Configuration.findOne();
    const leaveTypes = (config && config.leaveTypes) ? config.leaveTypes : [];

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    // Counts approved days plus anything still pending/under review, so an
    // employee can't get around their balance by stacking several requests
    // before any of them is decided. Rejected/cancelled requests don't count.
    const committed = await Leave.find({
        employee: employee._id,
        status: { $in: [...PENDING_STATUSES, 'approved'] },
        startDate: { $gte: yearStart }
    });

    return leaveTypes
        .filter(type => type.status !== 'inactive')
        .map(type => {
            const used = committed
                .filter(l => l.leaveTypeName === type.name)
                .reduce((sum, l) => sum + (l.totalDays || 0), 0);
            // Annual Leave entitlement scales with tenure rather than using
            // the flat configured value; every other leave type still comes
            // straight from policy configuration.
            const isAnnualLeave = /annual/i.test(type.name || '');
            const entitlement = isAnnualLeave
                ? calculateAnnualLeaveEntitlement(employee.employmentInfo && employee.employmentInfo.hireDate)
                : (type.daysPerYear || 0);
            return {
                leaveType: type.name,
                entitlement,
                used,
                remaining: Math.max(entitlement - used, 0),
                paid: type.paid !== false
            };
        });
};

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

        // Reject requests that would exceed the employee's remaining balance
        // for this leave type. Types with no configured policy (e.g. a
        // custom, free-typed leave type) have no balance to check against,
        // so they are left for HR to judge during review.
        const balances = await getEmployeeLeaveBalances(employee);
        const balance = balances.find(b => b.leaveType === leaveType);
        if (balance && days > balance.remaining) {
            return res.status(400).json({
                success: false,
                message: `Insufficient ${leaveType} balance: ${balance.remaining} day(s) remaining, but ${days} day(s) were requested.`
            });
        }

        // Sick Leave pay is legally tiered (full pay -> half pay -> unpaid),
        // based on how much Sick Leave was already used this year.
        const payBreakdown = /sick/i.test(leaveType)
            ? splitSickLeavePayTiers(balance ? balance.used : 0, days)
            : undefined;

        const leave = await Leave.create({
            employee: employee._id,
            employer: employee.employer,
            leaveTypeName: leaveType,
            startDate,
            endDate,
            totalDays: days,
            reason,
            payBreakdown,
            status: 'pending'
        });

        await notificationService.notifyRoles({
            employer: employee.employer,
            roles: ['hr_expert'],
            type: 'leave_request',
            title: 'New leave request',
            message: `${req.user.name} requested ${leaveType} leave (${days} day${days === 1 ? '' : 's'}).`,
            link: '/hr-expert/leave'
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
            .sort({ createdAt: -1 })
            .lean();

        // Surface how many "Other" leave requests each employee has made this
        // year, so HR can notice a pattern that likely needs a proper leave
        // type added to Configuration instead of repeated ad-hoc use of the
        // generic catch-all.
        const yearStart = new Date(new Date().getFullYear(), 0, 1);
        const otherLeaves = await Leave.find({
            employer: req.employerId,
            leaveTypeName: { $regex: /^other$/i },
            status: { $in: [...PENDING_STATUSES, 'approved'] },
            startDate: { $gte: yearStart }
        }).select('employee');

        const otherCountByEmployee = new Map();
        otherLeaves.forEach(l => {
            const key = l.employee.toString();
            otherCountByEmployee.set(key, (otherCountByEmployee.get(key) || 0) + 1);
        });

        const withCounts = leaves.map(leave => {
            const employeeId = leave.employee && leave.employee._id ? leave.employee._id.toString() : null;
            return {
                ...leave,
                otherLeaveCountThisYear: employeeId ? (otherCountByEmployee.get(employeeId) || 0) : 0
            };
        });

        res.status(200).json({ success: true, count: withCounts.length, data: withCounts });
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

        await notificationService.notifyRoles({
            employer: leave.employer,
            roles: ['hr_manager'],
            type: 'leave_request',
            title: 'Leave request awaiting approval',
            message: `A ${leave.leaveTypeName} leave request from ${leave.employee?.personalInfo?.firstName || 'an employee'} needs your approval.`,
            link: '/hr-manager/leave'
        });

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

        if (requesterUserId) {
            await notificationService.notify({
                user: requesterUserId,
                employer: leave.employer,
                type: 'leave_decision',
                title: status === 'approved' ? 'Leave request approved' : 'Leave request rejected',
                message: status === 'approved'
                    ? `Your ${leave.leaveTypeName} leave request has been approved.`
                    : `Your ${leave.leaveTypeName} leave request was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
                link: '/employee/dashboard'
            });
        }

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

        const balances = await getEmployeeLeaveBalances(employee);

        res.status(200).json({ success: true, balances });
    } catch (error) {
        console.error('Leave Balance Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
