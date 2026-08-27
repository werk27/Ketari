const Application = require('../models/Application');
const Job = require('../models/Job');
const Resume = require('../models/Resume');
const Employee = require('../models/Employee');
const Employer = require('../models/Employer');
const { validationResult } = require('express-validator');
const { calculateMatchScore, calculateMatchDetails } = require('../services/matchingService');
const { experienceYearsFor, insightsFor } = require('../services/candidateInsights');
const { createEmployeeFromApplication } = require('../services/onboardingService');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const User = require('../models/User');

// Statuses in which a vacancy still accepts applications.
const OPEN_STATUSES = ['published', 'approved', 'open'];

// Statuses an HR Expert may set while processing (operational work).
const PROCESSING_STATUSES = [
    'under_review', 'ai_analyzed', 'shortlisted',
    'interview_scheduled', 'interviewed', 'rejected'
];

// Statuses that represent an authorised final decision (HR Manager only).
const DECISION_STATUSES = ['selected', 'offered', 'hired'];

// An application reaches the HR Manager once the HR Expert has finished
// processing it. These are the states that still await an authorised decision.
const AWAITING_DECISION_STATUSES = ['shortlisted', 'interview_scheduled', 'interviewed', 'selected', 'offered'];

// Everything from shortlisting onward. Reaching interview or being hired does
// not undo the fact that a candidate was shortlisted, so the report's
// "shortlisted" filter has to include the stages that follow it.
const SHORTLISTED_ONWARD_STATUSES = [
    'shortlisted', 'interview_scheduled', 'interviewed', 'selected', 'offered', 'hired'
];

/**
 * Treat user-supplied filter text as literal.
 * Without this a candidate search for "C++" or a stray "(" reaches the regex
 * engine as a pattern and either matches nothing or throws.
 */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Verify the caller's organization owns the application, and return it.
 * Prevents cross-employer access to candidate applications.
 */
const loadScopedApplication = async (applicationId, req, populate = '') => {
    const query = Application.findById(applicationId).populate('job', 'hr_expert employer title');
    const application = populate ? await query.populate(populate) : await query;

    if (!application) {
        return { error: { code: 404, message: 'Application not found' } };
    }

    const employerId = req.employerId ? req.employerId.toString() : null;
    const applicationEmployerId = application.employer
        ? application.employer.toString()
        : (application.job && application.job.employer ? application.job.employer.toString() : null);

    if (!applicationEmployerId || applicationEmployerId !== employerId) {
        return { error: { code: 403, message: 'This application belongs to another organization' } };
    }

    return { application };
};

