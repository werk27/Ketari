const AuditLog = require('../models/AuditLog');

/**
 * HR activity / audit trail.
 *
 * The AuditLog model and the admin dashboard's "recent activity" feed already
 * existed, but nothing ever wrote an entry, so the feed was permanently empty.
 * Every important recruitment/HR action now records who did what, when, and the
 * value it moved from and to.
 *
 * Auditing must never break the operation it is recording, so failures here are
 * logged and swallowed rather than thrown.
 */
const record = async (req, { action, entity, entityId = '', details = '', from, to }) => {
    try {
        const user = req && req.user;
        if (!user) return null;

        const transition = (from !== undefined || to !== undefined)
            ? ` (${from ?? 'none'} -> ${to ?? 'none'})`
            : '';

        return await AuditLog.create({
            user: user.id || user._id,
            userName: user.name || 'System User',
            userRole: user.role || 'user',
            action,
            entity,
            entityId: entityId ? entityId.toString() : '',
            details: `${details}${transition}`.trim(),
            ipAddress: (req.headers && (req.headers['x-forwarded-for'] || req.ip)) || ''
        });
    } catch (error) {
        console.error('Audit log failed:', error.message);
        return null;
    }
};

module.exports = { record };
