const Notification = require('../models/Notification');
const User = require('../models/User');
const { HR_ROLES } = require('../config/permissions');

/**
 * Notifications / pending tasks.
 *
 * The Notification model, the API and the frontend bell menu already existed,
 * but no code ever created a notification, so the bell was always empty. These
 * helpers let workflow steps raise the task for whoever needs to act next.
 *
 * Delivery must never break the workflow that triggered it, so failures are
 * logged and swallowed.
 */

/** Notify a single user. */
const notify = async ({ user, employer = null, type, title, message, link = '' }) => {
    try {
        if (!user) return null;
        return await Notification.create({ user, employer, type, title, message, link });
    } catch (error) {
        console.error('Notification failed:', error.message);
        return null;
    }
};

/**
 * Notify every holder of the given roles inside one organization.
 * Used for "a task is waiting for HR" style events where the specific
 * assignee is not known yet.
 */
const notifyRoles = async ({ employer, roles, type, title, message, link = '', excludeUser = null }) => {
    try {
        if (!employer || !roles || roles.length === 0) return [];

        const query = { employer, role: { $in: roles }, status: 'active' };
        if (excludeUser) query._id = { $ne: excludeUser };

        const recipients = await User.find(query).select('_id');
        return await Promise.all(
            recipients.map(r => notify({ user: r._id, employer, type, title, message, link }))
        );
    } catch (error) {
        console.error('Role notification failed:', error.message);
        return [];
    }
};

/** Convenience: notify the organization's HR Experts and HR Managers. */
const notifyHrTeam = (args) => notifyRoles({ ...args, roles: HR_ROLES });

/**
 * A workspace path for whoever is being notified.
 *
 * Every authenticated area is role-prefixed (/hr-expert/…, /employee/…), so a
 * hard-coded link is only correct for one kind of recipient and 404s for
 * everyone else. Notifications about shared workflow objects - a requisition,
 * a vacancy - go to people in several roles at once, so the prefix has to
 * follow the recipient.
 *
 * `section` must be a path that genuinely exists for every organization role
 * (e.g. 'requisitions'), otherwise resolve the link at the call site instead.
 */
const ROLE_WORKSPACE = {
    employer: 'employer',
    hr_expert: 'hr-expert',
    hr_manager: 'hr-manager',
    employee: 'employee',
    candidate: 'candidate'
};

const linkForUser = async (userId, section) => {
    try {
        const user = await User.findById(userId).select('role');
        return `/${ROLE_WORKSPACE[user?.role] || 'employee'}/${section}`;
    } catch (error) {
        return `/employee/${section}`;
    }
};

/**
 * Notify every System Administrator on the platform.
 *
 * Unlike notifyRoles, this is never scoped to one organization - an
 * administrator's own `employer` is always null, so the org-scoped query
 * above would never match them. `employer` here is carried on the
 * notification itself (which organization this is about), not used to find
 * the recipients.
 */
const notifyAdmins = async ({ employer = null, type, title, message, link = '' }) => {
    try {
        const admins = await User.find({ role: 'admin', status: 'active' }).select('_id');
        return await Promise.all(
            admins.map(a => notify({ user: a._id, employer, type, title, message, link }))
        );
    } catch (error) {
        console.error('Admin notification failed:', error.message);
        return [];
    }
};

module.exports = { notify, notifyRoles, notifyHrTeam, notifyAdmins, linkForUser };
