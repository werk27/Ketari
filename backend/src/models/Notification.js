const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Present when the notification relates to a specific organization's activity.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null
    },
    type: {
        type: String,
        enum: [
            // Recruitment
            'application_update', 'interview_scheduled', 'job_approved', 'job_rejected',
            'vacancy_pending_approval', 'new_application', 'hiring_decision', 'vacancy_filled',
            // Job Requisition
            'requisition_submitted', 'requisition_returned', 'requisition_pending_approval',
            'requisition_approved', 'requisition_rejected', 'requisition_job_created',
            // HR operations
            'leave_request', 'leave_returned', 'leave_decision', 'request_submitted', 'request_returned', 'request_decision',
            'training_assigned', 'training_returned', 'training_decision',
            'delegation_assigned', 'delegation_request', 'delegation_update',
            'complaint_update', 'document_expiring',
            // Platform
            'employer_registered', 'account_update', 'general'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    link: {
        type: String,
        default: ''
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', NotificationSchema);
