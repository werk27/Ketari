const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { UPLOAD_PATHS, toPublicPath, toAbsolutePath } = require('../config/paths');

// Configure multer for photo upload
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const dir = UPLOAD_PATHS.profiles;
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
});

// @desc    Upload profile photo
// @route   POST /api/upload/profile-photo
// @access  Private
router.post('/profile-photo', protect, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a photo'
            });
        }

        const user = await User.findById(req.user.id);

        // Delete the previous photo so old files do not accumulate on disk.
        if (user.profile?.profilePhoto) {
            const oldPath = toAbsolutePath(user.profile.profilePhoto);
            if (oldPath && fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Store the web path (uploads/profiles/<file>) that matches the route
        // Express serves static files from.
        const photoPath = toPublicPath(req.file.path);

        if (!user.profile) {
            user.profile = {};
        }
        user.profile.profilePhoto = photoPath;
        user.markModified('profile');
        await user.save();

        res.status(200).json({
            success: true,
            data: {
                profilePhoto: photoPath,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    profile: user.profile,
                    company: user.company
                }
            }
        });
    } catch (error) {
        console.error('=== Photo Upload Error ===');
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Remove profile photo
// @route   DELETE /api/upload/profile-photo
// @access  Private
router.delete('/profile-photo', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (user.profile?.profilePhoto) {
            const photoPath = toAbsolutePath(user.profile.profilePhoto);
            if (photoPath && fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
            user.profile.profilePhoto = null;
            user.markModified('profile');
            await user.save();
        }

        res.status(200).json({
            success: true,
            message: 'Profile photo removed successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

module.exports = router;