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

module.exports = { notify, notifyRoles, notifyHrTeam };
