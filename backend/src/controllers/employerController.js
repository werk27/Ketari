const Employer = require('../models/Employer');
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { HR_ROLES, EMPLOYER_MANAGEABLE_ROLES } = require('../config/permissions');

const PUBLIC_STATUSES = ['published', 'approved', 'open'];

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

        res.status(200).json({ success: true, employer });
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
        const {
            status: _status, owner: _owner, slug: _slug,
            verifiedAt: _verifiedAt, verifiedBy: _verifiedBy, ...updates
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
        const team = await User.find({
            employer: req.employerId,
            role: { $in: [...EMPLOYER_MANAGEABLE_ROLES, 'employer'] }
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
            }
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

// @desc    Change an employer's platform status (approve / suspend)
// @route   PUT /api/employers/:id/status
// @access  Private (System Administrator)
exports.setEmployerStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['pending', 'active', 'suspended', 'inactive'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(', ')}`
            });
        }

        const employer = await Employer.findById(req.params.id);
        if (!employer) {
            return res.status(404).json({ success: false, message: 'Organization not found' });
        }

        employer.status = status;
        if (status === 'active') {
            employer.verifiedAt = new Date();
            employer.verifiedBy = req.user.id;
        }
        await employer.save();

        res.status(200).json({ success: true, message: `Organization marked ${status}`, employer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
