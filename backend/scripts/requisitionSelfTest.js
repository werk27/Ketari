/**
 * End-to-end check of the Job Requisition / Manpower Request workflow:
 *
 *   Department/authorized requester -> submitted -> HR Expert review
 *   -> returned (correction) | pending_approval -> HR Manager decision
 *   -> approved -> Job created from the requisition -> published
 *   -> candidate applies (existing recruitment flow keeps working)
 *
 * Also verifies: department must come from the organization's own configured
 * list (never free text, never another organization's), essential fields
 * lock on the created vacancy, the amendment + re-approval workflow re-syncs
 * a linked vacancy, and organization isolation throughout.
 *
 * Fully self-contained - creates its own throwaway organizations, HR teams,
 * configuration, requisitions, vacancy and candidate, and removes all of them
 * again at the end.
 *
 * Usage: node scripts/requisitionSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'ReqTest123!';

const accounts = {
    employerA: { name: 'Req Test Employer A', email: `req-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertA: { name: 'Req Test Expert A', email: `req-expA-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    managerA: { name: 'Req Test Manager A', email: `req-mgrA-${stamp}@example.com`, password: PASSWORD, role: 'hr_manager' },
    employerB: { name: 'Req Test Employer B', email: `req-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    candidate: { name: 'Req Test Candidate', email: `req-cand-${stamp}@example.com`, password: PASSWORD }
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

const login = async ({ email, password }) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data.message}`);
    return res.data.token;
};

const created = { emails: Object.values(accounts).map(a => a.email) };

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const users = await db.collection('users').find({ email: { $in: created.emails } }).toArray();
    const userIds = users.map(u => u._id);

    await db.collection('applications').deleteMany({ applicant: { $in: userIds } });
    await db.collection('resumes').deleteMany({ user: { $in: userIds } });
    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
    for (const employerId of created.employerIds || []) {
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
    created.employerIds = [];

    // ---- Organization A: employer + HR team + configured department ----------
    const employerAReg = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A registers', employerAReg.status === 201, employerAReg);
    const employerAId = new mongoose.Types.ObjectId(employerAReg.data.organization._id);
    created.employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = employerAReg.data.token;

    for (const key of ['expertA', 'managerA']) {
        const res = await call('POST', '/employers/me/team', { token: employerAToken, body: accounts[key] });
        check(`${accounts[key].role} (${key}) added to organization A`, res.status === 201, res);
    }
    const expertAToken = await login(accounts.expertA);
    const managerAToken = await login(accounts.managerA);

    const deptRes = await call('POST', '/config/departments', { token: employerAToken, body: { name: 'Engineering', code: 'ENG' } });
    check('Employer A configures a department', deptRes.status === 201, deptRes);
    const department = deptRes.data.data.departments.find(d => d.name === 'Engineering');

    const posRes = await call('POST', '/config/positions', {
        token: employerAToken,
        body: { title: 'Backend Developer', name: 'Backend Developer', department: department._id }
    });
    check('Employer A configures a position', posRes.status === 201, posRes);
    const position = posRes.data.data.positions.find(p => p.title === 'Backend Developer');

    // ---- Organization B: unrelated, used only to prove isolation -------------
    const employerBReg = await call('POST', '/auth/register', { body: accounts.employerB });
    const employerBId = new mongoose.Types.ObjectId(employerBReg.data.organization._id);
    created.employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = employerBReg.data.token;

    // ---- Department must be one of the organization's own configured list ----
    const freeTextDept = await call('POST', '/requisitions', {
        token: employerAToken,
        body: {
            department: new mongoose.Types.ObjectId().toString(),
            positionTitle: 'Ghost Role',
            numberOfPositions: 1,
            requestType: 'new_position',
            level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' },
            reason: 'Testing'
        }
    });
    check('An unconfigured department id is rejected', freeTextDept.status === 400, freeTextDept);

    const crossOrgDept = await call('POST', '/requisitions', {
        token: employerBToken,
        body: {
            department: department._id,
            positionTitle: 'Cross-org attempt',
            numberOfPositions: 1,
            requestType: 'new_position',
            level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' },
            reason: 'Testing'
        }
    });
    check('Organization B cannot use Organization A\'s department', crossOrgDept.status === 400, crossOrgDept);

    // ---- Department Head authorization -----------------------------------------
    // Create a second department Employer A does NOT assign anyone to head yet.
    const financeDeptRes = await call('POST', '/config/departments', { token: employerAToken, body: { name: 'Finance', code: 'FIN' } });
    const financeDept = financeDeptRes.data.data.departments.find(d => d.name === 'Finance');

    // A real Employee + linked account, following the Employee -> Account -> Role workflow.
    const headEmployeeRes = await call('POST', '/employees', {
        token: employerAToken,
        body: {
            personalInfo: { firstName: 'Dawit', lastName: 'Head' },
            contactInfo: { email: `req-head-${stamp}@example.com` },
            employmentInfo: { department: department._id, position: position._id, employmentStatus: 'active' }
        }
    });
    check('Employer A records the future Department Head as an employee', headEmployeeRes.status === 201, headEmployeeRes);
    const headEmployeeId = headEmployeeRes.data.data._id;

    const headEmail = `req-head-account-${stamp}@example.com`;
    const headAccountRes = await call('POST', `/employees/${headEmployeeId}/account`, {
        token: employerAToken,
        body: { email: headEmail, password: PASSWORD, role: 'employee' }
    });
    check('Employer A creates a login for the Department Head', headAccountRes.status === 201, headAccountRes);
    created.emails.push(headEmail);

    // HR Expert attempts to create a requisition BEFORE we even assign a head -
    // this must already be rejected; requisition:create is not an HR Expert capability at all.
    const expertCreateAttempt = await call('POST', '/requisitions', {
        token: expertAToken,
        body: {
            department: department._id, positionTitle: 'Should Not Be Created By HR Expert',
            numberOfPositions: 1, requestType: 'new_position', level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' }, reason: 'Testing'
        }
    });
    check('HR Expert cannot raise a requisition at all (role lacks the capability)', expertCreateAttempt.status === 403, expertCreateAttempt);

    const headToken = await login({ email: headEmail, password: PASSWORD });

    // Not yet assigned as this department's head - must be rejected with a specific reason.
    const unassignedHeadAttempt = await call('POST', '/requisitions', {
        token: headToken,
        body: {
            department: department._id, positionTitle: 'Too Early',
            numberOfPositions: 1, requestType: 'new_position', level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' }, reason: 'Testing'
        }
    });
    check('An employee not yet assigned as Department Head cannot raise a requisition',
        unassignedHeadAttempt.status === 403 &&
        unassignedHeadAttempt.data.message === 'Only the Employer or this department\'s assigned Department Head may raise a requisition for it.',
        unassignedHeadAttempt);

    // Employer assigns them as Engineering's Department Head.
    const headUserRes = await call('GET', '/auth/me', { token: headToken });
    const headUserId = headUserRes.data.user.id;
    check('Before assignment the session does not claim Department Head standing',
        headUserRes.data.user.employment?.isDepartmentHead === false, headUserRes.data.user.employment);
    check('The session already resolves the position and department from the employee record',
        headUserRes.data.user.employment?.jobTitle === 'Backend Developer' &&
        headUserRes.data.user.employment?.departmentName === 'Engineering',
        headUserRes.data.user.employment);

    const assignHeadRes = await call('PUT', `/config/departments/${department._id}`, {
        token: employerAToken, body: { name: 'Engineering', code: 'ENG', manager: headUserId }
    });
    check('Employer assigns the employee as Engineering\'s Department Head', assignHeadRes.status === 200, assignHeadRes);
    const engineeringDept = assignHeadRes.data.data.departments.find(d => d._id === department._id);
    check('Department stores the assigned head\'s real user id', String(engineeringDept?.manager) === String(headUserId), engineeringDept);

    // The head's own session must now say so: the account role is still the
    // generic "employee", so without this the person is shown as a plain
    // Employee and never learns they hold the department.
    const headSessionRes = await call('GET', '/auth/me', { token: headToken });
    const headEmployment = headSessionRes.data.user.employment;
    check('The Department Head\'s own session reports the standing',
        headEmployment?.isDepartmentHead === true, headEmployment);
    check('The session names the department they head',
        (headEmployment?.headOfDepartments || []).some(d => d.name === 'Engineering'), headEmployment);
    check('A Department Head\'s account role is still the generic employee role',
        headSessionRes.data.user.role === 'employee', headSessionRes.data.user.role);

    // Someone in the same organization who heads nothing must not inherit it.
    const expertSessionRes = await call('GET', '/auth/me', { token: expertAToken });
    check('A colleague who heads no department is not reported as a Department Head',
        expertSessionRes.data.user.employment?.isDepartmentHead === false &&
        (expertSessionRes.data.user.employment?.headOfDepartments || []).length === 0,
        expertSessionRes.data.user.employment);

    // Another organization's member must never pick up this department.
    const employerBSessionRes = await call('GET', '/auth/me', { token: employerBToken });
    check('Another organization\'s member never inherits this department',
        (employerBSessionRes.data.user.employment?.headOfDepartments || []).every(d => d.name !== 'Engineering'),
        employerBSessionRes.data.user.employment);

    // Now the Department Head CAN raise a requisition for Engineering.
    const headCreateRes = await call('POST', '/requisitions', {
        token: headToken,
        body: {
            department: department._id, positionTitle: 'QA Engineer',
            numberOfPositions: 1, requestType: 'new_position', level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 16000, currency: 'ETB', period: 'monthly' }, reason: 'Growing QA needs'
        }
    });
    check('The assigned Department Head CAN raise a requisition for their own department', headCreateRes.status === 201, headCreateRes);
    const headRequisitionId = headCreateRes.data.data._id;

    // But NOT for a department they do not head (Finance).
    const headWrongDeptAttempt = await call('POST', '/requisitions', {
        token: headToken,
        body: {
            department: financeDept._id, positionTitle: 'Should Not Be Allowed',
            numberOfPositions: 1, requestType: 'new_position', level: 'Junior',
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 15000, currency: 'ETB', period: 'monthly' }, reason: 'Testing'
        }
    });
    check('The Department Head cannot raise a requisition for a department they do not head',
        headWrongDeptAttempt.status === 403, headWrongDeptAttempt);

    // Nor reassign their own draft to that other department.
    const headReassignAttempt = await call('PUT', `/requisitions/${headRequisitionId}`, {
        token: headToken, body: { department: financeDept._id }
    });
    check('The Department Head cannot reassign their own draft to a department they do not head',
        headReassignAttempt.status === 403, headReassignAttempt);

    // HR Expert still reviews/forwards it normally (its actual job, unchanged).
    const headSubmitRes = await call('PUT', `/requisitions/${headRequisitionId}/submit`, { token: headToken });
    check('The Department Head submits their own requisition for HR review', headSubmitRes.status === 200, headSubmitRes);
    const expertPrepareHeadReqRes = await call('PUT', `/requisitions/${headRequisitionId}/prepare`, { token: expertAToken });
    check('HR Expert can still review/forward a Department Head\'s requisition', expertPrepareHeadReqRes.status === 200, expertPrepareHeadReqRes);
    const managerApproveHeadReqRes = await call('PUT', `/requisitions/${headRequisitionId}/decision`, { token: managerAToken, body: { outcome: 'approved' } });
    check('HR Manager can still approve a Department Head\'s requisition', managerApproveHeadReqRes.status === 200, managerApproveHeadReqRes);

    // ---- Happy path: Employer raises a requisition ----------------------------
    const draftRes = await call('POST', '/requisitions', {
        token: employerAToken,
        body: {
            department: department._id,
            position: position._id,
            numberOfPositions: 2,
            requestType: 'new_position',
            employmentType: 'Full-Time',
            level: 'Intermediate',
            education: 'BSc Computer Science',
            experience: '2+ years',
            skills: ['Node.js', 'MongoDB'],
            languages: ['English'],
            licenses: [],
            responsibilities: ['Build APIs', 'Review code'],
            competencies: ['Teamwork', 'Problem solving'],
            startDate: new Date(Date.now() + 30 * 864e5).toISOString(),
            salary: { amount: 28000, currency: 'ETB', period: 'monthly' },
            reason: 'Team is understaffed for the new product line'
        }
    });
    check('Employer raises a requisition as a draft', draftRes.status === 201 && draftRes.data.data.status === 'draft', draftRes);
    const requisitionId = draftRes.data.data._id;

    check('Requisition uses the configured department name (not free text)',
        draftRes.data.data.departmentName === 'Engineering', draftRes.data.data);
    check('Requisition resolves the configured position title',
        draftRes.data.data.positionTitle === 'Backend Developer', draftRes.data.data);

    const hrManagerSubmitAttempt = await call('PUT', `/requisitions/${requisitionId}/submit`, { token: managerAToken });
    check('HR Manager cannot submit a requisition (no create capability)', hrManagerSubmitAttempt.status === 403, hrManagerSubmitAttempt);

    const submitRes = await call('PUT', `/requisitions/${requisitionId}/submit`, { token: employerAToken });
    check('Employer submits the requisition for HR review', submitRes.status === 200 && submitRes.data.data.status === 'submitted', submitRes);

    // ---- Org isolation ---------------------------------------------------------
    const crossOrgView = await call('GET', `/requisitions/${requisitionId}`, { token: employerBToken });
    check('Organization B cannot view Organization A\'s requisition', crossOrgView.status === 403, crossOrgView);

    // ---- HR Expert returns it for correction -----------------------------------
    const returnNoNote = await call('PUT', `/requisitions/${requisitionId}/return`, { token: expertAToken, body: {} });
    check('Returning a requisition requires a note', returnNoNote.status === 400, returnNoNote);

    const returnRes = await call('PUT', `/requisitions/${requisitionId}/return`, {
        token: expertAToken,
        body: { note: 'Please confirm the required experience level.' }
    });
    check('HR Expert returns the requisition to the requester', returnRes.status === 200 && returnRes.data.data.status === 'returned', returnRes);

    const editRes = await call('PUT', `/requisitions/${requisitionId}`, {
        token: employerAToken,
        body: { experience: '3+ years' }
    });
    check('Requester edits the returned requisition (resets to draft)', editRes.status === 200 && editRes.data.data.status === 'draft', editRes);

    const resubmitRes = await call('PUT', `/requisitions/${requisitionId}/submit`, { token: employerAToken });
    check('Requester resubmits the corrected requisition', resubmitRes.status === 200 && resubmitRes.data.data.status === 'submitted', resubmitRes);

    // ---- HR Expert prepares it and forwards to HR Manager ----------------------
    const expertDecideAttempt = await call('PUT', `/requisitions/${requisitionId}/decision`, {
        token: expertAToken,
        body: { outcome: 'approved' }
    });
    check('HR Expert cannot approve a requisition (no approve capability)', expertDecideAttempt.status === 403, expertDecideAttempt);

    const prepareRes = await call('PUT', `/requisitions/${requisitionId}/prepare`, { token: expertAToken });
    check('HR Expert forwards the requisition for HR Manager approval',
        prepareRes.status === 200 && prepareRes.data.data.status === 'pending_approval', prepareRes);

    // ---- HR Manager approves -----------------------------------------------------
    const approveRes = await call('PUT', `/requisitions/${requisitionId}/decision`, {
        token: managerAToken,
        body: { outcome: 'approved' }
    });
    check('HR Manager approves the requisition', approveRes.status === 200 && approveRes.data.data.status === 'approved', approveRes);

    // ---- HR Expert creates a vacancy from the approved requisition -------------
    const jobFromReq = await call('POST', '/jobs', {
        token: expertAToken,
        body: {
            requisitionId,
            description: 'Join our backend team building the agency platform.',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 45 * 864e5).toISOString()
        }
    });
    check('HR Expert creates a vacancy from the approved requisition', jobFromReq.status === 201, jobFromReq);
    const job = jobFromReq.data.job;

    check('Vacancy title is pre-filled from the requisition', job.title === 'Backend Developer', job.title);
    check('Vacancy department is pre-filled from the requisition', job.department === 'Engineering', job.department);
    check('Vacancy headcount is pre-filled from the requisition', job.numberOfPositions === 2, job.numberOfPositions);
    check('Vacancy salary is pre-filled from the requisition', job.salary.amount === 28000, job.salary);
    check('Vacancy experience level is mapped from the requisition level', job.experienceLevel === 'Intermediate', job.experienceLevel);
    check('Vacancy skills are pre-filled from the requisition', (job.requirements.skills || []).includes('Node.js'), job.requirements);
    check('Vacancy responsibilities are pre-filled from the requisition',
        (job.responsibilities || []).includes('Build APIs'), job.responsibilities);
    check('Vacancy remembers its source requisition', job.sourceRequisition === requisitionId, job.sourceRequisition);

    const requisitionAfterJob = await call('GET', `/requisitions/${requisitionId}`, { token: employerAToken });
    check('Requisition status becomes "job_created"', requisitionAfterJob.data.data.status === 'job_created', requisitionAfterJob.data.data.status);
    check('Requisition links back to the created vacancy', requisitionAfterJob.data.data.linkedJob?._id === job._id, requisitionAfterJob.data.data.linkedJob);

    // ---- Essential fields are locked once sourced from a requisition ----------
    const lockedEdit = await call('PUT', `/jobs/${job._id}`, {
        token: expertAToken,
        body: { title: 'Renamed Role', salary: { amount: 99999, currency: 'ETB', period: 'monthly' } }
    });
    check('Direct edits to requisition-sourced essential fields are rejected', lockedEdit.status === 400, lockedEdit);

    const publicationEdit = await call('PUT', `/jobs/${job._id}`, {
        token: expertAToken,
        body: { location: 'Addis Ababa' }
    });
    check('Publication-only fields remain freely editable', publicationEdit.status === 200 && publicationEdit.data.job.location === 'Addis Ababa', publicationEdit);

    // ---- Recruitment continues normally: submit, approve, publish, apply ------
    const submitJobRes = await call('PUT', `/jobs/${job._id}/submit`, { token: expertAToken });
    check('Vacancy submitted for HR Manager approval', submitJobRes.status === 200, submitJobRes);

    const approveJobRes = await call('PUT', `/jobs/${job._id}/approve`, { token: managerAToken });
    check('HR Manager approves and publishes the vacancy', approveJobRes.status === 200 && approveJobRes.data.job.status === 'published', approveJobRes);

    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);
    const candidateToken = candidateReg.data.token;
    const candidateId = new mongoose.Types.ObjectId(candidateReg.data.user.id);

    // Resume upload needs a real file, so the record is inserted directly.
    const resumeInsert = await db.collection('resumes').insertOne({
        user: candidateId,
        title: 'Requisition test CV',
        isDefault: true,
        parsedData: { skills: ['javascript'], education: [], workExperience: [] },
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const applyRes = await call('POST', '/applications', {
        token: candidateToken,
        body: { jobId: job._id, resumeId: resumeInsert.insertedId.toString() }
    });
    check('Candidate can apply to the vacancy created from the requisition', [200, 201].includes(applyRes.status), applyRes);

    // ---- Amendment + re-approval workflow re-syncs the linked vacancy ----------
    const amendRes = await call('PUT', `/requisitions/${requisitionId}/amend`, {
        token: expertAToken,
        body: { salary: { amount: 32000, currency: 'ETB', period: 'monthly' }, note: 'Salary band was revised upward' }
    });
    check('HR Expert amends the requisition after job creation', amendRes.status === 200 && amendRes.data.data.status === 'pending_approval', amendRes);

    const reapproveRes = await call('PUT', `/requisitions/${requisitionId}/decision`, {
        token: managerAToken,
        body: { outcome: 'approved' }
    });
    check('HR Manager re-approves the amendment', reapproveRes.status === 200 && reapproveRes.data.data.status === 'job_created', reapproveRes);

    const jobAfterAmend = await call('GET', `/jobs/${job._id}`, { token: expertAToken });
    check('Linked vacancy salary is synced after re-approval', jobAfterAmend.data.job.salary.amount === 32000, jobAfterAmend.data.job.salary);

    // ---- Reject path -------------------------------------------------------------
    const draft2 = await call('POST', '/requisitions', {
        token: employerAToken,
        body: {
            department: department._id,
            positionTitle: 'Marketing Assistant',
            numberOfPositions: 1,
            requestType: 'additional_headcount',
            level: 'Beginner',
            startDate: new Date(Date.now() + 20 * 864e5).toISOString(),
            salary: { amount: 12000, currency: 'ETB', period: 'monthly' },
            reason: 'Support the growing marketing workload',
            submitForApproval: true
        }
    });
    check('A second requisition is created and submitted directly', draft2.status === 201 && draft2.data.data.status === 'submitted', draft2);
    const requisition2Id = draft2.data.data._id;

    await call('PUT', `/requisitions/${requisition2Id}/prepare`, { token: expertAToken });
    const rejectNoReason = await call('PUT', `/requisitions/${requisition2Id}/decision`, {
        token: managerAToken,
        body: { outcome: 'rejected' }
    });
    check('Rejection requires a reason', rejectNoReason.status === 400, rejectNoReason);

    const rejectRes = await call('PUT', `/requisitions/${requisition2Id}/decision`, {
        token: managerAToken,
        body: { outcome: 'rejected', reason: 'Headcount frozen this quarter' }
    });
    check('HR Manager rejects the second requisition', rejectRes.status === 200 && rejectRes.data.data.status === 'rejected', rejectRes);

    const rejectedEditRes = await call('PUT', `/requisitions/${requisition2Id}`, {
        token: employerAToken,
        body: { reason: 'Support the growing marketing workload; revised for next quarter' }
    });
    check('Requester can edit a rejected requisition (resets to draft)',
        rejectedEditRes.status === 200 && rejectedEditRes.data.data.status === 'draft', rejectedEditRes);

    // ---- An approved-but-not-yet-created requisition cannot be reused to
    //      create a second vacancy once already used ----------------------------
    const reuseAttempt = await call('POST', '/jobs', {
        token: expertAToken,
        body: {
            requisitionId,
            description: 'Should fail - already used.',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 45 * 864e5).toISOString()
        }
    });
    check('A requisition already used to create a vacancy cannot create another', reuseAttempt.status === 400, reuseAttempt);

    console.log('\nCleanup: removed the test organizations, HR teams, configuration, requisitions, vacancy and accounts.');
    await cleanup();
    await mongoose.disconnect();

    console.log(failures === 0 ? '\nAll job requisition workflow checks passed.' : `\n${failures} job requisition check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('Requisition self test crashed:', err);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
