const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');
const JobRequisition = require('../models/JobRequisition');
const { validationResult } = require('express-validator');
const { matchCandidates } = require('../services/matchingService');
const { applicantIdsFor, maskCandidate } = require('../services/candidatePrivacy');
const notificationService = require('../services/notificationService');
const { REQUISITION_LOCKED_FIELDS, buildFieldsFromRequisition } = require('../services/requisitionSync');
const { vacancyStats } = require('../services/vacancyFulfillment');
const { resolveActingForDelegators } = require('../services/delegationCapabilities');
const { CAPABILITIES } = require('../config/permissions');

/**
 * May this user act on a vacancy owned by HR Expert `ownerId`? True for the
 * owner, and for a colleague currently covering the owner through an
 * in-effect delegation that includes `capability` (or is full-role) - so a
 * draft/rejected vacancy never stalls while its owner is away. Deleting is
 * deliberately NOT covered: it stays with the owner alone.
 */
const canActForVacancyOwner = async (req, ownerId, capability) => {
    if (!ownerId) return false;
    if (ownerId.toString() === req.user.id) return true;
    const actingFor = await resolveActingForDelegators(req.user, capability);
    return actingFor.includes(ownerId.toString());
};

const PUBLIC_STATUSES = ['published', 'approved', 'open'];

/**
 * Statuses in which a vacancy is still the HR Expert's own work.
 *
 * Everything else has either been handed to the HR Manager for approval or
 * already published, so it may no longer be edited or deleted directly - see
 * updateJob and deleteJob.
 */
const EDITABLE_STATUSES = ['draft', 'rejected'];

/** Tell the HR Expert how to legitimately change a vacancy they can no longer touch. */
const reworkHint = (status) => {
    if (status === 'pending_approval') {
        return 'It is awaiting HR Manager approval - withdraw it, or ask them to reject it, first.';
    }
    if (PUBLIC_STATUSES.includes(status)) {
        return 'It is already published; close it instead and create a new vacancy.';
    }
    return 'Only draft or returned vacancies can still be changed.';
};

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
                message: errors.array().map(e => e.msg).join(', '),
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
            requisitionId,
            sourceRequisition: _ignoredSourceRequisition,
            ...safeBody
        } = req.body;

        // Creating a vacancy from an approved Job Requisition: its essential
        // staffing fields are pre-filled and locked (see updateJob below) so
        // the HR Expert only has to add the publication-specific details
        // (description, location, deadline, ...) rather than re-type them.
        let requisition = null;
        if (requisitionId) {
            requisition = await JobRequisition.findById(requisitionId);
            if (!requisition || requisition.employer.toString() !== req.employerId.toString()) {
                return res.status(404).json({ success: false, message: 'Requisition not found' });
            }
            if (requisition.status !== 'approved') {
                return res.status(400).json({
                    success: false,
                    message: `Only an approved requisition can be used to create a vacancy (current status: ${requisition.status})`
                });
            }
        }

        const requisitionFields = requisition ? buildFieldsFromRequisition(requisition) : {};

        const job = new Job({
            ...safeBody,
            ...requisitionFields,
            requirements: requisition
                ? { ...(safeBody.requirements || {}), ...requisitionFields.requirements }
                : safeBody.requirements,
            sourceRequisition: requisition ? requisition._id : null,
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

        if (requisition) {
            requisition.status = 'job_created';
            requisition.linkedJob = job._id;
            requisition.auditTrail.push({
                action: 'job_created',
                by: req.user.id,
                at: new Date(),
                note: `Vacancy "${job.title}" created from this requisition`
            });
            await requisition.save();

            const recipients = new Set([
                requisition.requestedBy?.toString(),
                requisition.processedBy?.toString(),
                requisition.decidedBy?.toString()
            ].filter(Boolean));
            // These three people are in different roles - typically the
            // Department Head who raised it, the HR Expert who processed it and
            // the HR Manager who approved it - so the link has to follow the
            // recipient. A fixed '/hr-expert/…' link sent the requesting
            // Department Head to a workspace they cannot open.
            await Promise.all(Array.from(recipients).map(async userId => notificationService.notify({
                user: userId,
                employer: req.employerId,
                type: 'requisition_job_created',
                title: 'Vacancy created from requisition',
                message: `"${job.title}" was created from the approved requisition and is ready to be submitted for publishing.`,
                link: await notificationService.linkForUser(userId, 'requisitions')
            })));
        }

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
            // Filters candidates search by, against each vacancy's one fixed
            // salary.amount - not a range stored on the job itself.
            query['salary.amount'] = {};
            if (minSalary) query['salary.amount'].$gte = parseInt(minSalary);
            if (maxSalary) query['salary.amount'].$lte = parseInt(maxSalary);
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

        const stats = await vacancyStats(job);

        res.status(200).json({
            success: true,
            job,
            vacancy: stats
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
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join(', '),
                errors: errors.array()
            });
        }

        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isOwner = await canActForVacancyOwner(req, job.hr_expert, CAPABILITIES.VACANCY_EDIT);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who created this vacancy (or their active delegate) can edit it'
            });
        }

        // Only work that is still the HR Expert's own may be edited.
        //
        // A submitted vacancy belongs to the HR Manager's review: editing it
        // underneath a live review would change what is being approved after
        // the fact, so the manager could authorise text they never saw. It has
        // to come back through rejection first. Approved/published vacancies
        // are locked for the same reason - candidates have already seen them.
        if (!EDITABLE_STATUSES.includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: `A vacancy with status "${job.status}" can no longer be edited. ${reworkHint(job.status)}`
            });
        }

        const {
            status: _s, employer: _e, approvedBy: _ab, approvedAt: _aa,
            rejectedBy: _rb, rejectedAt: _ra, statusHistory: _sh, hr_expert: _hr,
            createdByUser: _cbu, submittedBy: _sb, submittedAt: _sa,
            submitForApproval: _sfa, action: _act, sourceRequisition: _sr, ...updates
        } = req.body;

        // A vacancy created from an approved Job Requisition has its essential
        // staffing fields locked - they were authorised by the HR Manager as
        // part of that requisition and may only change through the
        // requisition amendment + re-approval workflow, never a direct edit
        // here. Publication-only details (description, location, deadline,
        // workMode, tags, benefits, ...) remain freely editable.
        if (job.sourceRequisition) {
            const lockedFieldsTouched = REQUISITION_LOCKED_FIELDS.filter(field => updates[field] !== undefined);
            if (lockedFieldsTouched.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `${lockedFieldsTouched.join(', ')} came from an approved Job Requisition and cannot be `
                        + 'edited directly. Ask HR to amend the requisition and have it re-approved instead.'
                });
            }
        }

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

        const isOwner = await canActForVacancyOwner(req, job.hr_expert, CAPABILITIES.VACANCY_SUBMIT);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who created this vacancy (or their active delegate) can submit it'
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

        await notificationService.notifyRoles({
            employer: job.employer,
            roles: ['hr_manager'],
            type: 'vacancy_pending_approval',
            title: 'Vacancy awaiting approval',
            message: `"${job.title}" was submitted for approval.`,
            link: '/hr-manager/vacancy-approvals'
        });

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

