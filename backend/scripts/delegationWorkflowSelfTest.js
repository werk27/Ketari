/**
 * End-to-end check of the Delegation workflow (spec §15):
 *
 *   Requester submits (pending_hr_expert_review)
 *     -> HR Expert: validate (pending_hr_manager_approval)
 *                 | return (returned_for_correction -> edit + resubmit)
 *                 (no HR Expert terminal reject - reserved for HR Manager)
 *     -> HR Manager: approve (approved_pending_acceptance) | reject
 *     -> Delegate: accept (scheduled/active) | decline
 *     -> end date / revoke ends the authority instantly.
 *
 * Verifies that delegated capabilities are ONLY in effect while the status
 * is scheduled/active AND the date window is open - never during review,
 * after rejection/decline, before the start date, after the end date or
 * after a revoke - and that the enforcement is real backend authorization,
 * not a UI state. Also verifies: intrinsic-capability-only delegation (no
 * chains), self-delegation and cross-organization rejection, duplicate/
 * overlap prevention, separation of duties (expert cannot approve, manager
 * cannot bypass the expert, nobody reviews their own request), full-role
 * direct grants still requiring acceptance, unchanged permanent roles, and
 * the append-only history trail.
 *
 * Fully self-contained - creates its own throwaway organizations and staff
 * and removes all of them again at the end.
 *
 * Usage: node scripts/delegationWorkflowSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'DelegTest123!';

const accounts = {
    employerA: { name: 'Deleg Test Employer A', email: `deleg-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    employerB: { name: 'Deleg Test Employer B', email: `deleg-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' }
};

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

const login = async ({ email, password }) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data.message}`);
    return res.data.token;
};

const me = async (token) => (await call('GET', '/auth/me', { token })).data.user;

/** YYYY-MM-DD, `offset` days from now. */
const dateOffset = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
};

/** Whether the delegate can currently exercise 'delegation:view' for real. */
const canViewOrg = async (token) => (await call('GET', '/delegations/organization', { token })).status === 200;

