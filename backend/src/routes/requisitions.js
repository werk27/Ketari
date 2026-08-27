const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
    createRequisition,
    getRequisitions,
    getRequisition,
    updateRequisition,
    submitRequisition,
    returnRequisition,
    respondToClarification,
    prepareRequisition,
    decideRequisition,
    amendRequisition
} = require('../controllers/requisitionController');
const { protect, can, withEmployerScope, requireActiveEmployer } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

const salaryValidation = [
    body('salary.amount')
        .notEmpty().withMessage('Salary is required')
        .bail()
        .isFloat({ gt: 0 }).withMessage('Salary must be a positive numeric amount'),
    body('salary.min').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount'),
    body('salary.max').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount')
];

// @route   POST /api/requisitions
// @desc    Raise a job requisition (draft, or submitted for HR review)
// @access  Private (Employer, or the Department Head of the target department)
router.post('/', [
    protect,
    can(CAPABILITIES.REQUISITION_CREATE),
    withEmployerScope,
    requireActiveEmployer,
    body('department').notEmpty().withMessage('Department is required'),
    body('numberOfPositions').isInt({ gt: 0 }).withMessage('Number of employees required must be at least 1'),
    body('requestType').notEmpty().withMessage('Request type is required'),
    body('level').notEmpty().withMessage('Required level is required'),
    body('startDate').notEmpty().withMessage('Required start date is required'),
    body('reason').notEmpty().withMessage('A reason/justification for hiring is required'),
    ...salaryValidation
], createRequisition);

// @route   GET /api/requisitions
// @desc    The organization's job requisitions
// @access  Private (requisition:view)
router.get('/', protect, can(CAPABILITIES.REQUISITION_VIEW), withEmployerScope, getRequisitions);

// @route   GET /api/requisitions/:id
// @desc    Get a single requisition
// @access  Private (requisition:view)
router.get('/:id', protect, can(CAPABILITIES.REQUISITION_VIEW), withEmployerScope, getRequisition);

// @route   PUT /api/requisitions/:id
// @desc    Edit a requisition (draft/returned/rejected only, by its requester)
// @access  Private (Employer, or the Department Head who raised it)
router.put('/:id', [
    protect,
    can(CAPABILITIES.REQUISITION_CREATE),
    withEmployerScope,
    body('salary.amount').optional().isFloat({ gt: 0 }).withMessage('Salary must be a positive numeric amount'),
    body('salary.min').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount'),
    body('salary.max').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount')
], updateRequisition);

// @route   PUT /api/requisitions/:id/submit
// @desc    Submit a draft/returned/rejected requisition for HR review
// @access  Private (the requester)
router.put('/:id/submit', protect, can(CAPABILITIES.REQUISITION_CREATE), withEmployerScope, requireActiveEmployer, submitRequisition);

// @route   PUT /api/requisitions/:id/return
// @desc    Return a submitted requisition to the requester for correction
// @access  Private (HR Expert)
router.put('/:id/return', protect, can(CAPABILITIES.REQUISITION_PROCESS), withEmployerScope, returnRequisition);

// @route   PUT /api/requisitions/:id/clarify
// @desc    Answer HR's clarification query and hand the requisition back for review
// @access  Private (the requester - typically the Department Head)
router.put('/:id/clarify', [
    protect,
    can(CAPABILITIES.REQUISITION_CREATE),
    withEmployerScope,
    requireActiveEmployer,
    body('response').trim().notEmpty().withMessage('Please write a response for HR')
], respondToClarification);

// @route   PUT /api/requisitions/:id/prepare
// @desc    Forward a reviewed requisition to HR Manager for approval
// @access  Private (HR Expert)
router.put('/:id/prepare', protect, can(CAPABILITIES.REQUISITION_PROCESS), withEmployerScope, prepareRequisition);

// @route   PUT /api/requisitions/:id/decision
// @desc    Approve or reject a requisition
// @access  Private (HR Manager)
router.put('/:id/decision', protect, can(CAPABILITIES.REQUISITION_APPROVE), withEmployerScope, decideRequisition);

// @route   PUT /api/requisitions/:id/amend
// @desc    Request an amendment to an approved requisition's essential requirements
// @access  Private (HR Expert)
router.put('/:id/amend', [
    protect,
    can(CAPABILITIES.REQUISITION_PROCESS),
    withEmployerScope,
    body('salary.amount').optional().isFloat({ gt: 0 }).withMessage('Salary must be a positive numeric amount'),
    body('salary.min').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount'),
    body('salary.max').not().exists().withMessage('Salary ranges are not supported; provide a single salary.amount')
], amendRequisition);

module.exports = router;
