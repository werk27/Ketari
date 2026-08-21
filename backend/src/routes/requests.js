const express = require('express');
const router = express.Router();
const {
    createRequest,
    getRequests,
    getMyRequests,
    processRequest,
    decideRequest,
    completeRequest,
    cancelRequest
} = require('../controllers/employeeRequestController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/requests
// @desc    Raise an employee request (break-year, resignation, transfer...)
// @access  Private (any organization member)
router.post('/', protect, can(CAPABILITIES.REQUEST_RAISE), createRequest);

// @route   GET /api/requests/me
// @desc    The signed-in user's own requests
// @access  Private
router.get('/me', protect, getMyRequests);

// @route   GET /api/requests
// @desc    The organization's employee requests
// @access  Private (request:view)
router.get('/', protect, can(CAPABILITIES.REQUEST_VIEW), withEmployerScope, getRequests);

// @route   PUT /api/requests/:id/process
// @desc    Process and forward a request for approval
// @access  Private (HR Expert)
router.put('/:id/process', protect, can(CAPABILITIES.REQUEST_PROCESS), withEmployerScope, processRequest);

// @route   PUT /api/requests/:id/decision
// @desc    Approve or reject a request
// @access  Private (HR Manager)
router.put('/:id/decision', protect, can(CAPABILITIES.REQUEST_APPROVE), withEmployerScope, decideRequest);

// @route   PUT /api/requests/:id/complete
// @desc    Mark an approved request as completed
// @access  Private (HR Expert)
router.put('/:id/complete', protect, can(CAPABILITIES.REQUEST_PROCESS), withEmployerScope, completeRequest);

// @route   PUT /api/requests/:id/cancel
// @desc    Cancel own request
// @access  Private
router.put('/:id/cancel', protect, cancelRequest);

module.exports = router;
