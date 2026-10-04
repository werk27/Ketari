const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Configuration = require('../models/Configuration');
const notificationService = require('../services/notificationService');
const { toPublicPath } = require('../config/paths');
const { CAPABILITIES, userCan } = require('../config/permissions');

/**
 * Leave management.
 *
 * Workflow: employee submits (pending) -> HR Expert is the validation gate,
 * which returns it for correction, rejects it outright, or forwards it
 * (pending_approval) -> HR Manager makes the final approve/reject decision.
 * A request may only reach the HR Manager once an HR Expert has forwarded
 * it - HR Manager can never decide on a still-`pending` request.
 *
 * Leave allowances come from configurable leave-type policy data, never from
 * hard-coded day counts.
 */

// Requests still "in play" - they reserve balance and block overlapping
// dates until they are decided one way or the other. A request returned for
// correction is still reserved: the employee is expected to fix and
// resubmit it, not lose its place while doing so.
//
// 'under_review' is the pre-rename value for "HR Expert forwarded, awaiting
// HR Manager"; 'pending_approval' is the current one (same name Job
// Requisition and Training use for the identical stage). Both are accepted
// everywhere so already-forwarded requests never get invalidated.
const AWAITING_MANAGER_STATUSES = ['under_review', 'pending_approval'];
const PENDING_STATUSES = ['pending', ...AWAITING_MANAGER_STATUSES, 'returned_for_correction'];
// Anything that could still occupy the calendar - used for overlap detection.
const OVERLAP_STATUSES = [...PENDING_STATUSES, 'approved'];

/** Append an entry to the request's permanent audit trail. */
const recordAudit = (leave, action, userId, note = '') => {
    leave.auditTrail.push({ action, by: userId, at: new Date(), note });
};

/** Whole days spanned by a date range, inclusive of both ends. */
const calculateDurationDays = (start, end) =>
    Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;

/**
 * Parse and validate a requested start/end date pair.
 * Returns { error } on failure, otherwise { start, end, days }.
 */
const parseAndValidateDates = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return { error: 'Start date and end date must be valid dates' };
    }
    if (end < start) {
        return { error: 'The end date cannot be before the start date' };
    }

    const days = calculateDurationDays(start, end);
    if (days <= 0) {
        return { error: 'Requested duration must be at least one day' };
    }

    return { start, end, days };
};

/**
 * Find the organization's configured policy for a leave type by name
 * (case-insensitive), along with the configuration document it came from.
 *
 * Deliberately does NOT fall back to "any Configuration document in the
 * database" if neither the organization's own config nor the platform
 * default exists - that fallback previously risked silently applying an
 * unrelated organization's leave policy. Failing to `null`/empty here
 * instead surfaces as "not configured" everywhere this is used.
 */
const findLeaveTypeConfig = async (employerId, leaveTypeName) => {
    const config = await Configuration.findOne({ employer: employerId })
        || await Configuration.findOne({ employer: null });
    const leaveTypes = (config && config.leaveTypes) ? config.leaveTypes : [];
    const needle = String(leaveTypeName || '').trim().toLowerCase();
    const entry = leaveTypes.find(t => (t.name || '').trim().toLowerCase() === needle);
    return { config, entry };
};

/**
 * Any other request (by the same employee) whose dates intersect the given
 * range and could still occupy the calendar - approved leave, or anything
 * still pending a decision (including one returned for correction).
 */
const findOverlappingLeave = async (employeeId, start, end, excludeLeaveId) => {
    const query = {
        employee: employeeId,
        status: { $in: OVERLAP_STATUSES },
        startDate: { $lte: end },
        endDate: { $gte: start }
    };
    if (excludeLeaveId) query._id = { $ne: excludeLeaveId };
    return Leave.find(query).select('leaveTypeName startDate endDate status').sort({ startDate: 1 });
};

const formatDate = (d) => new Date(d).toLocaleDateString();

const describeOverlap = (overlaps) => {
    const first = overlaps[0];
    return `This request overlaps with an existing ${first.leaveTypeName} leave request `
        + `(${formatDate(first.startDate)} - ${formatDate(first.endDate)}, status: ${first.status}).`;
};

