const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');

/**
 * The recruitment stages an applicant report breaks down by, taken from the
 * Application schema's own status enum so the report can never drift from the
 * workflow it describes.
 */
const REPORTED_STATUSES = [
    'applied', 'under_review', 'ai_analyzed', 'shortlisted',
    'interview_scheduled', 'interviewed', 'selected', 'offered',
    'hired', 'rejected', 'withdrawn'
];

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

// @desc    Applicant report for one vacancy
// @route   GET /api/reports/job/:jobId
// @access  Private (recruitment reporting, within the caller's own organization)
exports.getJobReport = async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId)
            .populate('hr_expert', 'name email');

        if (!job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Tenant boundary. This report exposes applicant identities, so a
        // vacancy belonging to another organization must be refused outright
        // rather than answered - knowing the id is not authorization.
        const employerId = req.employerId ? req.employerId.toString() : null;
        const jobEmployerId = job.employer ? job.employer.toString() : null;

        if (!jobEmployerId || jobEmployerId !== employerId) {
            return res.status(403).json({
                success: false,
                message: 'This vacancy belongs to another organization'
            });
        }

        const applications = await Application.find({ job: job._id })
            .populate('applicant', 'name email profile')
            .sort({ matchScore: -1 });

        // Counted from the Application schema's own enum. The previous list
        // included 'pending' and 'reviewed' - 'reviewed' is not a status this
        // system has ever had - so those rows always reported zero and the
        // real stages (under_review, ai_analyzed, interview_scheduled, hired)
        // were missing from the report entirely.
        const statusBreakdown = REPORTED_STATUSES.reduce((acc, status) => {
            acc[status] = applications.filter(a => a.status === status).length;
            return acc;
        }, {});

        const scored = applications.filter(a => typeof a.matchScore === 'number');

        res.status(200).json({
            success: true,
            data: {
                job: {
                    id: job._id,
                    title: job.title,
                    department: job.department,
                    location: job.location,
                    status: job.status,
                    hr_expert: job.hr_expert,
                    createdAt: job.createdAt
                },
                statistics: {
                    totalApplications: applications.length,
                    statusBreakdown,
                    averageMatchScore: scored.length > 0
                        ? Math.round(scored.reduce((acc, a) => acc + a.matchScore, 0) / scored.length)
                        : 0,
                    shortlistRate: applications.length > 0
                        ? Math.round((statusBreakdown.shortlisted / applications.length) * 100)
                        : 0
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