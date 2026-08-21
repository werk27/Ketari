const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Resume = require('../models/Resume');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
router.get('/users', protect, authorize('admin'), async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        const query = {};

        if (role) {
            query.role = role;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const totalUsers = await User.countDocuments(query);
        let users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .lean();

        let roleStats = null;

        if (role) {
            const activeCount = await User.countDocuments({ ...query, status: 'active' });
            const inactiveCount = await User.countDocuments({ ...query, status: 'inactive' });
            roleStats = { total: totalUsers, active: activeCount, inactive: inactiveCount };

            if (role === 'hr_expert') {
                const totalVacancies = await Job.countDocuments();
                const totalApplications = await Application.countDocuments();
                roleStats.totalVacancies = totalVacancies;
                roleStats.totalApplications = totalApplications;

                users = await Promise.all(users.map(async (u) => {
                    const vacanciesManaged = await Job.countDocuments({ hr_expert: u._id });
                    const jobs = await Job.find({ hr_expert: u._id }).select('_id');
                    const jobIds = jobs.map(j => j._id);
                    const applicationsProcessed = await Application.countDocuments({ job: { $in: jobIds } });
                    
                    return { ...u, stats: { vacanciesManaged, applicationsProcessed } };
                }));
            } else if (role === 'hr_manager') {
                const pendingVacancies = await Job.countDocuments({ status: 'pending_approval' });
                const pendingShortlists = await Application.countDocuments({ status: 'shortlisted' });
                roleStats.pendingVacancies = pendingVacancies;
                roleStats.pendingShortlists = pendingShortlists;

                users = await Promise.all(users.map(async (u) => {
                    const vacanciesApproved = await Job.countDocuments({ approvedBy: u._id });
                    
                    return { ...u, stats: { vacanciesApproved, pendingApprovals: pendingVacancies, pendingShortlists } };
                }));
            }
        }

        res.status(200).json({
            success: true,
            users,
            roleStats,
            totalUsers,
            page: Number(page),
            limit: Number(limit)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Create a new user
// @route   POST /api/admin/users
// @access  Private (Admin)
router.post('/users', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, email, role, password } = req.body;

        if (!name || !email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, role, and password are required'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'A user with this email already exists'
            });
        }

        const user = await User.create({
            name,
            email,
            password,
            role
        });

        res.status(201).json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt
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

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private (Admin)
router.get('/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private (Admin)
router.put('/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const { name, email, role, status } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (status) user.status = status;
        await user.save();
        user.password = undefined;
        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin)
router.delete('/users/:id', protect, authorize('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        await user.deleteOne();
        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Get top candidates by match score
// @route   GET /api/admin/top-candidates
// @access  Private (Admin)
router.get('/top-candidates', protect, authorize('admin'), async (req, res) => {
    try {
        const topCandidates = await Application.find({ matchScore: { $ne: null } })
            .sort({ matchScore: -1, createdAt: -1 })
            .limit(10)
            .populate('applicant', 'name email profile')
            .populate('job', 'title department');

        res.status(200).json({
            success: true,
            topCandidates
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

// @desc    Get all applications (admin)
// @route   GET /api/admin/applications
// @access  Private (Admin)
router.get('/applications', protect, authorize('admin'), async (req, res) => {
    try {
        const applications = await Application.find()
            .populate('applicant', 'name email')
            .populate('job', 'title department')
            .sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            applications
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

const AuditLog = require('../models/AuditLog');

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private (Admin)
router.get('/stats', protect, authorize('admin'), async (req, res) => {
    try {
        const [
            totalUsers,
            activeUsers,
            candidatesCount,
            hrExpertsCount,
            hrManagersCount,
            adminsCount,
            recentHrExperts,
            recentHrManagers,
            totalVacancies,
            activeVacancies,
            pendingApprovalVacancies,
            closedVacancies,
            totalApplications,
            underReviewCount,
            shortlistedCount,
            interviewsCount,
            selectedCount,
            hiredCount,
            cvsAnalyzed,
            candidatesMatched,
            avgMatchResult,
            pendingApprovalsList,
            recentAuditLogs,
            // Per-role active counts, so the dashboard can report accurate
            // active/inactive splits instead of defaulting them to zero.
            roleActiveCounts
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ status: { $ne: 'inactive' } }),
            User.countDocuments({ role: 'candidate' }),
            User.countDocuments({ role: 'hr_expert' }),
            User.countDocuments({ role: 'hr_manager' }),
            User.countDocuments({ role: 'admin' }),
            User.find({ role: 'hr_expert' }).select('-password').sort({ createdAt: -1 }).limit(5),
            User.find({ role: 'hr_manager' }).select('-password').sort({ createdAt: -1 }).limit(5),
            Job.countDocuments(),
            Job.countDocuments({ status: 'published' }),
            Job.countDocuments({ status: 'pending_approval' }),
            Job.countDocuments({ status: 'closed' }),
            Application.countDocuments(),
            Application.countDocuments({ status: { $in: ['pending', 'reviewed', 'under_review'] } }),
            Application.countDocuments({ status: 'shortlisted' }),
            Application.countDocuments({ status: 'interview' }),
            Application.countDocuments({ status: 'selected' }),
            Application.countDocuments({ status: 'hired' }),
            Resume.countDocuments(),
            Application.countDocuments({ matchScore: { $ne: null } }),
            Application.aggregate([
                { $match: { matchScore: { $ne: null } } },
                { $group: { _id: null, avgScore: { $avg: '$matchScore' } } }
            ]),
            // `createdBy` never existed on Job; the creator is tracked as
            // createdByUser (legacy) and submittedBy / hr_expert (current).
            // Populating a non-existent path threw StrictPopulateError and made
            // this whole endpoint return 500.
            Job.find({ status: 'pending_approval' })
                .populate('submittedBy', 'name email')
                .populate('hr_expert', 'name email')
                .populate('employer', 'name')
                .sort({ createdAt: -1 })
                .limit(10),
            AuditLog.find().sort({ createdAt: -1 }).limit(10).populate('user', 'name role'),
            User.aggregate([
                { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } }
            ])
        ]);

        // Build { role: { active, inactive } } from the aggregation.
        const activeByRole = roleActiveCounts.reduce((acc, row) => {
            const role = row._id.role;
            const isActive = row._id.status !== 'inactive';
            acc[role] = acc[role] || { active: 0, inactive: 0 };
            acc[role][isActive ? 'active' : 'inactive'] += row.count;
            return acc;
        }, {});
        const roleSplit = (role) => activeByRole[role] || { active: 0, inactive: 0 };

        const averageMatchScore = avgMatchResult[0]?.avgScore ? Math.round(avgMatchResult[0].avgScore) : 0;

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                activeUsers,
                inactiveUsers: totalUsers - activeUsers,
                roleBreakdown: {
                    admin: adminsCount,
                    hr_expert: hrExpertsCount,
                    hr_manager: hrManagersCount,
                    candidate: candidatesCount
                },
                roleStatusBreakdown: {
                    admin: roleSplit('admin'),
                    hr_expert: roleSplit('hr_expert'),
                    hr_manager: roleSplit('hr_manager'),
                    candidate: roleSplit('candidate'),
                    employee: roleSplit('employee'),
                    employer: roleSplit('employer')
                },
                hrExpertsOverview: {
                    total: hrExpertsCount,
                    active: roleSplit('hr_expert').active,
                    inactive: roleSplit('hr_expert').inactive,
                    recent: recentHrExperts
                },
                hrManagersOverview: {
                    total: hrManagersCount,
                    active: roleSplit('hr_manager').active,
                    inactive: roleSplit('hr_manager').inactive,
                    recent: recentHrManagers
                },
                recruitmentOverview: {
                    totalVacancies,
                    activeVacancies,
                    pendingApprovalVacancies,
                    closedVacancies,
                    totalApplications,
                    underReviewApplications: underReviewCount,
                    shortlistedCandidates: shortlistedCount,
                    interviews: interviewsCount,
                    selectedCandidates: selectedCount,
                    hiredCandidates: hiredCount
                },
                pipeline: {
                    applied: totalApplications,
                    under_review: underReviewCount,
                    ai_analyzed: candidatesMatched,
                    shortlisted: shortlistedCount,
                    interview: interviewsCount,
                    selected: selectedCount,
                    hired: hiredCount
                },
                aiOverview: {
                    cvsAnalyzed,
                    candidatesMatched,
                    averageMatchScore,
                    shortlistedWithAI: shortlistedCount
                },
                pendingApprovals: pendingApprovalsList.map(j => ({
                    _id: j._id,
                    type: 'Vacancy Approval',
                    title: j.title,
                    department: j.department,
                    organization: j.employer?.name || 'Unknown organization',
                    createdBy: j.submittedBy?.name || j.hr_expert?.name || 'HR Expert',
                    createdAt: j.createdAt,
                    status: j.status
                })),
                recentActivity: recentAuditLogs.length > 0 ? recentAuditLogs.map(log => ({
                    _id: log._id,
                    user: log.user?.name || log.userName || 'System User',
                    role: log.userRole || log.user?.role || 'admin',
                    action: log.action,
                    entity: log.entity,
                    details: log.details,
                    createdAt: log.createdAt
                })) : []
            }
        });
    } catch (error) {
        console.error('Error fetching admin dashboard stats:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
});

module.exports = router;