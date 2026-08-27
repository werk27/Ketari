const Employee = require('../models/Employee');
const Resume = require('../models/Resume');
const User = require('../models/User');
const Job = require('../models/Job');
const JobRequisition = require('../models/JobRequisition');
const audit = require('./auditService');
const notifications = require('./notificationService');
const email = require('./emailService');
const { HR_ROLES } = require('../config/permissions');

/**
 * Recruitment -> Employee onboarding bridge.
 *
 * When an HR Manager approves a hire, the candidate already has a name, contact
 * details, a CV, education, skills, experience and languages on file. This
 * creates the Employee record from that data so onboarding only ever asks for
 * what recruitment could not supply (address, marital status, blood type,
 * emergency contact, identification and similar).
 */

/** Next employee number within an organization. Mirrors employeeController. */
const nextEmployeeId = async (employerId) => {
    const count = await Employee.countDocuments({ employer: employerId });
    let candidate;
    let attempt = count + 1;

    do {
        candidate = `EMP${String(attempt).padStart(4, '0')}`;
        attempt += 1;
    } while (await Employee.exists({ employer: employerId, employeeId: candidate }));

    return candidate;
};

/** Split a candidate's single name field into the employee name parts. */
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

/**
 * The approved requisition a vacancy came from, or null.
 *
 * `application.job` is populated with only a few fields at the call sites, so
 * the vacancy is re-read here rather than assuming `sourceRequisition` is
 * present on it.
 */
const loadSourceRequisition = async (application, job) => {
    try {
        const jobId = (job && job._id) || application.job;
        if (!jobId) return null;

        const vacancy = await Job.findById(jobId).select('sourceRequisition');
        if (!vacancy || !vacancy.sourceRequisition) return null;

        return await JobRequisition.findById(vacancy.sourceRequisition)
            .select('department departmentName position positionTitle requestedBy');
    } catch (error) {
        console.error('Could not resolve the source requisition for a hire:', error.message);
        return null;
    }
};

/**
 * Create (or return the existing) Employee record for a hired application.
 *
 * Idempotent: re-deciding an application never produces a duplicate employee.
 * Returns { employee, created, activationSent, activationLink }.
 */
exports.createEmployeeFromApplication = async (application, req) => {
    const existing = await Employee.findOne({ 'recruitment.application': application._id });
    if (existing) return { employee: existing, created: false, activationSent: false, activationLink: null };

    const candidate = await User.findById(application.applicant);
    if (!candidate) {
        throw new Error('The hired candidate account no longer exists');
    }

    const employerId = application.employer || (application.job && application.job.employer);
    if (!employerId) {
        throw new Error('This application is not linked to an organization');
    }

    // Prefer the CV attached to the application, else the candidate's default.
    const resume = application.resume
        ? await Resume.findById(application.resume)
        : await Resume.findOne({ user: candidate._id, isDefault: true });

    const profile = candidate.profile || {};
    const parsed = (resume && resume.parsedData) || {};
    const { firstName, middleName, lastName } = splitName(candidate.name);

    const job = application.job && application.job.title ? application.job : null;

    // A vacancy created from a Job Requisition already carries the approved
    // department and position as real configuration references. Carrying them
    // onto the Employee record is what actually places the new hire in the
    // department that asked for them - without it the requesting Department
    // Head never sees the person they recruited, and the employee's own
    // profile shows no department at all.
    const requisition = await loadSourceRequisition(application, job);

    const employee = await Employee.create({
        employer: employerId,
        user: candidate._id,
        employeeId: await nextEmployeeId(employerId),
        personalInfo: {
            firstName,
            middleName,
            lastName,
            profilePhoto: profile.profilePhoto || ''
        },
        contactInfo: {
            email: candidate.email || '',
            phone: profile.phone || parsed.phone || '',
            address: { city: profile.location || '' }
        },
        employmentInfo: {
            department: requisition ? requisition.department : null,
            position: requisition ? requisition.position : null,
            jobTitle: job ? job.title : (profile.title || ''),
            employmentStatus: 'active',
            hireDate: new Date()
        },
        professional: {
            skills: profile.skills || parsed.skills || [],
            languages: profile.languages || [],
            certifications: profile.certifications || [],
            education: profile.education || parsed.education || [],
            workExperience: profile.workExperience || parsed.workExperience || [],
            resume: resume ? resume._id : null
        },
        recruitment: {
            application: application._id,
            job: job ? job._id : application.job,
            appliedPosition: job ? job.title : '',
            matchScore: application.matchScore ?? null,
            hiredBy: req.user.id,
            hiredAt: new Date()
        },
        onboarding: {
            status: 'pending_onboarding',
            invitedAt: new Date(),
            history: [{
                status: 'pending_onboarding',
                changedBy: req.user.id,
                note: 'Employee profile created from approved hire'
            }]
        },
        employmentHistory: [{
            type: 'hired',
            jobTitle: job ? job.title : '',
            employmentStatus: 'active',
            effectiveDate: new Date(),
            note: 'Hired through recruitment',
            recordedBy: req.user.id
        }],
        status: 'active'
    });

    // Being hired records the employment; it does not by itself hand over the
    // employee workspace. The role only changes when the person follows the
    // activation link, so a candidate who is signed in is not moved into a
    // different workspace mid-session by a decision someone else just made.
    // Their role stays 'candidate' until then, which also keeps their own
    // application history reachable.
    const activationToken = candidate.getEmployeeActivationToken(employerId);
    await candidate.save({ validateBeforeSave: false });

    const activationLink = `/activate-employee/${activationToken}`;
    const activationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${activationLink}`;

    await notifications.notify({
        user: candidate._id,
        employer: employerId,
        type: 'account_update',
        title: 'You have been hired - activate your employee account',
        message: `Congratulations, you have been hired${job ? ` as ${job.title}` : ''}. `
            + 'Activate your employee account to complete your profile.',
        link: activationLink
    });

    // Mail is best effort: SMTP may not be configured, and a hiring decision
    // that is already saved must not fail because of it. The in-app
    // notification above always reaches them.
    await email.sendEmployeeActivation({
        to: candidate.email,
        name: candidate.name,
        jobTitle: job ? job.title : '',
        activationUrl
    });

    await notifications.notifyRoles({
        employer: employerId,
        roles: HR_ROLES,
        type: 'account_update',
        title: 'New employee onboarding',
        message: `${candidate.name} has been hired and needs onboarding.`,
        link: '/hr-expert/employees'
    });

    // Close the loop for whoever raised the requisition: their staffing
    // request has now actually produced a person.
    if (requisition && requisition.requestedBy) {
        await notifications.notify({
            user: requisition.requestedBy,
            employer: employerId,
            type: 'hiring_decision',
            title: 'Your requisition has been filled',
            message: `${candidate.name} was hired${job ? ` as ${job.title}` : ''} for ${requisition.departmentName}.`,
            link: await notifications.linkForUser(requisition.requestedBy, 'requisitions')
        });
    }

    await audit.record(req, {
        action: 'employee.onboarding_created',
        entity: 'Employee',
        entityId: employee._id,
        details: `Employee profile created for ${candidate.name} from approved hire`,
        from: 'candidate',
        to: 'employee (pending activation)'
    });

    return { employee, created: true, activationSent: true, activationLink };
};

exports.nextEmployeeId = nextEmployeeId;
