const express = require('express');
const router = express.Router();
const {
    createLeave,
    getLeaves,
    getMyLeaves,
    processLeave,
    updateLeaveStatus,
    cancelLeave,
    getLeaveBalance
} = require('../controllers/leaveController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/leaves
// @desc    Submit a leave request
// @access  Private (any organization member)
router.post('/', protect, can(CAPABILITIES.LEAVE_REQUEST), createLeave);

// @route   GET /api/leaves/me
// @desc    The signed-in user's own leave requests
// @access  Private
router.get('/me', protect, getMyLeaves);

// @route   GET /api/leaves/balance
// @desc    Remaining allowance per configured leave type
// @access  Private
router.get('/balance', protect, getLeaveBalance);

// @route   GET /api/leaves
// @desc    The organization's leave requests
// @access  Private (leave:view)
router.get('/', protect, can(CAPABILITIES.LEAVE_VIEW), withEmployerScope, getLeaves);

// @route   PUT /api/leaves/:id/process
// @desc    Record and forward a request for manager approval
// @access  Private (HR Expert)
router.put('/:id/process', protect, can(CAPABILITIES.LEAVE_PROCESS), withEmployerScope, processLeave);

// @route   PUT /api/leaves/:id/status
// @desc    Approve or reject a leave request
// @access  Private (HR Manager)
router.put('/:id/status', protect, can(CAPABILITIES.LEAVE_APPROVE), withEmployerScope, updateLeaveStatus);

// @route   PUT /api/leaves/:id/cancel
// @desc    Cancel own leave request
// @access  Private
router.put('/:id/cancel', protect, cancelLeave);

module.exports = router;
