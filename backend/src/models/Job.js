const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a job title'],
        trim: true
    },
    department: {
        type: String,
        required: [true, 'Please add a department']
    },
    position: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        required: [true, 'Please add a job description']
    },
    responsibilities: {
        type: [String],
        default: []
    },
    // Required competencies (soft/behavioural, distinct from technical
    // requirements.skills) - included so an approved Job Requisition can flow
    // straight into vacancy creation without re-typing anything.
    competencies: {
        type: [String],
        default: []
    },
    requirements: {
        education: String,
        experience: String,
        skills: [String],
        qualifications: [String],
        preferredSkills: { type: [String], default: [] },
        languages: { type: [String], default: [] },
        certifications: { type: [String], default: [] },
        minimumExperienceYears: { type: Number, default: 0, min: 0 }
    },
    workMode: {
        type: String,
        enum: ['On-site', 'Remote', 'Hybrid'],
        default: 'On-site'
    },
    employmentType: {
        type: String,
        enum: ['Full-Time', 'Part-Time', 'Contract', 'Freelance'],
        default: 'Full-Time'
    },
    experienceLevel: {
        type: String,
        enum: ['Entry', 'Intermediate', 'Expert', 'Any'],
        default: 'Any'
    },
    budgetType: {
        type: String,
        enum: ['Fixed', 'Hourly', 'Milestone', 'Negotiable'],
        default: 'Negotiable'
    },
    expectedDuration: {
        type: String,
        default: 'More than 6 months'
    },
    tags: {
        type: [String],
        default: []
    },
    numberOfPositions: {
        type: Number,
        default: 1,
        min: 1
    },
    // ============================================
    // ACADEMIC REQUIREMENTS
    // ============================================
    academicRequirements: {
        fieldOfStudy: {
            type: [String],
            default: []
        },
        minimumGPA: {
            type: Number,
            min: 0,
            max: 4,
            default: 0
        },
        yearOfStudy: {
            type: String,
            enum: ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate', 'Any'],
            default: 'Any'
        },
        university: {
            type: String,
            default: ''
        }
    },
    // ============================================
    // BENEFITS (NEW)
    // ============================================
    benefits: {
        type: [String],
        default: []
    },
    location: {
        type: String,
        required: true
    },
    salary: {
        // A single fixed amount, not a range and never "negotiable" - the
        // business rule is one required, specific figure the employer commits
        // to (e.g. "25,000 ETB/month"), consistent everywhere the vacancy is
        // shown. Kept as a sub-document (not a bare number) so currency and
        // pay period travel with the amount.
        amount: {
            type: Number,
            required: [true, 'Salary is required'],
            min: [1, 'Salary must be a positive amount']
        },
        currency: {
            type: String,
            default: 'ETB'
        },
        period: {
            type: String,
            enum: ['hourly', 'daily', 'weekly', 'monthly', 'annual'],
            default: 'monthly'
        }
    },
    applicationDeadline: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'pending_approval', 'approved', 'published', 'open', 'closed', 'rejected', 'archived'],
        default: 'draft'
    },
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    submittedAt: {
        type: Date,
        default: null
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    // Full audit trail of the vacancy lifecycle (create -> submit -> approve/reject -> publish -> close)
    statusHistory: [{
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        note: String
    }],
    hr_expert: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Owning organization. This is the tenant boundary for all recruitment data.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    // Present when this vacancy was created from an approved Job Requisition.
    // Its essential staffing fields (title, department, position, headcount,
    // employment type, requirements, salary) were approved by the HR Manager
    // as part of that requisition and are locked from silent edits here - see
    // jobController.updateJob and the requisition "amend" workflow.
    sourceRequisition: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'JobRequisition',
        default: null
    },
    // Legacy: the individual user account that created the vacancy before
    // organizations existed. Retained so historical records stay resolvable.
    createdByUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    applications: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application'
    }],
    viewCount: {
        type: Number,
        default: 0
    },
    proposalsCount: {
        type: Number,
        default: 0
    },
    savedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

JobSchema.index({ title: 'text', description: 'text' });
JobSchema.index({ employer: 1, status: 1 });

// Statuses that make a vacancy visible to candidates on the public job board.
JobSchema.statics.PUBLIC_STATUSES = ['published', 'approved', 'open'];

module.exports = mongoose.model('Job', JobSchema);