const emails = Object.values(accounts).map(a => a.email);
const extraEmails = [];
const employerIds = [];

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const allEmails = [...emails, ...extraEmails];
    const users = await db.collection('users').find({ email: { $in: allEmails } }).toArray();
    const userIds = users.map(u => u._id);

    for (const employerId of employerIds) {
        await db.collection('delegations').deleteMany({ employer: employerId });
        await db.collection('employees').deleteMany({ employer: employerId });
        await db.collection('configurations').deleteMany({ employer: employerId });
        await db.collection('notifications').deleteMany({ employer: employerId });
        await db.collection('employeerequests').deleteMany({ employer: employerId });
        await db.collection('jobrequisitions').deleteMany({ employer: employerId });
        await db.collection('jobs').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

/** Record an Employee + login account + (optional) organizational role. */
const makeStaffMember = async ({ employerToken, firstName, lastName, email, role }) => {
    const empRes = await call('POST', '/employees', {
        token: employerToken,
        body: { personalInfo: { firstName, lastName }, contactInfo: { email } }
    });
    if (empRes.status !== 201) throw new Error(`Could not record employee ${firstName}: ${JSON.stringify(empRes.data)}`);
    const employeeId = empRes.data.data._id;

    extraEmails.push(email);
    const acctRes = await call('POST', `/employees/${employeeId}/account`, {
        token: employerToken, body: { email, password: PASSWORD, role: 'employee' }
    });
    if (acctRes.status !== 201) throw new Error(`Could not create account for ${firstName}: ${JSON.stringify(acctRes.data)}`);

    if (role && role !== 'employee') {
        const roleRes = await call('PUT', `/employees/${employeeId}/role`, { token: employerToken, body: { role } });
        if (roleRes.status !== 200) throw new Error(`Could not assign role ${role} to ${firstName}: ${JSON.stringify(roleRes.data)}`);
    }

    const token = await login({ email, password: PASSWORD });
    const user = await me(token);
    return { employeeId, token, userId: user._id || user.id };
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    // ---- Organizations and staff --------------------------------------------
    const empARes = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A registers', empARes.status === 201, empARes);
    const employerAId = new mongoose.Types.ObjectId(empARes.data.organization._id);
    employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = await login(accounts.employerA);

    const empBRes = await call('POST', '/auth/register', { body: accounts.employerB });
    check('Employer B registers', empBRes.status === 201, empBRes);
    const employerBId = new mongoose.Types.ObjectId(empBRes.data.organization._id);
    employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = await login(accounts.employerB);

    const expert1 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Expert', lastName: 'One', email: `deleg-exp1-${stamp}@example.com`, role: 'hr_expert' });
    const expert2 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Expert', lastName: 'Two', email: `deleg-exp2-${stamp}@example.com`, role: 'hr_expert' });
    const manager = await makeStaffMember({ employerToken: employerAToken, firstName: 'Manager', lastName: 'A', email: `deleg-mgr-${stamp}@example.com`, role: 'hr_manager' });
    const emp1 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Employee', lastName: 'One', email: `deleg-e1-${stamp}@example.com`, role: 'employee' });
    const emp2 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Employee', lastName: 'Two', email: `deleg-e2-${stamp}@example.com`, role: 'employee' });
    const empB1 = await makeStaffMember({ employerToken: employerBToken, firstName: 'Foreign', lastName: 'Employee', email: `deleg-b1-${stamp}@example.com`, role: 'employee' });

    // =========================================================================
    // Section 1 - full request workflow with a specific capability
    //             (expert1 delegates 'delegation:view' to employee emp2)
    // =========================================================================
    console.log('\n-- Section 1: request -> validate -> approve -> accept -> active -> revoke');

    check('Baseline: delegate cannot use the capability before anything exists', !(await canViewOrg(emp2.token)), 'emp2 could view org delegations');

    const req1 = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Cover delegation oversight',
            description: 'Annual leave cover', startDate: dateOffset(0), endDate: dateOffset(3),
            scopeType: 'specific', scopedCapabilities: ['delegation:view']
        }
    });
    check('TEST 1: HR Expert (no delegation:create) submits a delegation REQUEST', req1.status === 201, req1);
    check('TEST 1: request starts as pending_hr_expert_review, never active', req1.data.data?.status === 'pending_hr_expert_review', req1.data);
    const req1Id = req1.data.data?._id;

    check('TEST 1: no delegated permission while pending review', !(await canViewOrg(emp2.token)), 'emp2 gained capability too early');

    const emp1Review = await call('PUT', `/delegations/${req1Id}/review`, { token: emp1.token, body: { action: 'validate' } });
    check('TEST 14: an employee cannot act as the validation gate', emp1Review.status === 403, emp1Review);

    const selfReview = await call('PUT', `/delegations/${req1Id}/review`, { token: expert1.token, body: { action: 'validate' } });
    check('Separation: the requester cannot validate their own request', selfReview.status === 403, selfReview);

    const managerBypass = await call('PUT', `/delegations/${req1Id}/decision`, { token: manager.token, body: { action: 'approve' } });
    check('TEST 14: HR Manager cannot approve before HR Expert validation', managerBypass.status === 400, managerBypass);

    const earlyAccept = await call('PUT', `/delegations/${req1Id}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('Invalid transition: delegate cannot accept an unapproved request', earlyAccept.status === 400, earlyAccept);

    const expertReject = await call('PUT', `/delegations/${req1Id}/review`, { token: expert2.token, body: { action: 'reject', comment: 'no' } });
    check('POLICY: the HR Expert has NO terminal reject - only validate or return (400)', expertReject.status === 400, expertReject);

    const validate1 = await call('PUT', `/delegations/${req1Id}/review`, { token: expert2.token, body: { action: 'validate' } });
    check('TEST 2: HR Expert validates -> pending_hr_manager_approval', validate1.status === 200 && validate1.data.data?.status === 'pending_hr_manager_approval', validate1);
    check('TEST 2: still no delegated permission after validation', !(await canViewOrg(emp2.token)), 'emp2 gained capability after validation');

    const expertFinal = await call('PUT', `/delegations/${req1Id}/decision`, { token: expert2.token, body: { action: 'approve' } });
    check('TEST 13: HR Expert cannot perform the final approval', expertFinal.status === 403, expertFinal);

    const mgrRejectNoReason = await call('PUT', `/delegations/${req1Id}/decision`, { token: manager.token, body: { action: 'reject' } });
    check('HR Manager rejection requires a reason', mgrRejectNoReason.status === 400, mgrRejectNoReason);

    const approve1 = await call('PUT', `/delegations/${req1Id}/decision`, { token: manager.token, body: { action: 'approve' } });
    check('TEST 3: HR Manager approves -> approved_pending_acceptance', approve1.status === 200 && approve1.data.data?.status === 'approved_pending_acceptance', approve1);
    check('TEST 3: still no delegated permission before acceptance', !(await canViewOrg(emp2.token)), 'emp2 gained capability before accepting');

    const wrongResponder = await call('PUT', `/delegations/${req1Id}/respond`, { token: emp1.token, body: { action: 'accept' } });
    check('Only the delegate may respond', wrongResponder.status === 403, wrongResponder);

    const accept1 = await call('PUT', `/delegations/${req1Id}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('TEST 6: delegate accepts a started period -> active', accept1.status === 200 && accept1.data.data?.status === 'active', accept1);

    check('TEST 18: delegated capability now works through real API authorization', await canViewOrg(emp2.token), 'emp2 still gets 403');

    const emp2Me = await me(emp2.token);
    check('TEST 18: /auth/me shows the delegated capability in effective capabilities', (emp2Me.capabilities || []).includes('delegation:view'), emp2Me.capabilities);
    check('TEST 17/15: intrinsic ownCapabilities unchanged (no permanent grant)', !(emp2Me.ownCapabilities || []).includes('delegation:view'), emp2Me.ownCapabilities);
    check('Role model: the delegate\'s permanent role is unchanged', emp2Me.role === 'employee', emp2Me.role);

    const legacyActivate = await call('PUT', `/delegations/${req1Id}/status`, { token: expert1.token, body: { status: 'active' } });
    check('Legacy status route can no longer force-activate anything', legacyActivate.status === 400, legacyActivate);

    const revoke1 = await call('PUT', `/delegations/${req1Id}/status`, { token: expert1.token, body: { status: 'revoked', notes: 'Back early' } });
    check('TEST 8: the delegator revokes the active delegation', revoke1.status === 200 && revoke1.data.data?.status === 'revoked', revoke1);
    check('TEST 8: the delegated capability stops working immediately', !(await canViewOrg(emp2.token)), 'emp2 still has the capability after revoke');

    // =========================================================================
    // Section 2 - the delegate declines
    // =========================================================================
    console.log('\n-- Section 2: delegate declines');

    const req2 = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Second oversight cover',
            description: 'Cover again', startDate: dateOffset(0), endDate: dateOffset(3),
            scopeType: 'specific', scopedCapabilities: ['delegation:view']
        }
    });
    check('A new request is allowed once the earlier one is terminal', req2.status === 201, req2);
    const req2Id = req2.data.data?._id;
    await call('PUT', `/delegations/${req2Id}/review`, { token: expert2.token, body: { action: 'validate' } });
    await call('PUT', `/delegations/${req2Id}/decision`, { token: manager.token, body: { action: 'approve' } });

    const decline = await call('PUT', `/delegations/${req2Id}/respond`, { token: emp2.token, body: { action: 'decline', comment: 'Workload too high' } });
    check('TEST 4: delegate declines -> declined_by_delegate', decline.status === 200 && decline.data.data?.status === 'declined_by_delegate', decline);
    check('TEST 4: no delegated permission after decline', !(await canViewOrg(emp2.token)), 'emp2 gained capability after declining');

    const acceptAfterDecline = await call('PUT', `/delegations/${req2Id}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('TEST 21: a declined delegation can never become active', acceptAfterDecline.status === 400, acceptAfterDecline);

    // =========================================================================
    // Section 3 - scheduled start, duplicate prevention, automatic expiry
    // =========================================================================
    console.log('\n-- Section 3: scheduled start, duplicates, expiry');

    const req3 = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Future oversight cover',
            description: 'Planned leave', startDate: dateOffset(5), endDate: dateOffset(8),
            scopeType: 'specific', scopedCapabilities: ['delegation:view']
        }
    });
    check('Future-dated request accepted', req3.status === 201, req3);
    const req3Id = req3.data.data?._id;

    const dup = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Duplicate cover',
            description: 'Duplicate', startDate: dateOffset(6), endDate: dateOffset(7),
            scopeType: 'specific', scopedCapabilities: ['delegation:view']
        }
    });
    check('TEST 12: overlapping duplicate (same delegator/delegate/capability/period) is rejected', dup.status === 400, dup);

    const nonConflicting = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: emp2.userId, type: 'task', title: 'Different responsibility',
            description: 'Different capability, same period', startDate: dateOffset(6), endDate: dateOffset(7),
            scopeType: 'specific', scopedCapabilities: ['complaint:handle']
        }
    });
    check('TEST 12: a non-conflicting delegation (different capability) is still allowed', nonConflicting.status === 201, nonConflicting);
    // Withdraw it again so it cannot interfere with later sections.
    await call('PUT', `/delegations/${nonConflicting.data.data?._id}/status`, { token: expert1.token, body: { status: 'revoked' } });

    await call('PUT', `/delegations/${req3Id}/review`, { token: expert2.token, body: { action: 'validate' } });
    await call('PUT', `/delegations/${req3Id}/decision`, { token: manager.token, body: { action: 'approve' } });
    const accept3 = await call('PUT', `/delegations/${req3Id}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('TEST 5: accepting before the start date -> scheduled', accept3.status === 200 && accept3.data.data?.status === 'scheduled', accept3);
    check('TEST 5: no delegated permission before the start date', !(await canViewOrg(emp2.token)), 'emp2 gained capability before start date');

    // Start date arrives (simulated by moving it into the past).
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(req3Id) },
        { $set: { startDate: new Date(Date.now() - 24 * 3600 * 1000) } }
    );
    check('TEST 6: capability starts working the moment the start date arrives', await canViewOrg(emp2.token), 'emp2 still 403 after start date');

    const listAfterStart = await call('GET', '/delegations', { token: expert1.token });
    const rec3 = (listAfterStart.data.data || []).find(d => d._id === req3Id);
    check('TEST 6: the record is settled to active on the next list read', rec3?.status === 'active', rec3?.status);

    // End date passes (simulated).
    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(req3Id) },
        { $set: { endDate: new Date(Date.now() - 3600 * 1000) } }
    );
    check('TEST 7: capability stops working the moment the end date passes', !(await canViewOrg(emp2.token)), 'emp2 still authorized after end date');

    const listAfterEnd = await call('GET', '/delegations', { token: expert1.token });
    const rec3b = (listAfterEnd.data.data || []).find(d => d._id === req3Id);
    check('TEST 7: the record is settled to completed (expired) on the next list read', rec3b?.status === 'completed', rec3b?.status);

    // =========================================================================
    // Section 4 - security validations
    // =========================================================================
    console.log('\n-- Section 4: security validations');

    const notHeld = await call('POST', '/delegations', {
        token: emp1.token,
        body: {
            delegate: emp2.userId, type: 'approval', title: 'Leave approvals',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['leave:approve']
        }
    });
    check('TEST 9: requesting a capability the requester does not hold is rejected', notHeld.status === 400, notHeld);

    const selfDeleg = await call('POST', '/delegations', {
        token: emp1.token,
        body: {
            delegate: emp1.userId, type: 'task', title: 'Self delegation',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['leave:request']
        }
    });
    check('TEST 27: self-delegation is rejected', selfDeleg.status === 400, selfDeleg);

    const crossOrg = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: empB1.userId, type: 'authority', title: 'Cross-org',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['delegation:view']
        }
    });
    check('TEST 11: cross-organization delegation is rejected', crossOrg.status === 400, crossOrg);

    const fabricated = await call('POST', '/delegations', {
        token: emp1.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Fabricated capability',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['platform:users']
        }
    });
    check('TEST 27: manipulated capability IDs are rejected by the backend', fabricated.status === 400, fabricated);

    // =========================================================================
    // Section 5 - return for correction, resubmit, HR Manager rejection, history
    // =========================================================================
    console.log('\n-- Section 5: return -> resubmit -> manager rejection + audit history');

    const req5 = await call('POST', '/delegations', {
        token: emp1.token,
        body: {
            delegate: emp2.userId, type: 'task', title: 'Requisition viewing',
            description: 'Cover requisition follow-up', startDate: dateOffset(1), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['requisition:view']
        }
    });
    check('An ordinary employee can submit a delegation request', req5.status === 201 && req5.data.data?.status === 'pending_hr_expert_review', req5);
    const req5Id = req5.data.data?._id;

    const returnNoComment = await call('PUT', `/delegations/${req5Id}/review`, { token: expert2.token, body: { action: 'return' } });
    check('Returning requires an explanation', returnNoComment.status === 400, returnNoComment);

    const return5 = await call('PUT', `/delegations/${req5Id}/review`, { token: expert2.token, body: { action: 'return', comment: 'End date is too short - extend it' } });
    check('TEST 16: HR Expert returns the request for correction', return5.status === 200 && return5.data.data?.status === 'returned_for_correction', return5);

    const wrongEditor = await call('PUT', `/delegations/${req5Id}`, {
        token: emp2.token,
        body: {
            delegate: emp2.userId, type: 'task', title: 'Hijack', description: 'Nope',
            startDate: dateOffset(1), endDate: dateOffset(4), scopeType: 'specific', scopedCapabilities: ['requisition:view']
        }
    });
    check('Only the requester can edit a returned request', wrongEditor.status === 403, wrongEditor);

    const resubmit5 = await call('PUT', `/delegations/${req5Id}`, {
        token: emp1.token,
        body: {
            delegate: emp2.userId, type: 'task', title: 'Requisition viewing (extended)',
            description: 'Cover requisition follow-up, extended', startDate: dateOffset(1), endDate: dateOffset(4),
            scopeType: 'specific', scopedCapabilities: ['requisition:view']
        }
    });
    check('TEST 16: the requester edits and resubmits -> pending_hr_expert_review', resubmit5.status === 200 && resubmit5.data.data?.status === 'pending_hr_expert_review', resubmit5);

    await call('PUT', `/delegations/${req5Id}/review`, { token: expert2.token, body: { action: 'validate' } });
    const reject5 = await call('PUT', `/delegations/${req5Id}/decision`, { token: manager.token, body: { action: 'reject', comment: 'Not needed for this period' } });
    check('TEST 15: HR Manager rejects with a recorded reason', reject5.status === 200 && reject5.data.data?.status === 'rejected_by_hr_manager', reject5);

    const acceptRejected = await call('PUT', `/delegations/${req5Id}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('TEST 15/21: a rejected request can never become active', acceptRejected.status === 400, acceptRejected);

    const history = reject5.data.data?.history || [];
    const actionsSeen = history.map(h => h.action);
    check('TEST 19: full audit history preserved (requested -> returned -> resubmitted -> validated -> rejected)',
        ['requested', 'returned', 'resubmitted', 'validated', 'rejected'].every(a => actionsSeen.includes(a)), actionsSeen);
    const rejectedEntry = history.find(h => h.action === 'rejected');
    check('TEST 19: rejection records actor, role, reason and timestamp',
        rejectedEntry && rejectedEntry.actorRole === 'hr_manager' && /Not needed/.test(rejectedEntry.comment) && !!rejectedEntry.at, rejectedEntry);

    // =========================================================================
    // Section 6 - full-role direct grant by HR Manager + no delegation chains
    // =========================================================================
    console.log('\n-- Section 6: full-role direct grant, acceptance still required, no chains');

    const direct = await call('POST', '/delegations', {
        token: manager.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Full cover while away',
            description: 'Manager annual leave', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'full_role'
        }
    });
    check('Direct grant by HR Manager skips review but is NOT active yet', direct.status === 201 && direct.data.data?.status === 'approved_pending_acceptance', direct);
    const directId = direct.data.data?._id;

    let emp2MeBefore = await me(emp2.token);
    check('No manager capability before the delegate accepts', !(emp2MeBefore.capabilities || []).includes('leave:approve'), emp2MeBefore.capabilities);

    const acceptDirect = await call('PUT', `/delegations/${directId}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('Delegate accepts the full-role delegation -> active', acceptDirect.status === 200 && acceptDirect.data.data?.status === 'active', acceptDirect);

    const emp2MeAfter = await me(emp2.token);
    check('TEST 17: full-role delegation transfers the delegator\'s capabilities temporarily',
        ['leave:approve', 'vacancy:approve', 'delegation:view'].every(c => (emp2MeAfter.capabilities || []).includes(c)), emp2MeAfter.capabilities);
    check('TEST 17: the delegate\'s permanent role is still employee', emp2MeAfter.role === 'employee', emp2MeAfter.role);
    check('TEST 17: ownCapabilities (intrinsic) unchanged', !(emp2MeAfter.ownCapabilities || []).includes('leave:approve'), emp2MeAfter.ownCapabilities);
    check('TEST 18: delegated view capability works against the API', await canViewOrg(emp2.token), 'emp2 gets 403');

    const chain = await call('POST', '/delegations', {
        token: emp2.token,
        body: {
            delegate: emp1.userId, type: 'approval', title: 'Re-delegate borrowed authority',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(1),
            scopeType: 'specific', scopedCapabilities: ['leave:approve']
        }
    });
    check('TEST 10: borrowed capabilities can never be delegated onward (no chains)', chain.status === 400, chain);

    const revokeDirect = await call('PUT', `/delegations/${directId}/status`, { token: manager.token, body: { status: 'revoked', notes: 'Returning early' } });
    check('Manager revokes the full-role delegation', revokeDirect.status === 200, revokeDirect);
    const emp2MeFinal = await me(emp2.token);
    check('All temporary capabilities disappear after the revoke', !(emp2MeFinal.capabilities || []).includes('leave:approve'), emp2MeFinal.capabilities);

    // =========================================================================
    // Section 7 - temporary SUBSTITUTION: the delegator is suspended
    // =========================================================================
    console.log('\n-- Section 7: delegator suspension (temporary substitution, not shared access)');

    const mgr2 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Manager', lastName: 'Two', email: `deleg-mgr2-${stamp}@example.com`, role: 'hr_manager' });
    const expert3 = await makeStaffMember({ employerToken: employerAToken, firstName: 'Expert', lastName: 'Three', email: `deleg-exp3-${stamp}@example.com`, role: 'hr_expert' });

    const canListRequests = async (token) => (await call('GET', '/requests', { token })).status === 200;
    const canListLeaves = async (token) => (await call('GET', '/leaves', { token })).status === 200;

    check('Baseline: manager2 can list employee requests', await canListRequests(mgr2.token), 'mgr2 403 before any delegation');

    const sub1 = await call('POST', '/delegations', {
        token: mgr2.token,
        body: {
            delegate: emp1.userId, type: 'approval', title: 'Approve employee requests while away',
            description: 'Annual leave cover', startDate: dateOffset(0), endDate: dateOffset(3),
            scopeType: 'specific', scopedCapabilities: ['request:view', 'request:approve']
        }
    });
    check('Manager2 direct-grants request approval to employee1', sub1.status === 201 && sub1.data.data?.status === 'approved_pending_acceptance', sub1);
    const sub1Id = sub1.data.data?._id;

    check('SUBSTITUTION: delegator NOT suspended before the delegate accepts', await canListRequests(mgr2.token), 'mgr2 suspended too early');

    const dupDelegator = await call('POST', '/delegations', {
        token: mgr2.token,
        body: {
            delegate: emp2.userId, type: 'approval', title: 'Same responsibility to a second person',
            description: 'Nope', startDate: dateOffset(1), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['request:approve']
        }
    });
    check('SUBSTITUTION: the same responsibility cannot be handed to two people for overlapping periods', dupDelegator.status === 400, dupDelegator);

    await call('PUT', `/delegations/${sub1Id}/respond`, { token: emp1.token, body: { action: 'accept' } });

    check('TEST 5 (A attempts X): delegator now gets 403 on the delegated responsibility', !(await canListRequests(mgr2.token)), 'mgr2 still authorized');
    check('Delegator keeps NON-delegated responsibilities (leave list still 200)', await canListLeaves(mgr2.token), 'mgr2 lost unrelated capability');

    const mgr2Me = await me(mgr2.token);
    check('Delegator effective capabilities exclude the delegated ones', !(mgr2Me.capabilities || []).includes('request:approve'), mgr2Me.capabilities);
    check('Delegator ownCapabilities (permanent) unchanged', (mgr2Me.ownCapabilities || []).includes('request:approve'), mgr2Me.ownCapabilities);
    check('Delegator permanent role unchanged', mgr2Me.role === 'hr_manager', mgr2Me.role);
    check('Delegator sees the outgoing-delegation banner data', (mgr2Me.outgoingDelegations || []).length === 1, mgr2Me.outgoingDelegations);

    check('Delegate can now list employee requests', await canListRequests(emp1.token), 'emp1 403');

    // A real delegated ACTION, end to end, recorded under the delegate's identity.
    const rawReq = await call('POST', '/requests', {
        token: emp2.token,
        body: { type: 'other', title: 'Substitution test request', description: 'Testing' }
    });
    check('Employee2 raises a request', rawReq.status === 201, rawReq);
    const rawReqId = rawReq.data.data?._id;
    const proc = await call('PUT', `/requests/${rawReqId}/process`, { token: expert2.token, body: {} });
    check('HR Expert processes it', proc.status === 200, proc);

    const mgr2Decide = await call('PUT', `/requests/${rawReqId}/decision`, { token: mgr2.token, body: { outcome: 'approved' } });
    check('Suspended delegator CANNOT decide (403 from backend, not just UI)', mgr2Decide.status === 403, mgr2Decide);

    const emp1Decide = await call('PUT', `/requests/${rawReqId}/decision`, { token: emp1.token, body: { outcome: 'approved' } });
    check('Delegate performs the delegated ACTION successfully', emp1Decide.status === 200 && emp1Decide.data.data?.status === 'approved', emp1Decide);
    check('AUDIT: the action is recorded under the DELEGATE\'s identity', String(emp1Decide.data.data?.decidedBy) === String(emp1.userId), emp1Decide.data.data?.decidedBy);

    const revokeSub1 = await call('PUT', `/delegations/${sub1Id}/status`, { token: mgr2.token, body: { status: 'revoked', notes: 'Back early' } });
    check('Delegator revokes', revokeSub1.status === 200, revokeSub1);
    check('REVOKE: delegator authority restored immediately', await canListRequests(mgr2.token), 'mgr2 still suspended after revoke');
    check('REVOKE: delegate authority removed immediately', !(await canListRequests(emp1.token)), 'emp1 still authorized after revoke');

    // ---- Date behaviour on both sides with one scheduled delegation --------
    const sub2 = await call('POST', '/delegations', {
        token: mgr2.token,
        body: {
            delegate: emp1.userId, type: 'authority', title: 'Leave oversight cover',
            description: 'Planned absence', startDate: dateOffset(5), endDate: dateOffset(8),
            scopeType: 'specific', scopedCapabilities: ['leave:view']
        }
    });
    const sub2Id = sub2.data.data?._id;
    await call('PUT', `/delegations/${sub2Id}/respond`, { token: emp1.token, body: { action: 'accept' } });

    check('BEFORE START: delegator keeps the responsibility', await canListLeaves(mgr2.token), 'mgr2 suspended before start date');
    check('BEFORE START: delegate has nothing yet', !(await canListLeaves(emp1.token)), 'emp1 authorized before start date');

    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(sub2Id) },
        { $set: { startDate: new Date(Date.now() - 3600 * 1000) } }
    );
    check('ON START DAY: delegator is blocked automatically', !(await canListLeaves(mgr2.token)), 'mgr2 still authorized after start');
    check('ON START DAY: delegate gains the responsibility automatically', await canListLeaves(emp1.token), 'emp1 still blocked after start');

    await db.collection('delegations').updateOne(
        { _id: new mongoose.Types.ObjectId(sub2Id) },
        { $set: { endDate: new Date(Date.now() - 60 * 1000) } }
    );
    check('ON RETURN DAY: delegator authority restored automatically', await canListLeaves(mgr2.token), 'mgr2 not restored after end date');
    check('ON RETURN DAY: delegate loses the delegated authority automatically', !(await canListLeaves(emp1.token)), 'emp1 still authorized after end date');

    // ---- Non-delegable capabilities -----------------------------------------
    const personal = await call('POST', '/delegations', {
        token: mgr2.token,
        body: {
            delegate: emp1.userId, type: 'task', title: 'Delegate my own leave requests',
            description: 'Nope', startDate: dateOffset(0), endDate: dateOffset(1),
            scopeType: 'specific', scopedCapabilities: ['leave:request']
        }
    });
    check('Personal self-service capabilities cannot be delegated', personal.status === 400, personal);

    // Settle the (now date-expired) sub2 record so it cannot register as an
    // overlapping non-terminal delegation for the next check.
    await call('GET', '/delegations', { token: mgr2.token });

    // Full-role substitution never suspends the delegator's personal rights.
    const sub3 = await call('POST', '/delegations', {
        token: mgr2.token,
        body: {
            delegate: emp1.userId, type: 'authority', title: 'Full cover while abroad',
            description: 'Full role substitution', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'full_role'
        }
    });
    const sub3Id = sub3.data.data?._id;
    await call('PUT', `/delegations/${sub3Id}/respond`, { token: emp1.token, body: { action: 'accept' } });

    const mgr2Full = await me(mgr2.token);
    check('FULL ROLE: delegator loses delegable responsibilities', !(mgr2Full.capabilities || []).includes('leave:approve'), mgr2Full.capabilities);
    check('FULL ROLE: delegator keeps personal self-service rights', (mgr2Full.capabilities || []).includes('leave:request'), mgr2Full.capabilities);
    const emp1Full = await me(emp1.token);
    check('FULL ROLE: delegate gains the delegable responsibilities', (emp1Full.capabilities || []).includes('leave:approve'), emp1Full.capabilities);
    check('FULL ROLE: delegate keeps their own normal permissions', (emp1Full.capabilities || []).includes('complaint:raise'), emp1Full.capabilities);
    check('FULL ROLE: both permanent roles unchanged', mgr2Full.role === 'hr_manager' && emp1Full.role === 'employee', { m: mgr2Full.role, e: emp1Full.role });

    await call('PUT', `/delegations/${sub3Id}/status`, { token: mgr2.token, body: { status: 'revoked' } });
    const mgr2Restored = await me(mgr2.token);
    check('FULL ROLE revoke: delegator fully restored', (mgr2Restored.capabilities || []).includes('leave:approve'), mgr2Restored.capabilities);

    // =========================================================================
    // Section 8 - identity-bound responsibility: acting Department Head
    // =========================================================================
    console.log('\n-- Section 8: identity-bound Job Requesting (acting Department Head)');

    const headUser = await makeStaffMember({ employerToken: employerAToken, firstName: 'Head', lastName: 'IT', email: `deleg-head-${stamp}@example.com`, role: 'employee' });
    const depRes = await call('POST', '/config/departments', { token: employerAToken, body: { name: `IT Dept ${stamp}`, manager: headUser.userId } });
    check('Department created with an assigned head', depRes.status === 201, depRes);
    const cfgDoc = await db.collection('configurations').findOne({ employer: employerAId });
    const deptId = String((cfgDoc.departments || []).find(d => d.name === `IT Dept ${stamp}`)._id);

    const reqBody = {
        department: deptId, positionTitle: 'Developer', numberOfPositions: 1,
        requestType: 'new_position', employmentType: 'Full-Time', level: 'Junior',
        education: 'BSc', experience: '1 year', skills: 'JS', reason: 'Team growth',
        startDate: dateOffset(30), salary: { amount: 15000, currency: 'ETB' }
    };

    const headBaseline = await call('POST', '/requisitions', { token: headUser.token, body: reqBody });
    check('Baseline: the assigned head can raise a requisition', headBaseline.status === 201, headBaseline);
    const empBaseline = await call('POST', '/requisitions', { token: emp2.token, body: reqBody });
    check('Baseline: a non-head employee cannot (403)', empBaseline.status === 403, empBaseline);

    const headDeleg = await call('POST', '/delegations', {
        token: headUser.token,
        body: {
            delegate: emp2.userId, type: 'authority', title: 'Job requesting cover',
            description: 'On leave', startDate: dateOffset(0), endDate: dateOffset(3),
            scopeType: 'specific', scopedCapabilities: ['requisition:create', 'requisition:view']
        }
    });
    check('Head submits a delegation request for Job Requesting', headDeleg.status === 201 && headDeleg.data.data?.status === 'pending_hr_expert_review', headDeleg);
    const headDelegId = headDeleg.data.data?._id;
    await call('PUT', `/delegations/${headDelegId}/review`, { token: expert3.token, body: { action: 'validate' } });
    await call('PUT', `/delegations/${headDelegId}/decision`, { token: manager.token, body: { action: 'approve' } });
    const headAccept = await call('PUT', `/delegations/${headDelegId}/respond`, { token: emp2.token, body: { action: 'accept' } });
    check('Delegate accepts -> active', headAccept.status === 200 && headAccept.data.data?.status === 'active', headAccept);

    check('IDENTITY-BOUND: the head is now BLOCKED from raising requisitions',
        (await call('POST', '/requisitions', { token: headUser.token, body: reqBody })).status === 403, 'head still authorized');

    const coveredCreate = await call('POST', '/requisitions', { token: emp2.token, body: reqBody });
    check('IDENTITY-BOUND: the delegate CAN raise a requisition for the covered department', coveredCreate.status === 201, coveredCreate);
    check('AUDIT: the requisition is owned by the DELEGATE, never the head',
        String(coveredCreate.data.data?.requestedBy) === String(emp2.userId), coveredCreate.data.data?.requestedBy);
    const covReqId = coveredCreate.data.data?._id;

    const emp2List = await call('GET', '/requisitions', { token: emp2.token });
    check('DATA SCOPE: the delegate sees the covered department\'s requisitions', emp2List.status === 200
        && (emp2List.data.data || []).some(r => r._id === covReqId), { status: emp2List.status, count: emp2List.data.count });

    const emp2Me2 = await me(emp2.token);
    check('The delegate\'s employment shows the covered department (nav/menu source)',
        emp2Me2.employment?.isDepartmentHead === true, emp2Me2.employment);
    check('The delegate\'s permanent role is still employee', emp2Me2.role === 'employee', emp2Me2.role);

    const emp1Try = await call('POST', '/requisitions', { token: emp1.token, body: reqBody });
    check('SECURITY: an uninvolved employee still cannot raise one', emp1Try.status === 403, emp1Try);

    const cfgAfter = await db.collection('configurations').findOne({ employer: employerAId });
    const deptAfter = (cfgAfter.departments || []).find(d => String(d._id) === deptId);
    check('PERMANENT ASSIGNMENT unchanged: the department\'s manager is still the head',
        String(deptAfter.manager) === String(headUser.userId), deptAfter.manager);

    const revokeHead = await call('PUT', `/delegations/${headDelegId}/status`, { token: headUser.token, body: { status: 'revoked' } });
    check('Head revokes the cover', revokeHead.status === 200, revokeHead);
    check('REVOKE: the head can raise requisitions again',
        (await call('POST', '/requisitions', { token: headUser.token, body: reqBody })).status === 201, 'head still blocked');
    check('REVOKE: the delegate can no longer raise them',
        (await call('POST', '/requisitions', { token: emp2.token, body: reqBody })).status === 403, 'emp2 still authorized');

    // =========================================================================
    // Section 9 - identity-bound responsibility: HR Expert vacancy drafts
    // =========================================================================
    console.log('\n-- Section 9: identity-bound vacancy drafts (acting for the owning HR Expert)');

    const draftJob = await call('POST', '/jobs', {
        token: expert1.token,
        body: {
            title: `Draft Vacancy ${stamp}`, department: 'Engineering', description: 'A test draft vacancy',
            location: 'Hawassa', salary: { amount: 20000, currency: 'ETB' },
            applicationDeadline: dateOffset(30)
        }
    });
    check('HR Expert 1 creates a draft vacancy', draftJob.status === 201, draftJob);
    const draftId = draftJob.data.job?._id || draftJob.data.data?._id;

    const editBaseline = await call('PUT', `/jobs/${draftId}`, { token: expert2.token, body: { description: 'Hijack attempt' } });
    check('Baseline: another HR Expert cannot edit the draft', editBaseline.status === 403, editBaseline);

    const vacDeleg = await call('POST', '/delegations', {
        token: expert1.token,
        body: {
            delegate: expert2.userId, type: 'task', title: 'Finish my draft vacancies',
            description: 'On leave', startDate: dateOffset(0), endDate: dateOffset(2),
            scopeType: 'specific', scopedCapabilities: ['vacancy:edit', 'vacancy:submit']
        }
    });
    check('Expert1 requests draft-vacancy cover', vacDeleg.status === 201, vacDeleg);
    const vacDelegId = vacDeleg.data.data?._id;
    await call('PUT', `/delegations/${vacDelegId}/review`, { token: expert3.token, body: { action: 'validate' } });
    await call('PUT', `/delegations/${vacDelegId}/decision`, { token: manager.token, body: { action: 'approve' } });
    await call('PUT', `/delegations/${vacDelegId}/respond`, { token: expert2.token, body: { action: 'accept' } });

    const ownerEdit = await call('PUT', `/jobs/${draftId}`, { token: expert1.token, body: { description: 'Owner edit while suspended' } });
    check('SUBSTITUTION: the suspended owner cannot edit their own draft (403 at route guard)', ownerEdit.status === 403, ownerEdit);

    const coverEdit = await call('PUT', `/jobs/${draftId}`, { token: expert2.token, body: { description: 'Edited by the active delegate' } });
    check('The delegate edits the covered draft', coverEdit.status === 200, coverEdit);

    const coverSubmit = await call('PUT', `/jobs/${draftId}/submit`, { token: expert2.token });
    check('The delegate submits the covered draft for approval', coverSubmit.status === 200, coverSubmit);
    check('AUDIT: submittedBy is the DELEGATE\'s identity', String(coverSubmit.data.job?.submittedBy) === String(expert2.userId), coverSubmit.data.job?.submittedBy);

    const coverDelete = await call('DELETE', `/jobs/${draftId}`, { token: expert2.token });
    check('NON-DELEGABLE ownership: deleting stays with the owner alone', coverDelete.status === 403 || coverDelete.status === 400, coverDelete);

    await call('PUT', `/delegations/${vacDelegId}/status`, { token: expert1.token, body: { status: 'revoked' } });


    const notifCount = await db.collection('notifications').countDocuments({
        employer: employerAId,
        type: { $in: ['delegation_request', 'delegation_update', 'delegation_assigned'] }
    });
    check('Notifications were raised through the existing notification system', notifCount > 0, notifCount);

    // ---- Done -----------------------------------------------------------------
    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('\nSelf-test crashed:', err);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
