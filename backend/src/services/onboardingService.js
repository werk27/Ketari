const Employee = require('../models/Employee');
const Resume = require('../models/Resume');
const User = require('../models/User');
const audit = require('./auditService');
const notifications = require('./notificationService');
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
 * Create (or return the existing) Employee record for a hired application.
 *
 * Idempotent: re-deciding an application never produces a duplicate employee.
 * Returns { employee, created }.
 */
exports.createEmployeeFromApplication = async (application, req) => {
    const existing = await Employee.findOne({ 'recruitment.application': application._id });
    if (existing) return { employee: existing, created: false };

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

    // The candidate becomes a member of staff, so their account moves to the
    // employee role and joins the organization - this is what gives them the
    // employee self-service workspace.
    candidate.role = 'employee';
    candidate.employer = employerId;
    await candidate.save({ validateBeforeSave: false });

    await notifications.notify({
        user: candidate._id,
        employer: employerId,
        type: 'account_update',
        title: 'Welcome - complete your profile',
        message: `You have been hired${job ? ` as ${job.title}` : ''}. Please complete your employee profile.`,
        link: '/employee/onboarding'
    });

    await notifications.notifyRoles({
        employer: employerId,
        roles: HR_ROLES,
        type: 'account_update',
        title: 'New employee onboarding',
        message: `${candidate.name} has been hired and needs onboarding.`,
        link: '/hr-expert/employees'
    });

    await audit.record(req, {
        action: 'employee.onboarding_created',
        entity: 'Employee',
        entityId: employee._id,
        details: `Employee profile created for ${candidate.name} from approved hire`,
        from: 'candidate',
        to: 'employee'
    });

    return { employee, created: true };
};

exports.nextEmployeeId = nextEmployeeId;
