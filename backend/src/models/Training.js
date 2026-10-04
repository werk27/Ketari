const mongoose = require('mongoose');

const TrainingSchema = new mongoose.Schema({
    // Owning organization - the tenant boundary for all training records.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['technical', 'soft_skills', 'leadership', 'compliance', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    duration: {
        type: Number,
        required: true
    },
    durationUnit: {
        type: String,
        enum: ['hours', 'days', 'weeks'],
        default: 'days'
    },
    // Department this programme is organized for/originated from - a
    // snapshot from the source Training Need when prepared from one (see
    // trainingController.createTraining), or set directly by the HR Expert.
    // Optional: an org-wide programme with no single owning department is
    // valid and simply leaves this unset.
    department: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    departmentName: {
        type: String,
        default: ''
    },
    // The validated Training Need this programme was prepared from, if any
    // (mirrors Job.sourceRequisition). Never set for a programme an HR
    // Expert proposed directly with no originating need.
    sourceNeed: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrainingNeed',
        default: null
    },
    // Optional early cost estimate. Crossing the organization's threshold
    // (or an explicit `isStrategic` flag at creation) is what makes
    // Employer approval required after the HR Manager approves - see
    // requiresEmployerApproval and trainingController.decideTraining.
    estimatedCost: {
        type: Number,
        default: null
    },
    isStrategic: {
        type: Boolean,
        default: false
    },
    // Computed once, at creation, from estimatedCost/isStrategic against the
    // organization's threshold. Never a mandatory step for ordinary
    // training - see decideTraining's employer-approval branch.
    requiresEmployerApproval: {
        type: Boolean,
        default: false
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    provider: {
        type: String
    },
    trainer: {
        type: String
    },
    location: {
        type: String
    },
    maxParticipants: {
        type: Number,
        default: 20
    },
    participants: [{
        employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        registeredDate: { type: Date, default: Date.now },
        // Who added this participant: a Department Head nomination
        // (trainingController.nominateParticipant), an HR Expert directly
        // finalizing eligibility (manageParticipant), or null for a plain
        // employee self-registration (registerTraining).
        nominatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        completed: { type: Boolean, default: false },
        completionDate: { type: Date },
        certificate: { type: String },
        feedback: {
            rating: { type: Number, min: 1, max: 5 },
            comment: { type: String }
        }
    }],
    status: {
        type: String,
        // Full lifecycle: proposed -> pending_approval (HR Expert reviewed
        // and forwarded) -> approved | rejected (HR Manager decision) ->
        // open -> in_progress -> completed, with a returned_for_correction
        // detour (HR Expert sends a proposal back before forwarding it,
        // mirroring the Leave/Employee-Request/Job-Requisition workflows).
        // pending_employer_approval sits between the HR Manager's approval
        // and "approved" only when requiresEmployerApproval is true - see
        // trainingController.decideTraining/decideTrainingEmployer.
        // ('draft' is retained so programmes created before this change stay valid.)
        enum: [
            'draft', 'proposed', 'returned_for_correction', 'pending_approval',
            'pending_employer_approval', 'approved', 'rejected',
            'open', 'in_progress', 'completed', 'cancelled'
        ],
        default: 'proposed'
    },
    // HR Expert who proposed the programme
    proposedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Set by an HR Expert when returning the proposal for correction.
    // Cleared once the proposer resubmits (mirrors Leave/EmployeeRequest).
    returnReason: {
        type: String,
        default: ''
    },
    // HR Expert who reviewed and forwarded the proposal for approval
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    },
    // HR Manager who authorised it
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    decisionReason: {
        type: String,
        default: ''
    },
    // Employer who gave/refused the additional approval when
    // requiresEmployerApproval is true. Never set for ordinary training.
    employerDecisionBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    employerDecisionAt: {
        type: Date,
        default: null
    },
    employerDecisionReason: {
        type: String,
        default: ''
    },
    history: [{
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        note: { type: String, default: '' }
    }],
    // Skills this programme is intended to build, used for training-need matching.
    targetSkills: {
        type: [String],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Training', TrainingSchema);