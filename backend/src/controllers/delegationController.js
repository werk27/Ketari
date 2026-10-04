const Delegation = require('../models/Delegation');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const { capabilitiesFor, CAPABILITIES, ORG_ROLES, NON_DELEGABLE_CAPABILITIES } = require('../config/permissions');
const { loadDepartmentHeadIndex, annotateAccount } = require('../services/roleDisplay');

/**
 * Delegation of responsibility (spec §15).
 *
 * A delegation temporarily transfers responsibility from one member of an
 * organization to another - for example while the delegator is on leave.
 * Delegations never cross an organization boundary and expire automatically.
 *
 * Workflow (see models/Delegation.js for the status list):
 *   REQUEST (delegation:request)          -> pending_hr_expert_review
 *   HR EXPERT validate (delegation:process) -> pending_hr_manager_approval
 *             return                        -> returned_for_correction (edit + resubmit)
 *             (no terminal reject - the Expert is a validation gate; final
 *              rejection is reserved for the HR Manager, matching Leave and
 *              Job Requisition)
 *   HR MANAGER approve (delegation:approve) -> approved_pending_acceptance
 *              reject                       -> rejected_by_hr_manager
 *   DELEGATE accept                         -> scheduled (future start) / active
 *            decline                        -> declined_by_delegate
 *   End date passes                         -> completed (capabilities stop instantly
 *                                              via resolveDelegatedCapabilities)
 *   Delegator revoke                        -> revoked
 *
 * Direct grants (delegation:create - HR Manager / Employer) skip the review
 * stages because the creator IS the approval authority, but still require
 * the delegate's acceptance before anything takes effect.
 */

const { TERMINAL_STATUSES } = Delegation;

/** The delegator's own intrinsic capabilities - never anything borrowed
 *  through someone else's delegation, so authority can never chain. */
const intrinsicCapabilities = (user) => capabilitiesFor({ role: user.role, permissions: user.permissions });

/** Does this user hold the capability intrinsically (not via delegation)? */
const intrinsicallyCan = (user, capability) => intrinsicCapabilities(user).includes(capability);

/**
 * Delegation windows are exact timestamps, so notifications must show the
 * time of day too - "5 Sept 2026" alone hides that a window runs 02:00 to
 * 14:00. Rendered in a fixed, unambiguous format (server locale applies to
 * month names only).
 */
const fmtWhen = (d) => new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

/**
 * Housekeeping run whenever delegation lists are read:
 *  - any non-terminal delegation whose end date passed -> completed
 *    (capabilities already stopped at the end date regardless - the
 *    authorization layer is date-driven - this only settles the record);
 *  - any accepted 'scheduled' delegation whose start date arrived -> active.
 */
const expireOverdueDelegations = async (employerId) => {
    const now = new Date();
    await Delegation.updateMany(
        { employer: employerId, status: { $nin: TERMINAL_STATUSES }, endDate: { $lt: now } },
        {
            $set: { status: 'completed', completedDate: now },
            $push: { history: { action: 'expired', actorName: 'System', actorRole: 'system', toStatus: 'completed', at: now } }
        }
    );
    await Delegation.updateMany(
        { employer: employerId, status: 'scheduled', startDate: { $lte: now }, endDate: { $gte: now } },
        {
            $set: { status: 'active' },
            $push: { history: { action: 'activated', actorName: 'System', actorRole: 'system', fromStatus: 'scheduled', toStatus: 'active', at: now } }
        }
    );
};

/**
 * First overlapping non-terminal delegation by the same delegator whose
 * scope collides with the proposed one - to ANY delegate. Delegation is a
 * temporary substitution: while a responsibility is handed to one colleague
 * the delegator does not hold it themselves, so they cannot hand the same
 * responsibility to a second person for an overlapping period. Two
 * 'specific' delegations only conflict when they share at least one
 * capability; a full-role delegation conflicts with anything in the period.
 */
const findConflictingDelegation = async ({ employerId, delegator, delegate, startDate, endDate, scopeType, scopedCapabilities, excludeId }) => {
    const query = {
        employer: employerId,
        delegator,
        status: { $nin: TERMINAL_STATUSES },
        startDate: { $lte: new Date(endDate) },
        endDate: { $gte: new Date(startDate) }
    };
    if (excludeId) query._id = { $ne: excludeId };

    const overlapping = await Delegation.find(query).select('title status scopeType scopedCapabilities');
    return overlapping.find(existing => {
        const existingSpecific = existing.scopeType
            ? existing.scopeType === 'specific'
            : (existing.scopedCapabilities || []).length > 0;
        if (!existingSpecific || scopeType !== 'specific') return true;
        return (existing.scopedCapabilities || []).some(c => scopedCapabilities.includes(c));
    });
};

