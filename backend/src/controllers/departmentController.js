const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const JobRequisition = require('../models/JobRequisition');
const Job = require('../models/Job');
const Application = require('../models/Application');
const { positionsForDepartments } = require('../services/departmentScope');

/**
 * The Department Head workspace.
 *
 * Read-only, department-scoped views over data that already lives in the
 * Employee, Job Requisition and recruitment modules - this controller creates
 * no new HR concepts and owns no new collections. Every query is filtered by
 * BOTH `req.employerId` (the tenant boundary) and `req.headedDepartmentIds`
 * (the departments this user actually heads, resolved by
 * withDepartmentHeadScope), so a head can never read another organization's
 * data nor another department's.
 *
 * Writing is deliberately absent: a Department Head raises Job Requisitions
 * through the existing requisition module and changes nothing else. They never
 * manage configuration, departments, positions, salaries or HR roles.
 */

/**
 * Requisition statuses grouped the way a Department Head thinks about them.
 * `open` means "still moving" - anything not finished with, whether it is
 * theirs to act on or HR's.
 */
const OPEN_STATUSES = ['draft', 'submitted', 'returned', 'pending_approval'];
const AWAITING_HR_STATUSES = ['submitted', 'pending_approval'];
const APPROVED_STATUSES = ['approved', 'job_created'];

/**
 * What a Department Head may see about someone in their department.
 *
 * Deliberately narrow. A head manages work, not HR records: salary, bank
 * details, documents, dependents, home address, emergency contacts, date of
 * birth, religion, marital status and the recruitment/onboarding trail are all
 * HR information and are never selected here. Adding a field to this list is a
 * privacy decision, not a formatting one.
 */
const EMPLOYEE_FIELDS = [
    'employeeId',
    'personalInfo.firstName',
    'personalInfo.middleName',
    'personalInfo.lastName',
    'personalInfo.profilePhoto',
    'contactInfo.email',
    'contactInfo.phone',
    'employmentInfo.department',
    'employmentInfo.position',
    'employmentInfo.jobTitle',
    'employmentInfo.employmentStatus',
    'employmentInfo.hireDate',
    'employmentInfo.workLocation',
    'employmentInfo.supervisor',
    'status',
    'user'
].join(' ');

/** Look up a configured position/department name by its sub-document id. */
const nameById = (list, id) => {
    const found = (list || []).find(item => String(item._id) === String(id));
    return found ? (found.name || found.title || '') : '';
};

/** Every requisition raised for the departments this user heads. */
const departmentRequisitions = (req, extra = {}) => JobRequisition.find({
    employer: req.employerId,
    department: { $in: req.headedDepartmentIds },
    ...extra
});

