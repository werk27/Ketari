const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    resume: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume'
    },
    // Owning organization, denormalised from the job for efficient tenant-scoped queries.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    status: {
        type: String,
        enum: [
            'applied', 'pending', 'under_review', 'ai_analyzed', 'shortlisted',
            'interview', 'interview_scheduled', 'interviewed', 'selected',
            'offered', 'rejected', 'hired', 'withdrawn'
        ],
        default: 'applied'
    },
    // ============================================
    // PROCESSING TRAIL
    // HR Expert screens and shortlists; HR Manager makes the authorised decision.
    // Keeping these separate enforces that no single user both does and approves.
    // ============================================
    screenedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    screenedAt: {
        type: Date,
        default: null
    },
    shortlistedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    shortlistedAt: {
        type: Date,
        default: null
    },
    decision: {
        outcome: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        decidedAt: { type: Date, default: null },
        reason: { type: String, default: '' }
    },
    matchScore: {
        type: Number,
        min: 0,
        max: 100
    },
    matchDetails: {
        skillsScore: { type: Number, default: 0 },
        educationScore: { type: Number, default: 0 },
        experienceScore: { type: Number, default: 0 },
        locationScore: { type: Number, default: 0 },
        languageScore: { type: Number, default: 0 },
        matchingSkills: { type: [String], default: [] },
        missingSkills: { type: [String], default: [] },
        // Human-readable justification so HR can see WHY the AI recommended a candidate.
        // AI assists the decision; it never makes the final hiring decision.
        reasons: { type: [String], default: [] },
        analyzedAt: { type: Date, default: null }
    },
    coverLetter: String,
    notes: String,
    interviewDate: Date,
    interviewLocation: String,
    statusHistory: [{
        status: String,
        date: {
            type: Date,
            default: Date.now
        },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

ApplicationSchema.index({ job: 1, applicant: 1 });
ApplicationSchema.index({ employer: 1, status: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
