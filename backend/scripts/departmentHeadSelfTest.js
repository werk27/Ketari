/**
 * End-to-end check of the Department Head experience.
 *
 * A Department Head is an EMPLOYEE who has additionally been assigned as a
 * department's head (Configuration.departments[].manager). They keep every
 * employee service, gain read-only views of their own department, and raise
 * Job Requisitions for it - and nothing more.
 *
 * Covers:
 *   - the department-scoped workspace (overview / department / employees /
 *     recruitment) and that a non-head employee is refused it entirely
 *   - department isolation: a head never sees another department's employees
 *     or requisitions, by list OR by direct id
 *   - organization isolation throughout
 *   - every permission a Department Head must NOT have (configuration,
 *     departments, positions, vacancy creation/publishing, requisition
 *     approval, HR employee records, role management)
 *   - the clarification round trip (HR returns -> head responds -> back to HR)
 *   - the full workflow: Department Head -> Job Requisition -> HR Expert ->
 *     HR Manager -> approved -> HR Expert creates the vacancy -> HR Manager
 *     publishes -> a candidate applies
 *   - that the resulting hire lands in the requesting department, and that the
 *     head is notified along the way
 *
 * Fully self-contained - creates its own throwaway organizations, HR teams,
 * configuration, employees, requisitions, vacancy and candidate, and removes
 * all of them again at the end.
 *
 * Usage: node scripts/departmentHeadSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'DeptHead123!';

const accounts = {
    employerA: { name: 'DH Employer A', email: `dh-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertA: { name: 'DH Expert A', email: `dh-expA-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    managerA: { name: 'DH Manager A', email: `dh-mgrA-${stamp}@example.com`, password: PASSWORD, role: 'hr_manager' },
    employerB: { name: 'DH Employer B', email: `dh-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    candidate: { name: 'DH Candidate', email: `dh-cand-${stamp}@example.com`, password: PASSWORD }
};

const call = async (method, endpoint, { body, token } = {}) => {
    const res = await fetch(`${API}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let data;
    try {
        data = await res.json();
    } catch (err) {
        data = { message: '<non-JSON response>' };
    }
    return { status: res.status, data };
};

let failures = 0;
const check = (name, condition, detail) => {
    if (condition) {
        console.log(`  PASS  ${name}`);
    } else {
        failures++;
        console.log(`  FAIL  ${name} -> ${JSON.stringify(detail)}`);
    }
};

const section = (title) => console.log(`\n--- ${title} ---`);

const login = async ({ email, password }) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data.message}`);
    return res.data.token;
};

const created = { emails: Object.values(accounts).map(a => a.email), employerIds: [] };

/** Record an employee and give them a login, following the Employee -> Account -> Role workflow. */
const recordEmployee = async (token, { firstName, lastName, department, position, email }) => {
    const employee = await call('POST', '/employees', {
        token,
        body: {
            personalInfo: { firstName, lastName },
            contactInfo: { email: `${email}-work` },
            employmentInfo: { department, position, employmentStatus: 'active' },
            compensation: { salary: 42000, bankAccount: '1000200030004000' }
        }
    });
    if (employee.status !== 201) throw new Error(`Could not record ${firstName}: ${JSON.stringify(employee.data)}`);

    const account = await call('POST', `/employees/${employee.data.data._id}/account`, {
        token, body: { email, password: PASSWORD, role: 'employee' }
    });
    if (account.status !== 201) throw new Error(`Could not create a login for ${firstName}: ${JSON.stringify(account.data)}`);

    created.emails.push(email);
    return employee.data.data._id;
};

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    // Registration lower-cases every address, so the stored value never matches
    // a mixed-case one - match on the normalized form or the accounts survive
    // the run that created them.
    const emails = created.emails.map(email => email.trim().toLowerCase());
    const users = await db.collection('users').find({ email: { $in: emails } }).toArray();
    const userIds = users.map(u => u._id);

    await db.collection('applications').deleteMany({ applicant: { $in: userIds } });
    await db.collection('resumes').deleteMany({ user: { $in: userIds } });
    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
    for (const employerId of created.employerIds) {
        await db.collection('jobs').deleteMany({ employer: employerId });
        await db.collection('jobrequisitions').deleteMany({ employer: employerId });
        await db.collection('employees').deleteMany({ employer: employerId });
        await db.collection('configurations').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};
