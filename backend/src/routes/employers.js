const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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
    setEmployerStatus,
    getVerificationDossier,
    getVerificationDocument,
    uploadVerificationDocument,
    deleteVerificationDocument,
    submitForVerification
} = require('../controllers/employerController');
const { protect, can, withEmployerScope, requireActiveEmployer } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');
const { PRIVATE_PATHS } = require('../config/paths');

// Verification evidence is written to private-uploads, which is never served by
// express.static, because a trade licence identifies a real organization.
const verificationUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (!fs.existsSync(PRIVATE_PATHS.verification)) {
                fs.mkdirSync(PRIVATE_PATHS.verification, { recursive: true });
            }
            cb(null, PRIVATE_PATHS.verification);
        },
        filename: (req, file, cb) => {
            const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `verification-${unique}${path.extname(file.originalname)}`);
        }
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) return cb(null, true);
        cb(new Error('Upload a PDF, JPEG, PNG or WebP file'), false);
    }
});

// ============================================
// PLATFORM ADMINISTRATION (System Administrator)
// ============================================
router.get('/', protect, can(CAPABILITIES.PLATFORM_EMPLOYERS), listEmployers);
router.get('/:id/verification', protect, can(CAPABILITIES.PLATFORM_EMPLOYERS), getVerificationDossier);
router.put('/:id/status', protect, can(CAPABILITIES.PLATFORM_EMPLOYERS), setEmployerStatus);

// Authenticated document access: administrators, or the organization that owns
// the file. Never served by express.static.
router.get('/:id/documents/:docId', protect, getVerificationDocument);

// ============================================
// ORGANIZATION SELF-SERVICE
// ============================================
router.get('/me', protect, withEmployerScope, getMyEmployer);
router.put('/me', protect, can(CAPABILITIES.ORG_MANAGE), withEmployerScope, updateMyEmployer);
router.get('/me/overview', protect, withEmployerScope, getOverview);

// Verification evidence: available while the organization is still unverified,
// which is exactly when it needs to supply and correct it.
router.post('/me/documents', protect, can(CAPABILITIES.ORG_MANAGE), withEmployerScope,
    verificationUpload.single('document'), uploadVerificationDocument);
router.delete('/me/documents/:docId', protect, can(CAPABILITIES.ORG_MANAGE), withEmployerScope,
    deleteVerificationDocument);
router.post('/me/submit-verification', protect, can(CAPABILITIES.ORG_MANAGE), withEmployerScope,
    submitForVerification);

// HR team management belongs to the employer that owns the organization
router.get('/me/team', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, getTeam);
// Adding people is gated on verification: an unapproved organization must not
// be able to build a team and start collecting applicants' personal data.
// Viewing, editing and removing existing members stay open so an organization
// can still correct its own details while it waits.
router.post('/me/team', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, requireActiveEmployer, addTeamMember);
router.put('/me/team/:userId', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, updateTeamMember);
router.delete('/me/team/:userId', protect, can(CAPABILITIES.ORG_TEAM_MANAGE), withEmployerScope, removeTeamMember);

// ============================================
// PUBLIC ORGANIZATION PROFILE
// ============================================
router.get('/:id', getEmployerPublicProfile);

module.exports = router;