// @desc    Withdraw a vacancy submitted for HR Manager approval, back to the
//          HR Expert's own draft work
// @route   PUT /api/jobs/:id/withdraw
// @access  Private (HR Expert who owns it, or their active delegate)
//
// A vacancy pending approval had no way back to the HR Expert if the HR
// Manager simply never acted on it (no reject, no approve) - recruitment
// pressure had no valve. This gives the HR Expert who submitted it (never
// the HR Manager - that is what reject is for) an explicit way to retract
// it themselves, landing back in 'draft' as an ordinary edit/resubmit cycle
// exactly like a rejected vacancy already does (see EDITABLE_STATUSES,
// submitJob) - no new status is introduced. Once withdrawn, approveJob and
// rejectJob both already refuse anything that is not 'pending_approval', so
// a withdrawn vacancy can never be accidentally approved afterward.
exports.withdrawJob = async (req, res) => {
    try {
        const { job, error } = await findScopedJob(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isOwner = await canActForVacancyOwner(req, job.hr_expert, CAPABILITIES.VACANCY_SUBMIT);
        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Only the HR Expert who submitted this vacancy (or their active delegate) can withdraw it'
            });
        }

        if (job.status !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: `Only a vacancy pending approval can be withdrawn (current status: ${job.status})`
            });
        }

        job.status = 'draft';
        job.rejectionReason = '';
        recordStatus(job, 'draft', req.user.id, req.body.note || 'Withdrawn by the HR Expert before an HR Manager decision');
        await job.save();

        res.status(200).json({
            success: true,
            message: 'Vacancy withdrawn - it is back in your drafts and can be edited and resubmitted',
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

        // Deleting is only for work that never left the HR Expert's hands. Once
        // a vacancy has been submitted it is part of the organization's
        // recruitment record - the HR Manager has seen it, or candidates have -
        // and removing it would erase an approval trail rather than end a
        // recruitment. Published vacancies are closed, never deleted.
        if (!EDITABLE_STATUSES.includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: `A vacancy with status "${job.status}" cannot be deleted. ${reworkHint(job.status)}`
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

        // Attach the same hired/remaining computation the detail view uses,
        // computed from the applications already populated above (no extra
        // query per job).
        const jobsWithVacancy = await Promise.all(jobs.map(async job => {
            const vacancy = await vacancyStats(job);
            return { ...job.toObject(), vacancy };
        }));

        res.status(200).json({
            success: true,
            jobs: jobsWithVacancy
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

        const notifyTarget = job.submittedBy || job.hr_expert;
        if (notifyTarget) {
            await notificationService.notify({
                user: notifyTarget,
                employer: job.employer,
                type: 'job_approved',
                title: 'Vacancy approved',
                message: `"${job.title}" was approved and is now published.`,
                link: '/hr-expert/vacancies'
            });
        }

        // The department that asked for this headcount should learn that
        // recruitment has actually started, without having to poll HR. Reached
        // through the source requisition, so only the requester of THIS
        // vacancy is told.
        if (job.sourceRequisition) {
            const requisition = await JobRequisition.findById(job.sourceRequisition).select('requestedBy departmentName');
            if (requisition && String(requisition.requestedBy) !== String(notifyTarget)) {
                await notificationService.notify({
                    user: requisition.requestedBy,
                    employer: job.employer,
                    type: 'job_approved',
                    title: 'Your vacancy is now published',
                    message: `"${job.title}" was approved and published. Candidates can now apply.`,
                    link: await notificationService.linkForUser(requisition.requestedBy, 'requisitions')
                });
            }
        }

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

        const notifyTarget = job.submittedBy || job.hr_expert;
        if (notifyTarget) {
            await notificationService.notify({
                user: notifyTarget,
                employer: job.employer,
                type: 'job_rejected',
                title: 'Vacancy needs changes',
                message: `"${job.title}" was returned with feedback: ${reason.trim()}`,
                link: '/hr-expert/vacancies'
            });
        }

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
