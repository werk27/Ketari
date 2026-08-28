const Employee = require('../models/Employee');
const User = require('../models/User');
const Employer = require('../models/Employer');
const { EMPLOYER_MANAGEABLE_ROLES } = require('../config/permissions');
const auditService = require('../services/auditService');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

/**
 * Employee Information module.
 *
 * Every record belongs to exactly one organization (req.employerId), so one
 * employer can never read or modify another employer's staff data.
 *
 * Employee / User account / organizational role are kept as three distinct
 * concepts (see createEmployeeAccount, linkEmployeeAccount, assignEmployeeRole
 * below): an Employee record can exist with no login access at all, and a
 * role such as hr_expert or hr_manager is only ever granted to the User
 * account already linked to an existing Employee - never created on its own.
 */

const ROLE_LABELS = { employee: 'Employee', hr_expert: 'HR Expert', hr_manager: 'HR Manager', employer: 'Employer' };
const roleLabel = (role) => ROLE_LABELS[role] || role;

/**
 * Optional credential-delivery email for a newly created or role-changed
 * account (see emailService.sendAccountCredentials). Never sends a password:
 * a reset token is generated on the account so the employee sets their own,
 * reusing the exact same mechanism the "forgot password" flow already relies
 * on (User.getResetPasswordToken / the existing resetpassword endpoints) -
 * no new authentication mechanism is introduced.
 *
 * Always returns a status rather than throwing, so a mail failure never
 * rolls back the account/role change that already succeeded.
 */
const deliverAccountCredentials = async ({ account, employerId, isNewAccount }) => {
    const resetToken = account.getResetPasswordToken();
    // 7 days, not the 10 minutes a same-session "forgot password" request
    // gets: this arrives unprompted after an administrative decision and may
    // sit unread over a weekend (the same reasoning as the employee
    // activation link elsewhere in this codebase).
    account.resetPasswordExpire = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await account.save({ validateBeforeSave: false });

    const organization = await Employer.findById(employerId).select('name');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const result = await emailService.sendAccountCredentials({
        to: account.email,
        employeeName: account.name,
        organizationName: organization?.name || 'your organization',
        role: roleLabel(account.role),
        loginUrl: `${frontendUrl}/login`,
        setPasswordUrl: `${frontendUrl}/reset-password/${resetToken}`,
        isNewAccount
    });

    return { requested: true, sent: !!result.sent, configured: emailService.isEmailEnabled() };
};

/** Human-readable addition to a response message describing what happened with the credential email. */
const emailStatusMessage = (emailResult) => {
    if (!emailResult || !emailResult.requested) return '';
    if (emailResult.sent) return ' Login credentials were emailed to the employee.';
    if (!emailResult.configured) return ' Email delivery is currently unavailable, so no email was sent.';
    return ' The credential email could not be sent; you can retry with "Resend login credentials".';
};

/** Generate the next employee number within an organization. */
const nextEmployeeId = async (employerId) => {
    const count = await Employee.countDocuments({ employer: employerId });
    let candidate;
    let attempt = count + 1;

    // Guard against gaps left by deleted records.
    do {
        candidate = `EMP${String(attempt).padStart(4, '0')}`;
        attempt += 1;
    } while (await Employee.exists({ employer: employerId, employeeId: candidate }));

    return candidate;
};

