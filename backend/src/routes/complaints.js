const express = require('express');
const router = express.Router();
const {
    createComplaint,
    getComplaints,
    getUnassignedComplaints,
    getMyComplaints,
    updateComplaintStatus,
    updateUnassignedComplaintStatus
} = require('../controllers/complaintController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/complaints
// @desc    Submit a complaint or recruitment feedback
// @access  Private (any authenticated user)
router.post('/', protect, can(CAPABILITIES.COMPLAINT_RAISE), createComplaint);

// @route   GET /api/complaints/me
// @desc    The signed-in user's own complaints
// @access  Private
router.get('/me', protect, getMyComplaints);

// @route   GET /api/complaints/unassigned
// @desc    Platform-level feedback with no owning organization
// @access  Private (System Administrator)
router.get('/unassigned', protect, can(CAPABILITIES.PLATFORM_AUDIT), getUnassignedComplaints);

// @route   PUT /api/complaints/unassigned/:id/status
// @desc    Move platform-level feedback through its workflow
// @access  Private (System Administrator)
router.put('/unassigned/:id/status', protect, can(CAPABILITIES.PLATFORM_AUDIT), updateUnassignedComplaintStatus);

// @route   GET /api/complaints
// @desc    The organization's complaints
// @access  Private (complaint:view)
router.get('/', protect, can(CAPABILITIES.COMPLAINT_VIEW), withEmployerScope, getComplaints);

// @route   PUT /api/complaints/:id/status
// @desc    Move a complaint through its workflow
// @access  Private (complaint:handle)
router.put('/:id/status', protect, can(CAPABILITIES.COMPLAINT_HANDLE), withEmployerScope, updateComplaintStatus);

module.exports = router;
