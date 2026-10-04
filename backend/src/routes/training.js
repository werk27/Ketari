const express = require('express');
const router = express.Router();
const {
    createTraining,
    getTrainings,
    getMyTrainings,
    processTraining,
    returnTraining,
    resubmitTraining,
    decideTraining,
    decideTrainingEmployer,
    updateTrainingStatus,
    registerTraining,
    evaluateParticipant,
    nominateParticipant,
    addParticipant,
    removeParticipant,
    getAvailableTrainings,
    getDepartmentTrainings
} = require('../controllers/trainingController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { withDepartmentHeadScope } = require('../services/departmentScope');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/training/me
// @desc    Programmes the signed-in user takes part in
// @access  Private
router.get('/me', protect, getMyTrainings);

// @route   GET /api/training/available
// @desc    Open programmes the signed-in employee can self-register for
// @access  Private (training:participate)
router.get('/available', protect, can(CAPABILITIES.TRAINING_PARTICIPATE), getAvailableTrainings);

// @route   GET /api/training/department
// @desc    Training relevant to the caller's own headed department(s)
// @access  Private (Department Head)
router.get('/department', protect, withEmployerScope, withDepartmentHeadScope, getDepartmentTrainings);

// @route   POST /api/training
// @desc    Propose a training programme
// @access  Private (HR Expert)
router.post('/', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, createTraining);

// @route   GET /api/training
// @desc    The organization's training programmes
// @access  Private (training:view)
router.get('/', protect, can(CAPABILITIES.TRAINING_VIEW), withEmployerScope, getTrainings);

// @route   PUT /api/training/:id/process
// @desc    HR Expert reviews and forwards a proposal for HR Manager approval
// @access  Private (HR Expert)
router.put('/:id/process', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, processTraining);

// @route   PUT /api/training/:id/return
// @desc    Send a proposal back to the proposer for correction (the HR
//          Expert's only corrective action - no HR Expert final reject)
// @access  Private (HR Expert)
router.put('/:id/return', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, returnTraining);

// @route   PUT /api/training/:id/resubmit
// @desc    Proposer corrects and resubmits a returned proposal
// @access  Private (the proposer)
router.put('/:id/resubmit', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, resubmitTraining);

// @route   PUT /api/training/:id/decision
// @desc    Approve or reject a programme forwarded for approval
// @access  Private (HR Manager)
router.put('/:id/decision', protect, can(CAPABILITIES.TRAINING_APPROVE), withEmployerScope, decideTraining);

// @route   PUT /api/training/:id/employer-decision
// @desc    Employer's final sign-off on a high-cost/strategic programme
// @access  Private (Employer)
router.put('/:id/employer-decision', protect, can(CAPABILITIES.TRAINING_EMPLOYER_APPROVE), withEmployerScope, decideTrainingEmployer);

// @route   PUT /api/training/:id/status
// @desc    Move an approved programme through its lifecycle
// @access  Private (HR Expert)
router.put('/:id/status', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, updateTrainingStatus);

// @route   PUT /api/training/:id/nominate
// @desc    Department Head nominates one of their own department's
//          employees as a participant
// @access  Private (Department Head)
router.put('/:id/nominate', protect, can(CAPABILITIES.TRAINING_NOMINATE), withEmployerScope, nominateParticipant);

// @route   POST /api/training/:id/participants
// @desc    HR Expert adds/finalizes a participant
// @access  Private (HR Expert)
router.post('/:id/participants', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, addParticipant);

// @route   DELETE /api/training/:id/participants/:employeeId
// @desc    HR Expert removes a participant
// @access  Private (HR Expert)
router.delete('/:id/participants/:employeeId', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, removeParticipant);

// @route   PUT /api/training/:id/participants/:employeeId
// @desc    Record participation and evaluation
// @access  Private (HR Expert)
router.put('/:id/participants/:employeeId', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, evaluateParticipant);

// @route   POST /api/training/:id/register
// @desc    Register for a training programme
// @access  Private
router.post('/:id/register', protect, can(CAPABILITIES.TRAINING_PARTICIPATE), registerTraining);

module.exports = router;
