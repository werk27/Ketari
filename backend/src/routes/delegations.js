const express = require('express');
const router = express.Router();
const {
    createDelegation,
    getDelegations,
    getOrganizationDelegations,
    getDelegationCandidates,
    updateDelegationStatus,
    resubmitDelegation,
    reviewDelegation,
    decideDelegation,
    respondToDelegation
} = require('../controllers/delegationController');
const { protect, can, canAny, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/delegations/organization
// @desc    All delegations within the caller's organization
// @access  Private (delegation:view)
router.get('/organization', protect, can(CAPABILITIES.DELEGATION_VIEW), withEmployerScope, getOrganizationDelegations);

// @route   GET /api/delegations/colleagues
// @desc    Active organization members who can be delegated to
// @access  Private (delegation:create OR delegation:request)
router.get('/colleagues', protect, canAny(CAPABILITIES.DELEGATION_CREATE, CAPABILITIES.DELEGATION_REQUEST), withEmployerScope, getDelegationCandidates);

// @route   POST /api/delegations
// @desc    Direct grant (delegation:create) or workflow request (delegation:request)
// @access  Private - the controller decides the path from INTRINSIC capabilities
router.post('/', protect, canAny(CAPABILITIES.DELEGATION_CREATE, CAPABILITIES.DELEGATION_REQUEST), withEmployerScope, createDelegation);

// @route   GET /api/delegations
// @desc    Delegations involving the signed-in user
// @access  Private
router.get('/', protect, getDelegations);

// @route   PUT /api/delegations/:id/review
// @desc    HR Expert validation gate: validate / return / reject
// @access  Private (delegation:process)
router.put('/:id/review', protect, can(CAPABILITIES.DELEGATION_PROCESS), withEmployerScope, reviewDelegation);

// @route   PUT /api/delegations/:id/decision
// @desc    HR Manager final decision: approve / reject
// @access  Private (delegation:approve)
router.put('/:id/decision', protect, can(CAPABILITIES.DELEGATION_APPROVE), withEmployerScope, decideDelegation);

// @route   PUT /api/delegations/:id/respond
// @desc    Delegate accepts or declines an approved delegation
// @access  Private (the delegate)
router.put('/:id/respond', protect, respondToDelegation);

// @route   PUT /api/delegations/:id
// @desc    Edit and resubmit a request returned for correction
// @access  Private (the delegator)
router.put('/:id', protect, canAny(CAPABILITIES.DELEGATION_CREATE, CAPABILITIES.DELEGATION_REQUEST), withEmployerScope, resubmitDelegation);

// @route   PUT /api/delegations/:id/status
// @desc    Revoke or complete a delegation
// @access  Private (delegator or delegate)
router.put('/:id/status', protect, updateDelegationStatus);

module.exports = router;
