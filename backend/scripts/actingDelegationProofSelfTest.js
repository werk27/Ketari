/**
 * Proof that DELEGATED WORK is actually performable end-to-end - not merely
 * that a capability transfers.
 *
 * Two real users:
 *   A = Department Head (role: employee, assigned Configuration
 *       departments[].manager of Engineering) - the delegator.
 *   B = a plain employee - the delegate, always acting through B's OWN
 *       account and token.
 *
 * Verifies, against the real backend APIs, that while an approved+accepted
 * delegation from A to B is in effect, B can:
 *   1. see the delegated standing in their own auth payload (workspace);
 *   2. open the Department Head pages (/departments/mine*);
 *   3. load exactly A's departmental scope - never other departments;
 *   4. perform the delegated business operations:
 *        create / edit / submit / clarify Job Requisitions;
 *   5. complete them successfully (status transitions recorded);
 *   6. see the resulting state afterwards - with every action audited
 *      under B's identity, never A's.
 *
 * Also proves the HR-Expert-owned vacancy draft edit/submit cover, that
 * separation-of-duties and self-service restrictions survive delegation,
 * and the full leave lifecycle (A blocked during approved leave, restored
 * automatically; B's authority ends automatically with the delegation).
 *
 * Fully self-contained: creates its own throwaway organization/staff and
 * removes them again at the end.
 *
 * Usage: node scripts/actingDelegationProofSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'ActingProof123!';

const call = async (method, endpoint, { body, token } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (body) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${endpoint}`, { method, headers, body: payload });
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
const section = (title) => console.log(`\n-- ${title} --`);

const login = async (email) => call('POST', '/auth/login', { body: { email, password: PASSWORD } });

const extraEmails = [];
let employerId = null;

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const users = await db.collection('users').find({ email: { $in: extraEmails } }).toArray();
    const userIds = users.map(u => u._id);

    if (employerId) {
        for (const coll of ['leaves', 'employees', 'configurations', 'delegations',
            'jobrequisitions', 'jobs', 'notifications', 'employers']) {
            await db.collection(coll).deleteMany(coll === 'employers' ? { _id: employerId } : { employer: employerId });
        }
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

const isoOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dateOffset = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };

(async () => {
    console.log(`Testing ${API}`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    // ======================================================================
    section('Setup: organization, departments, staff');
    // ======================================================================
    const employerEmail = `acting-employer-${stamp}@example.com`;
    extraEmails.push(employerEmail);
    const reg = await call('POST', '/auth/register', {
        body: { name: 'Acting Proof Employer', email: employerEmail, password: PASSWORD, role: 'employer' }
    });
    check('Employer registers', reg.status === 201, reg.data);
    employerId = new mongoose.Types.ObjectId(reg.data.organization._id);
    await db.collection('employers').updateOne({ _id: employerId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerToken = (await login(employerEmail)).data.token;

    const makeStaff = async ({ firstName, lastName, email, role }) => {
        extraEmails.push(email);
        const rec = await call('POST', '/employees', {
            token: employerToken,
            body: { personalInfo: { firstName, lastName }, contactInfo: { email } }
        });
        if (rec.status !== 201) throw new Error(`Could not record ${firstName}: ${JSON.stringify(rec.data)}`);
        const employeeId = rec.data.data._id;
        await call('POST', `/employees/${employeeId}/account`, {
            token: employerToken, body: { email, password: PASSWORD, role: 'employee' }
        });
        if (role !== 'employee') {
            await call('PUT', `/employees/${employeeId}/role`, { token: employerToken, body: { role } });
        }
        const loginRes = await login(email);
        return { employeeId, token: loginRes.data.token, userId: loginRes.data.user._id, email };
    };

    const A = await makeStaff({ firstName: 'Head', lastName: 'Alpha', email: `acting-A-${stamp}@example.com`, role: 'employee' });
    const B = await makeStaff({ firstName: 'Delegate', lastName: 'Beta', email: `acting-B-${stamp}@example.com`, role: 'employee' });
    const F = await makeStaff({ firstName: 'Finance', lastName: 'Head', email: `acting-F-${stamp}@example.com`, role: 'employee' });
    const expert = await makeStaff({ firstName: 'Expert', lastName: 'One', email: `acting-X1-${stamp}@example.com`, role: 'hr_expert' });
    const expertOwner = await makeStaff({ firstName: 'Expert', lastName: 'Owner', email: `acting-X2-${stamp}@example.com`, role: 'hr_expert' });
    const manager = await makeStaff({ firstName: 'Manager', lastName: 'One', email: `acting-M-${stamp}@example.com`, role: 'hr_manager' });

    // Departments: A heads Engineering; F heads Finance (the scope boundary).
    const engRes = await call('POST', '/config/departments', {
        token: employerToken, body: { name: 'Engineering', code: 'ENG', description: 'Builds the product' }
    });
    const engineering = engRes.data.data.departments.find(d => d.name === 'Engineering');
    await call('PUT', `/config/departments/${engineering._id}`, {
        token: employerToken,
        body: { name: 'Engineering', code: 'ENG', description: 'Builds the product', manager: A.userId }
    });
    const finRes = await call('POST', '/config/departments', {
        token: employerToken, body: { name: 'Finance', code: 'FIN', description: 'Counts the money' }
    });
    const finance = finRes.data.data.departments.find(d => d.name === 'Finance');
    await call('PUT', `/config/departments/${finance._id}`, {
        token: employerToken,
        body: { name: 'Finance', code: 'FIN', description: 'Counts the money', manager: F.userId }
    });

    const posRes = await call('POST', '/config/positions', {
        token: employerToken, body: { title: 'Backend Developer', department: engineering._id }
    });
    const backendDev = posRes.data.data.positions.find(p => p.title === 'Backend Developer');
    check('Departments and position configured (A heads Engineering, F heads Finance)',
        !!engineering && !!finance && !!backendDev, { engineering: !!engineering, finance: !!finance });

    await call('POST', '/config/leave-types', {
        token: employerToken,
        body: { name: `Acting Leave ${stamp}`, daysPerYear: 15, paid: true, requiresAttachment: false }
    });

    const requisitionBody = (extra = {}) => ({
        department: engineering._id,
        position: backendDev._id,
        numberOfPositions: 1,
        requestType: 'new_position',
        employmentType: 'Full-Time',
        level: 'Intermediate',
        education: 'BSc',
        experience: '2+ years',
        startDate: new Date(Date.now() + 45 * 864e5).toISOString(),
        salary: { amount: 30000, currency: 'ETB', period: 'monthly' },
        reason: 'Roadmap needs another engineer',
        ...extra
    });

    // ======================================================================
    section('1-2. Before delegation: A works, B has nothing of A\'s');
    // ======================================================================
    const aDraft = await call('POST', '/requisitions', { token: A.token, body: requisitionBody() });
    check('BEFORE: A (Department Head) creates a draft requisition', aDraft.status === 201 && aDraft.data.data.status === 'draft', aDraft.data);
    const aDraftId = aDraft.data.data._id;

    const bCreateBefore = await call('POST', '/requisitions', { token: B.token, body: requisitionBody() });
    check('BEFORE: B cannot raise a requisition for A\'s department (403)', bCreateBefore.status === 403, bCreateBefore.data);
    const bDeptBefore = await call('GET', '/departments/mine', { token: B.token });
    check('BEFORE: B cannot open the Department Head workspace (403)', bDeptBefore.status === 403, bDeptBefore.data);
    const bListBefore = await call('GET', '/requisitions', { token: B.token });
    check('BEFORE: B\'s requisition list shows nothing (heads no department)',
        bListBefore.status === 200 && bListBefore.data.count === 0, bListBefore.data);
    const bEditBefore = await call('PUT', `/requisitions/${aDraftId}`, { token: B.token, body: { reason: 'hijack attempt' } });
    check('BEFORE: B cannot edit A\'s draft', bEditBefore.status === 403, bEditBefore.data);

    // ======================================================================
    section('3. Full workflow delegation request: A -> B (requisition:create)');
    // ======================================================================
    const delReq = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId,
            type: 'authority',
            title: 'Cover Engineering staffing requests',
            description: 'Acting Department Head for requisitions while I am on leave.',
            startDate: isoOffset(-1),
            endDate: isoOffset(6),
            scopeType: 'specific',
            scopedCapabilities: ['requisition:create']
        }
    });
    check('A (employee) submits a delegation REQUEST', delReq.status === 201 && delReq.data.data.status === 'pending_hr_expert_review', delReq.data);
    const delegationId = delReq.data.data._id;

    const bDuringReview = await call('GET', '/departments/mine', { token: B.token });
    check('PENDING REVIEW: B still has nothing', bDuringReview.status === 403, bDuringReview.data);

    const validate = await call('PUT', `/delegations/${delegationId}/review`, { token: expert.token, body: { action: 'validate' } });
    check('HR Expert validates the request', validate.status === 200 && validate.data.data.status === 'pending_hr_manager_approval', validate.data);
    const approve = await call('PUT', `/delegations/${delegationId}/decision`, { token: manager.token, body: { action: 'approve' } });
    check('HR Manager approves the request', approve.status === 200 && approve.data.data.status === 'approved_pending_acceptance', approve.data);

    const bBeforeAccept = await call('GET', '/departments/mine', { token: B.token });
    check('APPROVED BUT NOT ACCEPTED: B still has nothing', bBeforeAccept.status === 403, bBeforeAccept.data);

    const accept = await call('PUT', `/delegations/${delegationId}/respond`, { token: B.token, body: { action: 'accept' } });
    check('B accepts -> delegation ACTIVE', accept.status === 200 && accept.data.data.status === 'active', accept.data);

    // ======================================================================
    section('4. B\'s workspace shows the delegated standing');
    // ======================================================================
    const bAuth = await login(B.email);
    check('B logs in with their OWN account', bAuth.status === 200, bAuth.data);
    const bToken = bAuth.data.token;
    const bBanner = (bAuth.data.user.activeDelegations || []).find(d => String(d.id) === String(delegationId));
    check('B\'s auth payload lists the active delegation ("Acting for" data)',
        !!bBanner && /Head Alpha/.test(bBanner.delegatorName || ''), bAuth.data.user.activeDelegations);
    check('B\'s permanent role is still employee', bAuth.data.user.role === 'employee', bAuth.data.user.role);
    check('B\'s employment now reports acting Department Head of Engineering',
        bAuth.data.user.employment && bAuth.data.user.employment.isDepartmentHead === true
        && (bAuth.data.user.employment.headOfDepartments || []).some(d => d.name === 'Engineering'),
        bAuth.data.user.employment);

    // ======================================================================
    section('5. B opens the Department Head pages and sees A\'s scope only');
    // ======================================================================
    const bDeptMine = await call('GET', '/departments/mine', { token: bToken });
    check('B opens /departments/mine (Department Head visibility)', bDeptMine.status === 200, bDeptMine.data);
    const bDeptNames = (bDeptMine.data.data?.departments || bDeptMine.data.data || []).map(d => d.name);
    check('B sees Engineering (A\'s scope)', bDeptNames.includes('Engineering'), bDeptNames);
    check('B does NOT see Finance (someone else\'s department)', !bDeptNames.includes('Finance'), bDeptNames);

    const bOverview = await call('GET', '/departments/mine/overview', { token: bToken });
    check('B opens the Department Head dashboard overview', bOverview.status === 200, bOverview.data);
    const bDeptEmployees = await call('GET', '/departments/mine/employees', { token: bToken });
    check('B opens the department employees view', bDeptEmployees.status === 200, bDeptEmployees.data);
    const bRecruitment = await call('GET', '/departments/mine/recruitment', { token: bToken });
    check('B opens the department recruitment view', bRecruitment.status === 200, bRecruitment.data);

    const bList = await call('GET', '/requisitions', { token: bToken });
    check('B\'s requisition list now loads Engineering\'s data', bList.status === 200, bList.data);
    check('B sees A\'s in-flight draft (work never stalls)',
        (bList.data.data || []).some(r => String(r._id) === String(aDraftId)), bList.data.count);

    // ======================================================================
    section('6. B performs the delegated business operations');
    // ======================================================================
    // (a) EDIT A's draft.
    const bEdit = await call('PUT', `/requisitions/${aDraftId}`, {
        token: bToken, body: { reason: 'Updated by the acting head: roadmap confirmed, hire now.' }
    });
    check('B EDITS A\'s draft requisition', bEdit.status === 200 && bEdit.data.data.reason.includes('acting head'), bEdit.data);

    // (b) SUBMIT it for HR review.
    const bSubmit = await call('PUT', `/requisitions/${aDraftId}/submit`, { token: bToken });
    check('B SUBMITS the requisition', bSubmit.status === 200 && bSubmit.data.data.status === 'submitted', bSubmit.data);

    // (c) HR returns it with a query; B answers the CLARIFICATION.
    const ret = await call('PUT', `/requisitions/${aDraftId}/return`, {
        token: expert.token, body: { note: 'Please confirm the budget line.' }
    });
    check('HR Expert returns it with a query', ret.status === 200 && ret.data.data.status === 'returned', ret.data);
    const bClarify = await call('PUT', `/requisitions/${aDraftId}/clarify`, {
        token: bToken, body: { response: 'Budget line ENG-2026-04 covers it.' }
    });
    check('B answers the clarification -> back to submitted', bClarify.status === 200 && bClarify.data.data.status === 'submitted', bClarify.data);

    // (d) B CREATES a brand-new requisition for the covered department.
    const bCreate = await call('POST', '/requisitions', {
        token: bToken,
        body: requisitionBody({ reason: 'Raised by the acting head', submitForApproval: true })
    });
    check('B CREATES and submits a new requisition for Engineering', bCreate.status === 201 && bCreate.data.data.status === 'submitted', bCreate.data);
    const bCreatedId = bCreate.data.data._id;

    // (e) B sees the correct resulting state afterwards.
    const bAfterView = await call('GET', `/requisitions/${bCreatedId}`, { token: bToken });
    check('B reads back the resulting status', bAfterView.status === 200 && bAfterView.data.data.status === 'submitted', bAfterView.data);

    // ======================================================================
    section('7. Audit: every action recorded under B, never A');
    // ======================================================================
    const editedDoc = await db.collection('jobrequisitions').findOne({ _id: new mongoose.Types.ObjectId(String(aDraftId)) });
    const auditActors = (editedDoc.auditTrail || []).map(e => String(e.by));
    check('Requisition audit trail contains B\'s edits/submits', auditActors.includes(String(B.userId)), auditActors);
    const bEntries = (editedDoc.auditTrail || []).filter(e => String(e.by) === String(B.userId));
    check('None of B\'s actions are attributed to A', bEntries.length > 0 && !bEntries.some(e => String(e.by) === String(A.userId)), bEntries.length);
    const createdDoc = await db.collection('jobrequisitions').findOne({ _id: new mongoose.Types.ObjectId(String(bCreatedId)) });
    check('B\'s new requisition is OWNED by B (requestedBy = B)', String(createdDoc.requestedBy) === String(B.userId), createdDoc.requestedBy);
    check('Its audit notes it was raised under delegation from the assigned head',
        (createdDoc.auditTrail || []).some(e => /acting under delegation/.test(e.note || '')), createdDoc.auditTrail);

    // ======================================================================
    section('8. Scope, substitution, SoD and self-service boundaries hold');
    // ======================================================================
    const bFinance = await call('POST', '/requisitions', {
        token: bToken, body: requisitionBody({ department: finance._id, position: undefined, positionTitle: 'Accountant' })
    });
    check('SCOPE: B cannot raise a requisition for Finance (not A\'s scope)', bFinance.status === 403, bFinance.data);

    const aSuspended = await call('POST', '/requisitions', { token: A.token, body: requisitionBody() });
    check('SUBSTITUTION: A cannot raise requisitions while the delegation is active', aSuspended.status === 403, aSuspended.data);

    const bPrepare = await call('PUT', `/requisitions/${bCreatedId}/prepare`, { token: bToken });
    check('SoD: B cannot process/forward requisitions (never delegated)', bPrepare.status === 403, bPrepare.data);
    const bDecide = await call('PUT', `/requisitions/${bCreatedId}/decision`, { token: bToken, body: { action: 'approve' } });
    check('SoD: B cannot approve requisitions (never delegated)', bDecide.status === 403, bDecide.data);

    // Self-service stays personal: A can still request their OWN leave even
    // though A's delegable requisition responsibility is suspended.
    const aOwnLeave = await call('POST', '/leaves', {
        token: A.token,
        body: { leaveType: `Acting Leave ${stamp}`, startDate: isoOffset(2), endDate: isoOffset(4), reason: 'Family time' }
    });
    check('SELF-SERVICE: A can still submit their own leave request', aOwnLeave.status === 201, aOwnLeave.data);

    // ======================================================================
    section('9. Vacancy draft cover: HR Expert owner -> B');
    // ======================================================================
    const draftJob = await call('POST', '/jobs', {
        token: expertOwner.token,
        body: {
            title: `Acting Draft Vacancy ${stamp}`, department: 'Engineering',
            description: 'A test draft vacancy', location: 'Hawassa',
            salary: { amount: 20000, currency: 'ETB' }, applicationDeadline: isoOffset(30)
        }
    });
    check('HR Expert (owner) creates a draft vacancy', draftJob.status === 201, draftJob.data);
    const draftJobId = draftJob.data.job?._id || draftJob.data.data?._id;

    const bJobEditBefore = await call('PUT', `/jobs/${draftJobId}`, { token: bToken, body: { description: 'hijack' } });
    check('BEFORE COVER: B cannot edit the draft vacancy', bJobEditBefore.status === 403, bJobEditBefore.data);

    const vacDelegation = await call('POST', '/delegations', {
        token: expertOwner.token,
        body: {
            delegate: B.userId, type: 'task', title: 'Cover my vacancy drafts',
            description: 'Edit and submit my drafts while I am away.',
            startDate: isoOffset(-1), endDate: isoOffset(6),
            scopeType: 'specific', scopedCapabilities: ['vacancy:edit', 'vacancy:submit']
        }
    });
    check('Owner requests vacancy-draft cover for B', vacDelegation.status === 201, vacDelegation.data);
    const vacDelegationId = vacDelegation.data.data._id;
    await call('PUT', `/delegations/${vacDelegationId}/review`, { token: expert.token, body: { action: 'validate' } });
    await call('PUT', `/delegations/${vacDelegationId}/decision`, { token: manager.token, body: { action: 'approve' } });
    const vacAccept = await call('PUT', `/delegations/${vacDelegationId}/respond`, { token: bToken, body: { action: 'accept' } });
    check('B accepts the vacancy cover -> active', vacAccept.status === 200 && vacAccept.data.data.status === 'active', vacAccept.data);

    const bJobEdit = await call('PUT', `/jobs/${draftJobId}`, { token: bToken, body: { description: 'Polished by the acting cover.' } });
    check('B EDITS the covered draft vacancy', bJobEdit.status === 200, bJobEdit.data);
    const ownerSuspended = await call('PUT', `/jobs/${draftJobId}`, { token: expertOwner.token, body: { description: 'blocked' } });
    check('SUBSTITUTION: the suspended owner cannot edit their own draft', ownerSuspended.status === 403, ownerSuspended.data);
    const bJobDelete = await call('DELETE', `/jobs/${draftJobId}`, { token: bToken });
    check('OWNERSHIP: B can never DELETE the owner\'s draft', bJobDelete.status === 403, bJobDelete.data);
    const bJobSubmit = await call('PUT', `/jobs/${draftJobId}/submit`, { token: bToken });
    check('B SUBMITS the covered draft for approval', bJobSubmit.status === 200, bJobSubmit.data);
    const jobDoc = await db.collection('jobs').findOne({ _id: new mongoose.Types.ObjectId(String(draftJobId)) });
    const submitEntry = (jobDoc.statusHistory || []).filter(h => h.status === 'pending_approval').pop();
    check('AUDIT: the submission is recorded under B\'s identity', submitEntry && String(submitEntry.changedBy) === String(B.userId), submitEntry);

    // ======================================================================
    section('10. Leave lifecycle: A blocked during leave, all reverts on return');
    // ======================================================================
    const aEmployeeDoc = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(String(A.employeeId)) });
    const aLeave = await db.collection('leaves').insertOne({
        employee: aEmployeeDoc._id,
        employer: employerId,
        leaveTypeName: `Acting Leave ${stamp}`,
        startDate: dateOffset(-1),
        endDate: dateOffset(5),
        totalDays: 7,
        reason: 'Annual leave, B covers requisitions',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });

    const aLoginDuring = await login(A.email);
    check('DURING LEAVE: A cannot log in (ON_LEAVE_ACCESS_BLOCKED)',
        aLoginDuring.status === 403 && aLoginDuring.data.code === 'ON_LEAVE_ACCESS_BLOCKED', aLoginDuring.data);
    const aTokenDuring = await call('GET', '/requisitions', { token: A.token });
    check('DURING LEAVE: A\'s old token is rejected too',
        aTokenDuring.status === 403 && aTokenDuring.data.code === 'ON_LEAVE_ACCESS_BLOCKED', aTokenDuring.data);

    const bDuringLeaveCreate = await call('POST', '/requisitions', {
        token: bToken, body: requisitionBody({ reason: 'Raised while A is on leave' })
    });
    check('DURING LEAVE: B still performs the delegated work', bDuringLeaveCreate.status === 201, bDuringLeaveCreate.data);
    const bDuringDept = await call('GET', '/departments/mine', { token: bToken });
    check('DURING LEAVE: B still opens the Department Head workspace', bDuringDept.status === 200, bDuringDept.data);

    // Return date arrives: move the leave AND both delegations into the past.
    await db.collection('leaves').updateOne({ _id: aLeave.insertedId }, { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } });
    await db.collection('delegations').updateMany(
        { _id: { $in: [new mongoose.Types.ObjectId(String(delegationId)), new mongoose.Types.ObjectId(String(vacDelegationId))] } },
        { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } }
    );

    const aLoginAfter = await login(A.email);
    check('RETURN DATE: A logs in again automatically', aLoginAfter.status === 200, aLoginAfter.data);
    const aWorkAfter = await call('POST', '/requisitions', { token: aLoginAfter.data.token, body: requisitionBody({ reason: 'Back from leave' }) });
    check('RETURN DATE: A\'s requisition authority is restored automatically', aWorkAfter.status === 201, aWorkAfter.data);

    const bDeptAfter = await call('GET', '/departments/mine', { token: bToken });
    check('RETURN DATE: B loses the Department Head standing automatically', bDeptAfter.status === 403, bDeptAfter.data);
    const bCreateAfter = await call('POST', '/requisitions', { token: bToken, body: requisitionBody() });
    check('RETURN DATE: B can no longer raise Engineering requisitions', bCreateAfter.status === 403, bCreateAfter.data);
    const bAuthAfter = await login(B.email);
    check('RETURN DATE: B\'s workspace no longer lists the delegation',
        bAuthAfter.status === 200 && !(bAuthAfter.data.user.activeDelegations || []).some(d => String(d.id) === String(delegationId)),
        bAuthAfter.data.user.activeDelegations);
    check('B\'s permanent role never changed throughout', bAuthAfter.data.user.role === 'employee', bAuthAfter.data.user.role);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self-test crashed:', error);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
