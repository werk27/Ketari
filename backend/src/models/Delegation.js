const mongoose = require('mongoose');

/**
 * Delegation workflow statuses.
 *
 * Request path (raised with delegation:request):
 *   pending_hr_expert_review -> pending_hr_manager_approval
 *     -> approved_pending_acceptance -> scheduled/active -> completed
 *   with detours to returned_for_correction (fix + resubmit),
 *   rejected_by_hr_manager, declined_by_delegate and revoked.
 *   The HR Expert's only corrective action is RETURNING for correction;
 *   terminal rejection is reserved for the HR Manager (same rule as the
 *   Leave and Job Requisition workflows). 'rejected_by_hr_expert' stays in
 *   the enum only so records rejected before this policy stay valid.
 *
 * Direct-grant path (delegation:create - HR Manager / Employer): skips the
 * review stages because the creator IS the approver, but still requires the
 * delegate's acceptance -> approved_pending_acceptance onwards.
 *
 * 'pending' and plain 'active' remain in the enum for records created before
 * this workflow existed (legacy direct grants). New records never receive
 * 'pending'.
 */
const DELEGATION_STATUSES = [
    'pending_hr_expert_review',
    'returned_for_correction',
    'rejected_by_hr_expert',
    'pending_hr_manager_approval',
    'rejected_by_hr_manager',
    'approved_pending_acceptance',
    'declined_by_delegate',
    'scheduled',
    'active',
    'revoked',
    'completed',
    // Legacy (pre-workflow) value, kept so existing documents stay valid.
    'pending'
];

/** Statuses from which the delegation can never grant capabilities again. */
const TERMINAL_STATUSES = [
    'rejected_by_hr_expert',
    'rejected_by_hr_manager',
    'declined_by_delegate',
    'revoked',
    'completed'
];

/**
 * Statuses under which capabilities may be in effect (still subject to the
 * date window). 'pending' is included ONLY for legacy direct grants created
 * before acceptance existed - new records reach 'scheduled'/'active' instead.
 */
const GRANTING_STATUSES = ['active', 'scheduled', 'pending'];

const HistoryEntrySchema = new mongoose.Schema({
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    fromStatus: { type: String, default: '' },
    toStatus: { type: String, default: '' },
    comment: { type: String, default: '' },
    at: { type: Date, default: Date.now }
}, { _id: false });

const DelegationSchema = new mongoose.Schema({
    // Owning organization - responsibilities are only ever delegated within one employer.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    delegator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    delegate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['task', 'authority', 'approval', 'project'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: DELEGATION_STATUSES,
        default: 'pending_hr_expert_review'
    },
    // Legacy field: stored for old records but never enforced anywhere.
    // The real permission scope is scopeType + scopedCapabilities below.
    permissions: [{
        type: String,
        enum: ['view', 'edit', 'create', 'delete', 'approve']
    }],
    // Explicit scope choice. 'specific' = only scopedCapabilities transfer;
    // 'full_role' = every intrinsic capability the delegator holds transfers
    // while the delegation is in effect. Legacy records (created before this
    // field existed) are resolved by scopedCapabilities length instead - see
    // services/delegationCapabilities.js.
    scopeType: {
        type: String,
        enum: ['specific', 'full_role'],
        default: undefined
    },
    // Capabilities the delegator holds that transfer when scopeType is
    // 'specific' (e.g. 'leave:approve'). Validated at request time and
    // re-intersected with the delegator's current intrinsic capabilities at
    // every authorization check - see resolveDelegatedCapabilities.
    scopedCapabilities: {
        type: [String],
        default: []
    },
    notes: {
        type: String
    },
    completedDate: {
        type: Date
    },
    // Full audit trail of the workflow: requested, returned, resubmitted,
    // validated, approved, rejected, accepted, declined, activated, revoked,
    // expired. Never overwritten, only appended to.
    history: {
        type: [HistoryEntrySchema],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

/** Append an audit entry without touching earlier ones. */
DelegationSchema.methods.addHistory = function ({ action, actor = null, fromStatus = '', toStatus = '', comment = '' }) {
    this.history.push({
        action,
        actor: actor ? actor._id || actor.id : null,
        actorName: actor ? actor.name || '' : 'System',
        actorRole: actor ? actor.role || '' : 'system',
        fromStatus,
        toStatus,
        comment: comment || '',
        at: new Date()
    });
};

const Delegation = mongoose.model('Delegation', DelegationSchema);
Delegation.DELEGATION_STATUSES = DELEGATION_STATUSES;
Delegation.TERMINAL_STATUSES = TERMINAL_STATUSES;
Delegation.GRANTING_STATUSES = GRANTING_STATUSES;

module.exports = Delegation;