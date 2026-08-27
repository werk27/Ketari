const Delegation = require('../models/Delegation');
const User = require('../models/User');
const { capabilitiesFor, ORG_ROLES } = require('../config/permissions');

/**
 * Capabilities a user temporarily holds via delegations where they are
 * currently the delegate.
 *
 * While an active delegation names this user as the delegate, they
 * temporarily inherit the delegator's full role-based capability set - a
 * delegation "temporarily transfers responsibility from one member of an
 * organization to another" (see the Delegation model), so it is treated as
 * a full transfer, not a partial one, for as long as it is in effect.
 *
 * "In effect" is judged by date range rather than the `status` field alone:
 * a delegation created with a future start date stays `pending` until
 * someone manually flips it to `active`, so relying on status alone would
 * miss a delegation whose start date has already arrived.
 *
 * Used both by middleware/auth.js `protect` (to enforce it on API routes)
 * and by authController.js `buildAuthPayload` (so the frontend's own
 * `can()` checks - which decide whether to show an Approve/Reject button at
 * all - see the exact same capabilities the backend will actually allow).
 */
const resolveDelegatedCapabilities = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return [];

    const now = new Date();
    const activeDelegations = await Delegation.find({
        delegate: user._id,
        status: { $nin: ['revoked', 'completed'] },
        startDate: { $lte: now },
        endDate: { $gte: now }
    }).select('delegator');

    if (activeDelegations.length === 0) return [];

    const delegatorIds = [...new Set(activeDelegations.map(d => d.delegator.toString()))];
    const delegators = await User.find({ _id: { $in: delegatorIds } }).select('role permissions');

    const delegated = new Set();
    delegators.forEach(delegator => {
        capabilitiesFor(delegator).forEach(capability => delegated.add(capability));
    });

    return [...delegated];
};

module.exports = { resolveDelegatedCapabilities };