// Annual Leave entitlement scales with tenure: a per-organization configured
// base (falling back to the statutory 21 days if the organization has not
// customized it), +1 day per completed year of service, capped at 30 days.
// Only the base is organization-configurable (via Configuration.leaveTypes'
// daysPerYear field, the same field every other leave type already uses) -
// the +1/year increment and the 30-day cap are fixed platform-wide.
const ANNUAL_LEAVE_DEFAULT_BASE_DAYS = 21;
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

/**
 * Tenure-based Annual Leave entitlement: base -> base+1 -> ... -> capped at
 * 30. `baseDays` comes from the organization's own configured Annual Leave
 * entry (Configuration.leaveTypes[].daysPerYear); an organization that has
 * not set one (0/falsy - the schema default) gets the statutory 21-day
 * default instead, preserving existing behaviour for every org that added
 * an Annual Leave entry before this became configurable.
 */
const calculateAnnualLeaveEntitlement = (hireDate, baseDays) => {
    const base = baseDays > 0 ? baseDays : ANNUAL_LEAVE_DEFAULT_BASE_DAYS;
    return Math.min(base + yearsOfService(hireDate), ANNUAL_LEAVE_MAX_DAYS);
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
 *
 * Looks up the employer's own Configuration, falling back to the platform
 * default only. Deliberately does NOT fall back further to "any
 * Configuration document" - if neither exists, this organization has no
 * leave policy at all yet, and that must be visible as "not configured"
 * rather than risk silently applying an unrelated organization's policy.
 */
const getEmployeeLeaveBalances = async (employee, { excludeLeaveId } = {}) => {
    // Allowances are policy data, never hard-coded values.
    const config = await Configuration.findOne({ employer: employee.employer })
        || await Configuration.findOne({ employer: null });
    const leaveTypes = (config && config.leaveTypes) ? config.leaveTypes : [];

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    // Counts approved days plus anything still pending/under review/returned
    // for correction, so an employee can't get around their balance by
    // stacking several requests before any of them is decided. Rejected/
    // cancelled requests don't count. excludeLeaveId lets a request being
    // validated/resubmitted compute the balance as it stood *before* itself.
    const query = {
        employee: employee._id,
        status: { $in: [...PENDING_STATUSES, 'approved'] },
        startDate: { $gte: yearStart }
    };
    if (excludeLeaveId) query._id = { $ne: excludeLeaveId };
    const committed = await Leave.find(query);

    return leaveTypes
        .filter(type => type.status !== 'inactive')
        .map(type => {
            const forType = committed.filter(l => (l.leaveTypeName || '').toLowerCase() === type.name.toLowerCase());
            const approvedUsed = forType
                .filter(l => l.status === 'approved')
                .reduce((sum, l) => sum + (l.totalDays || 0), 0);
            const pending = forType
                .filter(l => l.status !== 'approved')
                .reduce((sum, l) => sum + (l.totalDays || 0), 0);
            const used = approvedUsed + pending;
            // Annual Leave entitlement scales with tenure on top of the
            // organization's configured base (falling back to the statutory
            // default if unset); every other leave type uses the configured
            // value directly with no tenure adjustment.
            const isAnnualLeave = /annual/i.test(type.name || '');
            const entitlement = isAnnualLeave
                ? calculateAnnualLeaveEntitlement(employee.employmentInfo && employee.employmentInfo.hireDate, type.daysPerYear)
                : (type.daysPerYear || 0);
            const available = Math.max(entitlement - used, 0);
            return {
                leaveType: type.name,
                entitlement,
                approvedUsed,
                pending,
                used,
                available,
                // Kept alongside `available` for the existing employee balance widget.
                remaining: available,
                paid: type.paid !== false,
                requiresAttachment: !!type.requiresAttachment
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
    // Guards against gaps/collisions left by other employee records the same
    // way employeeController.nextEmployeeId does, rather than trusting a bare
    // count (which can collide once records have been deleted or reassigned).
    const count = await Employee.countDocuments({ employer: user.employer });
    let attempt = count + 1;
    let employeeId;
    do {
        employeeId = `EMP${String(attempt).padStart(4, '0')}`;
        attempt += 1;
    } while (await Employee.exists({ employer: user.employer, employeeId }));

    const [firstName, ...rest] = (user.name || 'Employee').split(' ');

    return Employee.create({
        user: user.id,
        employer: user.employer,
        employeeId,
        personalInfo: { firstName: firstName || 'Employee', lastName: rest.join(' ') || '-' },
        contactInfo: { email: user.email || '' },
        employmentInfo: { employmentStatus: 'active', hireDate: new Date() }
    });
};

/** Load a leave request and confirm the caller's organization owns it. */
const findScopedLeave = async (leaveId, req) => {
    const leave = await Leave.findById(leaveId)
        .populate('employee', 'employer user personalInfo employeeId employmentInfo');
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

/** The attachment (if any) uploaded on this request, in the stored shape. */
const attachmentFromUpload = (file) =>
    (file ? [{ name: file.originalname, url: toPublicPath(file.path) }] : []);

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

        const parsed = parseAndValidateDates(startDate, endDate);
        if (parsed.error) {
            return res.status(400).json({ success: false, message: parsed.error });
        }
        const { start, end, days } = parsed;

        const employee = await resolveEmployeeForUser(req.user);
        if (!employee) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not linked to an organization, so leave cannot be requested'
            });
        }

        // Where the leave type matches the organization's configured policy,
        // its balance and attachment rules govern the request below. A
        // free-typed value that matches no configured policy is intentionally
        // still accepted (existing design: "left for HR to judge during
        // review" - see getEmployeeLeaveBalances) - only an entry the
        // organization has explicitly deactivated is rejected outright.
        const { entry: leaveTypeConfig } = await findLeaveTypeConfig(employee.employer, leaveType);
        if (leaveTypeConfig && leaveTypeConfig.status === 'inactive') {
            return res.status(400).json({
                success: false,
                message: `The "${leaveType}" leave type is no longer active.`
            });
        }

        // An employee cannot double-book leave against dates they (or an
        // already-decided/pending request) already occupy.
        const overlaps = await findOverlappingLeave(employee._id, start, end);
        if (overlaps.length > 0) {
            return res.status(400).json({ success: false, message: describeOverlap(overlaps) });
        }

        // Reject requests that would exceed the employee's remaining balance
        // for this leave type. Types with no configured policy (e.g. a
        // custom, free-typed leave type) have no balance to check against,
        // so they are left for HR to judge during review.
        const balances = await getEmployeeLeaveBalances(employee);
        const balance = balances.find(b => b.leaveType.toLowerCase() === leaveType.toLowerCase());
        if (balance && days > balance.available) {
            return res.status(400).json({
                success: false,
                message: `Insufficient ${leaveType} balance. Available: ${balance.available} day(s), `
                    + `requested: ${days} day(s), shortfall: ${days - balance.available} day(s).`
            });
        }

        // Some leave types require a supporting document (spec §11); this is
        // configured per leave type, never hard-coded.
        const requiresAttachment = leaveTypeConfig ? !!leaveTypeConfig.requiresAttachment : false;
        if (requiresAttachment && !req.file) {
            return res.status(400).json({
                success: false,
                message: `A supporting document is required for ${leaveType}.`
            });
        }

        // Sick Leave pay is legally tiered (full pay -> half pay -> unpaid),
        // based on how much Sick Leave was already used this year.
        const payBreakdown = /sick/i.test(leaveType)
            ? splitSickLeavePayTiers(balance ? balance.used : 0, days)
            : undefined;

        const leave = new Leave({
            employee: employee._id,
            employer: employee.employer,
            leaveTypeName: leaveType,
            startDate: start,
            endDate: end,
            totalDays: days,
            reason,
            payBreakdown,
            attachments: attachmentFromUpload(req.file),
            status: 'pending'
        });
        recordAudit(leave, 'submitted', req.user.id, 'Submitted for HR Expert validation');
        await leave.save();

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
        if (req.query.status) {
            // Accept either name for the "forwarded, awaiting HR Manager"
            // stage so a caller filtering by the old or new name catches
            // every matching record regardless of when it was forwarded.
            query.status = AWAITING_MANAGER_STATUSES.includes(req.query.status)
                ? { $in: AWAITING_MANAGER_STATUSES }
                : req.query.status;
        }

        const leaves = await Leave.find(query)
            .populate({ path: 'employee', select: 'employeeId personalInfo user' })
            .populate('approvedBy', 'name')
            .populate('processedBy', 'name')
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

// @desc    Full detail of one leave request - employee info, dates, balance
//          context (entitlement/used/pending/available/requested) and the
//          complete audit history, for the HR Expert/Manager review screens
//          or the requester checking their own request.
// @route   GET /api/leaves/:id
// @access  Private (the requester, or leave:view within the organization)
exports.getLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id)
            .populate({ path: 'employee', select: 'employeeId personalInfo employmentInfo employer user' })
            .populate('processedBy', 'name email role')
            .populate('approvedBy', 'name email role')
            .populate('auditTrail.by', 'name role');
        if (!leave) {
            return res.status(404).json({ success: false, message: 'Leave request not found' });
        }

        const employerId = req.employerId ? req.employerId.toString() : null;
        const recordEmployerId = leave.employer
            ? leave.employer.toString()
            : (leave.employee && leave.employee.employer ? leave.employee.employer.toString() : null);
        const isSameOrganization = !!recordEmployerId && recordEmployerId === employerId;
        const ownerId = leave.employee && leave.employee.user ? leave.employee.user.toString() : null;
        const isOwner = ownerId === req.user.id;
        const isPrivileged = isSameOrganization && userCan(req.user, CAPABILITIES.LEAVE_VIEW);

        if (!isOwner && !isPrivileged) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this leave request'
            });
        }

        const employeeDoc = await Employee.findById(leave.employee._id);
        const balances = employeeDoc ? await getEmployeeLeaveBalances(employeeDoc, { excludeLeaveId: leave._id }) : [];
        const balance = balances.find(b => b.leaveType.toLowerCase() === leave.leaveTypeName.toLowerCase()) || null;

        res.status(200).json({
            success: true,
            data: {
                ...leave.toObject(),
                balanceContext: balance ? {
                    ...balance,
                    requestedDays: leave.totalDays,
                    remainingAfterDecision: Math.max(balance.available - leave.totalDays, 0)
                } : null
            }
        });
    } catch (error) {
        console.error('Get Leave Error:', error);
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

        if (leave.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Only a pending leave request can be validated and forwarded (current status: ${leave.status})`
            });
        }

        // Re-validate against the current state of the world: another request
        // may have been approved, or the balance may have moved, since this
        // one was submitted (spec §24 - concurrency protection).
        const overlaps = await findOverlappingLeave(leave.employee._id, leave.startDate, leave.endDate, leave._id);
        if (overlaps.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot forward: ${describeOverlap(overlaps)} Send this request back to the employee for correction instead.`
            });
        }

        const employeeDoc = await Employee.findById(leave.employee._id);
        const balances = employeeDoc ? await getEmployeeLeaveBalances(employeeDoc, { excludeLeaveId: leave._id }) : [];
        const balance = balances.find(b => b.leaveType.toLowerCase() === leave.leaveTypeName.toLowerCase());
        if (balance && leave.totalDays > balance.available) {
            return res.status(400).json({
                success: false,
                message: `Cannot forward: insufficient ${leave.leaveTypeName} balance. Available: ${balance.available} `
                    + `day(s), requested: ${leave.totalDays} day(s). Send this request back to the employee for correction instead.`
            });
        }

        leave.status = 'pending_approval';
        leave.processedBy = req.user.id;
        leave.processedAt = new Date();
        if (req.body.note) leave.processingNote = req.body.note;
        recordAudit(leave, 'forwarded', req.user.id, req.body.note || 'Validated and forwarded for HR Manager approval');
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

