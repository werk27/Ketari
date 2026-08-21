const Application = require('../models/Application');
const Job = require('../models/Job');
const Resume = require('../models/Resume');
const Employee = require('../models/Employee');
const { validationResult } = require('express-validator');
const { calculateMatchScore, calculateMatchDetails } = require('../services/matchingService');
const { createEmployeeFromApplication } = require('../services/onboardingService');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');

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

        const query = { job: req.params.jobId };
        if (req.query.status) query.status = req.query.status;

        const applications = await Application.find(query)
            .populate('applicant', 'name email profile')
            .populate('resume')
            .populate('shortlistedBy', 'name')
            .populate('decision.decidedBy', 'name')
            .sort({ matchScore: -1, createdAt: -1 });

        res.status(200).json({
            success: true,
            count: applications.length,
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
            .populate('shortlistedBy', 'name')
            .populate('screenedBy', 'name')
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
                const { employee, created } = await createEmployeeFromApplication(application, req);
                onboarding = {
                    employeeId: employee.employeeId,
                    employee: employee._id,
                    status: employee.onboarding.status,
                    created
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

        await notificationService.notify({
            user: application.applicant,
            employer: application.employer,
            type: 'hiring_decision',
            title: outcome === 'approved' ? 'Application successful' : 'Application unsuccessful',
            message: outcome === 'approved'
                ? `Congratulations - your application was approved (${finalStatus}).`
                : `Your application was not successful.${reason ? ` Reason: ${reason}` : ''}`,
            link: '/candidate/dashboard'
        });

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
