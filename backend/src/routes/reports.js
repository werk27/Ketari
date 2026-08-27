const express = require('express');
const router = express.Router();
const { getSummaryReport, getJobReport } = require('../controllers/reportController');
const { protect, authorize, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/reports/summary
// @desc    Platform-wide recruitment summary (no single organization's candidates)
// @access  Private (Admin)
router.get('/summary', protect, authorize('admin'), getSummaryReport);

// @route   GET /api/reports/job/:jobId
// @desc    Applicant report for one vacancy
// @access  Private (recruitment reporting, within the caller's own organization)
//
// This report returns applicant identities, so it must be gated exactly like
// every other candidate endpoint. It previously used authorize('admin',
// 'hr_expert') with no tenant guard at all, which let an HR Expert in one
// organization read the full applicant list - names, emails and profiles - of
// any other organization's vacancy just by knowing its id. withEmployerScope
// now supplies req.employerId and the controller refuses a vacancy that does
// not belong to it.
router.get('/job/:jobId', protect, can(CAPABILITIES.REPORT_RECRUITMENT), withEmployerScope, getJobReport);

module.exports = router;