/**
 * Validate the requester-editable body fields shared by create and
 * resubmit. Returns { error } or the sanitized values.
 */
const validateDelegationBody = async (req) => {
    const { delegate, title, startDate, endDate, scopeType, scopedCapabilities } = req.body;

    if (!delegate || !title || !startDate || !endDate) {
        return { error: 'Delegate, title, start date and end date are required' };
    }

    if (Number.isNaN(new Date(startDate).getTime()) || Number.isNaN(new Date(endDate).getTime())) {
        return { error: 'Start and end must be valid dates/times (ISO-8601)' };
    }

    // Delegation windows are exact timestamps: the window must have real
    // duration, so the end must be strictly AFTER the start - a zero-length
    // window (start === end) can never grant anything and is rejected.
    if (new Date(endDate) <= new Date(startDate)) {
        return { error: 'The end date/time must be after the start date/time' };
    }

    if (new Date(endDate) < new Date()) {
        return { error: 'The end date/time has already passed' };
    }

    if (delegate.toString() === req.user.id.toString()) {
        return { error: 'You cannot delegate responsibility to yourself' };
    }

    // The delegate must be an active member of the SAME organization -
    // resolved server-side from the authenticated user, never from a
    // client-supplied organization id.
    const delegateUser = await User.findById(delegate).select('employer status name role');
    const sameOrg = delegateUser && delegateUser.employer
        && delegateUser.employer.toString() === req.employerId.toString();

    if (!sameOrg || !ORG_ROLES.includes(delegateUser.role)) {
        return { error: 'The delegate must be a member of your organization' };
    }

    if (delegateUser.status !== 'active') {
        return { error: 'The delegate account is not active' };
    }

    // Explicit scope. 'specific' requires at least one capability the
    // requester INTRINSICALLY holds; 'full_role' transfers their intrinsic
    // capability set. Capabilities borrowed via someone else's delegation
    // can never be delegated onward (no chains), and personal self-service /
    // organization-ownership capabilities can never be delegated at all.
    const resolvedScopeType = scopeType === 'specific' ? 'specific' : 'full_role';
    let validatedScope = [];
    if (resolvedScopeType === 'specific') {
        if (!Array.isArray(scopedCapabilities) || scopedCapabilities.length === 0) {
            return { error: 'Select at least one responsibility to delegate, or choose full-role delegation' };
        }
        const nonDelegable = scopedCapabilities.filter(c => NON_DELEGABLE_CAPABILITIES.includes(c));
        if (nonDelegable.length > 0) {
            return { error: `These capabilities are personal or organization-ownership rights and cannot be delegated: ${nonDelegable.join(', ')}` };
        }
        const ownCapabilities = intrinsicCapabilities(req.user);
        const invalid = scopedCapabilities.filter(c => !ownCapabilities.includes(c));
        if (invalid.length > 0) {
            return { error: `You can only delegate capabilities you currently hold. Not held: ${invalid.join(', ')}` };
        }
        validatedScope = [...new Set(scopedCapabilities)];
    }

    return { delegateUser, scopeType: resolvedScopeType, validatedScope };
};

