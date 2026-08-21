const express = require('express');
const router = express.Router();
const {
    checkIn,
    checkOut,
    getMyAttendance,
    getAttendanceReport,
    recordAttendance
} = require('../controllers/attendanceController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/attendance/check-in
// @desc    Check in for today
// @access  Private (organization members)
router.post('/check-in', protect, can(CAPABILITIES.ATTENDANCE_SELF), checkIn);

// @route   POST /api/attendance/check-out
// @desc    Check out for today
// @access  Private (organization members)
router.post('/check-out', protect, can(CAPABILITIES.ATTENDANCE_SELF), checkOut);

// @route   GET /api/attendance/me
// @desc    The signed-in user's own attendance
// @access  Private
router.get('/me', protect, getMyAttendance);

// @route   POST /api/attendance/record
// @desc    Record attendance for an employee (also the device/system integration point)
// @access  Private (HR Expert)
router.post('/record', protect, can(CAPABILITIES.ATTENDANCE_RECORD), withEmployerScope, recordAttendance);

// @route   GET /api/attendance/report
// @desc    Organization attendance report
// @access  Private (attendance:view)
router.get('/report', protect, can(CAPABILITIES.ATTENDANCE_VIEW), withEmployerScope, getAttendanceReport);

module.exports = router;
