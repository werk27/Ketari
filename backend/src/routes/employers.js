const express = require('express');
const router = express.Router();
const {
    getMyEmployer,
    updateMyEmployer,
    getEmployerPublicProfile,
    getTeam,
    addTeamMember,
    updateTeamMember,
    removeTeamMember,
    getOverview,
    listEmployers,
    setEmployerStatus
} = require('../controllers/employerController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// ============================================
// PLATFORM ADMINISTRATION (System Administrator)
// ============================================
router.get('/', protect, can(CAPABILITIES.PLATFORM_EMPLOYERS), listEmployers);
router.put('/:id/status', protect, can(CAPABILITIES.PLATFORM_EMPLOYERS), setEmployerStatus);

// ============================================
// ORGANIZATION SELF-SERVICE
// ============================================
router.get('/me', protect, withEmployerScope, getMyEmployer);
router.put('/me', protect, can(CAPABILITIES.ORG_MANAGE), withEmployerScope, updateMyEmployer);
router.get('/me/overview', protect, withEmployerScope, getOverview);

// HR team management belongs to the employer that owns the organization
router.get('/me/team', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, getTeam);
router.post('/me/team', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, addTeamMember);
router.put('/me/team/:userId', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, updateTeamMember);
router.delete('/me/team/:userId', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, removeTeamMember);

// ============================================
// PUBLIC ORGANIZATION PROFILE
// ============================================
router.get('/:id', getEmployerPublicProfile);

module.exports = router;
