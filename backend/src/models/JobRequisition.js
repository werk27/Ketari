const mongoose = require('mongoose');

/**
 * Job Requisition / Manpower Request.
 *
 * The bridge between an organization's configured departments and the
 * recruitment module: a department raises a staffing need, HR reviews and
 * prepares it, HR Manager approves it, and only then may a vacancy be
 * created from it.
 *
 * Workflow (spec: Job Requisition workflow):
 *   draft -> submitted -> (returned <-> submitted) -> pending_approval
 *          -> approved | rejected -> job_created
 *
 * "HR Review" from the spec is the action an HR Expert takes on a submitted
 * requisition (return it or forward it) rather than a separate stored state -
 * there is nothing else to record about a requisition sitting in the queue
 * that the audit trail (below) does not already capture.
 *
 * Separation of duties (enforced in the controller, mirrors Job/EmployeeRequest):
 *   - HR Expert may prepare/return a requisition, including one it raised
 *     itself, but can NEVER approve/reject any requisition (that is
 *     HR Manager only, and never the org:config capability HR Manager is
 *     deliberately never granted).
 *   - HR Manager may never approve/reject a requisition it raised or
 *     processed itself.
 */
const JobRequisitionSchema = new mongoose.Schema({
    // Owning organization - the tenant boundary for every query.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        required: true,
        index: true
    },

    // Department must come from the organization's own configured list -
    // never free text. Stored as the Configuration sub-document id (the same
    // pattern already used by Employee.employmentInfo.department), plus a
    // snapshot of its name so the requisition keeps a stable, readable label
    // even if the department is later renamed or deactivated.
    department: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    departmentName: {
        type: String,
        required: true
    },

    // Position/Job Title - uses the organization's configured position list
    // where one is chosen (positionId + snapshot title); falls back to a
    // typed title for organizations that have not configured positions yet.
    position: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    positionTitle: {
        type: String,
        required: true,
        trim: true
    },

    numberOfPositions: {
        type: Number,
        required: true,
        min: [1, 'At least one position must be requested']
    },
    requestType: {
        type: String,
        enum: ['new_position', 'replacement', 'additional_headcount'],
        required: true
    },
    employmentType: {
        type: String,
        enum: ['Full-Time', 'Part-Time', 'Contract', 'Freelance'],
        default: 'Full-Time'
    },
    level: {
        type: String,
        enum: ['Beginner', 'Junior', 'Intermediate', 'Senior'],
        required: true
    },
    education: { type: String, default: '' },
    experience: { type: String, default: '' },
    skills: { type: [String], default: [] },
    languages: { type: [String], default: [] },
    licenses: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    competencies: { type: [String], default: [] },
    startDate: {
        type: Date,
        required: true
    },

    // One fixed salary amount - identical rule and shape to Job.salary, so it
    // can flow straight into the vacancy unchanged.
    salary: {
        amount: {
            type: Number,
            required: [true, 'Salary is required'],
            min: [1, 'Salary must be a positive amount']
        },
        currency: { type: String, default: 'ETB' },
        period: {
            type: String,
            enum: ['hourly', 'daily', 'weekly', 'monthly', 'annual'],
            default: 'monthly'
        }
    },

    reason: {
        type: String,
        required: [true, 'A reason/justification for hiring is required'],
        trim: true
    },

    status: {
        type: String,
        enum: ['draft', 'submitted', 'returned', 'pending_approval', 'approved', 'rejected', 'job_created'],
        default: 'draft',
        index: true
    },

    // The department/requester who raised the need.
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // HR Expert who reviewed/prepared it and forwarded it for approval.
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    processedAt: { type: Date, default: null },

    // HR Manager who approved or rejected it.
    decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    decidedAt: { type: Date, default: null },

    returnReason: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },

    // Set once a vacancy has been created from this approved requisition.
    linkedJob: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
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

JobRequisitionSchema.index({ employer: 1, status: 1 });

module.exports = mongoose.model('JobRequisition', JobRequisitionSchema);
