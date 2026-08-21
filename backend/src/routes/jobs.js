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
const { protect, authorize, can, withEmployerScope, optionalAuth } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/jobs
// @desc    Create a vacancy (draft or submitted for approval)
// @access  Private (HR Expert - the operational recruitment role)
router.post('/', [
    protect,
    can(CAPABILITIES.VACANCY_CREATE),
    withEmployerScope,
    body('title').notEmpty().withMessage('Job title is required'),
    body('department').notEmpty().withMessage('Department is required'),
    body('description').notEmpty().withMessage('Job description is required'),
    body('location').notEmpty().withMessage('Location is required')
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
router.post('/:id/save', protect, authorize('candidate'), toggleSaveJob);

// @route   PUT /api/jobs/:id/submit
// @desc    Submit a draft vacancy for HR Manager approval
// @access  Private (HR Expert)
router.put('/:id/submit', protect, can(CAPABILITIES.VACANCY_SUBMIT), withEmployerScope, submitJob);

// @route   PUT /api/jobs/:id/approve
// @desc    Approve and publish a vacancy
// @access  Private (HR Manager)
router.put('/:id/approve', protect, can(CAPABILITIES.VACANCY_APPROVE), withEmployerScope, approveJob);

// @route   PUT /api/jobs/:id/reject
// @desc    Reject a vacancy back to the HR Expert with feedback
// @access  Private (HR Manager)
router.put('/:id/reject', protect, can(CAPABILITIES.VACANCY_REJECT), withEmployerScope, rejectJob);

// @route   PUT /api/jobs/:id/close
// @desc    Close a published vacancy
// @access  Private (HR Manager)
router.put('/:id/close', protect, can(CAPABILITIES.VACANCY_APPROVE), withEmployerScope, closeJob);

// @route   PUT /api/jobs/:id
// @desc    Update vacancy
// @access  Private (HR Expert who owns it)
router.put('/:id', protect, can(CAPABILITIES.VACANCY_EDIT), withEmployerScope, updateJob);

// @route   DELETE /api/jobs/:id
// @desc    Delete vacancy
// @access  Private (HR Expert who owns it)
router.delete('/:id', protect, can(CAPABILITIES.VACANCY_DELETE), withEmployerScope, deleteJob);

module.exports = router;
