const Employee = require('../models/Employee');
const audit = require('../services/auditService');
const notifications = require('../services/notificationService');
const { HR_ROLES } = require('../config/permissions');

/**
 * Employee onboarding workflow.
 *
 * HR Expert  -> sends, monitors, verifies, processes, submits
 * Employee   -> provides personal information and documents
 * HR Manager -> reviews and approves
 *
 * Recruitment data is transferred at hire time (see onboardingService), so the
 * employee is only ever asked for what the organization does not already hold.
 */

/** Push a workflow transition onto the record's own history. */
const pushHistory = (employee, status, userId, note = '') => {
    employee.onboarding.history.push({
        status,
        changedBy: userId,
        changedAt: new Date(),
        note
    });
};

/** Load an employee and confirm the caller's organization owns it. */
const loadScoped = async (id, req) => {
    const employee = await Employee.findById(id);
    if (!employee) return { error: { code: 404, message: 'Employee not found' } };

    const employerId = req.employerId ? req.employerId.toString() : null;
    const recordEmployerId = employee.employer ? employee.employer.toString() : null;

    if (!recordEmployerId || recordEmployerId !== employerId) {
        return { error: { code: 403, message: 'This employee belongs to another organization' } };
    }
    return { employee };
};

// @desc    The signed-in employee's own onboarding record and progress
// @route   GET /api/employees/onboarding/me
// @access  Private (the employee themselves)
exports.getMyOnboarding = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id })
            .populate('professional.resume', 'fileName filePath')
            .populate('recruitment.job', 'title department');

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'No employee record is linked to your account yet'
            });
        }

        res.status(200).json({
            success: true,
            employee,
            completion: employee.completionSummary()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Employee fills in the information recruitment could not supply
// @route   PUT /api/employees/onboarding/me
// @access  Private (the employee themselves)
exports.submitMyOnboarding = async (req, res) => {
    try {
        const employee = await Employee.findOne({ user: req.user.id });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'No employee record is linked to your account yet'
            });
        }

        if (['approved', 'complete'].includes(employee.onboarding.status)) {
            return res.status(400).json({
                success: false,
                message: 'Your onboarding is already approved. Ask HR to reopen it if something must change.'
            });
        }

        const { personalInfo, contactInfo, documents, submit } = req.body;
        const previousStatus = employee.onboarding.status;

        // Only the fields onboarding is responsible for. Name, email and the
        // professional background stay as transferred from recruitment.
        if (personalInfo) {
            const p = employee.personalInfo;
            p.dateOfBirth = personalInfo.dateOfBirth ?? p.dateOfBirth;
            p.gender = personalInfo.gender || p.gender;
            p.maritalStatus = personalInfo.maritalStatus ?? p.maritalStatus;
            p.nationality = personalInfo.nationality ?? p.nationality;
            p.religion = personalInfo.religion ?? p.religion;
            p.bloodType = personalInfo.bloodType ?? p.bloodType;
        }

        if (contactInfo) {
            const c = employee.contactInfo;
            c.phone = contactInfo.phone ?? c.phone;
            c.mobile = contactInfo.mobile ?? c.mobile;
            c.personalEmail = contactInfo.personalEmail ?? c.personalEmail;
            if (contactInfo.address) c.address = { ...c.address.toObject?.() ?? c.address, ...contactInfo.address };
            if (contactInfo.emergencyContact) {
                c.emergencyContact = {
                    ...(c.emergencyContact.toObject?.() ?? c.emergencyContact),
                    ...contactInfo.emergencyContact
                };
            }
        }

        if (Array.isArray(documents) && documents.length > 0) {
            employee.documents.push(...documents.map(d => ({
                name: d.name || 'Document',
                type: ['id', 'certificate', 'contract', 'other'].includes(d.type) ? d.type : 'other',
                fileUrl: d.fileUrl || '',
                expiryDate: d.expiryDate || null
            })));
        }

        const completion = employee.completionSummary();

        if (submit) {
            if (completion.missing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Please complete the remaining information first: ${completion.missing.map(m => m.label).join(', ')}`,
                    completion
                });
            }
            employee.onboarding.status = 'under_hr_verification';
            employee.onboarding.submittedAt = new Date();
            employee.onboarding.correctionNote = '';
            pushHistory(employee, 'under_hr_verification', req.user.id, 'Submitted by employee for HR verification');
        } else if (employee.onboarding.status === 'pending_onboarding') {
            employee.onboarding.status = 'employee_completing';
            pushHistory(employee, 'employee_completing', req.user.id, 'Employee started completing their profile');
        }

        await employee.save();

        if (submit) {
            await notifications.notifyRoles({
                employer: employee.employer,
                roles: HR_ROLES,
                type: 'account_update',
                title: 'Employee profile awaiting verification',
                message: `${employee.personalInfo.firstName} ${employee.personalInfo.middleName ? employee.personalInfo.middleName + " " : ""}${employee.personalInfo.lastName} submitted their onboarding information.`,
                link: '/hr-expert/employees'
            });
        }

        await audit.record(req, {
            action: 'employee.onboarding_updated',
            entity: 'Employee',
            entityId: employee._id,
            details: submit ? 'Employee submitted onboarding information' : 'Employee saved onboarding progress',
            from: previousStatus,
            to: employee.onboarding.status
        });

        res.status(200).json({
            success: true,
            message: submit ? 'Submitted for HR verification' : 'Progress saved',
            employee,
            completion: employee.completionSummary()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Onboarding queue for the caller's organization
// @route   GET /api/employees/onboarding
// @access  Private (employee:view)
exports.getOnboardingQueue = async (req, res) => {
    try {
        const query = { employer: req.employerId };
        if (req.query.status) query['onboarding.status'] = req.query.status;

        const employees = await Employee.find(query)
            .populate('user', 'name email')
            .populate('onboarding.verifiedBy', 'name')
            .populate('onboarding.approvedBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: employees.length,
            employees: employees.map(e => ({
                _id: e._id,
                employeeId: e.employeeId,
                name: [e.personalInfo.firstName, e.personalInfo.middleName, e.personalInfo.lastName]
                    .filter(Boolean).join(' '),
                jobTitle: e.employmentInfo.jobTitle,
                onboarding: e.onboarding,
                status: e.status,
                completion: e.completionSummary()
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Expert verifies a submitted profile and forwards it for approval
// @route   PUT /api/employees/:id/onboarding/verify
// @access  Private (employee:record - HR Expert)
exports.verifyOnboarding = async (req, res) => {
    try {
        const { employee, error } = await loadScoped(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (employee.onboarding.status !== 'under_hr_verification') {
            return res.status(400).json({
                success: false,
                message: `Only a submitted profile can be verified (current status: ${employee.onboarding.status})`
            });
        }

        const previousStatus = employee.onboarding.status;
        employee.onboarding.status = 'pending_manager_approval';
        employee.onboarding.verifiedBy = req.user.id;
        employee.onboarding.verifiedAt = new Date();
        pushHistory(employee, 'pending_manager_approval', req.user.id, req.body.note || 'Verified by HR Expert');
        await employee.save();

        await notifications.notifyRoles({
            employer: employee.employer,
            roles: ['hr_manager'],
            type: 'account_update',
            title: 'Employee record awaiting approval',
            message: `${employee.personalInfo.firstName} ${employee.personalInfo.middleName ? employee.personalInfo.middleName + " " : ""}${employee.personalInfo.lastName}'s onboarding is verified and needs your approval.`,
            link: '/hr-manager/employees'
        });

        await audit.record(req, {
            action: 'employee.onboarding_verified',
            entity: 'Employee',
            entityId: employee._id,
            details: req.body.note || 'Onboarding verified by HR Expert',
            from: previousStatus,
            to: employee.onboarding.status
        });

        res.status(200).json({ success: true, message: 'Verified and sent for approval', employee });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    HR Manager approves a verified profile
// @route   PUT /api/employees/:id/onboarding/approve
// @access  Private (employee:view + manager decision)
exports.approveOnboarding = async (req, res) => {
    try {
        const { employee, error } = await loadScoped(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        if (employee.onboarding.status !== 'pending_manager_approval') {
            return res.status(400).json({
                success: false,
                message: `Only a verified profile can be approved (current status: ${employee.onboarding.status})`
            });
        }

        // Separation of duties: the HR Expert who verified must not also approve.
        if (employee.onboarding.verifiedBy && employee.onboarding.verifiedBy.toString() === req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You cannot approve an onboarding record you verified yourself'
            });
        }

        const previousStatus = employee.onboarding.status;
        employee.onboarding.status = 'complete';
        employee.onboarding.approvedBy = req.user.id;
        employee.onboarding.approvedAt = new Date();
        employee.onboarding.correctionNote = '';
        pushHistory(employee, 'complete', req.user.id, req.body.note || 'Approved by HR Manager');
        await employee.save();

        if (employee.user) {
            await notifications.notify({
                user: employee.user,
                employer: employee.employer,
                type: 'account_update',
                title: 'Your employee profile is approved',
                message: 'Your onboarding has been approved. Your employee profile is now complete.',
                link: '/employee/dashboard'
            });
        }

        await audit.record(req, {
            action: 'employee.onboarding_approved',
            entity: 'Employee',
            entityId: employee._id,
            details: req.body.note || 'Onboarding approved by HR Manager',
            from: previousStatus,
            to: employee.onboarding.status
        });

        res.status(200).json({ success: true, message: 'Onboarding approved', employee });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Send an onboarding record back to the employee for correction
// @route   PUT /api/employees/:id/onboarding/return
// @access  Private (HR Expert or HR Manager)
exports.returnOnboarding = async (req, res) => {
    try {
        const { employee, error } = await loadScoped(req.params.id, req);
        if (error) return res.status(error.code).json({ success: false, message: error.message });

        const { note } = req.body;
        if (!note) {
            return res.status(400).json({
                success: false,
                message: 'Explain what the employee needs to correct'
            });
        }

        if (!['under_hr_verification', 'pending_manager_approval'].includes(employee.onboarding.status)) {
            return res.status(400).json({
                success: false,
                message: `Only a submitted profile can be returned (current status: ${employee.onboarding.status})`
            });
        }

        const previousStatus = employee.onboarding.status;
        employee.onboarding.status = 'needs_correction';
        employee.onboarding.correctionNote = note;
        pushHistory(employee, 'needs_correction', req.user.id, note);
        await employee.save();

        if (employee.user) {
            await notifications.notify({
                user: employee.user,
                employer: employee.employer,
                type: 'account_update',
                title: 'Your profile needs correction',
                message: note,
                link: '/employee/onboarding'
            });
        }

        await audit.record(req, {
            action: 'employee.onboarding_returned',
            entity: 'Employee',
            entityId: employee._id,
            details: note,
            from: previousStatus,
            to: employee.onboarding.status
        });

        res.status(200).json({ success: true, message: 'Returned to the employee for correction', employee });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
