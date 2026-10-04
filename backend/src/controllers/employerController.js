const path = require('path');
const fs = require('fs');
const Employer = require('../models/Employer');
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Employee = require('../models/Employee');
const { HR_ROLES, EMPLOYER_MANAGEABLE_ROLES } = require('../config/permissions');
const { PRIVATE_PATHS, toPublicPath, toAbsolutePath } = require('../config/paths');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { nextEmployeeId } = require('../services/onboardingService');

const PUBLIC_STATUSES = ['published', 'approved', 'open'];

/** Split a single "name" field into the Employee record's separate name parts.
 *  Mirrors onboardingService.splitName - this form only ever collects one
 *  name field, but Employee.personalInfo requires firstName AND lastName. */
const splitName = (fullName = '') => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'Unknown', middleName: '', lastName: 'Unknown' };
    if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: parts[0] };
    return {
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(' '),
        lastName: parts[parts.length - 1]
    };
};

// @desc    Get the caller's own organization profile
// @route   GET /api/employers/me
// @access  Private (organization members)
exports.getMyEmployer = async (req, res) => {
    try {
        const employer = await Employer.findById(req.employerId)
            .populate('owner', 'name email');

        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        res.status(200).json({
            success: true,
            employer,
            checklist: employer.verificationChecklist()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update the caller's organization profile
// @route   PUT /api/employers/me
// @access  Private (Employer owner)
exports.updateMyEmployer = async (req, res) => {
    try {
        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Platform-controlled fields can never be self-assigned by an organization.
        // Verification evidence is included: an employer that could write its own
        // verificationDocuments or clear its own rejectionReason would be able to
        // fake having been reviewed. `logo` is set only by its upload route, so a
        // crafted path cannot be stored here.
        const {
            status: _status, owner: _owner, slug: _slug,
            verifiedAt: _verifiedAt, verifiedBy: _verifiedBy,
            verificationDocuments: _docs, rejectionReason: _reason,
            reviewedAt: _reviewedAt, reviewedBy: _reviewedBy,
            submittedForReviewAt: _submittedAt, logo: _logo, ...updates
        } = req.body;

        Object.assign(employer, updates);
        await employer.save();

        res.status(200).json({ success: true, employer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Public organization profile
// @route   GET /api/employers/:id
// @access  Public
exports.getEmployerPublicProfile = async (req, res) => {
    try {
        const employer = await Employer.findById(req.params.id)
            .select('name logo description industry website address contact status');

        if (!employer || employer.status !== 'active') {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const openJobs = await Job.find({
            employer: employer._id,
            status: { $in: PUBLIC_STATUSES }
        }).select('title department location employmentType workMode createdAt applicationDeadline');

        res.status(200).json({ success: true, employer, openJobs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    List the organization's HR team
// @route   GET /api/employers/me/team
// @access  Private (Employer owner)
exports.getTeam = async (req, res) => {
    try {
        // HR_ROLES (hr_expert, hr_manager) only - not EMPLOYER_MANAGEABLE_ROLES,
        // which also includes 'employee' for account-creation validation
        // elsewhere. Using that broader list here pulled every hired,
        // activated employee into the "HR Team" roster alongside actual HR
        // staff, mislabeling plain employees as HR Expert in the UI.
        const team = await User.find({
            employer: req.employerId,
            role: { $in: [...HR_ROLES, 'employer'] }
        }).select('name email role status department jobTitle createdAt');

        res.status(200).json({ success: true, count: team.length, team });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Add an HR team member to the organization
// @route   POST /api/employers/me/team
// @access  Private (Employer owner)
//
// A role must only ever be granted to a User account already linked to an
// Employee record (see employeeController.js's module comment and
// assignEmployeeRole) - this used to create the User with a role directly
// and nothing else, leaving them invisible in the Employee Directory yet
// fully privileged, and completely bypassing the employee registration/
// approval workflow (employeeController.createEmployee). It now creates the
// same linked Employee record that path would, so this is just a faster
// on-ramp to the identical end state rather than a separate, weaker one.
// The Employer creating their own team is the same "organization has no HR
// staff yet" bootstrap case createEmployee already auto-approves, so this
// Employee record is active immediately, never pending_approval.
exports.addTeamMember = async (req, res) => {
    try {
        const { name, email, password, role, department, jobTitle } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email and password are required'
            });
        }

        // An employer may only create staff inside its own organization -
        // never platform administrators or other employers.
        if (!EMPLOYER_MANAGEABLE_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Role must be one of: ${EMPLOYER_MANAGEABLE_ROLES.join(', ')}`
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const exists = await User.findOne({ email: normalizedEmail });
        if (exists) {
            return res.status(400).json({
                success: false,
                message: 'A user with this email address already exists'
            });
        }

        const member = await User.create({
            name,
            email: normalizedEmail,
            password,
            role,
            status: 'active',
            employer: req.employerId,
            department: department || '',
            jobTitle: jobTitle || ''
        });

        const { firstName, middleName, lastName } = splitName(name);
        const employeeId = await nextEmployeeId(req.employerId);
        const employee = await Employee.create({
            employer: req.employerId,
            user: member._id,
            employeeId,
            personalInfo: { firstName, middleName, lastName },
            contactInfo: { email: normalizedEmail },
            employmentInfo: { jobTitle: jobTitle || '', employmentStatus: 'active', hireDate: new Date() },
            status: 'active',
            registration: {
                submittedBy: req.user.id,
                submittedAt: new Date(),
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
                history: [{
                    status: 'active',
                    changedBy: req.user.id,
                    changedAt: new Date(),
                    note: 'Recorded via Add HR Team Member (organization owner - auto-approved)'
                }]
            }
        });

        res.status(201).json({
            success: true,
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                status: member.status,
                department: member.department,
                jobTitle: member.jobTitle
            },
            employeeId: employee.employeeId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update an HR team member
// @route   PUT /api/employers/me/team/:userId
// @access  Private (Employer owner)
exports.updateTeamMember = async (req, res) => {
    try {
        const member = await User.findById(req.params.userId);

        if (!member || !member.employer || member.employer.toString() !== req.employerId.toString()) {
            return res.status(404).json({ success: false, message: 'Team member not found in your organization' });
        }

        if (member._id.toString() === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot modify your own membership here' });
        }

        const { role, status, department, jobTitle } = req.body;

        if (role !== undefined) {
            if (!EMPLOYER_MANAGEABLE_ROLES.includes(role)) {
                return res.status(400).json({
                    success: false,
                    message: `Role must be one of: ${EMPLOYER_MANAGEABLE_ROLES.join(', ')}`
                });
            }
            // A role may only ever be granted to an account already linked to
            // an Employee record (see addTeamMember above and
            // employeeController.assignEmployeeRole) - without this check a
            // role could still be handed to an orphan account through this
            // endpoint even though the creation path above no longer allows
            // one to exist. Changing status/department/jobTitle never touches
            // the role, so that keeps working exactly as before regardless.
            const hasEmployeeRecord = await Employee.exists({ user: member._id, employer: req.employerId });
            if (!hasEmployeeRecord) {
                return res.status(400).json({
                    success: false,
                    message: 'This account has no linked Employee record yet. Record them in the Employee Directory first, then assign a role there.'
                });
            }
            member.role = role;
        }
        if (status !== undefined) member.status = status;
        if (department !== undefined) member.department = department;
        if (jobTitle !== undefined) member.jobTitle = jobTitle;

        await member.save();

        res.status(200).json({
            success: true,
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                status: member.status,
                department: member.department,
                jobTitle: member.jobTitle
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Remove an HR team member from the organization
// @route   DELETE /api/employers/me/team/:userId
// @access  Private (Employer owner)
exports.removeTeamMember = async (req, res) => {
    try {
        const member = await User.findById(req.params.userId);

        if (!member || !member.employer || member.employer.toString() !== req.employerId.toString()) {
            return res.status(404).json({ success: false, message: 'Team member not found in your organization' });
        }

        if (member.role === 'employer') {
            return res.status(400).json({ success: false, message: 'The organization owner cannot be removed' });
        }

        // Deactivate rather than delete so recruitment history stays auditable.
        member.status = 'inactive';
        await member.save();

        res.status(200).json({ success: true, message: 'Team member deactivated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Organization HR overview (real data, no hard-coded statistics)
// @route   GET /api/employers/me/overview
// @access  Private (organization members)
exports.getOverview = async (req, res) => {
    try {
        const employerId = req.employerId;

        const Employee = require('../models/Employee');
        const Leave = require('../models/Leave');
        const EmployeeRequest = require('../models/EmployeeRequest');
        const Training = require('../models/Training');
        const Complaint = require('../models/Complaint');

        const groupByStatus = (Model) => Model.aggregate([
            { $match: { employer: employerId } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const [
            jobStatusCounts, applicationStatusCounts, teamCount, employer,
            employeeStatusCounts, leaveStatusCounts, requestStatusCounts,
            trainingStatusCounts, complaintStatusCounts, departmentCounts
        ] = await Promise.all([
            groupByStatus(Job),
            groupByStatus(Application),
            User.countDocuments({ employer: employerId, role: { $in: HR_ROLES }, status: 'active' }),
            Employer.findById(employerId).select('name logo industry status departments positions'),
            groupByStatus(Employee),
            groupByStatus(Leave),
            groupByStatus(EmployeeRequest),
            groupByStatus(Training),
            groupByStatus(Complaint),
            Employee.aggregate([
                { $match: { employer: employerId } },
                { $group: { _id: '$employmentInfo.jobTitle', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ])
        ]);

        const toMap = rows => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});
        const jobs = toMap(jobStatusCounts);
        const applications = toMap(applicationStatusCounts);
        const employees = toMap(employeeStatusCounts);
        const leaves = toMap(leaveStatusCounts);
        const requests = toMap(requestStatusCounts);
        const trainings = toMap(trainingStatusCounts);
        const complaints = toMap(complaintStatusCounts);

        const sum = (map, keys) => keys.reduce((total, key) => total + (map[key] || 0), 0);
        const totalOf = map => Object.values(map).reduce((a, b) => a + b, 0);

        // "New" employees are those hired within the last 30 days.
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const newEmployees = await Employee.countDocuments({
            employer: employerId,
            'employmentInfo.hireDate': { $gte: thirtyDaysAgo }
        });

        res.status(200).json({
            success: true,
            organization: employer,
            statistics: {
                vacancies: {
                    byStatus: jobs,
                    total: totalOf(jobs),
                    active: sum(jobs, PUBLIC_STATUSES),
                    pendingApproval: jobs.pending_approval || 0,
                    drafts: jobs.draft || 0
                },
                applications: {
                    byStatus: applications,
                    total: totalOf(applications),
                    shortlisted: applications.shortlisted || 0,
                    interviewing: sum(applications, ['interview', 'interview_scheduled', 'interviewed']),
                    aiAnalyzed: applications.ai_analyzed || 0,
                    hired: applications.hired || 0
                },
                employees: {
                    byStatus: employees,
                    total: totalOf(employees),
                    active: employees.active || 0,
                    onLeave: employees.on_leave || 0,
                    newThisMonth: newEmployees,
                    byJobTitle: departmentCounts.filter(row => row._id)
                },
                leave: {
                    byStatus: leaves,
                    total: totalOf(leaves),
                    pending: sum(leaves, ['pending', 'under_review']),
                    approved: leaves.approved || 0
                },
                requests: {
                    byStatus: requests,
                    total: totalOf(requests),
                    pending: sum(requests, ['submitted', 'processing'])
                },
                training: {
                    byStatus: trainings,
                    total: totalOf(trainings),
                    pendingApproval: trainings.proposed || 0,
                    upcoming: sum(trainings, ['approved', 'open']),
                    inProgress: trainings.in_progress || 0
                },
                complaints: {
                    byStatus: complaints,
                    total: totalOf(complaints),
                    open: sum(complaints, ['submitted', 'pending', 'under_review', 'investigating'])
                },
                team: { activeHrUsers: teamCount },
                structure: {
                    departments: employer && employer.departments ? employer.departments.length : 0,
                    positions: employer && employer.positions ? employer.positions.length : 0
                }
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// ============================================
// PLATFORM ADMINISTRATION (System Administrator)
// ============================================

// @desc    List all employers on the platform
// @route   GET /api/employers
// @access  Private (System Administrator)
exports.listEmployers = async (req, res) => {
    try {
        const query = {};
        if (req.query.status) query.status = req.query.status;
        if (req.query.search) query.name = { $regex: req.query.search, $options: 'i' };

        const employers = await Employer.find(query)
            .populate('owner', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: employers.length, employers });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Change an employer's platform status (approve / reject / suspend)
// @route   PUT /api/employers/:id/status
// @access  Private (System Administrator)
exports.setEmployerStatus = async (req, res) => {
    try {
        const { status, reason } = req.body;
        const allowed = ['pending', 'active', 'rejected', 'suspended', 'inactive'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(', ')}`
            });
        }

        // A refusal the applicant cannot read gives them nothing to correct, so
        // turning an organization away requires saying why.
        const needsReason = ['rejected', 'suspended'].includes(status);
        if (needsReason && (!reason || !String(reason).trim())) {
            return res.status(400).json({
                success: false,
                message: `A reason is required when marking an organization ${status}, `
                    + 'so the employer knows what to correct.'
            });
        }

        const employer = await Employer.findById(req.params.id);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        employer.status = status;
        employer.reviewedAt = new Date();
        employer.reviewedBy = req.user.id;
        employer.rejectionReason = needsReason ? String(reason).trim() : '';

        if (status === 'active') {
            employer.verifiedAt = new Date();
            employer.verifiedBy = req.user.id;
        }
        await employer.save();

        if (employer.owner && ['active', 'rejected', 'suspended'].includes(status)) {
            const resultMessage = {
                active: `Congratulations - ${employer.name} has been verified and is now active.`,
                rejected: `${employer.name}'s verification was not approved.${employer.rejectionReason ? ` Reason: ${employer.rejectionReason}` : ''}`,
                suspended: `${employer.name} has been suspended.${employer.rejectionReason ? ` Reason: ${employer.rejectionReason}` : ''}`
            }[status];

            await notificationService.notify({
                user: employer.owner,
                employer: employer._id,
                type: 'account_update',
                title: 'Organization verification result',
                message: resultMessage,
                link: '/employer/verification'
            });

            // Email is best effort - the in-app notification above always reaches the owner.
            try {
                const owner = await User.findById(employer.owner).select('name email');
                if (owner) {
                    await emailService.sendEmployerVerificationResult({
                        to: owner.email,
                        name: owner.name,
                        organizationName: employer.name,
                        status,
                        reason: employer.rejectionReason
                    });
                }
            } catch (emailError) {
                console.error('Employer verification result email failed:', emailError.message);
            }
        }

        res.status(200).json({ success: true, message: `Organization marked ${status}`, employer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Upload the organization's logo
// @route   POST /api/employers/me/logo
// @access  Private (Employer owner)
exports.uploadLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please attach an image' });
        }

        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // Remove the previous file so replaced logos do not accumulate on disk.
        if (employer.logo) {
            const old = toAbsolutePath(employer.logo);
            if (old && fs.existsSync(old)) fs.unlink(old, () => {});
        }

        // Unlike verification evidence, a logo is meant to be seen: candidates
        // view it on published vacancies, so it belongs in the public uploads
        // folder that express.static serves.
        employer.logo = toPublicPath(req.file.path);
        await employer.save();

        res.status(200).json({ success: true, message: 'Logo updated', logo: employer.logo });
    } catch (error) {
        console.error(error);
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Remove the organization's logo
// @route   DELETE /api/employers/me/logo
// @access  Private (Employer owner)
exports.deleteLogo = async (req, res) => {
    try {
        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        if (employer.logo) {
            const absolute = toAbsolutePath(employer.logo);
            if (absolute && fs.existsSync(absolute)) fs.unlink(absolute, () => {});
            employer.logo = null;
            await employer.save();
        }

        res.status(200).json({ success: true, message: 'Logo removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Full verification dossier for one organization
// @route   GET /api/employers/:id/verification
// @access  Private (System Administrator)
exports.getVerificationDossier = async (req, res) => {
    try {
        const employer = await Employer.findById(req.params.id)
            .populate('owner', 'name email createdAt')
            .populate('reviewedBy', 'name')
            .populate('verifiedBy', 'name');

        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const checklist = employer.verificationChecklist();

        // A duplicate TIN usually means the same organization applying twice, or
        // one impersonating another, so surface it rather than making the
        // administrator search for it.
        const duplicates = employer.tin
            ? await Employer.find({ tin: employer.tin, _id: { $ne: employer._id } })
                .select('name status createdAt')
            : [];

        res.status(200).json({
            success: true,
            employer,
            checklist,
            unmet: checklist.filter(item => !item.met).map(item => item.label),
            duplicates
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Stream one verification document
// @route   GET /api/employers/:id/documents/:docId
// @access  Private (System Administrator, or the organization that owns it)
exports.getVerificationDocument = async (req, res) => {
    try {
        const employer = await Employer.findById(req.params.id).select('verificationDocuments');
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        // These files identify a real organization, so they are never public:
        // only an administrator or a member of the owning organization may read
        // one. This is why they live outside the statically served uploads root.
        const isAdmin = req.user.role === 'admin';
        const ownsIt = String(req.user.employer || '') === String(employer._id);
        if (!isAdmin && !ownsIt) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this document' });
        }

        const doc = employer.verificationDocuments.id(req.params.docId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const absolute = path.join(PRIVATE_PATHS.verification, path.basename(doc.path));
        if (!fs.existsSync(absolute)) {
            return res.status(404).json({ success: false, message: 'The stored file is missing' });
        }

        res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${doc.originalName || 'document'}"`);
        fs.createReadStream(absolute).pipe(res);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Attach a verification document to the caller's organization
// @route   POST /api/employers/me/documents
// @access  Private (Employer owner)
exports.uploadVerificationDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please attach a file' });
        }

        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        employer.verificationDocuments.push({
            label: (req.body.label || 'Supporting document').slice(0, 120),
            path: path.basename(req.file.path),
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size
        });
        await employer.save();

        res.status(201).json({
            success: true,
            message: 'Document uploaded',
            documents: employer.verificationDocuments
        });
    } catch (error) {
        console.error(error);
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Remove one of the caller's verification documents
// @route   DELETE /api/employers/me/documents/:docId
// @access  Private (Employer owner)
exports.deleteVerificationDocument = async (req, res) => {
    try {
        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        const doc = employer.verificationDocuments.id(req.params.docId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const absolute = path.join(PRIVATE_PATHS.verification, path.basename(doc.path));
        fs.unlink(absolute, () => {});
        doc.deleteOne();
        await employer.save();

        res.status(200).json({ success: true, message: 'Document removed', documents: employer.verificationDocuments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Submit (or resubmit) the organization for administrator review
// @route   POST /api/employers/me/submit-verification
// @access  Private (Employer owner)
exports.submitForVerification = async (req, res) => {
    try {
        const employer = await Employer.findById(req.employerId);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        if (employer.status === 'active') {
            return res.status(400).json({ success: false, message: 'This organization is already verified.' });
        }
        if (employer.status === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'A suspended organization cannot resubmit. Contact the System Administrator.'
            });
        }

        // Sending an incomplete application straight to the reviewer wastes a
        // round trip, so the same checklist is applied before it is accepted.
        const unmet = employer.verificationChecklist()
            .filter(item => !item.met && item.key !== 'representative');

        if (unmet.length) {
            return res.status(400).json({
                success: false,
                message: 'Your application is not complete yet.',
                missing: unmet.map(item => item.label)
            });
        }

        employer.status = 'pending';
        employer.submittedForReviewAt = new Date();
        employer.rejectionReason = '';
        await employer.save();

        await notificationService.notifyAdmins({
            employer: employer._id,
            type: 'employer_registered',
            title: 'Organization verification required',
            message: `${employer.name} submitted their organization for verification.`,
            link: '/admin/employers'
        });

        res.status(200).json({
            success: true,
            message: 'Submitted for verification. An administrator will review your organization.',
            employer
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
