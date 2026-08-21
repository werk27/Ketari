const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { 
    register, 
    login, 
    getMe, 
    updateProfile,
    forgotPassword,
    resetPassword,
    verifyResetToken
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// @route   POST /api/auth/register
// @desc    Register a user
// @access  Public
router.post('/register', [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], register);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
// `trim()` runs before `isEmail()` so an address pasted or autofilled with
// surrounding whitespace is accepted instead of being rejected as invalid.
router.post('/login', [
    body('email').trim().isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required')
], login);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, getMe);

// @route   PUT /api/auth/updateprofile
// @desc    Update user profile
// @access  Private
router.put('/updateprofile', protect, updateProfile);

// ============================================
// PASSWORD RESET ROUTES
// ============================================

// @route   POST /api/auth/forgotpassword
// @desc    Forgot password - send reset token to email
// @access  Public
router.post('/forgotpassword', [
    body('email').trim().isEmail().withMessage('Please provide a valid email')
], forgotPassword);

// @route   PUT /api/auth/resetpassword/:resetToken
// @desc    Reset password using token
// @access  Public
router.put('/resetpassword/:resetToken', [
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], resetPassword);

// @route   GET /api/auth/verifyresettoken/:resetToken
// @desc    Verify if reset token is valid
// @access  Public
router.get('/verifyresettoken/:resetToken', verifyResetToken);

module.exports = router;