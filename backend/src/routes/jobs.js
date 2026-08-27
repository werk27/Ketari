const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    createJob,
    getJobs,
    getJob,
    updateJob,
    submitJob,
    deleteJob,
    getMatchingCandidates,
    getEmployerJobs,
    toggleSaveJob,
    approveJob,
    rejectJob,
    closeJob,
    getPendingVacancies,
    getHRExperts
} = require('../controllers/jobController');
const { protect, authorize, can, withEmployerScope, requireActiveEmployer, optionalAuth } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/jobs
// @desc    Create a vacancy (draft or submitted for approval)
// @access  Private (HR Expert - the operational recruitment role)
router.post('/', [
    protect,
    can(CAPABILITIES.VACANCY_CREATE),
    withEmployerScope,
    requireActiveEmployer,
    // When creating from an approved Job Requisition, its essential fields
    // (title, department, salary, ...) are pre-filled by the controller from
    // the requisition itself, so the request body legitimately omits them.
    body('title').if((v, { req }) => !req.body.requisitionId).notEmpty().withMessage('Job title is required'),
    body('department').if((v, { req }) => !req.body.requisitionId).notEmpty().withMessage('Department is required'),
    body('description').notEmpty().withMessage('Job description is required'),
    body('location').notEmpty().withMessage('Location is required'),
    // One fixed, required amount - never a range and never "negotiable".
    // Legacy salary.min / salary.max are rejected outright rather than
    // silently accepted and ignored, so an old client cannot post a range
    // that looks accepted but was never actually stored.
    body('salary.amount')
        .if((v, { req }) => !req.body.requisitionId)
        .notEmpty().withMessage('Salary is required')
        .bail()
        .isFloat({ gt: 0 }).withMessage('Salary must be a positive numeric amount'),
    body('salary.min').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount'),
    body('salary.max').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount')
], createJob);

// @route   GET /api/jobs
// @desc    Get all published jobs
// @access  Public
router.get('/', getJobs);

// @route   GET /api/jobs/pending-approval
// @desc    Get vacancies pending approval within the caller's organization
// @access  Private (HR Manager)
router.get('/pending-approval', protect, can(CAPABILITIES.VACANCY_APPROVE), withEmployerScope, getPendingVacancies);

// @route   GET /api/jobs/helpers/hr-experts
// @desc    Get HR Experts belonging to the caller's organization
// @access  Private (HR Manager / Employer)
router.get('/helpers/hr-experts', protect, withEmployerScope, authorize('hr_manager', 'employer'), getHRExperts);

// @route   GET /api/jobs/hr-expert/me
// @desc    Get the caller's organization vacancies
// @access  Private (organization members)
router.get('/hr-expert/me', protect, withEmployerScope, can(CAPABILITIES.VACANCY_VIEW), getEmployerJobs);

// @route   GET /api/jobs/:id
// @desc    Get single job (drafts visible only to the owning organization)
// @access  Public / Organization members
router.get('/:id', optionalAuth, getJob);

// @route   GET /api/jobs/:id/matches
// @desc    Get AI-matched candidates for a vacancy
// @access  Private (HR Expert / HR Manager)
router.get('/:id/matches', protect, can(CAPABILITIES.AI_MATCH), withEmployerScope, getMatchingCandidates);

// @route   POST /api/jobs/:id/save
// @desc    Toggle Save/Bookmark Job
// @access  Private (Candidate)
// @route   POST /api/jobs/:id/save
// @desc    Save or unsave a vacancy
// @access  Private (anyone job seeking)
router.post('/:id/save', protect, can(CAPABILITIES.JOB_SEEK), toggleSaveJob);

// @route   PUT /api/jobs/:id/submit
// @desc    Submit a draft vacancy for HR Manager approval
// @access  Private (HR Expert)
router.put('/:id/submit', protect, can(CAPABILITIES.VACANCY_SUBMIT), withEmployerScope, requireActiveEmployer, submitJob);

// @route   PUT /api/jobs/:id/approve
// @desc    Approve and publish a vacancy
// @access  Private (HR Manager)
router.put('/:id/approve', protect, can(CAPABILITIES.VACANCY_APPROVE), withEmployerScope, requireActiveEmployer, approveJob);

// @route   PUT /api/jobs/:id/reject
// @desc    Reject a vacancy back to the HR Expert with feedback
// @access  Private (HR Manager)
router.put('/:id/reject', protect, can(CAPABILITIES.VACANCY_REJECT), withEmployerScope, rejectJob);

// @route   PUT /api/jobs/:id/close
// @desc    Close a published vacancy
// @access  Private (HR Manager)
router.put('/:id/close', protect, can(CAPABILITIES.VACANCY_APPROVE), withEmployerScope, closeJob);

// @route   PUT /api/jobs/:id
// @desc    Update a vacancy (draft or returned only - a submitted vacancy is locked
//          while the HR Manager reviews it)
// @access  Private (HR Expert who owns it)
router.put('/:id', [
    protect,
    can(CAPABILITIES.VACANCY_EDIT),
    withEmployerScope,
    // Optional on update (an edit may not touch salary at all), but if
    // provided it follows the same fixed-amount rule as creation.
    body('salary.amount')
        .optional()
        .isFloat({ gt: 0 }).withMessage('Salary must be a positive numeric amount'),
    body('salary.min').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount'),
    body('salary.max').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount')
], updateJob);

// @route   DELETE /api/jobs/:id
// @desc    Delete a vacancy (draft or returned only - submitted/published vacancies
//          are part of the recruitment record and are closed, never deleted)
// @access  Private (HR Expert who owns it)
router.delete('/:id', protect, can(CAPABILITIES.VACANCY_DELETE), withEmployerScope, deleteJob);

module.exports = router;
