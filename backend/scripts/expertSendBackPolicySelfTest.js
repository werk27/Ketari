/**
 * Policy check: the HR Expert's ONLY correction action everywhere is
 * "Send Back / Return for Correction" - terminal Reject is reserved for
 * the HR Manager.
 *
 * Covers the two modules changed to enforce this:
 *  - Delegation: the Expert review no longer accepts action 'reject';
 *  - Employee Requests: a new Send Back (return) + resubmit flow, with the
 *    Manager keeping the only terminal reject.
 * (Leave and Job Requisition already followed the rule; their own suites
 * cover them.)
 *
 * Fully self-contained - creates a throwaway organization/staff and removes
 * them again at the end.
 *
 * Usage: node scripts/expertSendBackPolicySelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'SendBackTest123!';

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
const isoOffset = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

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
        for (const coll of ['employeerequests', 'employees', 'configurations', 'delegations', 'notifications', 'employers']) {
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
    const employerEmail = `sendback-emp-${stamp}@example.com`;
    extraEmails.push(employerEmail);
    const reg = await call('POST', '/auth/register', {
        body: { name: 'SendBack Employer', email: employerEmail, password: PASSWORD, role: 'employer' }
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

    const emp = await makeStaff({ firstName: 'Emma', lastName: 'Employee', email: `sendback-e-${stamp}@example.com`, role: 'employee' });
    const emp2 = await makeStaff({ firstName: 'Eyob', lastName: 'Colleague', email: `sendback-e2-${stamp}@example.com`, role: 'employee' });
    const expert = await makeStaff({ firstName: 'Xena', lastName: 'Expert', email: `sendback-x-${stamp}@example.com`, role: 'hr_expert' });
    const manager = await makeStaff({ firstName: 'Mina', lastName: 'Manager', email: `sendback-m-${stamp}@example.com`, role: 'hr_manager' });

    // ======================================================================
    section('Delegation: HR Expert can Send Back but never Reject');
    // ======================================================================
    const delReq = await call('POST', '/delegations', {
        token: emp.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Sendback policy test',
            description: 'Cover my requisitions.', startDate: isoOffset(1), endDate: isoOffset(5),
            scopeType: 'specific', scopedCapabilities: ['requisition:create']
        }
    });
    check('Employee submits a delegation request', delReq.status === 201, delReq.data);
    const delId = delReq.data.data._id;

    const expertReject = await call('PUT', `/delegations/${delId}/review`, {
        token: expert.token, body: { action: 'reject', comment: 'I reject this' }
    });
    check('POLICY: Expert action "reject" is refused (400)', expertReject.status === 400, expertReject.data);
    check('POLICY: the error explains reject is the HR Manager\'s',
        /HR Manager/i.test(expertReject.data.message || ''), expertReject.data.message);

    const stillPending = await db.collection('delegations').findOne({ _id: new mongoose.Types.ObjectId(String(delId)) });
    check('The request is untouched by the refused reject', stillPending.status === 'pending_hr_expert_review', stillPending.status);

    const expertReturn = await call('PUT', `/delegations/${delId}/review`, {
        token: expert.token, body: { action: 'return', comment: 'Please shorten the period' }
    });
    check('Expert CAN send back for correction', expertReturn.status === 200 && expertReturn.data.data.status === 'returned_for_correction', expertReturn.data);

    const resubmit = await call('PUT', `/delegations/${delId}`, {
        token: emp.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Sendback policy test',
            description: 'Cover my requisitions.', startDate: isoOffset(1), endDate: isoOffset(3),
            scopeType: 'specific', scopedCapabilities: ['requisition:create']
        }
    });
    check('Requester corrects and resubmits', resubmit.status === 200 && resubmit.data.data.status === 'pending_hr_expert_review', resubmit.data);

    await call('PUT', `/delegations/${delId}/review`, { token: expert.token, body: { action: 'validate' } });
    const mgrReject = await call('PUT', `/delegations/${delId}/decision`, {
        token: manager.token, body: { action: 'reject', comment: 'Not needed' }
    });
    check('HR Manager keeps the terminal reject', mgrReject.status === 200 && mgrReject.data.data.status === 'rejected_by_hr_manager', mgrReject.data);

    // ======================================================================
    section('Employee Requests: new Send Back + resubmit flow');
    // ======================================================================
    const reqRes = await call('POST', '/requests', {
        token: emp.token,
        body: { type: 'transfer', title: 'Transfer to Finance', reason: 'Career growth' }
    });
    check('Employee raises a request', reqRes.status === 201, reqRes.data);
    const reqId = reqRes.data.data._id;

    const noNote = await call('PUT', `/requests/${reqId}/return`, { token: expert.token, body: {} });
    check('Send Back requires a note', noNote.status === 400, noNote.data);

    const empReturn = await call('PUT', `/requests/${reqId}/return`, { token: emp.token, body: { note: 'hijack' } });
    check('A plain employee cannot use the Send Back route (403)', empReturn.status === 403, empReturn.status);

    const sendBack = await call('PUT', `/requests/${reqId}/return`, {
        token: expert.token, body: { note: 'Which department exactly? Please specify.' }
    });
    check('Expert sends the request back', sendBack.status === 200 && sendBack.data.data.status === 'returned_for_correction', sendBack.data);
    check('The return reason is recorded for the requester', sendBack.data.data.returnReason.includes('Which department'), sendBack.data.data.returnReason);

    const decideReturned = await call('PUT', `/requests/${reqId}/decision`, {
        token: manager.token, body: { outcome: 'approved' }
    });
    check('A returned request cannot be decided until resubmitted', decideReturned.status === 400, decideReturned.data);

    const forwardReturned = await call('PUT', `/requests/${reqId}/process`, { token: expert.token, body: {} });
    check('A returned request cannot be forwarded either', forwardReturned.status === 400, forwardReturned.data);

    const wrongResubmit = await call('PUT', `/requests/${reqId}/resubmit`, {
        token: emp2.token, body: { reason: 'someone else' }
    });
    check('IDENTITY-BOUND: only the requester can resubmit (403)', wrongResubmit.status === 403, wrongResubmit.data);

    const resubmitReq = await call('PUT', `/requests/${reqId}/resubmit`, {
        token: emp.token, body: { reason: 'Career growth - transfer to the Finance department', details: { targetDepartment: 'Finance' } }
    });
    check('Requester corrects and resubmits', resubmitReq.status === 200 && resubmitReq.data.data.status === 'submitted', resubmitReq.data);
    check('The return reason is cleared on resubmission', resubmitReq.data.data.returnReason === '', resubmitReq.data.data.returnReason);

    const forward = await call('PUT', `/requests/${reqId}/process`, { token: expert.token, body: {} });
    check('Expert forwards the corrected request', forward.status === 200 && forward.data.data.status === 'processing', forward.data);

    const approve = await call('PUT', `/requests/${reqId}/decision`, { token: manager.token, body: { outcome: 'approved' } });
    check('HR Manager approves it', approve.status === 200 && approve.data.data.status === 'approved', approve.data);

    const reqDoc = await db.collection('employeerequests').findOne({ _id: new mongoose.Types.ObjectId(String(reqId)) });
    const historyStatuses = (reqDoc.history || []).map(h => h.status);
    check('AUDIT: full history preserved (submitted -> returned -> submitted -> processing -> approved)',
        ['submitted', 'returned_for_correction', 'submitted', 'processing', 'approved']
            .every((s, i) => historyStatuses[i] === s),
        historyStatuses);
    const returnedEntry = (reqDoc.history || []).find(h => h.status === 'returned_for_correction');
    check('AUDIT: the send-back records the Expert as the actor', String(returnedEntry.changedBy) === String(expert.userId), returnedEntry);

    // A requester may still cancel a returned request.
    const req2 = await call('POST', '/requests', {
        token: emp.token, body: { type: 'other', title: 'Cancellable request', reason: 'test' }
    });
    const req2Id = req2.data.data._id;
    await call('PUT', `/requests/${req2Id}/return`, { token: expert.token, body: { note: 'Clarify please' } });
    const cancelReturned = await call('PUT', `/requests/${req2Id}/cancel`, { token: emp.token });
    check('The requester can cancel a returned request', cancelReturned.status === 200 && cancelReturned.data.data.status === 'cancelled', cancelReturned.data);

    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self-test crashed:', error);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