// @desc    The departments the signed-in user heads, with their structure
// @route   GET /api/departments/mine
// @access  Private (Department Head)
exports.getMyDepartments = async (req, res) => {
    try {
        const config = req.orgConfiguration;

        const departments = await Promise.all(req.headedDepartments.map(async (department) => {
            const positions = positionsForDepartments(config, [department._id]);

            const [employeeCount, requisitionCount] = await Promise.all([
                Employee.countDocuments({
                    employer: req.employerId,
                    'employmentInfo.department': department._id,
                    status: { $ne: 'terminated' }
                }),
                JobRequisition.countDocuments({ employer: req.employerId, department: department._id })
            ]);

            // Vacancies currently recruiting for this department, reached
            // through the requisitions it raised rather than by matching the
            // department name as text.
            const requisitionIds = await JobRequisition.find({
                employer: req.employerId,
                department: department._id,
                linkedJob: { $ne: null }
            }).distinct('linkedJob');

            const vacancies = await Job.find({
                _id: { $in: requisitionIds },
                employer: req.employerId
            }).select('title status applicationDeadline numberOfPositions createdAt').sort({ createdAt: -1 });

            return {
                _id: department._id,
                name: department.name,
                code: department.code || '',
                description: department.description || '',
                status: department.status || 'active',
                positions: positions.map(p => ({
                    _id: p._id,
                    title: p.title,
                    code: p.code || '',
                    description: p.description || '',
                    status: p.status || 'active',
                    rankName: nameById(config?.positionRanks, p.rank)
                })),
                employeeCount,
                requisitionCount,
                vacancies
            };
        }));

        res.status(200).json({ success: true, count: departments.length, data: departments });
    } catch (error) {
        console.error('Get My Departments Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Department Head dashboard - their own department only
// @route   GET /api/departments/mine/overview
// @access  Private (Department Head)
exports.getMyDepartmentOverview = async (req, res) => {
    try {
        const departmentIds = req.headedDepartmentIds;
        const employeeScope = {
            employer: req.employerId,
            'employmentInfo.department': { $in: departmentIds }
        };

        const [
            totalEmployees,
            activeEmployees,
            openRequisitions,
            pendingRequisitions,
            approvedRequisitions,
            returnedRequisitions,
            recentHires,
            linkedJobIds
        ] = await Promise.all([
            Employee.countDocuments({ ...employeeScope, status: { $ne: 'terminated' } }),
            Employee.countDocuments({ ...employeeScope, 'employmentInfo.employmentStatus': 'active' }),
            departmentRequisitions(req, { status: { $in: OPEN_STATUSES } }).countDocuments(),
            departmentRequisitions(req, { status: { $in: AWAITING_HR_STATUSES } }).countDocuments(),
            departmentRequisitions(req, { status: { $in: APPROVED_STATUSES } }).countDocuments(),
            departmentRequisitions(req, { status: 'returned' }).countDocuments(),
            Employee.find({ ...employeeScope, status: { $ne: 'terminated' } })
                .select(EMPLOYEE_FIELDS)
                .populate('user', 'name email')
                .sort({ 'employmentInfo.hireDate': -1 })
                .limit(5),
            JobRequisition.find({
                employer: req.employerId,
                department: { $in: departmentIds },
                linkedJob: { $ne: null }
            }).distinct('linkedJob')
        ]);

        // "Active recruitment" is a vacancy created from one of this
        // department's requisitions that candidates can currently reach.
        const activeVacancies = await Job.find({
            _id: { $in: linkedJobIds },
            employer: req.employerId,
            status: { $in: ['published', 'open'] }
        }).select('title status numberOfPositions applicationDeadline');

        const applicationsInProgress = activeVacancies.length === 0 ? 0 : await Application.countDocuments({
            job: { $in: activeVacancies.map(j => j._id) },
            status: { $nin: ['withdrawn', 'rejected'] }
        });

        res.status(200).json({
            success: true,
            data: {
                departments: req.headedDepartments.map(d => ({ _id: d._id, name: d.name, code: d.code || '' })),
                stats: {
                    totalEmployees,
                    activeEmployees,
                    openRequisitions,
                    pendingRequisitions,
                    approvedRequisitions,
                    returnedRequisitions,
                    activeRecruitment: activeVacancies.length,
                    applicationsInProgress
                },
                activeVacancies,
                recentHires
            }
        });
    } catch (error) {
        console.error('Get Department Overview Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Employees belonging to the departments the caller heads
// @route   GET /api/departments/mine/employees
// @access  Private (Department Head)
exports.getMyDepartmentEmployees = async (req, res) => {
    try {
        const query = {
            employer: req.employerId,
            'employmentInfo.department': { $in: req.headedDepartmentIds }
        };

        if (req.query.employmentStatus) {
            query['employmentInfo.employmentStatus'] = req.query.employmentStatus;
        }
        if (req.query.position && mongoose.Types.ObjectId.isValid(req.query.position)) {
            query['employmentInfo.position'] = req.query.position;
        }
        if (req.query.search) {
            const term = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [
                { 'personalInfo.firstName': term },
                { 'personalInfo.lastName': term },
                { employeeId: term },
                { 'employmentInfo.jobTitle': term }
            ];
        }

        const employees = await Employee.find(query)
            .select(EMPLOYEE_FIELDS)
            .populate('user', 'name email')
            .populate('employmentInfo.supervisor', 'name')
            .sort({ 'personalInfo.firstName': 1 });

        const config = req.orgConfiguration;
        const data = employees.map(employee => {
            const plain = employee.toObject();
            return {
                ...plain,
                departmentName: nameById(config?.departments, plain.employmentInfo?.department),
                positionTitle: nameById(config?.positions, plain.employmentInfo?.position)
                    || plain.employmentInfo?.jobTitle || ''
            };
        });

        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Get Department Employees Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Where a requisition has reached, as one ordered list of stages.
 *
 * Built from what the workflow already recorded (requisition status, the
 * linked vacancy's status and its applications) rather than stored again -
 * there is no new state to keep in sync, and nothing here can drift from the
 * records HR and the candidates actually act on.
 */
const buildProgress = (requisition, job, applicationStats) => {
    const reached = (condition) => (condition ? 'done' : 'pending');
    const status = requisition.status;

    const submitted = status !== 'draft';
    const hrReviewed = ['pending_approval', 'approved', 'rejected', 'job_created'].includes(status);
    const decided = ['approved', 'rejected', 'job_created'].includes(status);
    const approved = APPROVED_STATUSES.includes(status);
    const vacancyCreated = !!job;
    const published = !!job && ['published', 'open', 'closed', 'archived'].includes(job.status);
    const applying = (applicationStats?.total || 0) > 0;
    const interviewing = (applicationStats?.interviewing || 0) > 0;
    const hired = (applicationStats?.hired || 0) > 0;

    return [
        { key: 'submitted', label: 'Submitted', state: reached(submitted) },
        { key: 'hr_review', label: 'HR Review', state: hrReviewed ? 'done' : (submitted ? 'current' : 'pending') },
        {
            key: 'manager_decision',
            label: status === 'rejected' ? 'Manager Rejected' : 'Manager Approved',
            state: status === 'rejected' ? 'rejected' : (approved ? 'done' : (hrReviewed ? 'current' : 'pending'))
        },
        { key: 'vacancy_created', label: 'Vacancy Created', state: reached(vacancyCreated) },
        { key: 'published', label: 'Published', state: reached(published) },
        { key: 'applying', label: 'Candidates Applying', state: reached(applying) },
        { key: 'interview', label: 'Interview', state: reached(interviewing) },
        { key: 'hiring', label: 'Hiring', state: reached(hired) }
    ];
};

// @desc    What happened to this department's requisitions after approval
// @route   GET /api/departments/mine/recruitment
// @access  Private (Department Head)
exports.getMyDepartmentRecruitment = async (req, res) => {
    try {
        const requisitions = await JobRequisition.find({
            employer: req.employerId,
            department: { $in: req.headedDepartmentIds },
            status: { $ne: 'draft' }
        })
            .populate('linkedJob', 'title status numberOfPositions applicationDeadline approvedAt')
            .sort({ createdAt: -1 });

        const jobIds = requisitions.map(r => r.linkedJob?._id).filter(Boolean);

        // One grouped count for every vacancy rather than a query per stage.
        const grouped = jobIds.length === 0 ? [] : await Application.aggregate([
            { $match: { job: { $in: jobIds } } },
            { $group: { _id: { job: '$job', status: '$status' }, count: { $sum: 1 } } }
        ]);

        const statsByJob = new Map();
        grouped.forEach(({ _id, count }) => {
            const key = String(_id.job);
            const entry = statsByJob.get(key) || { total: 0, interviewing: 0, hired: 0, shortlisted: 0 };
            if (!['withdrawn', 'rejected'].includes(_id.status)) entry.total += count;
            if (['interview', 'interview_scheduled', 'interviewed'].includes(_id.status)) entry.interviewing += count;
            if (['shortlisted', 'selected', 'offered'].includes(_id.status)) entry.shortlisted += count;
            if (_id.status === 'hired') entry.hired += count;
            statsByJob.set(key, entry);
        });

        const data = requisitions.map(requisition => {
            const job = requisition.linkedJob;
            const stats = job ? statsByJob.get(String(job._id)) : null;
            return {
                _id: requisition._id,
                positionTitle: requisition.positionTitle,
                departmentName: requisition.departmentName,
                numberOfPositions: requisition.numberOfPositions,
                status: requisition.status,
                createdAt: requisition.createdAt,
                job: job
                    ? { _id: job._id, title: job.title, status: job.status, applicationDeadline: job.applicationDeadline }
                    : null,
                applications: stats || { total: 0, interviewing: 0, hired: 0, shortlisted: 0 },
                progress: buildProgress(requisition, job, stats)
            };
        });

        res.status(200).json({ success: true, count: data.length, data });
    } catch (error) {
        console.error('Get Department Recruitment Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
