const express = require('express');
const router = express.Router();
const {
    createDelegation,
    getDelegations,
    getOrganizationDelegations,
    updateDelegationStatus
} = require('../controllers/delegationController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/delegations/organization
// @desc    All delegations within the caller's organization
// @access  Private (delegation:view)
router.get('/organization', protect, can(CAPABILITIES.DELEGATION_VIEW), withEmployerScope, getOrganizationDelegations);

// @route   POST /api/delegations
// @desc    Delegate a responsibility to a colleague
// @access  Private (delegation:create)
router.post('/', protect, can(CAPABILITIES.DELEGATION_CREATE), withEmployerScope, createDelegation);

// @route   GET /api/delegations
// @desc    Delegations involving the signed-in user
// @access  Private
router.get('/', protect, getDelegations);

// @route   PUT /api/delegations/:id/status
// @desc    Activate, complete or revoke a delegation
// @access  Private (delegator or delegate)
router.put('/:id/status', protect, updateDelegationStatus);

module.exports = router;
