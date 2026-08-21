const Employee = require('../models/Employee');
const User = require('../models/User');

/**
 * Employee Information module.
 *
 * Every record belongs to exactly one organization (req.employerId), so one
 * employer can never read or modify another employer's staff data.
 */

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
        .populate('user', 'name email role')
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
            .populate('user', 'name email role')
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
            .populate('user', 'name email role')
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
