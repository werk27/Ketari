const mongoose = require('mongoose');

/**
 * Training Need / personal interest request.
 *
 * The bridge between a training gap someone has identified and the actual
 * Training Program module: a Department Head raises a need for their own
 * department (or an Employee raises a personal interest request), HR Expert
 * reviews it (returns it for correction, or validates it), and once
 * validated an HR Expert prepares the real Training Program from it (see
 * trainingController.createTraining's `sourceNeed` handling). Mirrors the
 * Job Requisition -> Vacancy bridge (JobRequisition.linkedJob) so the same
 * proven pattern is reused rather than duplicated.
 *
 * Workflow:
 *   submitted -> (returned_for_correction <-> submitted, HR Expert review)
 *              -> validated -> program_created (an HR Expert prepared the
 *                 Training Program from it - see linkedTraining)
 *
 * There is no HR Manager or Employer decision on the NEED itself - that
 * approval authority applies to the Training Program an HR Expert prepares
 * from a validated need, never to the need directly.
 *
 * Separation of duties: an HR Expert reviews needs someone else raised - it
 * never raises its own department need (Department Head is never an HR
 * Expert in the normal case), and its own review action (`processedBy`) is
 * recorded for the same audit reasons as Job Requisition/Training.
 */
const TrainingNeedSchema = new mongoose.Schema({
    // Owning organization - the tenant boundary for every query.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        required: true,
        index: true
    },

    // 'department': an organizational need raised by that department's
    // assigned head (or their active delegate) - only valid for their own
    // department. 'personal': an employee's own training interest, which is
    // NOT the same as raising an organization-wide training program request
    // and carries no department-head restriction.
    origin: {
        type: String,
        enum: ['department', 'personal'],
        required: true
    },

    // Department must come from the organization's own configured list -
    // never free text - mirroring JobRequisition.department/departmentName.
    // For a 'personal' request this is a snapshot of the requester's own
    // department for reporting context only, never an authorization check.
    department: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    departmentName: {
        type: String,
        default: ''
    },

    title: {
        type: String,
        required: true,
        trim: true
    },
    trainingType: {
        type: String,
        enum: ['technical', 'soft_skills', 'leadership', 'compliance', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },

    // Employees the Department Head suggests while raising a department
    // need. Informational only at this stage - actual participant
    // nomination/finalization happens on the approved Training Program (see
    // trainingController.nominateParticipant), never here.
    proposedParticipants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],

    urgency: {
        type: String,
        enum: ['low', 'normal', 'high'],
        default: 'normal'
    },

    // Optional early cost estimate, carried over to the Training Program if
    // one is prepared from this need (see trainingController.createTraining),
    // which is what determines whether Employer approval is required.
    estimatedCost: {
        type: Number,
        default: null
    },

    status: {
        type: String,
        enum: ['submitted', 'returned_for_correction', 'validated', 'program_created'],
        default: 'submitted',
        index: true
    },

    // The Department Head or Employee who raised it.
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // HR Expert who reviewed it (returned it, or validated it).
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    processedAt: { type: Date, default: null },

    returnReason: { type: String, default: '' },

    // Set once an HR Expert has prepared the actual Training Program from
    // this validated need (mirrors JobRequisition.linkedJob).
    linkedTraining: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Training',
        default: null
    },

    // Full audit trail: who did what, when.
    auditTrail: [{
        action: { type: String, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        note: { type: String, default: '' }
    }]
}, {
    timestamps: true
});

TrainingNeedSchema.index({ employer: 1, status: 1 });

module.exports = mongoose.model('TrainingNeed', TrainingNeedSchema);
