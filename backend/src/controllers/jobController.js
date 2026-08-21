const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const { validationResult } = require('express-validator');
const { matchCandidates } = require('../services/matchingService');
const { applicantIdsFor, maskCandidate } = require('../services/candidatePrivacy');

const PUBLIC_STATUSES = ['published', 'approved', 'open'];

/** Append an entry to the vacancy audit trail. */
const recordStatus = (job, status, userId, note = '') => {
    job.statusHistory.push({ status, changedBy: userId, changedAt: new Date(), note });
};

/**
 * Load a vacancy and verify the caller's organization owns it.
 * Prevents Employer A from reading or modifying Employer B's vacancies.
 */
const findScopedJob = async (jobId, req) => {
    const job = await Job.findById(jobId);
    if (!job) return { error: { code: 404, message: 'Vacancy not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const jobEmployerId = job.employer ? job.employer.toString() : null;

    // Legacy vacancies created before organizations existed fall back to creator ownership.
    const legacyOwner = !jobEmployerId && job.createdByUser
        ? job.createdByUser.toString() === req.user.id
        : false;

    if (jobEmployerId !== employerId && !legacyOwner) {
        return { error: { code: 403, message: 'This vacancy belongs to another organization' } };
    }

    return { job };
};

// @desc    Create a vacancy (draft, or submitted for approval)
// @route   POST /api/jobs
// @access  Private (HR Expert)
exports.createJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        // The workflow state is derived from the requested action, never trusted from the body.
        const submitForApproval = req.body.submitForApproval === true || req.body.action === 'submit';

        const {
            status: _ignoredStatus,
            employer: _ignoredEmployer,
            approvedBy: _ignoredApprovedBy,
            approvedAt: _ignoredApprovedAt,
            statusHistory: _ignoredHistory,
            submitForApproval: _ignoredFlag,
            action: _ignoredAction,
            ...safeBody
        } = req.body;

        const job = new Job({
            ...safeBody,
            employer: req.employerId,
            hr_expert: req.user.id,
            createdByUser: req.user.id,
            status: submitForApproval ? 'pending_approval' : 'draft',
            submittedBy: submitForApproval ? req.user.id : null,
            submittedAt: submitForApproval ? new Date() : null,
            statusHistory: []
        });

        recordStatus(
            job,
            job.status,
            req.user.id,
            submitForApproval ? 'Submitted for HR Manager approval' : 'Draft created'
        );
        await job.save();

        res.status(201).json({
            success: true,
            job
        });
    } catch (error) {
        console.error(error);

        // A missing or invalid field is bad input, not a server fault. Returning
        // 500 "Server Error" left the HR Expert with no idea which field to fix.
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Invalid vacancy data',
                errors: Object.entries(error.errors || {}).map(([field, e]) => ({ param: field, msg: e.message }))
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get all published jobs
// @route   GET /api/jobs
// @access  Public
exports.getJobs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, location, employmentType, minSalary, maxSalary } = req.query;

        const query = { status: { $in: PUBLIC_STATUSES } };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { department: { $regex: search, $options: 'i' } }
            ];
        }

        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }

        if (employmentType) {
            query.employmentType = employmentType;
        }

        if (req.query.workMode) {
            query.workMode = req.query.workMode;
        }

        if (req.query.experienceLevel) {
            query.experienceLevel = req.query.experienceLevel;
        }

        if (req.query.skills) {
            const skillsArray = req.query.skills.split(',');
            query['requirements.skills'] = { $in: skillsArray.map(s => new RegExp(s.trim(), 'i')) };
        }

        if (minSalary || maxSalary) {
            query.salary = {};
            if (minSalary) query.salary.min = { $gte: parseInt(minSalary) };
            if (maxSalary) query.salary.max = { $lte: parseInt(maxSalary) };
        }

        const jobs = await Job.find(query)
            .populate('employer', 'name logo industry')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Job.countDocuments(query);

        res.status(200).json({
            success: true,
            jobs,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalJobs: count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
// @access  Public for published vacancies; organization members otherwise
exports.getJob = async (req, res) => {
    try {
        const job = await Job.findById(req.params.id)
            .populate('employer', 'name logo industry website description')
            .populate('hr_expert', 'name email')
            .populate('applications', 'status');

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Unpublished vacancies (draft, pending approval, rejected) must never leak publicly.
        if (!PUBLIC_STATUSES.includes(job.status)) {
            const viewer = req.user;
            const jobEmployerId = job.employer ? (job.employer._id || job.employer).toString() : null;
            const sameOrg = Boolean(
                viewer && viewer.employer && jobEmployerId &&
                viewer.employer.toString() === jobEmployerId
            );

            if (!sameOrg) {
                return res.status(403).json({
                    success: false,
                    message: 'This vacancy is not publicly available'
                });
            }
        } else {
            job.viewCount += 1;
            await job.save();
        }

        res.status(200).json({
            success: true,
            job
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Update vacancy
// @route   PUT /api/jobs/:id
// @access  Private (HR Expert who owns it)
exports.updateJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isOwner = job.hr_expert && job.hr_expert.toString() === req.user.id;
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who created this vacancy can edit it'
            });
        }

        // Approved/published vacancies are locked; corrections go back through approval.
        if (!['draft', 'rejected', 'pending_approval'].includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: `A vacancy with status "${job.status}" can no longer be edited`
            });
        }

        const {
            status: _s, employer: _e, approvedBy: _ab, approvedAt: _aa,
            rejectedBy: _rb, rejectedAt: _ra, statusHistory: _sh, hr_expert: _hr,
            createdByUser: _cbu, submittedBy: _sb, submittedAt: _sa,
            submitForApproval: _sfa, action: _act, ...updates
        } = req.body;

        Object.assign(job, updates);

        // Editing a rejected vacancy resets it to draft so it must be resubmitted.
        if (job.status === 'rejected') {
            job.status = 'draft';
            job.rejectionReason = '';
            recordStatus(job, 'draft', req.user.id, 'Returned to draft after rejection feedback');
        }

        await job.save();

        res.status(200).json({
            success: true,
            job
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Submit a draft vacancy for HR Manager approval
// @route   PUT /api/jobs/:id/submit
// @access  Private (HR Expert who owns it)
exports.submitJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isOwner = job.hr_expert && job.hr_expert.toString() === req.user.id;
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who created this vacancy can submit it'
            });
        }

        if (!['draft', 'rejected'].includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: `Only draft or rejected vacancies can be submitted (current status: ${job.status})`
            });
        }

        job.status = 'pending_approval';
        job.submittedBy = req.user.id;
        job.submittedAt = new Date();
        job.rejectionReason = '';
        recordStatus(job, 'pending_approval', req.user.id, 'Submitted for HR Manager approval');
        await job.save();

        res.status(200).json({
            success: true,
            message: 'Vacancy submitted for HR Manager approval',
            job
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete vacancy
// @route   DELETE /api/jobs/:id
// @access  Private (HR Expert who owns it)
exports.deleteJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isOwner = job.hr_expert && job.hr_expert.toString() === req.user.id;
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who created this vacancy can delete it'
            });
        }

        const applicationCount = await Application.countDocuments({ job: job._id });
        if (applicationCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'This vacancy has applications and cannot be deleted. Close or archive it instead.'
            });
        }

        await job.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Job deleted successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get the organization's vacancies
