const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    // Owning organization - the tenant boundary for all leave records.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    leaveType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Configuration'
    },
    leaveTypeName: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    totalDays: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    // Sick Leave only: how many of totalDays fall into each statutory pay
    // tier (full pay / half pay / unpaid), based on how much Sick Leave the
    // employee had already used this year before this request. Left unset
    // for every other leave type, which are paid or unpaid as a whole.
    payBreakdown: {
        fullPayDays: { type: Number, default: undefined },
        halfPayDays: { type: Number, default: undefined },
        unpaidDays: { type: Number, default: undefined }
    },
    // Workflow (spec §17/§19): employee submits (pending) -> HR Expert is the
    // validation gate, which either sends it back for correction/clarification
    // or forwards it (under_review) -> HR Manager makes the final
    // approve/reject decision. HR Expert has no final-reject authority; only
    // the HR Manager may permanently reject a request, and HR Manager may
    // never decide on a request that has not passed through under_review.
    status: {
        type: String,
        enum: ['pending', 'returned_for_correction', 'under_review', 'approved', 'rejected', 'cancelled'],
        default: 'pending',
        index: true
    },
    // HR Expert who recorded and forwarded the request
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    processedAt: {
        type: Date,
        default: null
    },
    processingNote: {
        type: String,
        default: ''
    },
    // Set by the HR Expert when returning the request to the employee for
    // correction. Cleared once the employee resubmits.
    returnReason: {
        type: String,
        default: ''
    },
    // HR Manager who made the authorised decision
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedDate: {
        type: Date
    },
    rejectionReason: {
        type: String
    },
    attachments: [{
        name: String,
        url: String
    }],
    // Full history of who did what, when, so decisions stay auditable even
    // as the single `status` field moves on (mirrors JobRequisition.auditTrail).
    auditTrail: [{
        action: { type: String, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        note: { type: String, default: '' }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

LeaveSchema.index({ employee: 1, status: 1 });

module.exports = mongoose.model('Leave', LeaveSchema);