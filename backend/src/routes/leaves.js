const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    createLeave,
    getLeaves,
    getLeave,
    getMyLeaves,
    processLeave,
    returnLeave,
    resubmitLeave,
    updateLeaveStatus,
    cancelLeave,
    getLeaveBalance
} = require('../controllers/leaveController');
const { protect, can, withEmployerScope } = require('../middleware/auth');
const { CAPABILITIES } = require('../config/permissions');
const { UPLOAD_PATHS } = require('../config/paths');

// Supporting documents (spec §11) - stored alongside other generic HR
// documents, following the same multer pattern already used for resumes/
// profile photos (see routes/resumes.js, routes/upload.js).
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_PATHS.documents),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'leave-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png', 'image/webp'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF, DOCX, JPEG, PNG or WebP files are allowed'), false);
    }
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });

// @route   POST /api/leaves
// @desc    Submit a leave request
// @access  Private (any organization member)
router.post('/', protect, can(CAPABILITIES.LEAVE_REQUEST), upload.single('document'), createLeave);

// @route   GET /api/leaves/me
// @desc    The signed-in user's own leave requests
// @access  Private
router.get('/me', protect, getMyLeaves);

// @route   GET /api/leaves/balance
// @desc    Remaining allowance per configured leave type
// @access  Private
router.get('/balance', protect, withEmployerScope, getLeaveBalance);

// @route   GET /api/leaves
// @desc    The organization's leave requests
// @access  Private (leave:view)
router.get('/', protect, can(CAPABILITIES.LEAVE_VIEW), withEmployerScope, getLeaves);

// @route   GET /api/leaves/:id
// @desc    Full detail of one leave request, including balance context and history
// @access  Private (the requester, or leave:view within the organization)
router.get('/:id', protect, withEmployerScope, getLeave);

// @route   PUT /api/leaves/:id/process
// @desc    Validate and forward a request for HR Manager approval
// @access  Private (HR Expert)
router.put('/:id/process', protect, can(CAPABILITIES.LEAVE_PROCESS), withEmployerScope, processLeave);

// @route   PUT /api/leaves/:id/return
// @desc    Return a request to the employee for correction (Send Back /
//          Request Clarification - the only non-approval action available
//          to the HR Expert; there is no HR Expert reject)
// @access  Private (HR Expert)
router.put('/:id/return', protect, can(CAPABILITIES.LEAVE_PROCESS), withEmployerScope, returnLeave);

// @route   PUT /api/leaves/:id/resubmit
// @desc    Employee edits and resubmits a request returned for correction
// @access  Private (the requester)
router.put('/:id/resubmit', protect, can(CAPABILITIES.LEAVE_REQUEST), withEmployerScope, upload.single('document'), resubmitLeave);

// @route   PUT /api/leaves/:id/status
// @desc    Approve or reject a leave request already validated by an HR Expert
// @access  Private (HR Manager)
router.put('/:id/status', protect, can(CAPABILITIES.LEAVE_APPROVE), withEmployerScope, updateLeaveStatus);

// @route   PUT /api/leaves/:id/cancel
// @desc    Cancel own leave request
// @access  Private
router.put('/:id/cancel', protect, cancelLeave);

module.exports = router;

