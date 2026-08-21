const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    scheduleInterview,
    getJobInterviews,
    getMyInterviews,
    updateInterview
} = require('../controllers/interviewController');
const { protect, authorize } = require('../middleware/auth');

// @route   POST /api/interviews
// @access  Private (HR Expert/Employer/HR Manager/Admin)
router.post('/', [
    protect,
    authorize('hr_expert', 'hr_expert', 'hr_manager', 'admin'),
    body('applicationId').notEmpty().withMessage('Application ID is required')
], scheduleInterview);

// @route   GET /api/interviews/me
// @access  Private (All authenticated users)
router.get('/me', protect, getMyInterviews);

// @route   GET /api/interviews/job/:jobId
// @access  Private (HR Expert/Employer/HR Manager/Admin)
router.get('/job/:jobId', protect, authorize('hr_expert', 'hr_expert', 'hr_manager', 'admin'), getJobInterviews);

// @route   PUT /api/interviews/:id
// @access  Private (HR Expert/Employer/HR Manager/Admin)
router.put('/:id', protect, authorize('hr_expert', 'hr_expert', 'hr_manager', 'admin'), updateInterview);

module.exports = router;
