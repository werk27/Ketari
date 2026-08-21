const mongoose = require('mongoose');

const InterviewSchema = new mongoose.Schema({
    job: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Job',
        required: true
    },
    // Owning organization, denormalised from the vacancy for tenant-scoped queries.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    applicant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    interviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    title: {
        type: String,
        default: 'Candidate Interview'
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        default: '10:00 AM'
    },
    type: {
        type: String,
        enum: ['In-Person', 'Online (Video Call)', 'Technical Assessment', 'Phone Screen'],
        default: 'Online (Video Call)'
    },
    locationOrLink: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
        default: 'scheduled'
    },
    result: {
        type: String,
        enum: ['pending', 'passed', 'failed', 'reschedule', 'selected', 'rejected'],
        default: 'pending'
    },
    evaluationScore: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    evaluationComments: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Interview', InterviewSchema);