// @desc    Active members of the caller's organization who can be delegated to
// @route   GET /api/delegations/colleagues
// @access  Private (delegation:create)
//
// Deliberately NOT the /employers/me/team roster: that endpoint only lists
// HR staff (hr_expert, hr_manager, employer) for the "HR Team" management
// page. A delegation can go to ANY active member of the organization,
// including a plain employee, so it needs its own, broader listing.
exports.getDelegationCandidates = async (req, res) => {
    try {
        const colleagues = await User.find({
            employer: req.employerId,
            status: 'active',
            _id: { $ne: req.user.id }
        }).select('name email role').sort({ name: 1 }).lean();

        // Same annotation as the Employee Directory: a colleague who heads a
        // department is offered here as "Department Head", not a bare
        // "employee", so the delegate picker matches their assigned role.
        const headIndex = await loadDepartmentHeadIndex(req.employerId);
        const annotated = colleagues.map(c => annotateAccount(c, headIndex));

        res.status(200).json({ success: true, data: annotated });
    } catch (error) {
        console.error('Get Delegation Candidates Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create a delegation (direct grant) or a delegation request
// @route   POST /api/delegations
// @access  Private (delegation:create OR delegation:request)
exports.createDelegation = async (req, res) => {
    try {
        const { type, title, description, startDate, endDate, notes } = req.body;

        if (!type) {
            return res.status(400).json({ success: false, message: 'Delegation type is required' });
        }

        const validated = await validateDelegationBody(req);
        if (validated.error) {
            return res.status(400).json({ success: false, message: validated.error });
        }
        const { delegateUser, scopeType, validatedScope } = validated;

        // Reject clearly duplicate/conflicting delegations: same delegator ->
        // same delegate, overlapping period, colliding scope.
        const conflict = await findConflictingDelegation({
            employerId: req.employerId,
            delegator: req.user.id,
            delegate: delegateUser._id,
            startDate,
            endDate,
            scopeType,
            scopedCapabilities: validatedScope
        });
        if (conflict) {
            return res.status(400).json({
                success: false,
                message: `You have already delegated this responsibility for an overlapping period ("${conflict.title}", ${conflict.status.replace(/_/g, ' ')}). A responsibility can only be handed to one colleague at a time.`
            });
        }

        // The route allows either capability; which PATH applies is decided
        // by what the user INTRINSICALLY holds, so a borrowed
        // 'delegation:create' can never be used to skip the review stages.
        const isDirectGrant = intrinsicallyCan(req.user, CAPABILITIES.DELEGATION_CREATE);
        if (!isDirectGrant && !intrinsicallyCan(req.user, CAPABILITIES.DELEGATION_REQUEST)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to request a delegation'
            });
        }

        const initialStatus = isDirectGrant ? 'approved_pending_acceptance' : 'pending_hr_expert_review';

        const delegation = new Delegation({
            employer: req.employerId,
            delegator: req.user.id,
            delegate: delegateUser._id,
            type,
            title,
            description: description || '',
            startDate,
            endDate,
            scopeType,
            scopedCapabilities: validatedScope,
            notes: notes || '',
            status: initialStatus
        });
        delegation.addHistory({
            action: isDirectGrant ? 'created_direct' : 'requested',
            actor: req.user,
            toStatus: initialStatus,
            comment: description || ''
        });
        await delegation.save();

        if (isDirectGrant) {
            // Straight to the delegate for acceptance.
            await notificationService.notify({
                user: delegateUser._id,
                employer: req.employerId,
                type: 'delegation_assigned',
                title: 'Delegation awaiting your acceptance',
                message: `${req.user.name} wants to delegate "${title}" to you `
                    + `(${fmtWhen(startDate)} – ${fmtWhen(endDate)}). `
                    + 'Please accept or decline it.',
                link: await notificationService.linkForUser(delegateUser._id, 'delegation')
            });
        } else {
            // Request path: HR Experts validate first.
            await notificationService.notifyRoles({
                employer: req.employerId,
                roles: ['hr_expert'],
                excludeUser: req.user.id,
                type: 'delegation_request',
                title: 'Delegation request awaiting validation',
                message: `${req.user.name} requested to delegate "${title}" to ${delegateUser.name}. Please validate it.`,
                link: '/hr-expert/delegation'
            });
        }

        res.status(201).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Create Delegation Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(e => e.message)
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Edit and resubmit a request that was returned for correction
// @route   PUT /api/delegations/:id
// @access  Private (the delegator of a returned_for_correction request)
exports.resubmitDelegation = async (req, res) => {
    try {
        const delegation = await Delegation.findById(req.params.id);
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }
        if (delegation.employer && delegation.employer.toString() !== req.employerId.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        if (delegation.delegator.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the requester can edit this request' });
        }
        if (delegation.status !== 'returned_for_correction') {
            return res.status(400).json({
                success: false,
                message: 'Only a request returned for correction can be edited and resubmitted'
            });
        }

        const validated = await validateDelegationBody(req);
        if (validated.error) {
            return res.status(400).json({ success: false, message: validated.error });
        }
        const { delegateUser, scopeType, validatedScope } = validated;

        const conflict = await findConflictingDelegation({
            employerId: req.employerId,
            delegator: req.user.id,
            delegate: delegateUser._id,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            scopeType,
            scopedCapabilities: validatedScope,
            excludeId: delegation._id
        });
        if (conflict) {
            return res.status(400).json({
                success: false,
                message: `You have already delegated this responsibility for an overlapping period ("${conflict.title}", ${conflict.status.replace(/_/g, ' ')}).`
            });
        }

        delegation.delegate = delegateUser._id;
        delegation.type = req.body.type || delegation.type;
        delegation.title = req.body.title;
        delegation.description = req.body.description || '';
        delegation.startDate = req.body.startDate;
        delegation.endDate = req.body.endDate;
        delegation.scopeType = scopeType;
        delegation.scopedCapabilities = validatedScope;
        delegation.notes = req.body.notes || delegation.notes;
        delegation.addHistory({
            action: 'resubmitted',
            actor: req.user,
            fromStatus: 'returned_for_correction',
            toStatus: 'pending_hr_expert_review'
        });
        delegation.status = 'pending_hr_expert_review';
        await delegation.save();

        await notificationService.notifyRoles({
            employer: req.employerId,
            roles: ['hr_expert'],
            excludeUser: req.user.id,
            type: 'delegation_request',
            title: 'Delegation request resubmitted',
            message: `${req.user.name} corrected and resubmitted the delegation request "${delegation.title}".`,
            link: '/hr-expert/delegation'
        });

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Resubmit Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert validation gate: validate / return / reject
// @route   PUT /api/delegations/:id/review
// @access  Private (delegation:process)
exports.reviewDelegation = async (req, res) => {
    try {
        const { action, comment } = req.body;
        // Policy: the HR Expert is a validation gate, not a decision maker.
        // Their only corrective action is returning the request for
        // correction; a terminal reject is reserved for the HR Manager -
        // matching the Leave and Job Requisition workflows, so nothing can
        // be permanently killed without supervisory review.
        if (!['validate', 'return'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Action must be validate or return. Only the HR Manager may reject a delegation request.'
            });
        }
        if (action === 'return' && !comment) {
            return res.status(400).json({
                success: false,
                message: 'Explain what the requester should correct'
            });
        }

        const delegation = await Delegation.findById(req.params.id)
            .populate('delegator', 'name role employer status permissions')
            .populate('delegate', 'name role employer status');
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }
        if (delegation.employer && delegation.employer.toString() !== req.employerId.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        if (delegation.status !== 'pending_hr_expert_review') {
            return res.status(400).json({ success: false, message: 'This request is not awaiting HR Expert validation' });
        }
        // A reviewer can never validate a request they are part of.
        if ([delegation.delegator._id.toString(), delegation.delegate._id.toString()].includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You cannot review a delegation you are involved in' });
        }

        if (action === 'validate') {
            // Re-run the substance checks at validation time: the delegate may
            // have left/deactivated, or the delegator's capabilities narrowed,
            // since the request was submitted.
            if (delegation.delegate.status !== 'active') {
                return res.status(400).json({ success: false, message: 'The delegate account is no longer active' });
            }
            if (new Date(delegation.endDate) < new Date()) {
                return res.status(400).json({ success: false, message: 'The requested period has already ended' });
            }
            const scoped = delegation.scopedCapabilities || [];
            const isSpecific = delegation.scopeType ? delegation.scopeType === 'specific' : scoped.length > 0;
            if (isSpecific) {
                const delegatorCaps = intrinsicCapabilities(delegation.delegator);
                const invalid = scoped.filter(c => !delegatorCaps.includes(c));
                if (invalid.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: `The requester no longer holds: ${invalid.join(', ')}. Return the request for correction.`
                    });
                }
            }
        }

        const transitions = {
            validate: 'pending_hr_manager_approval',
            return: 'returned_for_correction'
        };
        const actions = { validate: 'validated', return: 'returned' };
        const nextStatus = transitions[action];

        delegation.addHistory({
            action: actions[action],
            actor: req.user,
            fromStatus: delegation.status,
            toStatus: nextStatus,
            comment: comment || ''
        });
        delegation.status = nextStatus;
        await delegation.save();

        const requesterLink = await notificationService.linkForUser(delegation.delegator._id, 'delegation');
        if (action === 'validate') {
            await notificationService.notifyRoles({
                employer: req.employerId,
                roles: ['hr_manager'],
                type: 'delegation_request',
                title: 'Delegation awaiting your approval',
                message: `The delegation request "${delegation.title}" (${delegation.delegator.name} → ${delegation.delegate.name}) was validated by HR and awaits your approval.`,
                link: '/hr-manager/delegation'
            });
            await notificationService.notify({
                user: delegation.delegator._id,
                employer: req.employerId,
                type: 'delegation_update',
                title: 'Delegation request validated',
                message: `Your delegation request "${delegation.title}" passed HR validation and moved to HR Manager approval.`,
                link: requesterLink
            });
        } else {
            await notificationService.notify({
                user: delegation.delegator._id,
                employer: req.employerId,
                type: 'delegation_update',
                title: 'Delegation request returned for correction',
                message: `HR returned your delegation request "${delegation.title}": ${comment}`,
                link: requesterLink
            });
        }

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Review Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Manager final decision: approve / reject
// @route   PUT /api/delegations/:id/decision
// @access  Private (delegation:approve)
exports.decideDelegation = async (req, res) => {
    try {
        const { action, comment } = req.body;
        if (!['approve', 'reject'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be approve or reject' });
        }
        if (action === 'reject' && !comment) {
            return res.status(400).json({ success: false, message: 'A rejection reason is required' });
        }

        const delegation = await Delegation.findById(req.params.id)
            .populate('delegator', 'name role')
            .populate('delegate', 'name role status');
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }
        if (delegation.employer && delegation.employer.toString() !== req.employerId.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        // Only HR Expert-validated requests ever reach this decision.
        if (delegation.status !== 'pending_hr_manager_approval') {
            return res.status(400).json({ success: false, message: 'This request is not awaiting HR Manager approval' });
        }
        if ([delegation.delegator._id.toString(), delegation.delegate._id.toString()].includes(req.user.id)) {
            return res.status(403).json({ success: false, message: 'You cannot decide on a delegation you are involved in' });
        }
        if (action === 'approve' && delegation.delegate.status !== 'active') {
            return res.status(400).json({ success: false, message: 'The delegate account is no longer active' });
        }

        const nextStatus = action === 'approve' ? 'approved_pending_acceptance' : 'rejected_by_hr_manager';
        delegation.addHistory({
            action: action === 'approve' ? 'approved' : 'rejected',
            actor: req.user,
            fromStatus: delegation.status,
            toStatus: nextStatus,
            comment: comment || ''
        });
        delegation.status = nextStatus;
        await delegation.save();

        const requesterLink = await notificationService.linkForUser(delegation.delegator._id, 'delegation');
        if (action === 'approve') {
            await notificationService.notify({
                user: delegation.delegate._id,
                employer: req.employerId,
                type: 'delegation_assigned',
                title: 'Delegation awaiting your acceptance',
                message: `An approved delegation of "${delegation.title}" from ${delegation.delegator.name} `
                    + `(${fmtWhen(delegation.startDate)} – ${fmtWhen(delegation.endDate)}) awaits your acceptance.`,
                link: await notificationService.linkForUser(delegation.delegate._id, 'delegation')
            });
            await notificationService.notify({
                user: delegation.delegator._id,
                employer: req.employerId,
                type: 'delegation_update',
                title: 'Delegation request approved',
                message: `Your delegation request "${delegation.title}" was approved and now awaits ${delegation.delegate.name}'s acceptance.`,
                link: requesterLink
            });
        } else {
            await notificationService.notify({
                user: delegation.delegator._id,
                employer: req.employerId,
                type: 'delegation_update',
                title: 'Delegation request rejected',
                message: `The HR Manager rejected your delegation request "${delegation.title}": ${comment}`,
                link: requesterLink
            });
        }

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Decide Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delegate accepts or declines an approved delegation
// @route   PUT /api/delegations/:id/respond
// @access  Private (the delegate only)
exports.respondToDelegation = async (req, res) => {
    try {
        const { action, comment } = req.body;
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({ success: false, message: 'Action must be accept or decline' });
        }

        const delegation = await Delegation.findById(req.params.id).populate('delegator', 'name');
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }
        if (delegation.delegate.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Only the delegate can respond to this delegation' });
        }
        if (delegation.status !== 'approved_pending_acceptance') {
            return res.status(400).json({ success: false, message: 'This delegation is not awaiting your acceptance' });
        }
        if (new Date(delegation.endDate) < new Date()) {
            return res.status(400).json({ success: false, message: 'This delegation period has already ended' });
        }

        let nextStatus;
        if (action === 'accept') {
            // Never active before its start date - 'scheduled' grants nothing
            // until the date arrives (see resolveDelegatedCapabilities).
            nextStatus = new Date(delegation.startDate) > new Date() ? 'scheduled' : 'active';
        } else {
            nextStatus = 'declined_by_delegate';
        }

        delegation.addHistory({
            action: action === 'accept' ? 'accepted' : 'declined',
            actor: req.user,
            fromStatus: delegation.status,
            toStatus: nextStatus,
            comment: comment || ''
        });
        delegation.status = nextStatus;
        await delegation.save();

        await notificationService.notify({
            user: delegation.delegator._id,
            employer: delegation.employer,
            type: 'delegation_update',
            title: action === 'accept' ? 'Delegation accepted' : 'Delegation declined',
            message: action === 'accept'
                ? `${req.user.name} accepted the delegation "${delegation.title}". `
                    + (nextStatus === 'scheduled'
                        ? `It becomes active on ${fmtWhen(delegation.startDate)}.`
                        : 'It is now active.')
                : `${req.user.name} declined the delegation "${delegation.title}"${comment ? `: ${comment}` : '.'}`,
            link: await notificationService.linkForUser(delegation.delegator._id, 'delegation')
        });

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Respond To Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delegations involving the signed-in user
// @route   GET /api/delegations
// @access  Private
exports.getDelegations = async (req, res) => {
    try {
        if (req.user.employer) await expireOverdueDelegations(req.user.employer);

        const delegations = await Delegation.find({
            $or: [{ delegator: req.user.id }, { delegate: req.user.id }]
        })
            .populate('delegator', 'name email role')
            .populate('delegate', 'name email role')
            .sort({ createdAt: -1 })
            .lean();

        // Annotate both sides with Department Head status so the delegator
        // and delegate are described the same way they are everywhere else.
        const headIndex = await loadDepartmentHeadIndex(req.user.employer);
        const annotated = delegations.map(d => ({
            ...d,
            delegator: annotateAccount(d.delegator, headIndex),
            delegate: annotateAccount(d.delegate, headIndex)
        }));

        res.status(200).json({ success: true, data: annotated });
    } catch (error) {
        console.error('Get Delegations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    All delegations within the organization
// @route   GET /api/delegations/organization
// @access  Private (delegation:view)
exports.getOrganizationDelegations = async (req, res) => {
    try {
        await expireOverdueDelegations(req.employerId);

        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;

        const delegations = await Delegation.find(query)
            .populate('delegator', 'name email role')
            .populate('delegate', 'name email role')
            .sort({ createdAt: -1 })
            .lean();

        const headIndex = await loadDepartmentHeadIndex(req.employerId);
        const annotated = delegations.map(d => ({
            ...d,
            delegator: annotateAccount(d.delegator, headIndex),
            delegate: annotateAccount(d.delegate, headIndex)
        }));

        res.status(200).json({ success: true, count: annotated.length, data: annotated });
    } catch (error) {
        console.error('Get Organization Delegations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Revoke (delegator) or mark complete (delegator/delegate)
// @route   PUT /api/delegations/:id/status
// @access  Private (delegator or delegate)
exports.updateDelegationStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;
        const allowed = ['completed', 'revoked'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(', ')}. Workflow steps use the review/decision/respond endpoints.`
            });
        }

        const delegation = await Delegation.findById(req.params.id).populate('delegate', 'name');
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }

        const isDelegator = delegation.delegator.toString() === req.user.id;
        const isDelegate = delegation.delegate._id.toString() === req.user.id;

        if (!isDelegator && !isDelegate) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        if (TERMINAL_STATUSES.includes(delegation.status)) {
            return res.status(400).json({ success: false, message: 'This delegation has already ended' });
        }

        // Only the delegator may withdraw a delegation/request they raised.
        if (status === 'revoked' && !isDelegator) {
            return res.status(403).json({
                success: false,
                message: 'Only the delegator can revoke a delegation'
            });
        }

        // 'completed' is an early hand-back of a delegation that is actually
        // in effect - it must never be a shortcut around the workflow.
        if (status === 'completed' && !['active', 'scheduled', 'pending'].includes(delegation.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only an accepted delegation can be marked complete. Use revoke to withdraw a request.'
            });
        }

        delegation.addHistory({
            action: status === 'revoked' ? 'revoked' : 'completed_early',
            actor: req.user,
            fromStatus: delegation.status,
            toStatus: status,
            comment: notes || ''
        });
        const wasInEffect = ['active', 'scheduled', 'pending'].includes(delegation.status);
        delegation.status = status;
        delegation.completedDate = new Date();
        if (notes) delegation.notes = notes;

        await delegation.save();

        if (status === 'revoked' && wasInEffect && !isDelegate) {
            await notificationService.notify({
                user: delegation.delegate._id,
                employer: delegation.employer,
                type: 'delegation_update',
                title: 'Delegation revoked',
                message: `${req.user.name} revoked the delegation "${delegation.title}". The delegated responsibility ends immediately.`,
                link: await notificationService.linkForUser(delegation.delegate._id, 'delegation')
            });
        }

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Update Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
