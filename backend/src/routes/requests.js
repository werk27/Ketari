const express = require('express');
const router = express.Router();
const {
    createRequest,
    getRequests,
    getMyRequests,
    processRequest,
    returnRequest,
    resubmitRequest,
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

// @route   PUT /api/requests/:id/return
// @desc    Send a submitted request back to the requester for correction
//          (the HR Expert's only corrective action - no Expert final reject)
// @access  Private (HR Expert)
router.put('/:id/return', protect, can(CAPABILITIES.REQUEST_PROCESS), withEmployerScope, returnRequest);

// @route   PUT /api/requests/:id/resubmit
// @desc    Requester corrects and resubmits a returned request
// @access  Private (the requester)
router.put('/:id/resubmit', protect, can(CAPABILITIES.REQUEST_RAISE), withEmployerScope, resubmitRequest);

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
