const Delegation = require('../models/Delegation');
const User = require('../models/User');
const { capabilitiesFor, ORG_ROLES, NON_DELEGABLE_CAPABILITIES } = require('../config/permissions');

/**
 * Delegation as temporary SUBSTITUTION of responsibility.
 *
 * While a delegation is in effect:
 *   - the DELEGATE temporarily gains the delegated capabilities;
 *   - the DELEGATOR temporarily LOSES those same capabilities (they handed
 *     the responsibility over - it is not shared access);
 *   - both keep every capability that was not part of the transfer, and
 *     nobody's permanent role or permissions are touched.
 *
 * A delegation only takes effect once the full workflow finished:
 * HR Expert validated + HR Manager approved (or an authorized user created
 * it directly) + the delegate ACCEPTED, which moves it to 'scheduled' or
 * 'active'. Requests still travelling through review/approval, returned,
 * rejected, declined, revoked or completed delegations transfer NOTHING.
 *
 * 'In effect' is additionally judged by the date range: an accepted
 * delegation whose start date has not arrived yet ('scheduled') transfers
 * nothing until the date arrives, and every transfer reverses the instant
 * the end date passes - the delegator's authority is restored and the
 * delegate's borrowed authority disappears automatically, no scheduler
 * needed, because this runs inside the `protect` middleware on every
 * request.
 *
 * Personal self-service and organization-ownership capabilities never
 * transfer in either direction - see NON_DELEGABLE_CAPABILITIES in
 * config/permissions.js.
 *
 * Legacy note: 'pending' records created before this workflow existed were
 * direct grants that activated by date alone; they are still honored, but
 * new records never receive that status (see models/Delegation.js).
 *
 * Used both by middleware/auth.js `protect` (to enforce it on API routes)
 * and by authController.js `buildAuthPayload` (so the frontend's own
 * `can()` checks - which decide whether to show an Approve/Reject button at
 * all - see the exact same capabilities the backend will actually allow).
 */

const NON_DELEGABLE = new Set(NON_DELEGABLE_CAPABILITIES);

/** Delegations currently in effect involving this user, on either side. */
const inEffectInvolving = (userId, now) => ({
    $or: [{ delegate: userId }, { delegator: userId }],
    status: { $in: Delegation.GRANTING_STATUSES },
    startDate: { $lte: now },
    endDate: { $gte: now }
});

/** True when a delegation transfers only its listed capabilities. */
const isSpecific = (delegation) => {
    const scoped = Array.isArray(delegation.scopedCapabilities) ? delegation.scopedCapabilities : [];
    // Explicit scopeType wins; legacy records (no scopeType) fall back to
    // the old convention: non-empty list = specific, empty = full transfer.
    return delegation.scopeType ? delegation.scopeType === 'specific' : scoped.length > 0;
};

/** The capabilities one delegation currently transfers from its delegator. */
const capsTransferredBy = (delegation, delegatorCaps) => {
    if (isSpecific(delegation)) {
        // Scoped: transfer only the specifically chosen capabilities, and
        // never more than the delegator still currently holds themselves
        // (their own access may have narrowed since the delegation was
        // created).
        return delegation.scopedCapabilities.filter(c => delegatorCaps.includes(c) && !NON_DELEGABLE.has(c));
    }
    // Full-role transfer of every DELEGABLE intrinsic capability.
    return delegatorCaps.filter(c => !NON_DELEGABLE.has(c));
};

/** A user's intrinsic capabilities only - role + employer-granted, never
 *  anything borrowed or suspended. */
const intrinsicCapsOf = (user) => capabilitiesFor({ role: user.role, permissions: user.permissions });

/**
 * Everything the delegation system currently does to this user's authority:
 *   granted   - capabilities temporarily held as a DELEGATE
 *   suspended - own capabilities temporarily handed away as a DELEGATOR
 * One indexed query covers both directions.
 */
