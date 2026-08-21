const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
    uploadResume, 
    getResumes, 
    setDefaultResume, 
    deleteResume 
} = require('../controllers/resumeController');
const { protect, can } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');
const { UPLOAD_PATHS } = require('../config/paths');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        // Absolute path: the previous 'uploads/' was relative to the process
        // working directory, so resumes landed in different folders depending
        // on where the server was started from.
        cb(null, UPLOAD_PATHS.resumes);
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

module.exports = router;