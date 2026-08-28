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
    }).select('delegator scopedCapabilities');

    if (activeDelegations.length === 0) return [];

    const delegatorIds = [...new Set(activeDelegations.map(d => d.delegator.toString()))];
    const delegators = await User.find({ _id: { $in: delegatorIds } }).select('role permissions');
    const delegatorCapsById = new Map(delegators.map(d => [d._id.toString(), capabilitiesFor(d)]));

    const delegated = new Set();
    activeDelegations.forEach(delegation => {
        const delegatorCaps = delegatorCapsById.get(delegation.delegator.toString()) || [];
        if (Array.isArray(delegation.scopedCapabilities) && delegation.scopedCapabilities.length > 0) {
            // Scoped: grant only the specifically chosen capabilities, and
            // never more than the delegator still currently holds themselves
            // (their own access may have narrowed since the delegation was
            // created).
            delegation.scopedCapabilities
                .filter(c => delegatorCaps.includes(c))
                .forEach(c => delegated.add(c));
        } else {
            // Unscoped (the default): full transfer, as before.
            delegatorCaps.forEach(c => delegated.add(c));
        }
    });

    return [...delegated];
};

module.exports = { resolveDelegatedCapabilities };

/**
 * Lightweight, display-only summary of delegations currently in effect where
 * this user is the delegate - "you're covering X's leave approvals until Y" -
 * used purely to show the user why they might see extra actions available.
 * Kept separate from resolveDelegatedCapabilities (which only needs ids, not
 * names) so that function's already-tested query is never touched.
 */
const getActiveDelegationsSummary = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return [];

    const now = new Date();
    const activeDelegations = await Delegation.find({
        delegate: user._id,
        status: { $nin: ['revoked', 'completed'] },
        startDate: { $lte: now },
        endDate: { $gte: now }
    })
        .populate('delegator', 'name')
        .select('delegator title type endDate scopedCapabilities')
        .sort({ endDate: 1 });

    return activeDelegations.map(d => ({
        id: d._id,
        title: d.title,
        type: d.type,
        delegatorName: (d.delegator && d.delegator.name) || 'a colleague',
        endDate: d.endDate,
        scopedCapabilities: d.scopedCapabilities || []
    }));
};

module.exports.getActiveDelegationsSummary = getActiveDelegationsSummary;