// @desc    Apply for a job
// @route   POST /api/applications
// @access  Private (Job Seeker)
exports.applyJob = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Include `message` as well as `errors`: the client surfaces
            // `data.message`, so validation failures used to reach the candidate
            // as a generic "failed to submit" with no reason attached.
            return res.status(400).json({
                success: false,
                message: errors.array().map(e => e.msg).join(', '),
                errors: errors.array()
            });
        }

        const { jobId, resumeId, coverLetter } = req.body;

        // Check if job exists and is open
        const job = await Job.findById(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (!OPEN_STATUSES.includes(job.status)) {
            return res.status(400).json({
                success: false,
                message: 'This job is no longer accepting applications'
            });
        }

        if (job.applicationDeadline && new Date(job.applicationDeadline) < new Date()) {
            return res.status(400).json({
                success: false,
                message: 'The application deadline for this vacancy has passed'
            });
        }

        // Check if already applied
        const existingApplication = await Application.findOne({
            job: jobId,
            applicant: req.user.id
        });

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You have already applied for this job'
            });
        }

        // Get resume data
        const resume = await Resume.findById(resumeId);
        if (!resume || resume.user.toString() !== req.user.id) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found or not authorized'
            });
        }

        // Calculate match score and structured breakdown
        const candidateProfile = req.user.profile || (resume ? resume.parsedData : {});
        const { score: matchScore, details: matchDetails } = calculateMatchDetails(job, candidateProfile);

        // Create application
        const application = await Application.create({
            job: jobId,
            applicant: req.user.id,
            employer: job.employer,
            resume: resumeId,
            coverLetter,
            matchScore,
            matchDetails,
            status: 'applied',
            statusHistory: [{
                status: 'applied',
                changedBy: req.user.id,
                note: 'Application submitted successfully'
            }]
        });

        // Link the application to the vacancy with an atomic update. job.save()
        // re-validated the entire vacancy document, so one legacy field (such as
        // a retired employmentType) made every application to that vacancy fail
        // with a 500 - after the Application row had already been created,
        // leaving it orphaned and blocking the candidate from retrying.
        await Job.updateOne(
            { _id: job._id },
            { $addToSet: { applications: application._id } }
        );

        // Notify the candidate (confirmation) and whoever needs to screen this
        // application next - the vacancy's own HR Expert if one is assigned,
        // otherwise every HR Expert in the organization. The employer also
        // gets an org-wide view of new applications without doing the
        // screening themselves.
        await notificationService.notify({
            user: req.user.id,
            employer: job.employer,
            type: 'application_update',
            title: 'Application submitted',
            message: `Your application for ${job.title} has been received.`,
            link: '/candidate/dashboard'
        });

        if (job.hr_expert) {
            await notificationService.notify({
                user: job.hr_expert,
                employer: job.employer,
                type: 'new_application',
                title: 'New application received',
                message: `${req.user.name} applied for ${job.title}.`,
                link: `/hr-expert/applications/${job._id}`
            });
        } else {
            await notificationService.notifyRoles({
                employer: job.employer,
                roles: ['hr_expert'],
                type: 'new_application',
                title: 'New application received',
                message: `${req.user.name} applied for ${job.title}.`,
                link: `/hr-expert/applications/${job._id}`
            });
        }

        await notificationService.notifyRoles({
            employer: job.employer,
            roles: ['employer'],
            type: 'new_application',
            title: 'New application received',
            message: `${req.user.name} applied for ${job.title}.`,
            link: `/employer/applications/${job._id}`
        });

        // Email confirmation is best effort - the in-app notification above
        // always reaches the candidate even if SMTP is not configured.
        try {
            const employerOrg = await Employer.findById(job.employer).select('name');
            await emailService.sendApplicationConfirmation(req.user.email, req.user.name, job.title, employerOrg?.name || '');
        } catch (emailError) {
            console.error('Application confirmation email failed:', emailError.message);
        }

        res.status(201).json({
            success: true,
            application
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get all applications for a job
// @route   GET /api/applications/job/:jobId
// @access  Private (organization members)
//
// This is the applicant report behind a vacancy, so it carries the search,
// filter, sort and pagination the HR user needs to work through a large
// shortlist. Every filter narrows the real Application/User records - nothing
// here is computed from sample data - and the tenant check below runs before
// any candidate is read.
exports.getJobApplications = async (req, res) => {
    try {
        const job = await Job.findById(req.params.jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        const employerId = req.employerId ? req.employerId.toString() : null;
        const jobEmployerId = job.employer ? job.employer.toString() : null;

        if (!jobEmployerId || jobEmployerId !== employerId) {
            return res.status(403).json({
                success: false,
                message: 'This vacancy belongs to another organization'
            });
        }

        const {
            search, status, minScore, maxScore, skills, education,
            minExperience, dateFrom, dateTo, shortlisted,
            sort = 'matchScore', order = 'desc'
        } = req.query;

        const query = { job: req.params.jobId };

        if (status) {
            query.status = { $in: String(status).split(',').map(s => s.trim()).filter(Boolean) };
        }

        // "Shortlisted candidates" means everything from shortlisting onward -
        // an applicant who has already reached interview has not stopped being
        // shortlisted, and dropping them would hide the very people this filter
        // exists to find.
        if (shortlisted === 'true') {
            query.status = { $in: SHORTLISTED_ONWARD_STATUSES };
        }

        const scoreFilter = {};
        if (minScore !== undefined && minScore !== '') scoreFilter.$gte = Number(minScore);
        if (maxScore !== undefined && maxScore !== '') scoreFilter.$lte = Number(maxScore);
        if (Object.keys(scoreFilter).length > 0) query.matchScore = scoreFilter;

        const dateFilter = {};
        if (dateFrom) dateFilter.$gte = new Date(dateFrom);
        if (dateTo) {
            // An inclusive end date: a plain YYYY-MM-DD parses to midnight, so
            // without this the last day of the range matches nothing.
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            dateFilter.$lte = end;
        }
        if (Object.keys(dateFilter).length > 0) query.createdAt = dateFilter;

        // Candidate-attribute filters live on the User document, so they are
        // resolved to a set of applicant ids first. Scoped to the people who
        // actually applied to THIS vacancy, so it can never widen into a search
        // across the whole candidate pool.
        const needsProfileFilter = [search, skills, education, minExperience]
            .some(value => value !== undefined && value !== '');

        if (needsProfileFilter) {
            const applicantIds = await Application.find({ job: req.params.jobId }).distinct('applicant');
            const userQuery = { _id: { $in: applicantIds } };

            if (search) {
                userQuery.$or = [
                    { name: { $regex: escapeRegex(search), $options: 'i' } },
                    { email: { $regex: escapeRegex(search), $options: 'i' } },
                    { 'profile.skills': { $regex: escapeRegex(search), $options: 'i' } }
                ];
            }

            if (skills) {
                const wanted = String(skills).split(',').map(s => s.trim()).filter(Boolean);
                if (wanted.length > 0) {
                    userQuery['profile.skills'] = { $in: wanted.map(s => new RegExp(escapeRegex(s), 'i')) };
                }
            }

            if (education) {
                const pattern = new RegExp(escapeRegex(education), 'i');
                userQuery.$and = [{
                    $or: [
                        { 'profile.education.degree': pattern },
                        { 'profile.education.field': pattern },
                        { 'profile.education.institution': pattern }
                    ]
                }];
            }

            let matching = await User.find(userQuery).select('_id profile.workExperience');

            // Years of experience are derived from the profile rather than
            // stored, so this one filter is applied in memory - over the
            // applicants of a single vacancy, never the whole user collection.
            if (minExperience !== undefined && minExperience !== '') {
                const threshold = Number(minExperience);
                if (Number.isFinite(threshold)) {
                    matching = matching.filter(u => experienceYearsFor(u.profile) >= threshold);
                }
            }

            query.applicant = { $in: matching.map(u => u._id) };
        }

        // Status tallies always describe the whole vacancy, not the filtered
        // page, so the HR user keeps a stable picture of the pipeline while
        // narrowing down within it.
        const statusAgg = await Application.aggregate([
            { $match: { job: job._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const statusCounts = statusAgg.reduce((acc, row) => {
            acc[row._id] = row.count;
            return acc;
        }, {});

        const total = await Application.countDocuments(query);

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const direction = order === 'asc' ? 1 : -1;

        // `name` and `experience` describe the candidate, not the application,
        // so they cannot be sorted by the database here; they are handled after
        // loading, below.
        const DB_SORTS = {
            matchScore: { matchScore: direction, createdAt: -1 },
            createdAt: { createdAt: direction },
            status: { status: direction, matchScore: -1 }
        };
        const inMemorySort = ['name', 'experience'].includes(sort);

        let cursor = Application.find(query)
            .populate('applicant', 'name email profile')
            // filePath is an absolute location on the server's disk - never
            // send it to the client. The actual file is read back through
            // the authorized GET /resumes/:id/file route instead.
            .populate('resume', 'fileName fileType parsedData')
            .populate('screenedBy', 'name')
            .populate('shortlistedBy', 'name')
            .populate('decision.decidedBy', 'name')
            .populate('statusHistory.changedBy', 'name role');

        if (!inMemorySort) {
            cursor = cursor.sort(DB_SORTS[sort] || DB_SORTS.matchScore).skip((page - 1) * limit).limit(limit);
        }

        let applications = await cursor;

        if (inMemorySort) {
            const key = sort === 'name'
                ? (a) => (a.applicant?.name || '').toLowerCase()
                : (a) => experienceYearsFor(a.applicant?.profile);

            applications = applications
                .sort((a, b) => {
                    const left = key(a);
                    const right = key(b);
                    if (left < right) return -1 * direction;
                    if (left > right) return 1 * direction;
                    return 0;
                })
                .slice((page - 1) * limit, page * limit);
        }

        // The derived figures the report table shows, attached here so the
        // filter above and the displayed value can never disagree.
        const rows = applications.map(application => ({
            ...application.toObject(),
            insights: insightsFor(application.applicant?.profile)
        }));

        res.status(200).json({
            success: true,
            count: rows.length,
            total,
            page,
            limit,
            totalPages: Math.max(Math.ceil(total / limit), 1),
            statusCounts,
            applications: rows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get user's applications
// @route   GET /api/applications/me
// @access  Private (Job Seeker)
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await Application.find({ applicant: req.user.id })
            .populate('job', 'title department location employmentType')
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
};

// @desc    Applications across the organization awaiting an authorised decision
// @route   GET /api/applications/pending-decision
// @access  Private (HR Manager)
exports.getPendingDecisions = async (req, res) => {
    try {
        // Only candidates the HR Expert has already processed reach this queue,
        // which is what keeps processing and approval as two separate steps.
        // Hires whose onboarding bridge failed are included as well, so a broken
        // handover stays visible and can be retried instead of being lost.
        const hiredInOrg = await Application.find({
            employer: req.employerId,
            status: 'hired'
        }).select('_id');

        const onboarded = await Employee.find({
            'recruitment.application': { $in: hiredInOrg.map(a => a._id) }
        }).select('recruitment.application');

        const onboardedIds = new Set(onboarded.map(e => e.recruitment.application.toString()));
        const strandedHires = hiredInOrg
            .filter(a => !onboardedIds.has(a._id.toString()))
            .map(a => a._id);

        const applications = await Application.find({
            employer: req.employerId,
            $or: [
                { status: { $in: AWAITING_DECISION_STATUSES } },
                { _id: { $in: strandedHires } }
            ]
        })
            .populate('applicant', 'name email profile')
            .populate('job', 'title department location')
            .populate('resume', 'fileName fileType parsedData')
            .populate('shortlistedBy', 'name')
            .populate('screenedBy', 'name')
            .populate('statusHistory.changedBy', 'name role')
            .sort({ shortlistedAt: -1, matchScore: -1, createdAt: -1 });

        const strandedSet = new Set(strandedHires.map(id => id.toString()));

        // A manager may not decide on a candidate they shortlisted themselves,
        // so the queue says up front which entries they cannot action.
        const decorated = applications.map(application => {
            const item = application.toObject();
            item.canDecide = !(application.shortlistedBy &&
                application.shortlistedBy._id.toString() === req.user.id);
            item.onboardingFailed = strandedSet.has(application._id.toString());
            return item;
        });

        res.status(200).json({
            success: true,
            count: decorated.length,
            applications: decorated
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update application status (HR Expert processing)
// @route   PUT /api/applications/:id/status
// @access  Private (HR Expert)
exports.updateApplicationStatus = async (req, res) => {
    try {
        const { status, note } = req.body;
        const { application, error } = await loadScopedApplication(req.params.id, req);

        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // Final hiring outcomes are reserved for the HR Manager decision endpoint,
        // so the user who processes an application never also approves it.
        if (DECISION_STATUSES.includes(status)) {
            return res.status(403).json({
                success: false,
                message: 'Final recruitment decisions must be made by an HR Manager'
            });
        }

        if (!PROCESSING_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${PROCESSING_STATUSES.join(', ')}`
            });
        }

        // Separation of duties has to hold in both directions. Blocking only the
        // *setting* of a decision status still let an HR Expert overwrite one the
        // HR Manager had already recorded - including reopening a hire whose
        // employee record and role change had already been applied.
        if (application.decision && application.decision.outcome !== 'pending') {
            return res.status(403).json({
                success: false,
                message: 'This application has an authorised HR Manager decision and can no longer be processed'
            });
        }

        if (['withdrawn', ...DECISION_STATUSES].includes(application.status)) {
            return res.status(400).json({
                success: false,
                message: `This application is closed (status: ${application.status}) and can no longer be processed`
            });
        }

        application.status = status;

        if (status === 'shortlisted') {
            application.shortlistedBy = req.user.id;
            application.shortlistedAt = new Date();
        }
        if (status === 'under_review' && !application.screenedBy) {
            application.screenedBy = req.user.id;
            application.screenedAt = new Date();
        }

        application.statusHistory.push({
            status,
            date: new Date(),
            changedBy: req.user.id,
            note: note || `Status updated to ${status}`
        });

        await application.save();

        // Candidate: "Application status changed" / "Shortlisted". HR Manager:
        // "Candidate awaiting review" once the application first enters the
        // decision queue (getPendingDecisions already includes 'shortlisted'
        // onward, so this is the exact moment a review becomes actionable).
        const candidateMessages = {
            under_review: `Your application for ${application.job.title} is now under review.`,
            shortlisted: `Good news - you have been shortlisted for ${application.job.title}.`,
            interviewed: `Your interview for ${application.job.title} has been recorded.`,
            rejected: `Your application for ${application.job.title} was not successful.${note ? ` ${note}` : ''}`
        };
        if (candidateMessages[status]) {
            await notificationService.notify({
                user: application.applicant,
                employer: application.employer,
                type: 'application_update',
                title: status === 'shortlisted' ? 'You have been shortlisted' : 'Application update',
                message: candidateMessages[status],
                link: '/candidate/dashboard'
            });
        }

        if (status === 'shortlisted') {
            await notificationService.notifyRoles({
                employer: application.employer,
                roles: ['hr_manager'],
                type: 'application_update',
                title: 'Candidate awaiting review',
                message: `A shortlisted candidate for ${application.job.title} is awaiting your review.`,
                link: '/hr-manager/shortlists'
            });
        }

        if (status === 'rejected') {
            try {
                const candidate = await User.findById(application.applicant).select('name email');
                if (candidate) {
                    await emailService.sendApplicationRejected({
                        to: candidate.email,
                        name: candidate.name,
                        jobTitle: application.job?.title || '',
                        reason: note || ''
                    });
                }
            } catch (emailError) {
                console.error('Application rejection email failed:', emailError.message);
            }
        }

        res.status(200).json({
            success: true,
            application
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Record an authorised final recruitment decision
// @route   PUT /api/applications/:id/decision
// @access  Private (HR Manager)
exports.decideApplication = async (req, res) => {
    try {
        const { outcome, status, reason } = req.body;

        if (!['approved', 'rejected'].includes(outcome)) {
            return res.status(400).json({
                success: false,
                message: 'Outcome must be either approved or rejected'
            });
        }

        const { application, error } = await loadScopedApplication(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // The manager decides on work the HR Expert has already processed. Deciding
        // on a raw application would collapse the two-step flow into one.
        //
        // A hire whose onboarding bridge failed is the one exception: the decision
        // was saved but no Employee record exists, and createEmployeeFromApplication
        // is idempotent by design. Without this escape hatch such a candidate stayed
        // 'hired' with no employee record and no way to retry from anywhere.
        if (!AWAITING_DECISION_STATUSES.includes(application.status)) {
            const retryingFailedOnboarding = application.status === 'hired' &&
                outcome === 'approved' &&
                !(await Employee.exists({ 'recruitment.application': application._id }));

            if (!retryingFailedOnboarding) {
                return res.status(400).json({
                    success: false,
                    message: `This application is not awaiting a decision (status: ${application.status}). An HR Expert must screen and shortlist it first.`
                });
            }
        }

        // A manager must not decide on a candidate they personally shortlisted.
        if (application.shortlistedBy && application.shortlistedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot make the final decision on a candidate you shortlisted yourself'
            });
        }

        let finalStatus;
        if (outcome === 'rejected') {
            finalStatus = 'rejected';
        } else {
            finalStatus = DECISION_STATUSES.includes(status) ? status : 'selected';
        }

        const previousStatus = application.status;

        application.status = finalStatus;
        application.decision = {
            outcome,
            decidedBy: req.user.id,
            decidedAt: new Date(),
            reason: reason || ''
        };
        application.statusHistory.push({
            status: finalStatus,
            date: new Date(),
            changedBy: req.user.id,
            note: reason || `Final decision: ${outcome}`
        });

        await application.save();

        // Approving a hire is what connects recruitment to employee management:
        // create the Employee profile now so onboarding can begin. A failure
        // here must not lose the recorded decision, so it is reported alongside
        // the saved application rather than thrown away.
        let onboarding = null;
        if (outcome === 'approved' && finalStatus === 'hired') {
            try {
                const { employee, created, activationSent, activationLink } = await createEmployeeFromApplication(application, req);
                onboarding = {
                    employeeId: employee.employeeId,
                    employee: employee._id,
                    status: employee.onboarding.status,
                    created,
                    // The hire does not grant the employee workspace; the person
                    // does that themselves through the activation link.
                    accountActivationPending: created && activationSent,
                    activationLink: created && activationSent ? activationLink : null
                };
            } catch (onboardingError) {
                console.error('Employee onboarding failed:', onboardingError);
                onboarding = { error: onboardingError.message };
            }
        }

        await auditService.record(req, {
            action: 'application.decision',
            entity: 'Application',
            entityId: application._id,
            details: `Recruitment decision recorded${reason ? `: ${reason}` : ''}`,
            from: previousStatus,
            to: finalStatus
        });

        // A hire's activation link is the actionable next step, so this
        // notification must point there rather than back to the dashboard
        // the candidate is already on - otherwise it reads as a dead end,
        // and the separate "activate your account" notification underneath
        // it (older, so lower in the list) is easy to miss entirely.
        await notificationService.notify({
            user: application.applicant,
            employer: application.employer,
            type: 'hiring_decision',
            title: outcome === 'approved' ? 'Application successful' : 'Application unsuccessful',
            message: outcome === 'approved'
                ? `Congratulations - your application was approved (${finalStatus}).`
                : `Your application was not successful.${reason ? ` Reason: ${reason}` : ''}`,
            link: onboarding?.activationLink || '/candidate/dashboard'
        });

        // A rejected candidate gets no activation mail, so this is the only
        // message they receive by email. Sending is best effort - the in-app
        // notification above is the guaranteed channel.
        if (outcome === 'rejected') {
            const candidate = await User.findById(application.applicant).select('name email');
            if (candidate) {
                await emailService.sendApplicationRejected({
                    to: candidate.email,
                    name: candidate.name,
                    jobTitle: application.job?.title || '',
                    reason: reason || ''
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Recruitment decision recorded (${finalStatus})`,
            application,
            onboarding
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Withdraw own application
// @route   PUT /api/applications/:id/withdraw
// @access  Private (Candidate)
exports.withdrawApplication = async (req, res) => {
    try {
        const application = await Application.findById(req.params.id);

        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }

        if (application.applicant.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only withdraw your own application' });
        }

        if (['hired', 'withdrawn'].includes(application.status)) {
            return res.status(400).json({
                success: false,
                message: `This application can no longer be withdrawn (status: ${application.status})`
            });
        }

        application.status = 'withdrawn';
        application.statusHistory.push({
            status: 'withdrawn',
            date: new Date(),
            changedBy: req.user.id,
            note: req.body.reason || 'Withdrawn by candidate'
        });
        await application.save();

        res.status(200).json({ success: true, message: 'Application withdrawn', application });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Schedule interview
// @route   PUT /api/applications/:id/schedule-interview
// @access  Private (HR Expert)
exports.scheduleInterview = async (req, res) => {
    try {
        const { interviewDate, interviewLocation, note } = req.body;
        const { application, error } = await loadScopedApplication(req.params.id, req);

        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        const isReschedule = application.status === 'interview_scheduled';

        application.interviewDate = interviewDate;
        application.interviewLocation = interviewLocation;
        application.status = 'interview_scheduled';
        application.statusHistory.push({
            status: 'interview_scheduled',
            date: new Date(),
            changedBy: req.user.id,
            note: note || 'Interview scheduled'
        });

        await application.save();

        await notificationService.notify({
            user: application.applicant,
            employer: application.employer,
            type: 'interview_scheduled',
            title: isReschedule ? 'Interview rescheduled' : 'Interview scheduled',
            message: `Your interview for ${application.job.title} is ${isReschedule ? 'now' : ''} scheduled for `
                + `${new Date(interviewDate).toLocaleString()}${interviewLocation ? ` at ${interviewLocation}` : ''}.`,
            link: '/candidate/dashboard'
        });

        // Email invitation is best effort - the in-app notification above
        // always reaches the candidate even if SMTP is not configured.
        try {
            const candidate = await User.findById(application.applicant).select('name email');
            const employerOrg = await Employer.findById(application.employer).select('name');
            if (candidate) {
                await emailService.sendInterviewInvitation(
                    candidate.email, candidate.name, application.job.title, employerOrg?.name || '',
                    interviewDate, interviewLocation, note
                );
            }
        } catch (emailError) {
            console.error('Interview invitation email failed:', emailError.message);
        }

        res.status(200).json({
            success: true,
            application
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};
