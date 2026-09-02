const Employee = require('../models/Employee');
const Leave = require('../models/Leave');
const { ORG_ROLES } = require('../config/permissions');

/**
 * Business rule: while an employee is on APPROVED leave that covers today,
 * they must be blocked from the normal HR/work workspace entirely - the
 * whole point of delegating their responsibilities to a colleague is that
 * nobody, including the person on leave, keeps working during that window.
 *
 * Only 'approved' leave triggers this. Pending, returned-for-correction,
 * under_review, rejected or cancelled requests never block access - the
 * requester keeps working normally until a leave is actually approved.
 *
 * The block is purely date-driven so it starts and ends automatically with
 * no scheduler or manual step. Leave days are CALENDAR days, inclusive of
 * both ends (see leaveController.calculateDurationDays), so the comparison
 * is day-granular: a leave blocks from the first moment of its start DAY
 * through the last moment of its end DAY. Comparing against the exact
 * instant `now` instead used to leak access at the edges, because leave
 * dates submitted as 'YYYY-MM-DD' are stored at midnight UTC while the
 * server clock may be hours ahead - on a UTC+3 server the block only began
 * at 03:00 of the first leave day and ended at 03:00 of the LAST leave day,
 * letting the delegator log back into the workspace while still on leave.
 *
 * Returns `null` when the user is not currently blocked, otherwise an object
 * describing the active leave so callers can build a clear, non-alarming
 * message (never a silent 401/403 that looks like a broken account).
 */
const getActiveLeaveBlock = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return null;

    // Platform/organization owners are not "staff on leave" in this sense;
    // only rank-and-file organization members request leave through this
    // workflow. Still, only Employee-linked accounts can even have a Leave
    // record, so this naturally excludes anyone without one.
    const employee = await Employee.findOne({ user: user._id || user.id }).select('_id');
    if (!employee) return null;

    // Day-granular window: blocked when the leave's inclusive [startDate's
    // day .. endDate's day] range covers today's calendar date, regardless
    // of the time-of-day component the stored dates happen to carry.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const activeLeave = await Leave.findOne({
        employee: employee._id,
        status: 'approved',
        startDate: { $lte: endOfToday },
        endDate: { $gte: startOfToday }
    })
        .select('startDate endDate leaveTypeName')
        .sort({ endDate: -1 });

    if (!activeLeave) return null;

    // The return date is the first working day AFTER the leave ends: a leave
    // of Sept 5-14 blocks through Sept 14 and access resumes on Sept 15.
    const returnDate = new Date(activeLeave.endDate);
    returnDate.setHours(0, 0, 0, 0);
    returnDate.setDate(returnDate.getDate() + 1);

    return {
        leaveId: activeLeave._id,
        leaveTypeName: activeLeave.leaveTypeName,
        startDate: activeLeave.startDate,
        endDate: activeLeave.endDate,
        returnDate
    };
};

/** Standard error payload shape used by both login and the `protect` middleware. */
const buildLeaveBlockResponse = (block) => ({
    success: false,
    code: 'ON_LEAVE_ACCESS_BLOCKED',
    message: `You are currently on leave. Your system access is temporarily unavailable during your `
        + `leave period. Access will be restored on your return date: ${new Date(block.returnDate).toDateString()}.`,
    returnDate: block.returnDate,
    leaveStartDate: block.startDate,
    leaveEndDate: block.endDate
});

module.exports = { getActiveLeaveBlock, buildLeaveBlockResponse };