const resolveDelegationEffects = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return { granted: [], suspended: [] };

    const userId = (user._id || user.id).toString();
    const inEffect = await Delegation.find(inEffectInvolving(user._id || user.id, new Date()))
        .select('delegator delegate scopeType scopedCapabilities');

    if (inEffect.length === 0) return { granted: [], suspended: [] };

    const incoming = inEffect.filter(d => d.delegate.toString() === userId);
    const outgoing = inEffect.filter(d => d.delegator.toString() === userId);

    // --- granted: inherit from each delegator's current intrinsic set ------
    const granted = new Set();
    if (incoming.length > 0) {
        const delegatorIds = [...new Set(incoming.map(d => d.delegator.toString()))];
        const delegators = await User.find({ _id: { $in: delegatorIds } }).select('role permissions');
        const capsById = new Map(delegators.map(d => [d._id.toString(), intrinsicCapsOf(d)]));
        incoming.forEach(delegation => {
            const delegatorCaps = capsById.get(delegation.delegator.toString()) || [];
            capsTransferredBy(delegation, delegatorCaps).forEach(c => granted.add(c));
        });
    }

    // --- suspended: own capabilities handed away for the duration ----------
    const suspended = new Set();
    if (outgoing.length > 0) {
        const ownCaps = intrinsicCapsOf(user);
        outgoing.forEach(delegation => {
            capsTransferredBy(delegation, ownCaps).forEach(c => suspended.add(c));
        });
    }

    return { granted: [...granted], suspended: [...suspended] };
};

/** Back-compat wrapper: only the capabilities gained as a delegate. */
const resolveDelegatedCapabilities = async (user) => (await resolveDelegationEffects(user)).granted;

/**
 * Delegators whose IDENTITY-BOUND standing this user currently covers for a
 * given responsibility - e.g. "acting Department Head".
 *
 * Capability transfer alone cannot satisfy authorization checks that compare
 * the acting user against a specific assigned person (a department's
 * `manager`, a vacancy's owning HR Expert). Those checks call this to also
 * accept a user who holds an in-effect delegation from the assigned person,
 * where the delegation is full-role or specifically includes the capability
 * that governs the responsibility.
 *
 * Returns delegator id strings. The delegate acts under their OWN identity -
 * records they touch carry their id, never the delegator's.
 */
const resolveActingForDelegators = async (user, capability) => {
    if (!user || !ORG_ROLES.includes(user.role)) return [];

    const inEffect = await Delegation.find({
        delegate: user._id || user.id,
        status: { $in: Delegation.GRANTING_STATUSES },
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
    }).select('delegator scopeType scopedCapabilities');

    return [...new Set(inEffect
        .filter(d => !isSpecific(d) || (d.scopedCapabilities || []).includes(capability))
        .map(d => d.delegator.toString()))];
};

/**
 * Display-only summaries of delegations currently in effect, used by the
 * workspace banners: incoming = "you're covering X until Y" (delegate side),
 * outgoing = "you've handed X to Y until Z - it's unavailable to you until
 * then" (delegator side).
 */
const getActiveDelegationsSummary = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return [];

    const now = new Date();
    const activeDelegations = await Delegation.find({
        delegate: user._id,
        status: { $in: Delegation.GRANTING_STATUSES },
        startDate: { $lte: now },
        endDate: { $gte: now }
    })
        .populate('delegator', 'name')
        .select('delegator title type endDate scopeType scopedCapabilities')
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

const getOutgoingDelegationsSummary = async (user) => {
    if (!user || !ORG_ROLES.includes(user.role)) return [];

    const now = new Date();
    const outgoing = await Delegation.find({
        delegator: user._id,
        status: { $in: Delegation.GRANTING_STATUSES },
        startDate: { $lte: now },
        endDate: { $gte: now }
    })
        .populate('delegate', 'name')
        .select('delegate title type endDate scopeType scopedCapabilities')
        .sort({ endDate: 1 });

    return outgoing.map(d => ({
        id: d._id,
        title: d.title,
        type: d.type,
        delegateName: (d.delegate && d.delegate.name) || 'a colleague',
        endDate: d.endDate,
        scopedCapabilities: d.scopedCapabilities || []
    }));
};

module.exports = {
    resolveDelegationEffects,
    resolveDelegatedCapabilities,
    resolveActingForDelegators,
    getActiveDelegationsSummary,
    getOutgoingDelegationsSummary
};
