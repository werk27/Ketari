const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');

// @desc    Get recruitment summary report
// @route   GET /api/reports/summary
// @access  Private (Admin)
exports.getSummaryReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = {};
        if (startDate && endDate) {
            query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
        }

        // Get totals
        const totalJobs = await Job.countDocuments(query);
        const totalApplications = await Application.countDocuments(query);
        const totalUsers = await User.countDocuments();
        const totalEmployers = await User.countDocuments({ role: 'hr_expert' });
        const totalJobSeekers = await User.countDocuments({ role: 'candidate' });

        // Status breakdown
        const statusStats = await Application.aggregate([
            { $match: query },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Jobs by department
        const jobsByDepartment = await Job.aggregate([
            { $match: query },
            { $group: { _id: '$department', count: { $sum: 1 } } }
        ]);

        // Applications by month
        const monthlyApplications = await Application.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Get recent applications
        const recentApplications = await Application.find(query)
            .populate('applicant', 'name email')
            .populate('job', 'title department')
            .sort({ createdAt: -1 })
            .limit(10);

        // Top jobs by volume
        const topJobs = await Application.aggregate([
            { $match: query },
            { $group: { _id: '$job', applicationCount: { $sum: 1 }, averageMatchScore: { $avg: '$matchScore' } } },
            { $sort: { applicationCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'jobs',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'job'
                }
            },
            { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    jobId: '$_id',
                    title: '$job.title',
                    department: '$job.department',
                    applicationCount: 1,
                    averageMatchScore: { $round: ['$averageMatchScore', 0] }
                }
            }
        ]);

        // Top candidates by average match score and total applications
        const topCandidates = await Application.aggregate([
            { $match: query },
            { $group: { _id: '$applicant', applicationCount: { $sum: 1 }, averageMatchScore: { $avg: '$matchScore' } } },
            { $sort: { averageMatchScore: -1, applicationCount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    applicantId: '$_id',
                    name: '$user.name',
                    email: '$user.email',
                    applicationCount: 1,
                    averageMatchScore: { $round: ['$averageMatchScore', 0] }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalJobs,
                    totalApplications,
                    totalUsers,
                    totalEmployers,
                    totalJobSeekers,
                    placementRate: totalJobs > 0 ? 
                        Math.round((totalApplications / totalJobs) * 100) : 0,
                    averageApplicationsPerJob: totalJobs > 0 ?
                        Math.round(totalApplications / totalJobs) : 0
                },
                statusBreakdown: statusStats,
                jobsByDepartment,
                monthlyApplications,
                recentApplications,
                topJobs,
                topCandidates
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get job-specific report
// @route   GET /api/reports/job/:jobId
// @access  Private (Admin/Employer)
exports.getJobReport = async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId)
            .populate('hr_expert', 'name email');

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        const applications = await Application.find({ job: job._id })
            .populate('applicant', 'name email profile')
            .sort({ matchScore: -1 });

        const statusBreakdown = {
            pending: applications.filter(a => a.status === 'pending').length,
            reviewed: applications.filter(a => a.status === 'reviewed').length,
            shortlisted: applications.filter(a => a.status === 'shortlisted').length,
            interviewed: applications.filter(a => a.status === 'interviewed').length,
            offered: applications.filter(a => a.status === 'offered').length,
            rejected: applications.filter(a => a.status === 'rejected').length
        };

        res.status(200).json({
            success: true,
            data: {
                job: {
                    title: job.title,
                    department: job.department,
                    location: job.location,
                    hr_expert: job.hr_expert,
                    createdAt: job.createdAt
                },
                statistics: {
                    totalApplications: applications.length,
                    statusBreakdown,
                    averageMatchScore: applications.length > 0 ?
                        Math.round(applications.reduce((acc, a) => acc + (a.matchScore || 0), 0) / applications.length) : 0,
                    shortlistRate: applications.length > 0 ?
                        Math.round((statusBreakdown.shortlisted / applications.length) * 100) : 0
                },
                applications: applications.map(a => ({
                    id: a._id,
                    applicant: a.applicant,
                    status: a.status,
                    matchScore: a.matchScore,
                    appliedDate: a.createdAt
                }))
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};