(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    // ---- Organization A: employer + HR team ---------------------------------
    section('Organization setup');
    const employerAReg = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A registers', employerAReg.status === 201, employerAReg);
    const employerAId = new mongoose.Types.ObjectId(employerAReg.data.organization._id);
    created.employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = employerAReg.data.token;

    for (const key of ['expertA', 'managerA']) {
        const res = await call('POST', '/employers/me/team', { token: employerAToken, body: accounts[key] });
        check(`${accounts[key].role} added to organization A`, res.status === 201, res);
    }
    const expertAToken = await login(accounts.expertA);
    const managerAToken = await login(accounts.managerA);

    const employerBReg = await call('POST', '/auth/register', { body: accounts.employerB });
    const employerBId = new mongoose.Types.ObjectId(employerBReg.data.organization._id);
    created.employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = employerBReg.data.token;

    // ---- Configuration the requisition form draws on ------------------------
    section('Organization configuration');
    const engRes = await call('POST', '/config/departments', {
        token: employerAToken, body: { name: 'Engineering', code: 'ENG', description: 'Builds the product' }
    });
    check('Employer configures the Engineering department', engRes.status === 201, engRes);
    const engineering = engRes.data.data.departments.find(d => d.name === 'Engineering');

    const finRes = await call('POST', '/config/departments', {
        token: employerAToken, body: { name: 'Finance', code: 'FIN', description: 'Runs the books' }
    });
    const finance = finRes.data.data.departments.find(d => d.name === 'Finance');

    const posRes = await call('POST', '/config/positions', {
        token: employerAToken, body: { title: 'Backend Developer', department: engineering._id }
    });
    check('Employer configures a position inside Engineering', posRes.status === 201, posRes);
    const backendDeveloper = posRes.data.data.positions.find(p => p.title === 'Backend Developer');

    const finPosRes = await call('POST', '/config/positions', {
        token: employerAToken, body: { title: 'Accountant', department: finance._id }
    });
    const accountant = finPosRes.data.data.positions.find(p => p.title === 'Accountant');

    // The lookup lists the requisition form offers as dropdowns/multi-selects.
    for (const [type, body] of [
        ['skills', { name: 'Node.js', category: 'technical' }],
        ['skills', { name: 'MongoDB', category: 'technical' }],
        ['languages', { name: 'English' }],
        ['licenses', { name: 'PMP' }],
        ['education-levels', { name: 'BSc Computer Science', level: 6 }],
        ['job-titles', { name: 'Software Engineer' }]
    ]) {
        const res = await call('POST', `/config/${type}`, { token: employerAToken, body });
        check(`Configured ${type}: ${body.name}`, res.status === 201, res);
    }

    // ---- People -------------------------------------------------------------
    section('Employees and the Department Head');
    const headEmail = `dh-head-${stamp}@example.com`;
    await recordEmployee(employerAToken, {
        firstName: 'Dawit', lastName: 'Bekele',
        department: engineering._id, position: backendDeveloper._id, email: headEmail
    });

    const teammateEmail = `dh-eng-${stamp}@example.com`;
    await recordEmployee(employerAToken, {
        firstName: 'Sara', lastName: 'Tesfaye',
        department: engineering._id, position: backendDeveloper._id, email: teammateEmail
    });

    const financeEmail = `dh-fin-${stamp}@example.com`;
    await recordEmployee(employerAToken, {
        firstName: 'Meron', lastName: 'Alemu',
        department: finance._id, position: accountant._id, email: financeEmail
    });

    const headToken = await login({ email: headEmail, password: PASSWORD });
    const teammateToken = await login({ email: teammateEmail, password: PASSWORD });

    const headMeBefore = await call('GET', '/auth/me', { token: headToken });
    const headUserId = headMeBefore.data.user.id;
    check('Before assignment the employee is not a Department Head',
        headMeBefore.data.user.employment?.isDepartmentHead === false, headMeBefore.data.user.employment);

    const beforeScope = await call('GET', '/departments/mine/overview', { token: headToken });
    check('The department workspace is closed before the assignment', beforeScope.status === 403, beforeScope);

    const assign = await call('PUT', `/config/departments/${engineering._id}`, {
        token: employerAToken,
        body: { name: 'Engineering', code: 'ENG', description: 'Builds the product', manager: headUserId }
    });
    check('Employer assigns the employee as Engineering\'s Department Head', assign.status === 200, assign);

    const headMe = await call('GET', '/auth/me', { token: headToken });
    check('The head\'s session reports the standing',
        headMe.data.user.employment?.isDepartmentHead === true
        && headMe.data.user.employment.headOfDepartments.some(d => d.name === 'Engineering'),
        headMe.data.user.employment);
    check('A Department Head keeps the plain employee role',
        headMe.data.user.role === 'employee', headMe.data.user.role);
    check('A Department Head keeps their own employee services',
        (headMe.data.user.capabilities || []).includes('leave:request')
        && (headMe.data.user.capabilities || []).includes('attendance:self'),
        headMe.data.user.capabilities);

    // ---- The department workspace ------------------------------------------
    section('Department Head workspace');
    const mine = await call('GET', '/departments/mine', { token: headToken });
    check('The head reads their own department', mine.status === 200 && mine.data.count === 1, mine);
    const department = mine.data.data[0];
    check('It carries the department name, code and description',
        department.name === 'Engineering' && department.code === 'ENG' && department.description === 'Builds the product',
        department);
    check('It lists the department\'s configured positions',
        department.positions.some(p => p.title === 'Backend Developer'), department.positions);
    check('It never exposes another department',
        !mine.data.data.some(d => d.name === 'Finance'), mine.data.data.map(d => d.name));

    const overview = await call('GET', '/departments/mine/overview', { token: headToken });
    check('The dashboard loads', overview.status === 200, overview);
    check('It counts only this department\'s employees',
        overview.data.data.stats.totalEmployees === 2, overview.data.data.stats);

    const deptEmployees = await call('GET', '/departments/mine/employees', { token: headToken });
    check('The head sees their own department\'s employees',
        deptEmployees.status === 200 && deptEmployees.data.count === 2, deptEmployees.data);
    check('Another department\'s employee is never listed',
        !deptEmployees.data.data.some(e => e.personalInfo?.firstName === 'Meron'),
        deptEmployees.data.data.map(e => e.personalInfo?.firstName));
    check('Salary and bank details are never exposed to a Department Head',
        deptEmployees.data.data.every(e => e.compensation === undefined), deptEmployees.data.data[0]);
    check('Personal HR records are never exposed to a Department Head',
        deptEmployees.data.data.every(e =>
            e.documents === undefined && e.dependents === undefined
            && e.contactInfo?.emergencyContact === undefined && e.onboarding === undefined),
        deptEmployees.data.data[0]);
    check('Work information the head does need is present',
        deptEmployees.data.data.every(e => e.employeeId && e.positionTitle === 'Backend Developer'),
        deptEmployees.data.data[0]);

    // ---- A plain employee gets none of it -----------------------------------
    section('An employee who heads nothing');
    for (const path of ['/departments/mine', '/departments/mine/overview', '/departments/mine/employees', '/departments/mine/recruitment']) {
        const res = await call('GET', path, { token: teammateToken });
        check(`A non-head employee is refused ${path}`, res.status === 403, res);
    }

    const crossOrg = await call('GET', '/departments/mine', { token: employerBToken });
    check('Another organization never reaches this department workspace',
        crossOrg.status === 403, crossOrg);

    // ---- Everything a Department Head must NOT be able to do -----------------
    section('Permissions a Department Head must not hold');
    const forbidden = [
        ['POST', '/config/departments', { name: 'Rogue Department' }, 'create a department'],
        ['PUT', `/config/departments/${engineering._id}`, { name: 'Renamed' }, 'modify department configuration'],
        ['DELETE', `/config/departments/${finance._id}`, undefined, 'delete a department'],
        ['POST', '/config/positions', { title: 'Rogue Position', department: engineering._id }, 'create a position'],
        ['POST', '/config/position-ranks', { name: 'Rogue Rank', salary: 999999 }, 'change salary configuration'],
        ['POST', '/config/skills', { name: 'Rogue Skill' }, 'add to organization configuration']
    ];
    for (const [method, path, body, label] of forbidden) {
        const res = await call(method, path, { token: headToken, body });
        check(`A Department Head cannot ${label}`, res.status === 403, res);
    }

    const employeeDirectory = await call('GET', '/employees', { token: headToken });
    check('A Department Head cannot open the HR employee directory',
        employeeDirectory.status === 403, employeeDirectory);

    const recordAttempt = await call('POST', '/employees', {
        token: headToken,
        body: { personalInfo: { firstName: 'Ghost', lastName: 'Hire' }, contactInfo: { email: 'ghost@example.com' } }
    });
    check('A Department Head cannot create employee records', recordAttempt.status === 403, recordAttempt);

    const teamAttempt = await call('POST', '/employers/me/team', {
        token: headToken, body: { name: 'Rogue HR', email: `dh-rogue-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' }
    });
    check('A Department Head cannot manage HR users or roles', teamAttempt.status === 403, teamAttempt);

    const vacancyAttempt = await call('POST', '/jobs', {
        token: headToken,
        body: {
            title: 'Rogue Vacancy', department: 'Engineering', description: 'Should never be created',
            applicationDeadline: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
        }
    });
    check('A Department Head cannot create a job vacancy', vacancyAttempt.status === 403, vacancyAttempt);

    // ---- Raising the requisition -------------------------------------------
    section('Job Requisition: the Department Head\'s primary function');
    const wrongDept = await call('POST', '/requisitions', {
        token: headToken,
        body: {
            department: finance._id, positionTitle: 'Should Not Be Allowed', numberOfPositions: 1,
            requestType: 'new_position', level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' }, reason: 'Testing'
        }
    });
    check('A head cannot raise a requisition for a department they do not head',
        wrongDept.status === 403, wrongDept);

    const createRes = await call('POST', '/requisitions', {
        token: headToken,
        body: {
            department: engineering._id,
            position: backendDeveloper._id,
            numberOfPositions: 2,
            requestType: 'new_position',
            employmentType: 'Full-Time',
            level: 'Intermediate',
            education: 'BSc Computer Science',
            experience: '2+ years',
            skills: ['Node.js', 'MongoDB'],
            languages: ['English'],
            licenses: ['PMP'],
            responsibilities: ['Build and maintain services'],
            competencies: ['Teamwork'],
            startDate: new Date(Date.now() + 45 * 864e5).toISOString(),
            salary: { amount: 32000, currency: 'ETB', period: 'monthly' },
            reason: 'The product roadmap needs two more engineers',
            submitForApproval: true
        }
    });
    check('The Department Head raises a requisition for their own department',
        createRes.status === 201 && createRes.data.data.status === 'submitted', createRes);
    const requisitionId = createRes.data.data._id;

    check('It references the configured department, not free text',
        String(createRes.data.data.department) === String(engineering._id)
        && createRes.data.data.departmentName === 'Engineering', createRes.data.data);
    check('It references the configured position',
        String(createRes.data.data.position) === String(backendDeveloper._id)
        && createRes.data.data.positionTitle === 'Backend Developer', createRes.data.data);
    check('It records the Department Head as the requester',
        String(createRes.data.data.requestedBy) === String(headUserId), createRes.data.data);

    // A requisition raised for the OTHER department, by the Employer.
    const financeReq = await call('POST', '/requisitions', {
        token: employerAToken,
        body: {
            department: finance._id, position: accountant._id, numberOfPositions: 1,
            requestType: 'replacement', level: 'Senior',
            startDate: new Date(Date.now() + 60 * 864e5).toISOString(),
            salary: { amount: 40000, currency: 'ETB', period: 'monthly' },
            reason: 'Replacing a leaver', submitForApproval: true
        }
    });
    check('The Employer raises a requisition for Finance', financeReq.status === 201, financeReq);
    const financeRequisitionId = financeReq.data.data._id;

    section('Requisition ownership and department isolation');
    const headList = await call('GET', '/requisitions', { token: headToken });
    check('The head sees their own department\'s requisition',
        headList.data.data.some(r => r._id === requisitionId), headList.data.data.map(r => r.departmentName));
    check('The head never sees another department\'s requisition',
        !headList.data.data.some(r => r._id === financeRequisitionId),
        headList.data.data.map(r => r.departmentName));

    const directRead = await call('GET', `/requisitions/${financeRequisitionId}`, { token: headToken });
    check('Knowing the id does not reveal another department\'s requisition',
        directRead.status === 403, directRead);

    const expertList = await call('GET', '/requisitions', { token: expertAToken });
    check('HR Expert still sees the whole organization\'s pipeline',
        expertList.data.data.some(r => r._id === requisitionId)
        && expertList.data.data.some(r => r._id === financeRequisitionId),
        expertList.data.data.map(r => r.departmentName));

    const headApproveAttempt = await call('PUT', `/requisitions/${requisitionId}/decision`, {
        token: headToken, body: { outcome: 'approved' }
    });
    check('A Department Head cannot approve their own requisition',
        headApproveAttempt.status === 403, headApproveAttempt);

    const headProcessAttempt = await call('PUT', `/requisitions/${requisitionId}/prepare`, { token: headToken });
    check('A Department Head cannot process a requisition (that is HR Expert work)',
        headProcessAttempt.status === 403, headProcessAttempt);

    // ---- Clarification round trip ------------------------------------------
    section('Responding to a request for clarification');
    const returnRes = await call('PUT', `/requisitions/${requisitionId}/return`, {
        token: expertAToken, body: { note: 'Is the second role also Intermediate?' }
    });
    check('HR Expert returns the requisition with a query',
        returnRes.status === 200 && returnRes.data.data.status === 'returned', returnRes);

    const outsiderClarify = await call('PUT', `/requisitions/${requisitionId}/clarify`, {
        token: employerAToken, body: { response: 'Not my requisition' }
    });
    check('Only the requester may answer the clarification',
        outsiderClarify.status === 403, outsiderClarify);

    const emptyClarify = await call('PUT', `/requisitions/${requisitionId}/clarify`, {
        token: headToken, body: { response: '   ' }
    });
    check('An empty clarification is rejected', emptyClarify.status === 400, emptyClarify);

    const clarifyRes = await call('PUT', `/requisitions/${requisitionId}/clarify`, {
        token: headToken, body: { response: 'Yes - both roles are Intermediate.' }
    });
    check('The Department Head answers and the requisition returns to HR review',
        clarifyRes.status === 200 && clarifyRes.data.data.status === 'submitted', clarifyRes);

    const afterClarify = await call('GET', `/requisitions/${requisitionId}`, { token: headToken });
    check('The answer is recorded on the audit trail, not lost',
        afterClarify.data.data.auditTrail.some(e => (e.note || '').includes('Yes - both roles are Intermediate.')),
        afterClarify.data.data.auditTrail);
    check('The clarification cleared the return reason',
        !afterClarify.data.data.returnReason, afterClarify.data.data.returnReason);

    const doubleClarify = await call('PUT', `/requisitions/${requisitionId}/clarify`, {
        token: headToken, body: { response: 'Again' }
    });
    check('A requisition already back with HR cannot be "clarified" again',
        doubleClarify.status === 400, doubleClarify);

    // ---- The full workflow --------------------------------------------------
    section('Department Head -> HR Expert -> HR Manager -> Vacancy -> Published');
    const prepareRes = await call('PUT', `/requisitions/${requisitionId}/prepare`, { token: expertAToken });
    check('HR Expert forwards the requisition for approval',
        prepareRes.status === 200 && prepareRes.data.data.status === 'pending_approval', prepareRes);

    const decideRes = await call('PUT', `/requisitions/${requisitionId}/decision`, {
        token: managerAToken, body: { outcome: 'approved' }
    });
    check('HR Manager approves the requisition',
        decideRes.status === 200 && decideRes.data.data.status === 'approved', decideRes);

    const jobRes = await call('POST', '/jobs', {
        token: expertAToken,
        body: {
            requisitionId,
            description: 'Build and maintain the backend services that power the product.',
            applicationDeadline: new Date(Date.now() + 30 * 864e5).toISOString(),
            location: 'Hawassa'
        }
    });
    check('HR Expert creates the vacancy from the approved requisition', jobRes.status === 201, jobRes);
    const job = jobRes.data.job || jobRes.data.data;
    check('The vacancy is pre-filled from the requisition',
        job.title === 'Backend Developer' && job.department === 'Engineering', job);
    check('The vacancy remembers the requisition it came from',
        String(job.sourceRequisition) === String(requisitionId), job.sourceRequisition);

    const submitJob = await call('PUT', `/jobs/${job._id}/submit`, { token: expertAToken });
    check('HR Expert submits the vacancy for approval', submitJob.status === 200, submitJob);

    const publishJob = await call('PUT', `/jobs/${job._id}/approve`, { token: managerAToken });
    check('HR Manager approves and publishes the vacancy',
        publishJob.status === 200 && publishJob.data.job.status === 'published', publishJob);

    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);

    // Applying needs a CV, and uploading one needs a real file, so the resume
    // record is inserted directly - the point of this step is the vacancy, not
    // the upload endpoint.
    const resumeInsert = await db.collection('resumes').insertOne({
        user: new mongoose.Types.ObjectId(candidateReg.data.user.id),
        title: 'Department Head test CV',
        isDefault: true,
        parsedData: { skills: ['node.js'], education: [], workExperience: [] },
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const applyRes = await call('POST', '/applications', {
        token: candidateReg.data.token,
        body: {
            jobId: job._id,
            resumeId: resumeInsert.insertedId.toString(),
            coverLetter: 'I would like to join the Engineering team.'
        }
    });
    check('A candidate applies to the published vacancy',
        [200, 201].includes(applyRes.status), applyRes);

    // ---- Monitoring, not controlling ---------------------------------------
    section('Recruitment status the Department Head can monitor');
    const recruitment = await call('GET', '/departments/mine/recruitment', { token: headToken });
    check('The recruitment view loads', recruitment.status === 200, recruitment);
    const tracked = recruitment.data.data.find(r => r._id === requisitionId);
    check('It tracks the head\'s own requisition', !!tracked, recruitment.data.data);
    check('It never tracks another department\'s requisition',
        !recruitment.data.data.some(r => r._id === financeRequisitionId), recruitment.data.data);
    check('It links the requisition to the vacancy it produced',
        tracked.job && String(tracked.job._id) === String(job._id), tracked.job);
    check('It reports the vacancy as published',
        tracked.progress.find(s => s.key === 'published')?.state === 'done', tracked.progress);
    check('It counts the candidate now applying',
        tracked.applications.total === 1
        && tracked.progress.find(s => s.key === 'applying')?.state === 'done', tracked);

    const headJobEdit = await call('PUT', `/jobs/${job._id}`, {
        token: headToken, body: { description: 'Rewritten by the department head' }
    });
    check('A Department Head cannot edit the vacancy created from their requisition',
        headJobEdit.status === 403, headJobEdit);

    const headJobClose = await call('PUT', `/jobs/${job._id}/close`, { token: headToken });
    check('A Department Head cannot close the vacancy', headJobClose.status === 403, headJobClose);

    // ---- Notifications ------------------------------------------------------
    section('Notifications reaching the Department Head');
    const notifications = await call('GET', '/notifications', { token: headToken });
    const types = (notifications.data.data || notifications.data.notifications || []).map(n => n.type);
    check('The head was notified when HR returned the requisition',
        types.includes('requisition_returned'), types);
    check('The head was notified when it was approved',
        types.includes('requisition_approved'), types);
    check('The head was notified when the vacancy was published',
        types.includes('job_approved'), types);
    const links = (notifications.data.data || notifications.data.notifications || []).map(n => n.link);
    check('Every notification links into the head\'s own workspace, not HR\'s',
        links.every(link => !link || !link.startsWith('/hr-')), links);

    // ---- Cleanup ------------------------------------------------------------
    await cleanup();
    console.log('\nCleanup: removed the test organizations, HR teams, configuration, employees, requisitions, vacancy and accounts.');

    if (failures > 0) {
        console.log(`\n${failures} Department Head check(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll Department Head checks passed.');
    process.exit(0);
})().catch(async (error) => {
    console.error('\nSelf-test crashed:', error.message);
    try {
        await cleanup();
        console.log('Cleanup: removed what the run had created.');
    } catch (cleanupError) {
        console.error('Cleanup also failed:', cleanupError.message);
    }
    process.exit(1);
});
