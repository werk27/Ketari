const mongoose = require('mongoose');

const ComplaintSchema = new mongoose.Schema({
    // The account that raised the complaint. Candidates have no Employee record,
    // so submitter identity is tracked on the User rather than the Employee.
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    // Set only when the complainant is a member of staff.
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null
    },
    // Organization the complaint concerns. Null for platform/technical issues
    // raised by a candidate who is not tied to a specific employer.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    // Separates workplace grievances from recruitment-process feedback.
    category: {
        type: String,
        enum: ['employee', 'recruitment', 'interview', 'technical', 'other'],
        default: 'other'
    },
    title: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'harassment', 'discrimination', 'work_environment', 'salary', 'benefits',
            'management', 'application_issue', 'interview_concern', 'process_feedback',
            'technical', 'other'
        ],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        // 'pending' is retained so complaints created before this change stay valid.
        enum: ['pending', 'submitted', 'under_review', 'investigating', 'responded', 'resolved', 'rejected'],
        default: 'submitted'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        type: String
    },
    resolvedDate: {
        type: Date
    },
    attachments: [{
        name: String,
        url: String
    }],
    history: [{
        action: String,
        note: String,
        date: { type: Date, default: Date.now },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Complaint', ComplaintSchema);