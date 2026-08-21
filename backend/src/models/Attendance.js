const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    // Owning organization - the tenant boundary for attendance records.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    date: {
        type: Date,
        required: true
    },
    checkIn: {
        time: { type: Date },
        method: { type: String, enum: ['manual', 'biometric', 'web', 'mobile'] },
        location: { type: String }
    },
    checkOut: {
        time: { type: Date },
        method: { type: String, enum: ['manual', 'biometric', 'web', 'mobile'] },
        location: { type: String }
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'],
        default: 'absent'
    },
    hoursWorked: {
        type: Number,
        default: 0
    },
    overtime: {
        type: Number,
        default: 0
    },
    note: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Attendance', AttendanceSchema);