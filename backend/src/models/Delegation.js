const mongoose = require('mongoose');

const DelegationSchema = new mongoose.Schema({
    // Owning organization - responsibilities are only ever delegated within one employer.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    delegator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    delegate: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['task', 'authority', 'approval', 'project'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
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
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'revoked'],
        default: 'pending'
    },
    permissions: [{
        type: String,
        enum: ['view', 'edit', 'create', 'delete', 'approve']
    }],
    notes: {
        type: String
    },
    completedDate: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Delegation', DelegationSchema);