const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    applyJob,
    getJobApplications,
    getMyApplications,
    getPendingDecisions,
    updateApplicationStatus,
    decideApplication,
    withdrawApplication,
    scheduleInterview
} = require('../controllers/applicationController');
const { protect, authorize, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/applications
// @desc    Apply for a job
// @access  Private (Candidate)
router.post('/', [
    protect,
    authorize('candidate'),
    body('jobId')
        .notEmpty().withMessage('Job ID is required')
        .bail()
        .isMongoId().withMessage('Invalid job ID'),
    body('resumeId')
        .notEmpty().withMessage('Resume ID is required')
        .bail()
        .isMongoId().withMessage('Invalid resume ID')
], applyJob);

// @route   GET /api/applications/me
// @desc    Get the candidate's own applications
// @access  Private (Candidate)
router.get('/me', protect, authorize('candidate'), getMyApplications);

// @route   PUT /api/applications/:id/withdraw
// @desc    Withdraw own application
// @access  Private (Candidate)
router.put('/:id/withdraw', protect, authorize('candidate'), withdrawApplication);

// @route   GET /api/applications/pending-decision
// @desc    Applications across the organization awaiting the manager's decision
// @access  Private (HR Manager)
// Declared before /job/:jobId so the literal path is never read as a job id.
router.get('/pending-decision', protect, can(CAPABILITIES.APPLICATION_DECIDE), withEmployerScope, getPendingDecisions);

// @route   GET /api/applications/job/:jobId
// @desc    Get all applications for a vacancy in the caller's organization
// @access  Private (organization members)
router.get('/job/:jobId', protect, can(CAPABILITIES.APPLICATION_VIEW), withEmployerScope, getJobApplications);

// @route   PUT /api/applications/:id/status
// @desc    Process an application (screening / shortlisting)
// @access  Private (HR Expert)
router.put('/:id/status', [
    protect,
    can(CAPABILITIES.APPLICATION_PROCESS),
    withEmployerScope,
    body('status')
        .isIn(['under_review', 'ai_analyzed', 'shortlisted', 'interview_scheduled', 'interviewed', 'rejected'])
        .withMessage('Invalid processing status')
], updateApplicationStatus);

// @route   PUT /api/applications/:id/decision
// @desc    Record the authorised final recruitment decision
// @access  Private (HR Manager)
router.put('/:id/decision', [
    protect,
    can(CAPABILITIES.APPLICATION_DECIDE),
    withEmployerScope,
    body('outcome').isIn(['approved', 'rejected']).withMessage('Outcome must be approved or rejected')
], decideApplication);

// @route   PUT /api/applications/:id/schedule-interview
// @desc    Schedule an interview
// @access  Private (HR Expert)
router.put('/:id/schedule-interview', [
    protect,
    can(CAPABILITIES.INTERVIEW_SCHEDULE),
    withEmployerScope
], scheduleInterview);

module.exports = router;
