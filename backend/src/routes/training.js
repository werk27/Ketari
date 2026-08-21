const express = require('express');
const router = express.Router();
const {
    createTraining,
    getTrainings,
    getMyTrainings,
    decideTraining,
    updateTrainingStatus,
    registerTraining,
    evaluateParticipant
} = require('../controllers/trainingController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/training/me
// @desc    Programmes the signed-in user takes part in
// @access  Private
router.get('/me', protect, getMyTrainings);

// @route   POST /api/training
// @desc    Propose a training programme
// @access  Private (HR Expert)
router.post('/', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, createTraining);

// @route   GET /api/training
// @desc    The organization's training programmes
// @access  Private (training:view)
router.get('/', protect, can(CAPABILITIES.TRAINING_VIEW), withEmployerScope, getTrainings);

// @route   PUT /api/training/:id/decision
// @desc    Approve or reject a proposed programme
// @access  Private (HR Manager)
router.put('/:id/decision', protect, can(CAPABILITIES.TRAINING_APPROVE), withEmployerScope, decideTraining);

// @route   PUT /api/training/:id/status
// @desc    Move an approved programme through its lifecycle
// @access  Private (HR Expert)
router.put('/:id/status', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, updateTrainingStatus);

// @route   PUT /api/training/:id/participants/:employeeId
// @desc    Record participation and evaluation
// @access  Private (HR Expert)
router.put('/:id/participants/:employeeId', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, evaluateParticipant);

// @route   POST /api/training/:id/register
// @desc    Register for a training programme
// @access  Private
router.post('/:id/register', protect, can(CAPABILITIES.TRAINING_PARTICIPATE), registerTraining);

module.exports = router;
