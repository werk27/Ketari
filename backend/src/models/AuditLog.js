const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        default: 'System User'
    },
    userRole: {
        type: String,
        default: 'user'
    },
    action: {
        type: String,
        required: true
    },
    entity: {
        type: String,
        required: true // 'Job', 'Application', 'Interview', 'User', 'Config'
    },
    entityId: {
        type: String,
        default: ''
    },
    details: {
        type: String,
        default: ''
    },
    ipAddress: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
