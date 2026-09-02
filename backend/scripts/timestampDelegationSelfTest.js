/**
 * Timestamp-precision check of the delegation window (time-of-day support).
 *
 * The engine evaluates `startDate <= now <= endDate` per request with full
 * timestamp precision and no scheduler. This proves the exact-boundary
 * behavior end-to-end via the real APIs, manipulating the stored window
 * around "now" (the only way to test instants without waiting hours):
 *
 *   before startAt          -> no delegated authority
 *   at startAt              -> delegated authority active
 *   inside the window       -> active (delegator suspended)
 *   at/after endAt          -> inactive on the very next request,
 *                              including for an already-signed-in delegate
 *
 * Also verifies the new validation (startAt < endAt strictly, ISO-8601
 * accepted), full-role at timestamp precision, immediate revoke, unchanged
 * delegate-own permissions, and that delegation and the leave block remain
 * fully independent mechanisms.
 *
 * Fully self-contained - creates a throwaway organization and staff and
 * removes them again at the end.
 *
 * Usage: node scripts/timestampDelegationSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'TimestampTest123!';

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
/** An instant `s` seconds from now, as a Date (for DB) . */
const secOffset = (s) => new Date(Date.now() + s * 1000);

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

(async () => {
    console.log(`Testing ${API}`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    // ---- Setup ------------------------------------------------------------
    const employerEmail = `ts-emp-${stamp}@example.com`;
    extraEmails.push(employerEmail);
    const reg = await call('POST', '/auth/register', {
        body: { name: 'Timestamp Employer', email: employerEmail, password: PASSWORD, role: 'employer' }
    });
    check('Employer registers', reg.status === 201, reg.data);
    employerId = new mongoose.Types.ObjectId(reg.data.organization._id);
    await db.collection('employers').updateOne({ _id: employerId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerToken = (await login(employerEmail)).data.token;

    const makeStaff = async ({ firstName, email, role }) => {
        extraEmails.push(email);
        const rec = await call('POST', '/employees', {
            token: employerToken,
            body: { personalInfo: { firstName, lastName: 'T' }, contactInfo: { email } }
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

    const A = await makeStaff({ firstName: 'Anna', email: `ts-A-${stamp}@example.com`, role: 'hr_manager' });
    const B = await makeStaff({ firstName: 'Bekele', email: `ts-B-${stamp}@example.com`, role: 'employee' });

    const setWindow = async (id, startAt, endAt) => db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(String(id)) },
        { $set: { startDate: startAt, endDate: endAt } }
    );

    // ======================================================================
    section('Validation: strict startAt < endAt, ISO-8601 accepted');
    // ======================================================================
    const sameInstant = secOffset(3600).toISOString();
    const equalRes = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority', title: 'Zero-length window',
            description: 'x', startDate: sameInstant, endDate: sameInstant,
            scopeType: 'specific', scopedCapabilities: ['leave:view']
        }
    });
    check('6. startAt === endAt is rejected (400)', equalRes.status === 400, equalRes.data);

    const reversedRes = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority', title: 'Reversed window',
            description: 'x', startDate: secOffset(7200).toISOString(), endDate: secOffset(3600).toISOString(),
            scopeType: 'specific', scopedCapabilities: ['leave:view']
        }
    });
    check('7. endAt < startAt is rejected (400)', reversedRes.status === 400, reversedRes.data);

    const pastEnd = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority', title: 'Already over',
            description: 'x', startDate: secOffset(-7200).toISOString(), endDate: secOffset(-3600).toISOString(),
            scopeType: 'specific', scopedCapabilities: ['leave:view']
        }
    });
    check('An already-passed end time is still rejected (400)', pastEnd.status === 400, pastEnd.data);

    // ======================================================================
    section('Exact window boundaries (specific delegation of leave:view)');
    // ======================================================================
    // Created with ISO timestamps: starts in 60s, ends in ~1h.
    const create = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority', title: 'Timed leave-view cover',
            description: 'Exact window test', startDate: secOffset(60).toISOString(), endDate: secOffset(3660).toISOString(),
            scopeType: 'specific', scopedCapabilities: ['leave:view']
        }
    });
    check('ISO-8601 timestamps are accepted on create', create.status === 201, create.data);
    const delId = create.data.data._id;
    const accept = await call('PUT', `/delegations/${delId}/respond`, { token: B.token, body: { action: 'accept' } });
    check('B accepts a future-start window -> scheduled', accept.status === 200 && accept.data.data.status === 'scheduled', accept.data);

    // 1. One minute before startAt.
    const before = await call('GET', '/leaves', { token: B.token });
    check('1. One minute BEFORE startAt: B has no delegated authority (403)', before.status === 403, before.status);
    const aBefore = await call('GET', '/leaves', { token: A.token });
    check('1b. Before startAt A is NOT suspended (200)', aBefore.status === 200, aBefore.status);

    // 2. Exactly at startAt (window opens this instant).
    await setWindow(delId, secOffset(0), secOffset(3600));
    const atStart = await call('GET', '/leaves', { token: B.token });
    check('2. AT startAt: delegated authority is active (200)', atStart.status === 200, atStart.status);

    // 3. During the window.
    await setWindow(delId, secOffset(-1800), secOffset(1800));
    const during = await call('GET', '/leaves', { token: B.token });
    check('3. DURING the window: still active (200)', during.status === 200, during.status);

    // 9. A's delegated responsibility is suspended for exactly the same window.
    const aDuring = await call('GET', '/leaves', { token: A.token });
    check('9. DURING the window: A is suspended from the delegated responsibility (403)', aDuring.status === 403, aDuring.status);

    // 8. B's own permissions are untouched throughout.
    const bOwn = await call('GET', '/requests/me', { token: B.token });
    check('8. B\'s normal permissions unchanged (own requests 200)', bOwn.status === 200, bOwn.status);
    const bMe = await call('GET', '/auth/me', { token: B.token });
    check('8b. B\'s intrinsic capabilities never include the delegated one',
        !(bMe.data.user.ownCapabilities || []).includes('leave:view')
        && (bMe.data.user.capabilities || []).includes('leave:view'),
        bMe.data.user.ownCapabilities);
    check('8c. B\'s permanent role is unchanged', bMe.data.user.role === 'employee', bMe.data.user.role);

    // 4. Exactly at endAt: B is ALREADY signed in (same token used all along);
    //    the very next protected request after the instant passes is refused.
    await setWindow(delId, secOffset(-3600), secOffset(0));
    const atEnd = await call('GET', '/leaves', { token: B.token });
    check('4. AT endAt: the next request already refuses the authority (403)', atEnd.status === 403, atEnd.status);

    // 5. One minute after endAt.
    await setWindow(delId, secOffset(-3660), secOffset(-60));
    const after = await call('GET', '/leaves', { token: B.token });
    check('5. One minute AFTER endAt: inactive (403)', after.status === 403, after.status);
    check('5b. Signed-in delegate crossing expiry loses access with the SAME token', after.status === 403, after.status);
    const aAfter = await call('GET', '/leaves', { token: A.token });
    check('5c. A\'s suspended responsibility returns the moment the window closes (200)', aAfter.status === 200, aAfter.status);

    // ======================================================================
    section('11. Revoke removes authority immediately');
    // ======================================================================
    await setWindow(delId, secOffset(-1800), secOffset(1800));
    const reactivated = await call('GET', '/leaves', { token: B.token });
    check('Window reopened: B active again (200)', reactivated.status === 200, reactivated.status);
    const revoke = await call('PUT', `/delegations/${delId}/status`, { token: A.token, body: { status: 'revoked', notes: 'Back early' } });
    check('A revokes the active delegation', revoke.status === 200, revoke.data);
    const afterRevoke = await call('GET', '/leaves', { token: B.token });
    check('11. Revoke: B\'s authority is gone on the very next request (403)', afterRevoke.status === 403, afterRevoke.status);
    const aAfterRevoke = await call('GET', '/leaves', { token: A.token });
    check('11b. Revoke: A restored immediately (200)', aAfterRevoke.status === 200, aAfterRevoke.status);

    // ======================================================================
    section('10. Full-role delegation at timestamp precision');
    // ======================================================================
    const fullRole = await call('POST', '/delegations', {
        token: A.token,
        body: {
            delegate: B.userId, type: 'authority', title: 'Timed full-role cover',
            description: 'x', startDate: secOffset(60).toISOString(), endDate: secOffset(3660).toISOString(),
            scopeType: 'full_role'
        }
    });
    check('Full-role delegation created with ISO timestamps', fullRole.status === 201, fullRole.data);
    const frId = fullRole.data.data._id;
    await call('PUT', `/delegations/${frId}/respond`, { token: B.token, body: { action: 'accept' } });

    const frBefore = await call('GET', '/employees', { token: B.token });
    check('Full-role BEFORE startAt: no authority (403)', frBefore.status === 403, frBefore.status);
    await setWindow(frId, secOffset(-60), secOffset(3600));
    const frDuring = await call('GET', '/employees', { token: B.token });
    check('10. Full-role DURING the window: delegable authority active (200)', frDuring.status === 200, frDuring.status);
    await setWindow(frId, secOffset(-3660), secOffset(-1));
    const frAfter = await call('GET', '/employees', { token: B.token });
    check('Full-role AFTER endAt: authority gone on the next request (403)', frAfter.status === 403, frAfter.status);
    const frADuringRestore = await call('GET', '/employees', { token: A.token });
    check('A\'s full-role responsibilities restored after the window (200)', frADuringRestore.status === 200, frADuringRestore.status);

    // ======================================================================
    section('12. Delegation and the leave block stay independent');
    // ======================================================================
    // An ACTIVE delegation alone must never block the delegator's account.
    await setWindow(frId, secOffset(-1800), secOffset(1800));
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(String(frId)) }, { $set: { status: 'active' } }
    );
    const aLoginActiveDeleg = await login(A.email);
    check('12. Active delegation does NOT block A\'s login', aLoginActiveDeleg.status === 200, aLoginActiveDeleg.data.code);
    check('12b. No ON_LEAVE_ACCESS_BLOCKED without leave', aLoginActiveDeleg.data.code === undefined, aLoginActiveDeleg.data.code);

    // Only an approved leave covering today triggers the whole-system block.
    const aEmployeeDoc = await db.collection('employees').findOne({ _id: new mongoose.Types.ObjectId(String(A.employeeId)) });
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(); dayEnd.setHours(0, 0, 0, 0); dayEnd.setDate(dayEnd.getDate() + 2);
    const leave = await db.collection('leaves').insertOne({
        employee: aEmployeeDoc._id, employer: employerId, leaveTypeName: 'Annual Leave',
        startDate: dayStart, endDate: dayEnd, totalDays: 3, reason: 'Leave block independence',
        status: 'approved', auditTrail: [], createdAt: new Date()
    });
    const aLoginOnLeave = await login(A.email);
    check('12c. Approved leave still blocks A entirely (independent mechanism)',
        aLoginOnLeave.status === 403 && aLoginOnLeave.data.code === 'ON_LEAVE_ACCESS_BLOCKED', aLoginOnLeave.data);
    const bDuringLeave = await call('GET', '/employees', { token: B.token });
    check('12d. B keeps performing the timed delegated work during A\'s leave (200)', bDuringLeave.status === 200, bDuringLeave.status);
    await db.collection('leaves').deleteOne({ _id: leave.insertedId });
    const aLoginAfterLeave = await login(A.email);
    check('12e. Leave record gone -> A\'s access back, delegation still just a delegation', aLoginAfterLeave.status === 200, aLoginAfterLeave.data.code);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self-test crashed:', error);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
