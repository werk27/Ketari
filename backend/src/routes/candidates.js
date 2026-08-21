const express = require('express');
const router = express.Router();
const { getCandidates } = require('../controllers/candidateController');
const { protect, can } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');

// @route   GET /api/candidates
// @desc    Search the candidate pool
// @access  Private (authorised HR users only)
//
// Previously public: this endpoint returned full candidate profiles - names,
// emails, phone numbers, locations and salary expectations - to anonymous
// callers. Candidate PII must never be served without authentication.
router.get('/', protect, can(CAPABILITIES.CANDIDATE_VIEW), getCandidates);

module.exports = router;
