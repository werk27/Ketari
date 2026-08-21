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
        // Full lifecycle: proposed -> approved -> open -> in_progress -> completed
        // ('draft' is retained so programmes created before this change stay valid.)
        enum: ['draft', 'proposed', 'approved', 'rejected', 'open', 'in_progress', 'completed', 'cancelled'],
        default: 'proposed'
    },
    // HR Expert who proposed the programme
    proposedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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