/** Load an employee and confirm the caller's organization owns it. */
const findScopedEmployee = async (employeeId, req) => {
    const employee = await Employee.findById(employeeId)
        .populate('user', 'name email role status')
        .populate('employmentInfo.supervisor', 'name email');

    if (!employee) return { error: { code: 404, message: 'Employee not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const recordEmployerId = employee.employer ? employee.employer.toString() : null;

    if (!recordEmployerId || recordEmployerId !== employerId) {
        return { error: { code: 403, message: 'This employee belongs to another organization' } };
    }

    return { employee };
};

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (HR Expert - records employee information)
exports.createEmployee = async (req, res) => {
    try {
        const { personalInfo, contactInfo, employmentInfo, compensation, userId } = req.body;

        if (!personalInfo?.firstName || !personalInfo?.lastName) {
            return res.status(400).json({
                success: false,
                message: 'First name and last name are required'
            });
        }

        // An optional linked account must belong to the same organization.
        if (userId) {
            const linkedUser = await User.findById(userId);
            const sameOrg = linkedUser && linkedUser.employer
                && linkedUser.employer.toString() === req.employerId.toString();
            if (!sameOrg) {
                return res.status(400).json({
                    success: false,
                    message: 'The linked user account must belong to your organization'
                });
            }
        }

        const employeeId = await nextEmployeeId(req.employerId);

        const employee = await Employee.create({
            employer: req.employerId,
            user: userId || null,
            employeeId,
            personalInfo: {
                title: personalInfo?.title || '',
                firstName: personalInfo.firstName,
                middleName: personalInfo?.middleName || '',
                lastName: personalInfo.lastName,
                dateOfBirth: personalInfo?.dateOfBirth || null,
                gender: personalInfo?.gender || 'male',
                maritalStatus: personalInfo?.maritalStatus || '',
                nationality: personalInfo?.nationality || '',
                religion: personalInfo?.religion || '',
                bloodType: personalInfo?.bloodType || '',
                profilePhoto: personalInfo?.profilePhoto || ''
            },
            contactInfo: {
                phone: contactInfo?.phone || '',
                mobile: contactInfo?.mobile || '',
                email: contactInfo?.email || '',
                personalEmail: contactInfo?.personalEmail || '',
                address: {
                    street: contactInfo?.address?.street || '',
                    city: contactInfo?.address?.city || '',
                    state: contactInfo?.address?.state || '',
                    country: contactInfo?.address?.country || '',
                    postalCode: contactInfo?.address?.postalCode || ''
                },
                emergencyContact: {
                    name: contactInfo?.emergencyContact?.name || '',
                    relationship: contactInfo?.emergencyContact?.relationship || '',
                    phone: contactInfo?.emergencyContact?.phone || '',
                    mobile: contactInfo?.emergencyContact?.mobile || ''
                }
            },
            employmentInfo: {
                department: employmentInfo?.department || null,
                position: employmentInfo?.position || null,
                jobTitle: employmentInfo?.jobTitle || '',
                employmentStatus: employmentInfo?.employmentStatus || 'active',
                hireDate: employmentInfo?.hireDate || new Date(),
                startDate: employmentInfo?.startDate || null,
                endDate: employmentInfo?.endDate || null,
                terminationReason: employmentInfo?.terminationReason || '',
                terminationDate: employmentInfo?.terminationDate || null,
                supervisor: employmentInfo?.supervisor || null,
                workLocation: employmentInfo?.workLocation || '',
                workSchedule: {
                    days: employmentInfo?.workSchedule?.days || [],
                    startTime: employmentInfo?.workSchedule?.startTime || '',
                    endTime: employmentInfo?.workSchedule?.endTime || ''
                }
            },
            compensation: {
                salary: compensation?.salary || 0,
                currency: compensation?.currency || 'ETB',
                salaryType: compensation?.salaryType || 'monthly',
                bankName: compensation?.bankName || '',
                bankAccount: compensation?.bankAccount || '',
                taxId: compensation?.taxId || ''
            },
            status: 'active'
        });

        res.status(201).json({
            success: true,
            data: employee,
            message: 'Employee added successfully'
        });
    } catch (error) {
        console.error('Create Employee Error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Server Error'
        });
    }
};

// @desc    Get the organization's employee directory
// @route   GET /api/employees
// @access  Private (organization members with employee:view)
exports.getEmployees = async (req, res) => {
    try {
        const query = { employer: req.employerId };

        if (req.query.status) query.status = req.query.status;
        if (req.query.department) query['employmentInfo.department'] = req.query.department;
        if (req.query.position) query['employmentInfo.position'] = req.query.position;
        if (req.query.employmentStatus) query['employmentInfo.employmentStatus'] = req.query.employmentStatus;

        if (req.query.search) {
            const term = new RegExp(req.query.search, 'i');
            query.$or = [
                { 'personalInfo.firstName': term },
                { 'personalInfo.lastName': term },
                { employeeId: term },
                { 'contactInfo.email': term }
            ];
        }

        const employees = await Employee.find(query)
            .populate('user', 'name email role status')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: employees.length,
            data: employees
        });
    } catch (error) {
        console.error('Get Employees Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get the employee record for the signed-in user
// @route   GET /api/employees/me
// @access  Private (any authenticated user)
exports.getMyEmployeeRecord = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id })
            .populate('employmentInfo.supervisor', 'name email');

        if (!employee) {
            return res.status(200).json({ success: true, data: null });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        console.error('Get My Employee Record Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private (own record, or organization members with employee:view)
exports.getEmployee = async (req, res) => {
    try {
        const employee = await Employee.findById(req.params.id)
            .populate('user', 'name email role status')
            .populate('employmentInfo.supervisor', 'name email');

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // An employee may always read their own record.
        const isSelf = employee.user && employee.user._id.toString() === req.user.id;
        const sameOrg = req.user.employer && employee.employer
            && req.user.employer.toString() === employee.employer.toString();

        if (!isSelf && !sameOrg) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorised to view this employee record'
            });
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        console.error('Get Employee Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (HR Expert)
exports.updateEmployee = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // Identity and ownership fields are never client-controlled.
        const { _id, employer, employeeId, user, createdAt, ...updates } = req.body;

        Object.assign(employee, updates);
        await employee.save();

        res.status(200).json({
            success: true,
            data: employee,
            message: 'Employee updated successfully'
        });
    } catch (error) {
        console.error('Update Employee Error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }

        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Deactivate an employee
// @route   DELETE /api/employees/:id
// @access  Private (HR Expert)
exports.deleteEmployee = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        // Employment history is retained for audit purposes rather than deleted.
        employee.status = 'terminated';
        employee.employmentInfo.terminationDate = new Date();
        if (req.body.terminationReason) {
            employee.employmentInfo.terminationReason = req.body.terminationReason;
        }
        await employee.save();

        res.status(200).json({
            success: true,
            message: 'Employee record marked as terminated'
        });
    } catch (error) {
        console.error('Delete Employee Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Employee directory statistics for the organization
// @route   GET /api/employees/statistics
// @access  Private (organization members with employee:view)
exports.getEmployeeStatistics = async (req, res) => {
    try {
        const employerId = req.employerId;

        const [byStatus, byDepartment, total] = await Promise.all([
            Employee.aggregate([
                { $match: { employer: employerId } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Employee.aggregate([
                { $match: { employer: employerId } },
                { $group: { _id: '$employmentInfo.jobTitle', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            Employee.countDocuments({ employer: employerId })
        ]);

        const statusMap = byStatus.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {});

        // "New" means hired within the last 30 days.
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const newHires = await Employee.countDocuments({
            employer: employerId,
            'employmentInfo.hireDate': { $gte: thirtyDaysAgo }
        });

        res.status(200).json({
            success: true,
            statistics: {
                total,
                active: statusMap.active || 0,
                onLeave: statusMap.on_leave || 0,
                inactive: statusMap.inactive || 0,
                terminated: statusMap.terminated || 0,
                newHires,
                byStatus: statusMap,
                byJobTitle: byDepartment.filter(row => row._id)
            }
        });
    } catch (error) {
        console.error('Employee Statistics Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// ---------------------------------------------------------------------------
// Employee <-> User account <-> Organizational role
//
// These three are kept as separate concepts throughout this module:
//   - An Employee record can exist with no login access at all.
//   - A User account, once it exists, is what actually carries a `role`.
//   - Assigning a role only ever changes the role of an account already
//     linked to an existing Employee - it is never possible to grant
//     hr_expert / hr_manager to a freestanding account that bypasses the
//     Employee Directory.
// ---------------------------------------------------------------------------

// @desc    Users in this organization with no Employee record pointing at them
//          yet (candidates for "link existing account", including HR staff
//          created before this Employee/Account/Role separation existed)
// @route   GET /api/employees/accounts/unlinked
// @access  Private (org:team - the employer)
exports.getUnlinkedAccounts = async (req, res) => {
    try {
        const linkedUserIds = await Employee.find({ employer: req.employerId, user: { $ne: null } })
            .distinct('user');

        const users = await User.find({
            employer: req.employerId,
            _id: { $nin: linkedUserIds }
        }).select('name email role status createdAt').sort({ name: 1 });

        res.status(200).json({ success: true, count: users.length, users });
    } catch (error) {
        console.error('Get Unlinked Accounts Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Create a new user account for an existing employee
// @route   POST /api/employees/:id/account
// @access  Private (org:team - the employer)
exports.createEmployeeAccount = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (employee.user) {
            return res.status(400).json({
                success: false,
                message: 'This employee already has a linked user account'
            });
        }

        const { email, password, role = 'employee' } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
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

        const fullName = [employee.personalInfo?.firstName, employee.personalInfo?.middleName, employee.personalInfo?.lastName]
            .filter(Boolean).join(' ');

        const user = await User.create({
            name: fullName || 'Employee',
            email: normalizedEmail,
            password,
            role,
            status: 'active',
            employer: req.employerId
        });

        employee.user = user._id;
        employee.employmentHistory.push({
            type: 'account_change',
            employmentStatus: employee.employmentInfo?.employmentStatus,
            effectiveDate: new Date(),
            note: `User account created (${role})`,
            recordedBy: req.user.id
        });
        await employee.save();

        await auditService.record(req, {
            action: 'employee.account_created',
            entity: 'Employee',
            entityId: employee._id,
            details: `Account created for ${fullName} (${normalizedEmail})`,
            to: role
        });

        // Optional, defaulting to on: an Employer creating an account almost
        // always wants the new hire to hear about it, but can opt out (e.g.
        // when credentials are being handed over in person instead).
        const sendCredentials = req.body.sendCredentials !== false;
        const emailResult = sendCredentials
            ? await deliverAccountCredentials({ account: user, employerId: req.employerId, isNewAccount: true })
            : { requested: false };

        res.status(201).json({
            success: true,
            message: `Account created and linked to the employee.${emailStatusMessage(emailResult)}`,
            emailStatus: emailResult,
            data: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status }
        });
    } catch (error) {
        console.error('Create Employee Account Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Link an existing (unlinked) user account in this organization to an employee
// @route   PUT /api/employees/:id/account/link
// @access  Private (org:team - the employer)
exports.linkEmployeeAccount = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (employee.user) {
            return res.status(400).json({
                success: false,
                message: 'This employee already has a linked user account'
            });
        }

        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'A user account is required' });
        }

        const account = await User.findById(userId);
        if (!account || !account.employer || account.employer.toString() !== req.employerId.toString()) {
            return res.status(404).json({
                success: false,
                message: 'That user account does not belong to your organization'
            });
        }

        const alreadyLinked = await Employee.exists({ user: account._id });
        if (alreadyLinked) {
            return res.status(400).json({
                success: false,
                message: 'That account is already linked to a different employee record'
            });
        }

        employee.user = account._id;
        employee.employmentHistory.push({
            type: 'account_change',
            employmentStatus: employee.employmentInfo?.employmentStatus,
            effectiveDate: new Date(),
            note: `Linked to existing account ${account.email}`,
            recordedBy: req.user.id
        });
        await employee.save();

        await auditService.record(req, {
            action: 'employee.account_linked',
            entity: 'Employee',
            entityId: employee._id,
            details: `Linked existing account ${account.email}`
        });

        res.status(200).json({
            success: true,
            message: 'Account linked to the employee',
            data: { id: account._id, name: account.name, email: account.email, role: account.role, status: account.status }
        });
    } catch (error) {
        console.error('Link Employee Account Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Activate or deactivate the employee's linked user account
// @route   PUT /api/employees/:id/account/status
// @access  Private (org:team - the employer)
exports.setEmployeeAccountStatus = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!employee.user) {
            return res.status(400).json({
                success: false,
                message: 'This employee has no linked user account yet'
            });
        }

        const { status } = req.body;
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Status must be active or inactive' });
        }

        const account = await User.findById(employee.user._id || employee.user);
        if (!account) {
            return res.status(404).json({ success: false, message: 'Linked user account no longer exists' });
        }
        if (account._id.toString() === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot change your own account status here' });
        }

        account.status = status;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Account ${status === 'active' ? 'activated' : 'deactivated'}`,
            data: { id: account._id, name: account.name, email: account.email, role: account.role, status: account.status }
        });
    } catch (error) {
        console.error('Set Employee Account Status Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Assign an organizational role to an employee's linked account
// @route   PUT /api/employees/:id/role
// @access  Private (org:team - the employer)
//
// Validation order follows the business rule directly: the employee must
// already exist and belong to this organization (findScopedEmployee), a role
// can only ever be granted to the account already linked to that employee
// (never created independently of it), the role itself must be one this
// organization is allowed to grant, and assigning the role the account
// already has is refused rather than silently repeated.
exports.assignEmployeeRole = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!employee.user) {
            return res.status(400).json({
                success: false,
                message: 'Create or link a user account for this employee before assigning a role'
            });
        }

        const { role } = req.body;
        if (!EMPLOYER_MANAGEABLE_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: `Role must be one of: ${EMPLOYER_MANAGEABLE_ROLES.join(', ')}`
            });
        }

        const account = await User.findById(employee.user._id || employee.user);
        if (!account || !account.employer || account.employer.toString() !== req.employerId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'This account no longer belongs to your organization'
            });
        }

        if (account.role === role) {
            return res.status(400).json({
                success: false,
                message: `This employee already has the ${role} role`
            });
        }

        const previousRole = account.role;
        account.role = role;
        await account.save();

        employee.employmentHistory.push({
            type: 'role_change',
            employmentStatus: employee.employmentInfo?.employmentStatus,
            effectiveDate: new Date(),
            note: `Role changed from ${previousRole} to ${role}`,
            recordedBy: req.user.id
        });
        await employee.save();

        await auditService.record(req, {
            action: 'employee.role_assigned',
            entity: 'Employee',
            entityId: employee._id,
            details: `Role changed for ${account.email}`,
            from: previousRole,
            to: role
        });

        await notificationService.notify({
            user: account._id,
            employer: req.employerId,
            type: 'account_update',
            title: 'Your role has changed',
            message: `Your organizational role is now ${role.replace('_', ' ')}.`
        });

        // Optional, defaulting to on (see createEmployeeAccount above for the
        // same reasoning). deliverAccountCredentials re-reads account.role,
        // which was already saved above, so the email reflects the NEW role.
        const sendCredentials = req.body.sendCredentials !== false;
        const emailResult = sendCredentials
            ? await deliverAccountCredentials({ account, employerId: req.employerId, isNewAccount: false })
            : { requested: false };

        res.status(200).json({
            success: true,
            message: `Role assigned: ${role}.${emailStatusMessage(emailResult)}`,
            emailStatus: emailResult,
            data: { id: account._id, name: account.name, email: account.email, role: account.role, status: account.status }
        });
    } catch (error) {
        console.error('Assign Employee Role Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Resend an employee's login credentials by email
// @route   POST /api/employees/:id/account/resend-credentials
// @access  Private (org:team - the employer)
//
// Re-sends the same "set up your password" email createEmployeeAccount /
// assignEmployeeRole can send, without changing the account's role or any
// other state - useful when the first email was missed, went to spam, or
// email delivery was not configured (or failed) at the time.
exports.resendEmployeeCredentials = async (req, res) => {
    try {
        const { employee, error } = await findScopedEmployee(req.params.id, req);
        if (error) {
            return res.status(error.code).json({ success: false, message: error.message });
        }

        if (!employee.user) {
            return res.status(400).json({
                success: false,
                message: 'This employee has no linked user account yet'
            });
        }

        const account = await User.findById(employee.user._id || employee.user);
        if (!account || !account.employer || account.employer.toString() !== req.employerId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'This account no longer belongs to your organization'
            });
        }

        if (!account.email) {
            return res.status(400).json({
                success: false,
                message: 'This account has no email address on file'
            });
        }

        const emailResult = await deliverAccountCredentials({ account, employerId: req.employerId, isNewAccount: false });

        await auditService.record(req, {
            action: 'employee.credentials_resent',
            entity: 'Employee',
            entityId: employee._id,
            details: `Login credentials resent to ${account.email}`
        });

        if (!emailResult.sent) {
            return res.status(200).json({
                success: true,
                message: emailResult.configured
                    ? 'Could not send the email right now. Please try again shortly.'
                    : 'Email delivery is currently unavailable, so no email was sent.',
                emailStatus: emailResult
            });
        }

        res.status(200).json({
            success: true,
            message: `Login credentials were resent to ${account.email}.`,
            emailStatus: emailResult
        });
    } catch (error) {
        console.error('Resend Employee Credentials Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
