const express = require('express');
const router = express.Router();
const { getSummaryReport, getJobReport } = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/reports/summary
// @desc    Get recruitment summary report
// @access  Private (Admin)
router.get('/summary', protect, authorize('admin'), getSummaryReport);

// @route   GET /api/reports/job/:jobId
// @desc    Get job-specific report
// @access  Private (Admin/Employer)
router.get('/job/:jobId', protect, authorize('admin', 'hr_expert'), getJobReport);

module.exports = router;