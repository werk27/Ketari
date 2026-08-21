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
    status: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'rejected', 'cancelled'],
        default: 'pending'
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
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Leave', LeaveSchema);