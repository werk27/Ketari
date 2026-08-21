const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Resume = require('../models/Resume');

// @desc    Get dashboard stats publicly
// @route   GET /api/public/stats
// @access  Public
router.get('/stats', async (req, res) => {
    try {
        const [totalUsers, totalJobs, totalApplications, totalResumes] = await Promise.all([
            User.countDocuments(),
            Job.countDocuments(),
            Application.countDocuments(),
            Resume.countDocuments()
        ]);
        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalJobs,
                totalApplications,
                totalResumes
            }
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
