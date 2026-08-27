const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
    uploadResume, 
    getResumes, 
    setDefaultResume, 
    deleteResume,
    viewResumeFile
} = require('../controllers/resumeController');
const { protect, can } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');
const { PRIVATE_PATHS } = require('../config/paths');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // A CV identifies a real person, so it is written under the private,
        // non-statically-served root rather than uploads/ - see
        // resumeController.viewResumeFile for how it is read back out under
        // authorization instead of a plain public URL.
        cb(null, PRIVATE_PATHS.resumes);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF and DOCX files are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

// A CV belongs to the person, not to whoever hired them, so these are gated on
// the job-seeking capability rather than the candidate role. Every handler
// already scopes by req.user.id, so one person can only ever touch their own.

// @route   POST /api/resumes
// @desc    Upload resume
// @access  Private (candidate or employee)
router.post('/', protect, can(CAPABILITIES.JOB_SEEK_PROFILE), upload.single('resume'), uploadResume);

// @route   GET /api/resumes
// @desc    Get user's resumes
// @access  Private (candidate or employee)
router.get('/', protect, can(CAPABILITIES.JOB_SEEK_PROFILE), getResumes);

// @route   PUT /api/resumes/:id/default
// @desc    Set default resume
// @access  Private (candidate or employee)
router.put('/:id/default', protect, can(CAPABILITIES.JOB_SEEK_PROFILE), setDefaultResume);

// @route   DELETE /api/resumes/:id
// @desc    Delete resume
// @access  Private (candidate or employee)
router.delete('/:id', protect, can(CAPABILITIES.JOB_SEEK_PROFILE), deleteResume);

// @route   GET /api/resumes/:id/file
// @desc    Stream the CV itself (the actual file, not just parsed data)
// @access  Private (the owning candidate, or an HR user from an organization
//          the candidate applied to / was hired by - checked in the controller
//          since it depends on the Application/Employee relationship rather
//          than a simple role check)
router.get('/:id/file', protect, viewResumeFile);

module.exports = router;