// @route   GET /api/jobs/hr-expert/me
// @access  Private (organization members)
exports.getEmployerJobs = async (req, res) => {
    try {
        const query = { employer: req.employerId };

        // HR Experts see the vacancies they own; managers/employers see the whole organization.
        if (req.user.role === 'hr_expert' && req.query.scope !== 'organization') {
            query.hr_expert = req.user.id;
        }

        if (req.query.status) {
            query.status = req.query.status;
        }

        const jobs = await Job.find(query)
            .populate('applications', 'status')
            .populate('hr_expert', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            jobs
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get AI-matched candidates for a vacancy
// @route   GET /api/jobs/:id/matches
// @access  Private (HR Expert / HR Manager)
exports.getMatchingCandidates = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const candidates = await User.find({ role: 'candidate', status: 'active' })
            .select('name email profile');

        const applications = await Application.find({ job: job._id }).select('applicant');
        const applicantIds = applications.map(app => app.applicant.toString());

        const matchedCandidates = await matchCandidates(job, candidates, applicantIds);

        const minimumScore = parseInt(req.query.minScore, 10) || 0;
        const limit = parseInt(req.query.limit, 10) || 20;
        const results = matchedCandidates
            .filter(match => match.matchScore >= minimumScore)
            .slice(0, limit);

        // A match is a suggestion about someone who has not applied, so their
        // contact details stay hidden until they do.
        const revealIds = req.user?.role === 'admin'
            ? new Set()
            : await applicantIdsFor(req.employerId || req.user?.employer);
        const masked = results.map(match => ({
            ...match,
            candidate: maskCandidate(match.candidate, revealIds, { isAdmin: req.user?.role === 'admin' })
        }));

        res.status(200).json({
            success: true,
            count: masked.length,
            // AI assists the recruiter; it never makes the final hiring decision.
            disclaimer: 'AI recommendations are advisory. Final hiring decisions are made by authorised HR users.',
            candidates: masked
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Toggle Save/Bookmark Job
// @route   POST /api/jobs/:id/save
// @access  Private (Candidate)
exports.toggleSaveJob = async (req, res) => {
    try {
        if (req.user.role !== 'candidate') {
            return res.status(403).json({ success: false, message: 'Only candidates can save jobs' });
        }

        const job = await Job.findById(req.params.id);
        const user = await User.findById(req.user.id);

        if (!job || !user) {
            return res.status(404).json({ success: false, message: 'Job or User not found' });
        }

        const savedJobsStr = user.profile.savedJobs.map(id => id.toString());
        const isSaved = savedJobsStr.includes(job._id.toString());

        if (isSaved) {
            user.profile.savedJobs = user.profile.savedJobs.filter(id => id.toString() !== job._id.toString());
            job.savedBy = job.savedBy.filter(id => id.toString() !== user._id.toString());
        } else {
            user.profile.savedJobs.push(job._id);
            job.savedBy.push(user._id);
        }

        // Skipping full validation is safer for partial profile updates
        await user.save({ validateBeforeSave: false });
        await job.save();

        res.status(200).json({ success: true, isSaved: !isSaved, message: isSaved ? 'Job removed from saved' : 'Job saved successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Approve and publish a vacancy
// @route   PUT /api/jobs/:id/approve
// @access  Private (HR Manager)
exports.approveJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (job.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: `Only vacancies pending approval can be approved (current status: ${job.status})`
            });
        }

        // Separation of duties: a user may never approve work they created or submitted.
        const submitterId = job.submittedBy ? job.submittedBy.toString() : null;
        const ownerId = job.hr_expert ? job.hr_expert.toString() : null;
        if (submitterId === req.user.id || ownerId === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve a vacancy you created or submitted'
            });
        }

        if (req.body.hr_expert) {
            const assignee = await User.findById(req.body.hr_expert);
            const sameOrg = assignee && assignee.employer &&
                assignee.employer.toString() === req.employerId.toString();

            if (!assignee || assignee.role !== 'hr_expert' || !sameOrg) {
                return res.status(400).json({
                    success: false,
                    message: 'Assigned HR Expert must belong to your organization'
                });
            }
            job.hr_expert = assignee._id;
        }

        job.status = 'published';
        job.approvedBy = req.user.id;
        job.approvedAt = new Date();
        job.rejectedBy = null;
        job.rejectedAt = null;
        job.rejectionReason = '';
        recordStatus(job, 'published', req.user.id, req.body.note || 'Approved and published');
        await job.save();

        res.status(200).json({ success: true, message: 'Vacancy approved and published', job });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Reject a vacancy back to the HR Expert with feedback
// @route   PUT /api/jobs/:id/reject
// @access  Private (HR Manager)
exports.rejectJob = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: 'A rejection reason is required so the HR Expert can correct the vacancy'
            });
        }

        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (job.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: `Only vacancies pending approval can be rejected (current status: ${job.status})`
            });
        }

        const submitterId = job.submittedBy ? job.submittedBy.toString() : null;
        if (submitterId === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot review a vacancy you submitted yourself'
            });
        }

        job.status = 'rejected';
        job.rejectedBy = req.user.id;
        job.rejectedAt = new Date();
        job.rejectionReason = reason.trim();
        recordStatus(job, 'rejected', req.user.id, reason.trim());
        await job.save();

        res.status(200).json({ success: true, message: 'Vacancy returned to the HR Expert with feedback', job });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Close a published vacancy
// @route   PUT /api/jobs/:id/close
// @access  Private (HR Manager)
exports.closeJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!PUBLIC_STATUSES.includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: 'Only a published vacancy can be closed'
            });
        }

        job.status = 'closed';
        recordStatus(job, 'closed', req.user.id, req.body.note || 'Vacancy closed');
        await job.save();

        res.status(200).json({ success: true, message: 'Vacancy closed', job });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get vacancies awaiting approval within the organization
// @route   GET /api/jobs/pending-approval
// @access  Private (HR Manager)
exports.getPendingVacancies = async (req, res) => {
    try {
        const jobs = await Job.find({
            status: 'pending_approval',
            employer: req.employerId
        })
            .populate('hr_expert', 'name email department')
            .populate('submittedBy', 'name email')
            .sort({ submittedAt: -1, createdAt: -1 });

        res.status(200).json({ success: true, count: jobs.length, jobs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get HR Experts belonging to the caller's organization
// @route   GET /api/jobs/helpers/hr-experts
// @access  Private (HR Manager / Employer)
exports.getHRExperts = async (req, res) => {
    try {
        const experts = await User.find({
            role: 'hr_expert',
            employer: req.employerId
        }).select('name email department jobTitle');

        res.status(200).json({ success: true, experts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