// @desc    Send a submitted leave request back to the employee for
//          correction/clarification ("Send Back / Request Clarification").
//          This is the only non-approval action available to the HR
//          Expert - there is no HR Expert final reject; only the HR
//          Manager can permanently reject a request (see updateLeaveStatus).
// @route   PUT /api/leaves/:id/return
// @access  Private (HR Expert)
exports.returnLeave = async (req, res) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({
                success: false,
                message: 'A note is required so the employee knows what to correct'
            });
        }

        const { leave, error } = await findScopedLeave(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (leave.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Only a pending leave request can be returned for correction (current status: ${leave.status})`
            });
        }

        leave.status = 'returned_for_correction';
        leave.returnReason = note.trim();
        leave.processedBy = req.user.id;
        leave.processedAt = new Date();
        recordAudit(leave, 'returned_for_correction', req.user.id, note.trim());
        await leave.save();

        const requesterUserId = leave.employee && leave.employee.user ? leave.employee.user.toString() : null;
        if (requesterUserId) {
            await notificationService.notify({
                user: requesterUserId,
                employer: leave.employer,
                type: 'leave_returned',
                title: 'Leave request needs correction',
                message: `Your ${leave.leaveTypeName} leave request was returned: ${note.trim()}`,
                link: '/employee/dashboard'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Leave request returned to the employee for correction',
            data: leave
        });
    } catch (error) {
        console.error('Return Leave Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Employee edits and resubmits a leave request returned for correction
// @route   PUT /api/leaves/:id/resubmit
// @access  Private (the requester)
exports.resubmitLeave = async (req, res) => {
    try {
        const { leave, error } = await findScopedLeave(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const ownerId = leave.employee && leave.employee.user ? leave.employee.user.toString() : null;
        if (ownerId !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the requester can resubmit this leave request' });
        }

        if (leave.status !== 'returned_for_correction') {
            return res.status(400).json({
                success: false,
                message: `Only a request returned for correction can be resubmitted (current status: ${leave.status})`
            });
        }

        const leaveType = req.body.leaveType || leave.leaveTypeName;
        const startDate = req.body.startDate || leave.startDate;
        const endDate = req.body.endDate || leave.endDate;
        const reason = req.body.reason || leave.reason;

        const parsed = parseAndValidateDates(startDate, endDate);
        if (parsed.error) {
            return res.status(400).json({ success: false, message: parsed.error });
        }
        const { start, end, days } = parsed;

        const employeeDoc = await Employee.findById(leave.employee._id);
        const { entry: leaveTypeConfig } = await findLeaveTypeConfig(employeeDoc.employer, leaveType);
        if (leaveTypeConfig && leaveTypeConfig.status === 'inactive') {
            return res.status(400).json({ success: false, message: `The "${leaveType}" leave type is no longer active.` });
        }

        const overlaps = await findOverlappingLeave(employeeDoc._id, start, end, leave._id);
        if (overlaps.length > 0) {
            return res.status(400).json({ success: false, message: describeOverlap(overlaps) });
        }

        const balances = await getEmployeeLeaveBalances(employeeDoc, { excludeLeaveId: leave._id });
        const balance = balances.find(b => b.leaveType.toLowerCase() === leaveType.toLowerCase());
        if (balance && days > balance.available) {
            return res.status(400).json({
                success: false,
                message: `Insufficient ${leaveType} balance. Available: ${balance.available} day(s), `
                    + `requested: ${days} day(s), shortfall: ${days - balance.available} day(s).`
            });
        }

        const requiresAttachment = leaveTypeConfig ? !!leaveTypeConfig.requiresAttachment : false;
        const hasExistingAttachment = leave.attachments && leave.attachments.length > 0;
        if (requiresAttachment && !req.file && !hasExistingAttachment) {
            return res.status(400).json({
                success: false,
                message: `A supporting document is required for ${leaveType}.`
            });
        }

        if (req.file) leave.attachments = attachmentFromUpload(req.file);
        leave.leaveTypeName = leaveType;
        leave.startDate = start;
        leave.endDate = end;
        leave.totalDays = days;
        leave.reason = reason;
        leave.status = 'pending';
        leave.returnReason = '';
        recordAudit(leave, 'resubmitted', req.user.id, 'Edited and resubmitted for HR Expert validation');
        await leave.save();

        await notificationService.notifyRoles({
            employer: leave.employer,
            roles: ['hr_expert'],
            type: 'leave_request',
            title: 'Leave request resubmitted',
            message: `${req.user.name} resubmitted a ${leaveType} leave request after correction.`,
            link: '/hr-expert/leave'
        });

        res.status(200).json({ success: true, message: 'Leave request resubmitted for HR Expert validation', data: leave });
    } catch (error) {
        console.error('Resubmit Leave Error:', error);
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

        // The HR Expert validation gate: a request may only be decided by the
        // HR Manager once it has been reviewed and forwarded. This is the
        // rule that prevents "Employee -> HR Manager" bypassing HR Expert
        // entirely (spec §17/§19/§20).
        if (!AWAITING_MANAGER_STATUSES.includes(leave.status)) {
            return res.status(400).json({
                success: false,
                message: leave.status === 'pending'
                    ? 'This leave request must be validated by an HR Expert before it can be decided'
                    : `This leave request has already been ${leave.status}`
            });
        }

        // Separation of duties: nobody decides on their own leave request,
        // and whoever validated/forwarded it cannot also be the one deciding.
        const requesterUserId = leave.employee && leave.employee.user
            ? leave.employee.user.toString()
            : null;
        if (requesterUserId === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve your own leave request'
            });
        }
        if (leave.processedBy && leave.processedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot decide a leave request you validated as HR Expert yourself'
            });
        }

        leave.status = status;
        leave.approvedBy = req.user.id;
        leave.approvedDate = new Date();
        if (status === 'rejected') leave.rejectionReason = rejectionReason;
        recordAudit(leave, status, req.user.id, status === 'rejected' ? rejectionReason : 'Approved');
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
        recordAudit(leave, 'cancelled', req.user.id, 'Cancelled by the employee');
        await leave.save();

        res.status(200).json({ success: true, message: 'Leave request cancelled', data: leave });
    } catch (error) {
        console.error('Cancel Leave Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Leave balance - the signed-in user's own, or (for HR Expert/
//          Manager reviewing a request) a specific employee's, based on
//          configured policy.
// @route   GET /api/leaves/balance?employeeId=...
// @access  Private
exports.getLeaveBalance = async (req, res) => {
    try {
        let employee;
        let employeeLinked = true;

        if (req.query.employeeId && userCan(req.user, CAPABILITIES.LEAVE_VIEW)) {
            employee = await Employee.findById(req.query.employeeId);
            if (!employee) {
                return res.status(404).json({ success: false, message: 'Employee not found' });
            }
            if (req.employerId && employee.employer
                && employee.employer.toString() !== req.employerId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'This employee belongs to another organization'
                });
            }
        } else {
            employee = await Employee.findOne({ user: req.user.id });

            // A User with an organization role does not always have an
            // Employee HR record yet (see resolveEmployeeForUser above) -
            // that record is normally created the moment leave is first
            // requested. Balance must be visible *before* that first
            // request too, so it is computed the same way here without
            // writing anything: a real Employee document is still required
            // to actually file a request (createLeave persists one), but
            // simply checking a balance must never require or create one.
            if (!employee && req.user.employer) {
                employeeLinked = false;
                employee = {
                    _id: null,
                    employer: req.user.employer,
                    employmentInfo: { hireDate: req.user.createdAt || new Date() }
                };
            }
        }

        if (!employee) {
            return res.status(200).json({
                success: true,
                balances: [],
                employeeLinked: false,
                leaveTypesConfigured: false,
                message: 'Your account is not linked to an organization, so no leave balance applies.'
            });
        }

        const balances = await getEmployeeLeaveBalances(employee);
        const leaveTypesConfigured = balances.length > 0;

        res.status(200).json({
            success: true,
            balances,
            employeeLinked,
            leaveTypesConfigured,
            message: leaveTypesConfigured
                ? undefined
                : 'No leave types have been configured for your organization yet.'
        });
    } catch (error) {
        console.error('Leave Balance Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
