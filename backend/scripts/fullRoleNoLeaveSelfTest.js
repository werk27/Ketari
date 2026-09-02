/**
 * Regression: FULL-ROLE delegation WITHOUT leave.
 *
 * Establishes that the two rules are independent and never conflated:
 *
 *   active delegation + NO leave  -> only the delegated responsibilities
 *                                    move; the delegator's account and
 *                                    workspace access stay fully open;
 *   active APPROVED leave         -> the delegator's entire work access is
 *                                    blocked (tested elsewhere - see
 *                                    leaveAccessBlockSelfTest.js).
 *
 * A = HR Manager (delegator), no leave anywhere. B = plain employee, not a
 * Department Head. A hands B a full_role delegation. Verifies A logs in and
 * uses the workspace normally (never ON_LEAVE_ACCESS_BLOCKED), loses only
 * the delegated responsibilities, keeps personal self-service; B gains
 * every legitimate delegable responsibility of A's role, performs a real
 * delegated operation, and never receives non-delegable powers (personal
 * self-service acts on A's records, organization-ownership powers). When
 * the delegation ends everything reverts automatically and neither
 * permanent role ever changes.
 *
 * Fully self-contained - creates a throwaway organization and staff and
 * removes them again at the end.
 *
 * Usage: node scripts/fullRoleNoLeaveSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'FullRoleTest123!';

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
        for (const coll of ['leaves', 'employees', 'configurations', 'delegations', 'notifications', 'employers']) {
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

    // ---- Setup ------------------------------------------------------------
    section('Setup');
    const employerEmail = `fullrole-emp-${stamp}@example.com`;
    extraEmails.push(employerEmail);
    const reg = await call('POST', '/auth/register', {
        body: { name: 'FullRole Employer', email: employerEmail, password: PASSWORD, role: 'employer' }
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

    const A = await makeStaff({ firstName: 'Anna', lastName: 'Manager', email: `fullrole-A-${stamp}@example.com`, role: 'hr_manager' });
    const B = await makeStaff({ firstName: 'Bekele', lastName: 'Delegate', email: `fullrole-B-${stamp}@example.com`, role: 'employee' });
    const C = await makeStaff({ firstName: 'Chaltu', lastName: 'Requester', email: `fullrole-C-${stamp}@example.com`, role: 'employee' });
    const X = await makeStaff({ firstName: 'Xpert', lastName: 'One', email: `fullrole-X-${stamp}@example.com`, role: 'hr_expert' });

    await call('POST', '/config/leave-types', {
        token: employerToken,
        body: { name: `FullRole Leave ${stamp}`, daysPerYear: 15, paid: true, requiresAttachment: false }
    });

    // Sanity: A has NO leave records at all, approved or otherwise.
    const aEmployeeDoc = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(String(A.employeeId)) });
    const aLeaveCount = await db.collection('leaves').countDocuments({ employee: aEmployeeDoc._id });
    check('Precondition: A has no leave records whatsoever', aLeaveCount === 0, aLeaveCount);

    // ---- Full-role delegation, no leave ------------------------------------
    section('Active full-role delegation A -> B (A NOT on leave)');
    const delRes = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority',
            title: 'Full role cover (no leave)',
            description: 'Covering all my delegable HR Manager responsibilities.',
            startDate: isoOffset(-1), endDate: isoOffset(5),
            scopeType: 'full_role'
        }
    });
    check('A direct-grants a full_role delegation', delRes.status === 201 && delRes.data.data.status === 'approved_pending_acceptance', delRes.data);
    const delegationId = delRes.data.data._id;
    const accept = await call('PUT', `/delegations/${delegationId}/respond`, { token: B.token, body: { action: 'accept' } });
    check('B accepts -> ACTIVE', accept.status === 200 && accept.data.data.status === 'active', accept.data);

    // 1-3. A's account and workspace stay fully open.
    const aLogin = await login(A.email);
    check('1. A logs in normally while the delegation is active', aLogin.status === 200, aLogin.data);
    check('2. A is NOT given ON_LEAVE_ACCESS_BLOCKED', aLogin.data.code === undefined, aLogin.data.code);
    const aToken = aLogin.data.token;
    const aMe = await call('GET', '/auth/me', { token: aToken });
    check('3. A accesses the workspace (/auth/me 200)', aMe.status === 200, aMe.data);
    check('3b. A sees the outgoing-delegation banner (handed to B)',
        (aMe.data.user.outgoingDelegations || []).some(d => String(d.id) === String(delegationId)), aMe.data.user.outgoingDelegations);

    // 4. A cannot perform the delegated responsibilities.
    const aLeavesList = await call('GET', '/leaves', { token: aToken });
    check('4. A cannot use a delegated responsibility (leave list 403)', aLeavesList.status === 403, aLeavesList.status);
    const aEmployeesList = await call('GET', '/employees', { token: aToken });
    check('4b. Another delegated responsibility is suspended too (employee view 403)', aEmployeesList.status === 403, aEmployeesList.status);

    // 5. A keeps everything OUTSIDE the delegated role transfer.
    const aOwnLeave = await call('POST', '/leaves', {
        token: aToken,
        body: { leaveType: `FullRole Leave ${stamp}`, startDate: isoOffset(30), endDate: isoOffset(31), reason: 'Personal errand' }
    });
    check('5. A still performs non-delegable self-service (own leave request 201)', aOwnLeave.status === 201, aOwnLeave.data);
    const aOwnLeaveId = aOwnLeave.data.data._id;
    const aMyLeaves = await call('GET', '/leaves/me', { token: aToken });
    check('5b. A still sees their own records', aMyLeaves.status === 200, aMyLeaves.status);

    // 6-7. B logs in with their own account and receives the delegable set.
    const bLogin = await login(B.email);
    check('6. B logs in with their own account', bLogin.status === 200, bLogin.data);
    const bToken = bLogin.data.token;
    const bCaps = bLogin.data.user.capabilities || [];
    check('7. B receives A\'s delegable responsibilities (leave:view, leave:approve, request:approve, employee:view)',
        ['leave:view', 'leave:approve', 'request:approve', 'employee:view'].every(c => bCaps.includes(c)), bCaps);
    check('7b. B\'s intrinsic capabilities are untouched',
        !(bLogin.data.user.ownCapabilities || []).includes('leave:approve'), bLogin.data.user.ownCapabilities);
    check('7c. B\'s workspace lists the delegation ("Acting for" A)',
        (bLogin.data.user.activeDelegations || []).some(d => String(d.id) === String(delegationId) && /Anna/.test(d.delegatorName || '')),
        bLogin.data.user.activeDelegations);

    // 8. B opens the delegated pages.
    const bLeavesList = await call('GET', '/leaves', { token: bToken });
    check('8. B opens the delegated Leave Management data', bLeavesList.status === 200, bLeavesList.status);
    const bEmployeesList = await call('GET', '/employees', { token: bToken });
    check('8b. B opens the delegated Employee directory', bEmployeesList.status === 200, bEmployeesList.status);

    // 9. B performs a real delegated operation end-to-end.
    const cLeave = await call('POST', '/leaves', {
        token: C.token,
        body: { leaveType: `FullRole Leave ${stamp}`, startDate: isoOffset(20), endDate: isoOffset(21), reason: 'Family visit' }
    });
    check('C submits a leave request', cLeave.status === 201, cLeave.data);
    const cLeaveId = cLeave.data.data._id;
    const forward = await call('PUT', `/leaves/${cLeaveId}/process`, { token: X.token, body: { action: 'forward', note: 'ok' } });
    check('HR Expert forwards it', forward.status === 200, forward.data);
    const bApprove = await call('PUT', `/leaves/${cLeaveId}/status`, { token: bToken, body: { status: 'approved' } });
    check('9. B APPROVES the leave using the delegated authority', bApprove.status === 200, bApprove.data);
    const decided = await db.collection('leaves').findOne({ _id: new mongoose.Types.ObjectId(String(cLeaveId)) });
    check('9b. The approval is recorded under B\'s identity, not A\'s', String(decided.approvedBy) === String(B.userId), decided.approvedBy);

    // 10. Non-delegable responsibilities never transfer.
    check('10. B did NOT receive organization-ownership powers (org:team)', !bCaps.includes('org:team'), bCaps.filter(c => c.startsWith('org:')));
    const bRoleChange = await call('PUT', `/employees/${C.employeeId}/role`, { token: bToken, body: { role: 'hr_expert' } });
    check('10b. B cannot manage team roles (403 at the API)', bRoleChange.status === 403, bRoleChange.status);
    const bCancelAsLeave = await call('PUT', `/leaves/${aOwnLeaveId}/cancel`, { token: bToken });
    check('10c. B cannot act on A\'s PERSONAL records (cancel A\'s own leave request 403)', bCancelAsLeave.status === 403, bCancelAsLeave.data);

    // Also: an employer full_role grant still never hands over org powers.
    const orgDel = await call('POST', '/delegations', {
        token: employerToken,
        body: {
            delegate: B.userId, type: 'authority', title: 'Employer full role',
            description: 'x', startDate: isoOffset(-1), endDate: isoOffset(5), scopeType: 'full_role'
        }
    });
    check('Employer direct-grants a full_role delegation to B', orgDel.status === 201, orgDel.data);
    const orgDelId = orgDel.data.data._id;
    await call('PUT', `/delegations/${orgDelId}/respond`, { token: bToken, body: { action: 'accept' } });
    const bLoginOrg = await login(B.email);
    const bOrgCaps = bLoginOrg.data.user.capabilities || [];
    check('10d. Even the EMPLOYER\'s full_role never transfers org:manage/org:team/org:config',
        !bOrgCaps.includes('org:manage') && !bOrgCaps.includes('org:team') && !bOrgCaps.includes('org:config'),
        bOrgCaps.filter(c => c.startsWith('org:')));
    const bRoleChange2 = await call('PUT', `/employees/${C.employeeId}/role`, { token: bLoginOrg.data.token, body: { role: 'hr_expert' } });
    check('10e. B still cannot manage team roles under the employer grant', bRoleChange2.status === 403, bRoleChange2.status);
    // Retire the employer grant so the expiry checks below isolate A's delegation.
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(String(orgDelId)) },
        { $set: { startDate: dateOffset(-10), endDate: dateOffset(-2) } }
    );

    // 11-14. Delegation ends -> automatic reversal, roles untouched.
    section('Delegation end: automatic reversal');
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(String(delegationId)) },
        { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } }
    );

    const aAfter = await call('GET', '/leaves', { token: aToken });
    check('11. A\'s responsibilities restore automatically (leave list 200)', aAfter.status === 200, aAfter.status);
    const aEmployeesAfter = await call('GET', '/employees', { token: aToken });
    check('11b. All of A\'s suspended responsibilities are back', aEmployeesAfter.status === 200, aEmployeesAfter.status);

    const bAfter = await call('GET', '/leaves', { token: bToken });
    check('12. B loses the delegated responsibilities automatically', bAfter.status === 403, bAfter.status);

    const aFinal = await call('GET', '/auth/me', { token: aToken });
    check('13. A\'s permanent role never changed (hr_manager)', aFinal.data.user.role === 'hr_manager', aFinal.data.user.role);
    const bFinal = await call('GET', '/auth/me', { token: bToken });
    check('14. B\'s permanent role never changed (employee)', bFinal.data.user.role === 'employee', bFinal.data.user.role);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self-test crashed:', error);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
