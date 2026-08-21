const mongoose = require('mongoose');

/**
 * Employee Request
 *
 * A single workflow for every non-leave HR request an employee can raise:
 * break-year, resignation, transfer, termination and general requests.
 *
 * Workflow (see spec §12 / §32):
 *   submitted -> processing (HR Expert) -> approved | rejected (HR Manager) -> completed
 *
 * Separation of duties is enforced in the controller: the person who processes
 * a request may never be the person who approves it.
 */
const EmployeeRequestSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        index: true
    },
    // The account that raised the request, kept separately so the requester is
    // still identifiable if the employee record is later archived.
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['break_year', 'resignation', 'transfer', 'termination', 'promotion', 'other'],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    reason: {
        type: String,
        default: ''
    },
    // Optional period, used by break-year and transfer requests.
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    // Free-form details specific to the request type (e.g. target department
    // for a transfer). Kept flexible so new request types need no schema change.
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    status: {
        type: String,
        enum: ['submitted', 'processing', 'approved', 'rejected', 'completed', 'cancelled'],
        default: 'submitted',
        index: true
    },

    // HR Expert who processed and forwarded the request
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    processedAt: { type: Date, default: null },
    processingNote: { type: String, default: '' },

    // HR Manager who made the authorised decision
    decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    decidedAt: { type: Date, default: null },
    decisionReason: { type: String, default: '' },

    attachments: [{
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],

    history: [{
        status: String,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        changedAt: { type: Date, default: Date.now },
        note: String
    }]
}, {
    timestamps: true
});

EmployeeRequestSchema.index({ employer: 1, status: 1 });

module.exports = mongoose.model('EmployeeRequest', EmployeeRequestSchema);
