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
const { protect, authorize } = require('../middleware/auth');
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

// @route   POST /api/resumes
// @desc    Upload resume
// @access  Private (Candidate)
router.post('/', protect, authorize('candidate'), upload.single('resume'), uploadResume);

// @route   GET /api/resumes
// @desc    Get user's resumes
// @access  Private (Candidate)
router.get('/', protect, authorize('candidate'), getResumes);

// @route   PUT /api/resumes/:id/default
// @desc    Set default resume
// @access  Private (Candidate)
router.put('/:id/default', protect, authorize('candidate'), setDefaultResume);

// @route   DELETE /api/resumes/:id
// @desc    Delete resume
// @access  Private (Candidate)
router.delete('/:id', protect, authorize('candidate'), deleteResume);

module.exports = router;