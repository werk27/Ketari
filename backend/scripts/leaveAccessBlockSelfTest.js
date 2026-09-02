/**
 * End-to-end check of the leave-based work-access block (delegation spec item
 * 1/12/13): an employee whose leave is APPROVED and covers today must be
 * blocked from the whole work system (login rejected, existing token
 * rejected on every subsequent request) - but only for the duration of that
 * leave, automatically, with no account/role/permission change and no manual
 * restoration step. Pending/rejected/cancelled leave must never block access.
 *
 * Fully self-contained - creates its own throwaway organization, staff and
 * leave records, and removes them all again at the end.
 *
 * Usage: node scripts/leaveAccessBlockSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'LeaveBlockTest123!';

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

const login = async (email, password) => call('POST', '/auth/login', { body: { email, password } });

const emails = [];
const extraEmails = [];
let employerId = null;

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const allEmails = [...emails, ...extraEmails];
    const users = await db.collection('users').find({ email: { $in: allEmails } }).toArray();
    const userIds = users.map(u => u._id);

    if (employerId) {
        await db.collection('leaves').deleteMany({ employer: employerId });
        await db.collection('employees').deleteMany({ employer: employerId });
        await db.collection('configurations').deleteMany({ employer: employerId });
        await db.collection('delegations').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    const employerEmail = `leaveblock-emp-${stamp}@example.com`;
    emails.push(employerEmail);
    const empRes = await call('POST', '/auth/register', {
        body: { name: 'LeaveBlock Employer', email: employerEmail, password: PASSWORD, role: 'employer' }
    });
    check('Employer registers', empRes.status === 201, empRes);
    employerId = new mongoose.Types.ObjectId(empRes.data.organization._id);
    await db.collection('employers').updateOne({ _id: employerId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerTokenRes = await login(employerEmail, PASSWORD);
    const employerToken = employerTokenRes.data.token;

    // ---- Employee A: the person who will go on leave ----------------------
    const aEmail = `leaveblock-a-${stamp}@example.com`;
    extraEmails.push(aEmail);
    const aEmpRes = await call('POST', '/employees', {
        token: employerToken,
        body: { personalInfo: { firstName: 'A', lastName: 'Delegator' }, contactInfo: { email: aEmail } }
    });
    check('Employee A recorded', aEmpRes.status === 201, aEmpRes);
    const aEmployeeId = aEmpRes.data.data._id;
    await call('POST', `/employees/${aEmployeeId}/account`, { token: employerToken, body: { email: aEmail, password: PASSWORD, role: 'employee' } });
    const aLoginBefore = await login(aEmail, PASSWORD);
    check('BEFORE LEAVE: A can log in normally', aLoginBefore.status === 200, aLoginBefore);
    const aToken = aLoginBefore.data.token;
    const aUserId = new mongoose.Types.ObjectId(aLoginBefore.data.user._id);

    const aMeBefore = await call('GET', '/auth/me', { token: aToken });
    check('BEFORE LEAVE: A can use the API normally', aMeBefore.status === 200, aMeBefore);

    // ---- A leave-type configuration + a raw Leave document -----------------
    const employeeDoc = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(aEmployeeId) });

    const dateOffset = (n) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + n);
        return d;
    };

    // Case 1: a PENDING leave covering today must NOT block access.
    const pendingLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: dateOffset(-2),
        endDate: dateOffset(5),
        totalDays: 8,
        reason: 'Pending leave - must not block',
        status: 'pending',
        auditTrail: [],
        createdAt: new Date()
    });
    const pendingLoginCheck = await login(aEmail, PASSWORD);
    check('PENDING leave does NOT block login', pendingLoginCheck.status === 200, pendingLoginCheck.data);
    await db.collection('leaves').deleteOne({ _id: pendingLeave.insertedId });

    // Case 2: a REJECTED leave covering today must NOT block access.
    const rejectedLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: dateOffset(-2),
        endDate: dateOffset(5),
        totalDays: 8,
        reason: 'Rejected leave - must not block',
        status: 'rejected',
        auditTrail: [],
        createdAt: new Date()
    });
    const rejectedLoginCheck = await login(aEmail, PASSWORD);
    check('REJECTED leave does NOT block login', rejectedLoginCheck.status === 200, rejectedLoginCheck.data);
    await db.collection('leaves').deleteOne({ _id: rejectedLeave.insertedId });

    // Case 3: BEFORE the approved leave's start date - must NOT block yet.
    const futureLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: dateOffset(5),
        endDate: dateOffset(14),
        totalDays: 10,
        reason: 'Future approved leave',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });
    const beforeStartCheck = await login(aEmail, PASSWORD);
    check('APPROVED leave BEFORE its start date does NOT block login', beforeStartCheck.status === 200, beforeStartCheck.data);

    // Case 4: move the SAME leave into its active window (simulates the start
    // date arriving) - login and an already-issued token must now be blocked.
    await db.collection('leaves').updateOne(
        { _id: futureLeave.insertedId },
        { $set: { startDate: dateOffset(-2), endDate: dateOffset(5) } }
    );
    const duringLeaveLogin = await login(aEmail, PASSWORD);
    check('DURING LEAVE: login is blocked (403)', duringLeaveLogin.status === 403, duringLeaveLogin.data);
    check('DURING LEAVE: error code is ON_LEAVE_ACCESS_BLOCKED', duringLeaveLogin.data.code === 'ON_LEAVE_ACCESS_BLOCKED', duringLeaveLogin.data);
    check('DURING LEAVE: message mentions the return date', /return date/i.test(duringLeaveLogin.data.message || ''), duringLeaveLogin.data);
    // The return date is the day AFTER the leave ends (leave Sept 5-14 ->
    // return Sept 15), never the last leave day itself.
    const expectedReturn = new Date(dateOffset(5)); expectedReturn.setDate(expectedReturn.getDate() + 1);
    check('DURING LEAVE: returnDate is the day AFTER the leave end date',
        duringLeaveLogin.data.returnDate
        && new Date(duringLeaveLogin.data.returnDate).toDateString() === expectedReturn.toDateString(),
        duringLeaveLogin.data.returnDate);

    // An ALREADY-ISSUED token (obtained before the leave started) must also
    // stop working now - the block is enforced per-request, not just at login.
    const duringLeaveMe = await call('GET', '/auth/me', { token: aToken });
    check('DURING LEAVE: a pre-existing token is rejected on the next request', duringLeaveMe.status === 403, duringLeaveMe.data);
    check('DURING LEAVE: pre-existing token rejection also carries the leave-block code', duringLeaveMe.data.code === 'ON_LEAVE_ACCESS_BLOCKED', duringLeaveMe.data);

    // The account itself must remain untouched: still 'active' status, still
    // role 'employee', password unchanged, not soft-deleted.
    const userDoc = await db.collection('users').findOne({ _id: aUserId });
    check('ACCOUNT UNCHANGED: status is still active (never disabled)', userDoc.status !== 'inactive', userDoc.status);
    check('ACCOUNT UNCHANGED: role is still employee', userDoc.role === 'employee', userDoc.role);

    // Case 5: the return date passes - access must resume automatically, no
    // manual restore step (simulate by moving the window to the past).
    await db.collection('leaves').updateOne(
        { _id: futureLeave.insertedId },
        { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } }
    );
    const afterReturnLogin = await login(aEmail, PASSWORD);
    check('RETURN DATE: A can log in again automatically', afterReturnLogin.status === 200, afterReturnLogin.data);
    const afterReturnMe = await call('GET', '/auth/me', { token: aToken });
    check('RETURN DATE: the pre-existing token works again automatically', afterReturnMe.status === 200, afterReturnMe.data);

    await db.collection('leaves').deleteOne({ _id: futureLeave.insertedId });

    // Case 6 (REGRESSION - timezone/day boundary): real leaves submitted as
    // 'YYYY-MM-DD' are stored at midnight UTC, while the server clock may be
    // hours ahead (e.g. UTC+3). Comparing against the exact instant `now`
    // used to unblock the delegator at 03:00 of the LAST leave day and not
    // block them before 03:00 of the FIRST. The block must be day-granular:
    // a leave ENDING today (stored as today 00:00 UTC) blocks ALL of today.
    // NOTE: 'today' must come from LOCAL date components - toISOString()
    // flips to the previous calendar day between local midnight and the
    // UTC-offset hour, which is exactly the trap this case guards against.
    const localYmd = (n) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        const p = (x) => String(x).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const utcMidnight = (n) => new Date(`${localYmd(n)}T00:00:00.000Z`);
    const endsTodayLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: utcMidnight(-3),
        endDate: utcMidnight(0),
        totalDays: 4,
        reason: 'UTC-midnight boundary: last leave day is today',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });
    const lastDayLogin = await login(aEmail, PASSWORD);
    check('BOUNDARY: a leave ENDING today (UTC-midnight dates) still blocks the whole last day',
        lastDayLogin.status === 403 && lastDayLogin.data.code === 'ON_LEAVE_ACCESS_BLOCKED', lastDayLogin.data);
    check('BOUNDARY: the reported return date is tomorrow (the day after the last leave day)',
        lastDayLogin.data.returnDate
        && new Date(lastDayLogin.data.returnDate).toDateString() === new Date(dateOffset(1)).toDateString(),
        lastDayLogin.data.returnDate);
    await db.collection('leaves').deleteOne({ _id: endsTodayLeave.insertedId });

    const startsTodayLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: utcMidnight(0),
        endDate: utcMidnight(3),
        totalDays: 4,
        reason: 'UTC-midnight boundary: first leave day is today',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });
    const firstDayLogin = await login(aEmail, PASSWORD);
    check('BOUNDARY: a leave STARTING today (UTC-midnight dates) blocks from the first day',
        firstDayLogin.status === 403 && firstDayLogin.data.code === 'ON_LEAVE_ACCESS_BLOCKED', firstDayLogin.data);
    await db.collection('leaves').deleteOne({ _id: startsTodayLeave.insertedId });

    // A leave that ended YESTERDAY (UTC midnight) must NOT block today.
    const endedYesterdayLeave = await db.collection('leaves').insertOne({
        employee: employeeDoc._id,
        employer: employerId,
        leaveTypeName: 'Annual Leave',
        startDate: utcMidnight(-5),
        endDate: utcMidnight(-1),
        totalDays: 5,
        reason: 'Ended yesterday - today is the return day',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });
    const returnDayLogin = await login(aEmail, PASSWORD);
    check('BOUNDARY: a leave that ended YESTERDAY does not block the return day', returnDayLogin.status === 200, returnDayLogin.data);
    await db.collection('leaves').deleteOne({ _id: endedYesterdayLeave.insertedId });
    // decisions to B (employee) and goes on approved leave. B performs the
    // delegated work through B's OWN account while A is blocked entirely;
    // on the return date A is restored and B's authority ends, automatically.
    // =======================================================================
    console.log('\n-- Section 2: A delegates to B, goes on leave, returns --');

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
        const loginRes = await login(email, PASSWORD);
        return { employeeId, token: loginRes.data.token, userId: loginRes.data.user._id, email };
    };

    const A = await makeStaff({ firstName: 'Alpha', lastName: 'Manager', email: `leaveblock-A2-${stamp}@example.com`, role: 'hr_manager' });
    const B = await makeStaff({ firstName: 'Beta', lastName: 'Delegate', email: `leaveblock-B-${stamp}@example.com`, role: 'employee' });
    const C = await makeStaff({ firstName: 'Gamma', lastName: 'Requester', email: `leaveblock-C-${stamp}@example.com`, role: 'employee' });
    const X = await makeStaff({ firstName: 'Xavier', lastName: 'Expert', email: `leaveblock-X-${stamp}@example.com`, role: 'hr_expert' });

    await call('POST', '/config/leave-types', {
        token: employerToken,
        body: { name: `Block Test Leave ${stamp}`, daysPerYear: 10, paid: true, requiresAttachment: false }
    });

    // 1-2. Before any delegation: A works, B has no delegated authority.
    const aLeavesBaseline = await call('GET', '/leaves', { token: A.token });
    check('BEFORE DELEGATION: A (HR Manager) can list leaves', aLeavesBaseline.status === 200, aLeavesBaseline.data);
    const bLeavesBaseline = await call('GET', '/leaves', { token: B.token });
    check('BEFORE DELEGATION: B (employee) cannot list leaves (403)', bLeavesBaseline.status === 403, bLeavesBaseline.data);

    // A direct-grants leave viewing + deciding to B for the leave window.
    // Local calendar date (YYYY-MM-DD): toISOString() would flip to the
    // previous day between local midnight and the UTC-offset hour.
    const isoOffset = (n) => localYmd(n);
    const createDelegation = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId,
            type: 'authority',
            title: 'Leave decisions while on annual leave',
            description: 'Covering my leave approvals during my leave.',
            startDate: isoOffset(-1),
            endDate: isoOffset(5),
            scopeType: 'specific',
            scopedCapabilities: ['leave:view', 'leave:approve']
        }
    });
    check('A creates a specific delegation to B (direct grant)', createDelegation.status === 201, createDelegation.data);
    const delegationId = createDelegation.data.data._id;
    check('Delegation awaits acceptance (not active yet)', createDelegation.data.data.status === 'approved_pending_acceptance', createDelegation.data.data.status);

    const bBeforeAccept = await call('GET', '/leaves', { token: B.token });
    check('BEFORE ACCEPTANCE: B still has no delegated authority', bBeforeAccept.status === 403, bBeforeAccept.data);

    const acceptRes = await call('PUT', `/delegations/${delegationId}/respond`, { token: B.token, body: { action: 'accept' } });
    check('B accepts -> delegation active', acceptRes.status === 200 && acceptRes.data.data.status === 'active', acceptRes.data);

    // A goes on approved leave covering today (uses the EXISTING Leave data).
    const aEmployeeDoc = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(A.employeeId) });
    const aLeave = await db.collection('leaves').insertOne({
        employee: aEmployeeDoc._id,
        employer: employerId,
        leaveTypeName: `Block Test Leave ${stamp}`,
        startDate: dateOffset(-1),
        endDate: dateOffset(5),
        totalDays: 7,
        reason: 'Annual leave with delegation to B',
        status: 'approved',
        auditTrail: [],
        createdAt: new Date()
    });

    // 5/10. A is blocked from the work system during leave.
    const aLoginDuring = await login(A.email, PASSWORD);
    check('DURING LEAVE: A cannot log in (403 leave block)', aLoginDuring.status === 403 && aLoginDuring.data.code === 'ON_LEAVE_ACCESS_BLOCKED', aLoginDuring.data);
    const aApiDuring = await call('GET', '/leaves', { token: A.token });
    check('DURING LEAVE: A\'s existing token is rejected everywhere', aApiDuring.status === 403 && aApiDuring.data.code === 'ON_LEAVE_ACCESS_BLOCKED', aApiDuring.data);

    // 6. B logs in normally with B's OWN account.
    const bLoginDuring = await login(B.email, PASSWORD);
    check('DURING LEAVE: B logs in normally with their own account', bLoginDuring.status === 200, bLoginDuring.data);
    const bDuringToken = bLoginDuring.data.token;
    check('B\'s permanent role is still employee (nothing copied from A)', bLoginDuring.data.user.role === 'employee', bLoginDuring.data.user.role);
    const banner = (bLoginDuring.data.user.activeDelegations || []).find(d => String(d.id) === String(delegationId));
    check('B\'s workspace shows the "Acting for" banner data with A\'s name', !!banner && /Alpha/.test(banner.delegatorName || ''), bLoginDuring.data.user.activeDelegations);
    check('B\'s effective capabilities include the delegated ones', (bLoginDuring.data.user.capabilities || []).includes('leave:approve'), bLoginDuring.data.user.capabilities);
    check('B\'s intrinsic capabilities are unchanged', !(bLoginDuring.data.user.ownCapabilities || []).includes('leave:approve'), bLoginDuring.data.user.ownCapabilities);

    // 7. B opens the delegated page's data through the backend API.
    const bLeavesDuring = await call('GET', '/leaves', { token: bDuringToken });
    check('DURING LEAVE: B can open the delegated leave list', bLeavesDuring.status === 200, bLeavesDuring.data);

    // 8. B performs a delegated ACTION: decide a leave request end-to-end.
    const cLeaveReq = await call('POST', '/leaves', {
        token: C.token,
        body: { leaveType: `Block Test Leave ${stamp}`, startDate: isoOffset(20), endDate: isoOffset(21), reason: 'Family visit' }
    });
    check('C submits a leave request', cLeaveReq.status === 201, cLeaveReq.data);
    const cLeaveId = cLeaveReq.data.data._id;
    const forwardRes = await call('PUT', `/leaves/${cLeaveId}/process`, { token: X.token, body: { action: 'forward', note: 'Checks out' } });
    check('HR Expert forwards it for decision', forwardRes.status === 200, forwardRes.data);
    const bApprove = await call('PUT', `/leaves/${cLeaveId}/status`, { token: bDuringToken, body: { status: 'approved' } });
    check('DURING LEAVE: B performs the delegated APPROVE action', bApprove.status === 200, bApprove.data);

    // 10 (audit). The decision is recorded under B's identity, never A's.
    const decidedLeave = await db.collection('leaves').findOne({ _id: new mongoose.Types.ObjectId(cLeaveId) });
    check('AUDIT: approvedBy is B, the actual actor', String(decidedLeave.approvedBy) === String(B.userId), decidedLeave.approvedBy);
    check('AUDIT: the decision is never attributed to A', String(decidedLeave.approvedBy) !== String(A.userId), decidedLeave.approvedBy);

    // 9. B cannot touch authority that was never delegated.
    const bEmployees = await call('GET', '/employees', { token: bDuringToken });
    check('B cannot access non-delegated authority (employee directory 403)', bEmployees.status === 403, bEmployees.status);
    const bDelegationCreate = await call('POST', '/delegations', {
        token: bDuringToken,
        body: {
            delegate: C.userId, type: 'authority', title: 'Chain attempt', description: 'x',
            startDate: isoOffset(0), endDate: isoOffset(2), scopeType: 'specific', scopedCapabilities: ['leave:approve']
        }
    });
    check('B cannot re-delegate the borrowed authority (no chaining)', bDelegationCreate.status === 400 || bDelegationCreate.status === 403, bDelegationCreate.data);

    // 11-13. Return date: everything reverts automatically. Simulate the
    // dates passing by moving both windows into the past - the exact same
    // records, no status/account change of any kind.
    await db.collection('leaves').updateOne({ _id: aLeave.insertedId }, { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } });
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(delegationId) },
        { $set: { startDate: dateOffset(-10), endDate: dateOffset(-1) } }
    );

    const aLoginAfter = await login(A.email, PASSWORD);
    check('RETURN DATE: A logs in again automatically', aLoginAfter.status === 200, aLoginAfter.data);
    const aLeavesAfter = await call('GET', '/leaves', { token: aLoginAfter.data.token });
    check('RETURN DATE: A\'s delegated-away authority is restored automatically', aLeavesAfter.status === 200, aLeavesAfter.data);
    const bLeavesAfter = await call('GET', '/leaves', { token: bDuringToken });
    check('RETURN DATE: B loses the delegated authority automatically', bLeavesAfter.status === 403, bLeavesAfter.data);

    // Self-delegation and revocation guards still hold in this flow.
    const selfDelegation = await call('POST', '/delegations', {
        token: aLoginAfter.data.token,
        body: {
            delegate: A.userId, type: 'authority', title: 'Self', description: 'x',
            startDate: isoOffset(1), endDate: isoOffset(2), scopeType: 'specific', scopedCapabilities: ['leave:approve']
        }
    });
    check('Self-delegation is rejected', selfDelegation.status === 400, selfDelegation.data);

    await db.collection('leaves').deleteOne({ _id: aLeave.insertedId });

    // =======================================================================
    // Section 3: END-TO-END through the real API - no hand-crafted dates.
    // C submits a leave starting TODAY as 'YYYY-MM-DD' (stored midnight UTC,
    // exactly as production writes it), HR Expert forwards, HR Manager
    // approves - from that moment C must be blocked, with the return date
    // reported as the day after the leave ends.
    // =======================================================================
    console.log('\n-- Section 3: leave created via the real API workflow --');

    const cLeaveReq2 = await call('POST', '/leaves', {
        token: C.token,
        body: { leaveType: `Block Test Leave ${stamp}`, startDate: isoOffset(0), endDate: isoOffset(2), reason: 'Starts today' }
    });
    check('C submits a leave starting today via the API', cLeaveReq2.status === 201, cLeaveReq2.data);
    const cLeaveId2 = cLeaveReq2.data.data._id;

    const cStillWorks = await call('GET', '/auth/me', { token: C.token });
    check('PENDING: C still has full access while the request awaits approval', cStillWorks.status === 200, cStillWorks.status);

    await call('PUT', `/leaves/${cLeaveId2}/process`, { token: X.token, body: { action: 'forward', note: 'ok' } });
    const approveC = await call('PUT', `/leaves/${cLeaveId2}/status`, { token: aLoginAfter.data.token, body: { status: 'approved' } });
    check('HR Manager approves it through the API', approveC.status === 200, approveC.data);

    const cLoginBlocked = await login(C.email, PASSWORD);
    check('E2E: C is blocked at login the moment the approval lands',
        cLoginBlocked.status === 403 && cLoginBlocked.data.code === 'ON_LEAVE_ACCESS_BLOCKED', cLoginBlocked.data);
    const cTokenBlocked = await call('GET', '/auth/me', { token: C.token });
    check('E2E: C\'s pre-existing token is rejected (refresh cannot bypass)',
        cTokenBlocked.status === 403 && cTokenBlocked.data.code === 'ON_LEAVE_ACCESS_BLOCKED', cTokenBlocked.data);
    const expectedCReturn = new Date(dateOffset(3));
    check('E2E: the reported return date is the day after the leave ends',
        cLoginBlocked.data.returnDate
        && new Date(cLoginBlocked.data.returnDate).toDateString() === expectedCReturn.toDateString(),
        cLoginBlocked.data.returnDate);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self-test crashed:', error);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
