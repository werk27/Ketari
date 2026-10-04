const express = require('express');
const router = express.Router();
const {
    createNeed,
    getNeeds,
    getNeed,
    processNeed,
    returnNeed,
    resubmitNeed
} = require('../controllers/trainingNeedController');
const { protect, can, canAny, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   POST /api/training-needs
// @desc    Raise a Training Need (Department Head) or personal Training
//          Interest request (any employee)
// @access  Private (training_need:create)
router.post('/', protect, can(CAPABILITIES.TRAINING_NEED_CREATE), withEmployerScope, createNeed);

// @route   GET /api/training-needs
// @desc    The organization's training needs, or (for a plain requester) their own
// @access  Private (training_need:view / training:view)
router.get('/', protect, canAny(CAPABILITIES.TRAINING_NEED_VIEW, CAPABILITIES.TRAINING_VIEW), withEmployerScope, getNeeds);

// @route   GET /api/training-needs/:id
// @desc    A single training need
// @access  Private (training_need:view / training:view)
router.get('/:id', protect, canAny(CAPABILITIES.TRAINING_NEED_VIEW, CAPABILITIES.TRAINING_VIEW), withEmployerScope, getNeed);

// @route   PUT /api/training-needs/:id/process
// @desc    HR Expert validates a submitted training need
// @access  Private (HR Expert)
router.put('/:id/process', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, processNeed);

// @route   PUT /api/training-needs/:id/return
// @desc    HR Expert returns an incomplete/incorrect training need for correction
// @access  Private (HR Expert)
router.put('/:id/return', protect, can(CAPABILITIES.TRAINING_RECORD), withEmployerScope, returnNeed);

// @route   PUT /api/training-needs/:id/resubmit
// @desc    Correct and resubmit a training need returned for correction
// @access  Private (the requester)
router.put('/:id/resubmit', protect, can(CAPABILITIES.TRAINING_NEED_CREATE), withEmployerScope, resubmitNeed);

module.exports = router;
