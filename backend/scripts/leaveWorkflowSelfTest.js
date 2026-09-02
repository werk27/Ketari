/**
 * End-to-end check of the Leave Management workflow:
 *
 *   Employee submits (pending)
 *     -> HR Expert validates: forward (under_review) | return (correction) | reject
 *     -> HR Manager decides: approved | rejected
 *
 * HR Expert is the validation gate: HR Manager may never decide on a request
 * that has not passed through under_review. Also verifies: leave type must
 * come from configuration, backend-authoritative day count, date validation,
 * overlap detection, balance validation (including pending reservation),
 * required supporting documents, return-for-correction + resubmission,
 * separation of duties, and organization isolation.
 *
 * Fully self-contained - creates its own throwaway organizations, HR team,
 * employees, leave-type configuration and leave requests, and removes all of
 * them again at the end.
 *
 * Usage: node scripts/leaveWorkflowSelfTest.js [apiUrl]
 */
require('./_env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const FormData = require('form-data');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'LeaveTest123!';

const accounts = {
    employerA: { name: 'Leave Test Employer A', email: `leave-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    employerB: { name: 'Leave Test Employer B', email: `leave-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' }
};

const call = async (method, endpoint, { body, token, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        Object.assign(headers, form.getHeaders());
        payload = form.getBuffer();
        headers['Content-Length'] = form.getLengthSync();
    } else if (body) {
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

/** YYYY-MM-DD, `offset` days from now - keeps every test's dates isolated. */
const dateOffset = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
};

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
        await db.collection('leaves').deleteMany({ employer: employerId });
        await db.collection('employees').deleteMany({ employer: employerId });
        await db.collection('configurations').deleteMany({ employer: employerId });
        await db.collection('notifications').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

/** Record an Employee + login account + (optional) organizational role. */
const makeStaffMember = async ({ employerToken, firstName, lastName, email, role, hireDate }) => {
    const empRes = await call('POST', '/employees', {
        token: employerToken,
        body: {
            personalInfo: { firstName, lastName },
            contactInfo: { email },
            ...(hireDate ? { employmentInfo: { hireDate } } : {})
        }
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
    return { employeeId, token };
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    // ---- Organization A: employer + configured leave types + HR team ---------
    const empARes = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A registers', empARes.status === 201, empARes);
    const employerAId = new mongoose.Types.ObjectId(empARes.data.organization._id);
    employerIds.push(employerAId);
    const db = mongoose.connection;
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = await login(accounts.employerA);

    // Leave types come from configuration, never hard-coded (spec §3/§22).
    const testLeaveRes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: `Test Leave ${stamp}`, daysPerYear: 5, paid: true, requiresAttachment: false }
    });
    check('Employer A configures "Test Leave" (5 days/year, no document)', testLeaveRes.status === 201, testLeaveRes);
    const TEST_LEAVE = `Test Leave ${stamp}`;

    const docLeaveRes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: `Doc Leave ${stamp}`, daysPerYear: 10, paid: true, requiresAttachment: true }
    });
    check('Employer A configures "Doc Leave" (requires a supporting document)', docLeaveRes.status === 201, docLeaveRes);
    const DOC_LEAVE = `Doc Leave ${stamp}`;

    const overlapLeaveRes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: `Overlap Leave ${stamp}`, daysPerYear: 20, paid: true, requiresAttachment: false }
    });
    check('Employer A configures "Overlap Leave" (20 days/year)', overlapLeaveRes.status === 201, overlapLeaveRes);
    const OVERLAP_LEAVE = `Overlap Leave ${stamp}`;

    const employeeA = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Employee', lastName: 'A',
        email: `leave-empA-emp-${stamp}@example.com`, role: 'employee'
    });
    const expertA = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Expert', lastName: 'A',
        email: `leave-expA-${stamp}@example.com`, role: 'hr_expert'
    });
    const managerA = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Manager', lastName: 'A',
        email: `leave-mgrA-${stamp}@example.com`, role: 'hr_manager'
    });
    const employeeC = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Employee', lastName: 'C',
        email: `leave-empC-${stamp}@example.com`, role: 'employee'
    });

    // A leave type explicitly deactivated by the organization is rejected,
    // even though a still-unconfigured free-typed value is intentionally left
    // for HR to judge during review (existing design - see
    // getEmployeeLeaveBalances in leaveController.js).
    const inactiveTypeRes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: `Retired Leave ${stamp}`, daysPerYear: 3, paid: true, status: 'inactive' }
    });
    check('Employer A configures an inactive leave type', inactiveTypeRes.status === 201, inactiveTypeRes);
    const inactiveTypeReq = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: `Retired Leave ${stamp}`, startDate: dateOffset(1), endDate: dateOffset(1), reason: 'Testing' }
    });
    check('An inactive leave type is rejected', inactiveTypeReq.status === 400, inactiveTypeReq);

    // ================================================================
    // Test 3 - Invalid dates
    // ================================================================
    const invalidDates = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(15), endDate: dateOffset(10), reason: 'End before start' }
    });
    check('Test 3: end date before start date is rejected', invalidDates.status === 400, invalidDates);

    // ================================================================
    // Test 1 - Valid request: full HR Expert -> HR Manager workflow
    // ================================================================
    const req1 = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(10), endDate: dateOffset(12), reason: 'Family trip' }
    });
    check('Test 1: employee submits a valid leave request', req1.status === 201, req1);
    check('Test 1: backend computes the day count (3 days)', req1.data.data?.totalDays === 3, req1.data);
    check('Test 1: request starts as "pending"', req1.data.data?.status === 'pending', req1.data);
    const req1Id = req1.data.data._id;

    // ---- Test 7 / role separation - HR Manager cannot bypass HR Expert -------
    const bypassAttempt = await call('PUT', `/leaves/${req1Id}/status`, {
        token: managerA.token, body: { status: 'approved' }
    });
    check('Test 7: HR Manager cannot decide a still-pending request (bypass denied)',
        bypassAttempt.status === 400 && /HR Expert/i.test(bypassAttempt.data.message || ''), bypassAttempt);

    // ---- Test 10 - HR Expert cannot perform the final approval ----------------
    const expertApproveAttempt = await call('PUT', `/leaves/${req1Id}/status`, {
        token: expertA.token, body: { status: 'approved' }
    });
    check('Test 10: HR Expert cannot perform the final approval (no leave:approve capability)',
        expertApproveAttempt.status === 403, expertApproveAttempt);

    const forwardRes = await call('PUT', `/leaves/${req1Id}/process`, { token: expertA.token, body: {} });
    check('Test 1: HR Expert forwards the validated request', forwardRes.status === 200, forwardRes);
    check('Test 1: status becomes "under_review"', forwardRes.data.data?.status === 'under_review', forwardRes.data);

    const approveRes = await call('PUT', `/leaves/${req1Id}/status`, {
        token: managerA.token, body: { status: 'approved' }
    });
    check('Test 1: HR Manager approves the forwarded request', approveRes.status === 200, approveRes);
    check('Test 1: status becomes "approved"', approveRes.data.data?.status === 'approved', approveRes.data);

    const balanceAfter1 = await call('GET', '/leaves/balance', { token: employeeA.token });
    const testLeaveBalance1 = (balanceAfter1.data.balances || []).find(b => b.leaveType === TEST_LEAVE);
    check('Test 1: approved days are deducted from the balance (2 remaining of 5)',
        testLeaveBalance1?.available === 2, testLeaveBalance1);

    // ================================================================
    // Balance retrieval bug fix: a User with an organization role but no
    // Employee HR record yet (e.g. added via /employers/me/team, before any
    // employee data entry) must still see a REAL computed balance, not an
    // empty array indistinguishable from "no leave types configured".
    // ================================================================
    const bareEmail = `leave-bare-${stamp}@example.com`;
    extraEmails.push(bareEmail);
    const bareRes = await call('POST', '/employers/me/team', {
        token: employerAToken, body: { name: 'Bare Account', email: bareEmail, password: PASSWORD, role: 'employee' }
    });
    check('A bare account (no Employee record) can be added to the organization', bareRes.status === 201, bareRes);
    const bareToken = await login({ email: bareEmail, password: PASSWORD });

    const bareBalance = await call('GET', '/leaves/balance', { token: bareToken });
    check('Balance fix: a user with no Employee record yet still gets 200', bareBalance.status === 200, bareBalance);
    check('Balance fix: real configured balances are returned, not an empty array',
        (bareBalance.data.balances || []).length > 0
        && bareBalance.data.balances.some(b => b.leaveType === TEST_LEAVE && b.available === 5),
        bareBalance.data);
    check('Balance fix: response flags that no Employee record is linked yet',
        bareBalance.data.employeeLinked === false, bareBalance.data);

    // ---- Balance endpoint authorization ---------------------------------
    const employeeCProfile = await call('GET', '/employees', { token: employerAToken });
    const employeeCRecord = (employeeCProfile.data.data || []).find(e => e.contactInfo?.email === `leave-empC-${stamp}@example.com`);

    const crossBalance = await call('GET', `/leaves/balance?employeeId=${employeeCRecord?._id}`, { token: employeeA.token });
    check('Test 5 (security): a plain employee cannot retrieve another employee\'s balance - the employeeId param is ignored, their own balance is returned instead',
        crossBalance.status === 200 && (crossBalance.data.balances || []).find(b => b.leaveType === TEST_LEAVE)?.available === 2,
        crossBalance.data);

    const privilegedBalance = await call('GET', `/leaves/balance?employeeId=${employeeCRecord?._id}`, { token: expertA.token });
    check('HR Expert (leave:view) CAN retrieve a specific employee\'s balance by id',
        privilegedBalance.status === 200
        && (privilegedBalance.data.balances || []).some(b => b.leaveType === TEST_LEAVE && b.available === 5),
        privilegedBalance.data);

    const missingEmployeeBalance = await call('GET', '/leaves/balance?employeeId=000000000000000000000000', { token: expertA.token });
    check('An unknown employeeId returns 404, not a misleading empty success', missingEmployeeBalance.status === 404, missingEmployeeBalance);

    // ================================================================
    // Test 2 - Insufficient balance is rejected before it ever reaches HR
    // ================================================================
    const insufficientReq = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(30), endDate: dateOffset(32), reason: 'Too many days' }
    });
    check('Test 2: a request exceeding the available balance is rejected',
        insufficientReq.status === 400 && /insufficient/i.test(insufficientReq.data.message || ''), insufficientReq);

    // ================================================================
    // Test 9 - Concurrent/double request cannot double-spend the same balance
    // ================================================================
    const reqA9 = await call('POST', '/leaves', {
        token: employeeC.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(80), endDate: dateOffset(82), reason: 'Request A' }
    });
    check('Test 9: employee C\'s first request (3 of 5 days) is accepted', reqA9.status === 201, reqA9);

    const reqB9 = await call('POST', '/leaves', {
        token: employeeC.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(90), endDate: dateOffset(92), reason: 'Request B' }
    });
    check('Test 9: a second, non-overlapping request that would double-spend the reserved balance is rejected',
        reqB9.status === 400 && /insufficient/i.test(reqB9.data.message || ''), reqB9);

    // ================================================================
    // Test 4 - Required supporting document is enforced
    // ================================================================
    const noDocReq = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: DOC_LEAVE, startDate: dateOffset(40), endDate: dateOffset(40), reason: 'Medical' }
    });
    check('Test 4: a leave type requiring a document rejects a request without one',
        noDocReq.status === 400 && /document/i.test(noDocReq.data.message || ''), noDocReq);

    const docForm = new FormData();
    docForm.append('leaveType', DOC_LEAVE);
    docForm.append('startDate', dateOffset(41));
    docForm.append('endDate', dateOffset(41));
    docForm.append('reason', 'Medical, doctor\'s note attached');
    docForm.append('document', Buffer.from('%PDF-1.4 fake supporting document'), {
        filename: 'note.pdf', contentType: 'application/pdf'
    });
    const withDocReq = await call('POST', '/leaves', { token: employeeA.token, form: docForm });
    check('Test 4: the same request succeeds once a document is attached',
        withDocReq.status === 201 && withDocReq.data.data?.attachments?.length === 1, withDocReq);

    // ================================================================
    // Test 5 - Overlapping leave is detected
    // ================================================================
    const overlapA = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: OVERLAP_LEAVE, startDate: dateOffset(50), endDate: dateOffset(52), reason: 'First' }
    });
    check('Test 5: first request in the range is accepted', overlapA.status === 201, overlapA);

    const overlapB = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: OVERLAP_LEAVE, startDate: dateOffset(51), endDate: dateOffset(54), reason: 'Overlapping' }
    });
    check('Test 5: an overlapping request is rejected',
        overlapB.status === 400 && /overlap/i.test(overlapB.data.message || ''), overlapB);

    // ================================================================
    // Test 6 - Return for correction -> employee edits -> resubmits -> validated
    // ================================================================
    const req6 = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: OVERLAP_LEAVE, startDate: dateOffset(60), endDate: dateOffset(61), reason: 'Needs a fix' }
    });
    check('Test 6: employee submits a request', req6.status === 201, req6);
    const req6Id = req6.data.data._id;

    const resubmitTooEarly = await call('PUT', `/leaves/${req6Id}/resubmit`, {
        token: employeeA.token, body: { reason: 'Trying to edit before any return' }
    });
    check('Test 6: a pending request cannot be "resubmitted" (nothing to correct yet)',
        resubmitTooEarly.status === 400, resubmitTooEarly);

    const returnRes = await call('PUT', `/leaves/${req6Id}/return`, {
        token: expertA.token, body: { note: 'Please clarify the reason for this request.' }
    });
    check('Test 6: HR Expert returns the request for correction', returnRes.status === 200, returnRes);
    check('Test 6: status becomes "returned_for_correction"',
        returnRes.data.data?.status === 'returned_for_correction', returnRes.data);

    // Regression: the "leave_returned" notification type must be accepted by
    // the Notification model, otherwise the employee's notification silently
    // fails to save (Mongoose enum validation error, swallowed by the
    // notification service) and they never learn the request was sent back.
    const empNotifications = await call('GET', '/notifications', { token: employeeA.token });
    const returnedNotification = (empNotifications.data.notifications || [])
        .find(n => n.type === 'leave_returned');
    check('Test 6: the employee actually receives a "leave_returned" notification after Send Back',
        !!returnedNotification, empNotifications.data);

    const bypassAfterReturn = await call('PUT', `/leaves/${req6Id}/process`, { token: expertA.token, body: {} });
    check('Test 6: a returned request cannot be forwarded directly (must be resubmitted first)',
        bypassAfterReturn.status === 400, bypassAfterReturn);

    const resubmitRes = await call('PUT', `/leaves/${req6Id}/resubmit`, {
        token: employeeA.token, body: { reason: 'Clarified: annual family visit' }
    });
    check('Test 6: employee edits and resubmits the request', resubmitRes.status === 200, resubmitRes);
    check('Test 6: status returns to "pending"', resubmitRes.data.data?.status === 'pending', resubmitRes.data);

    const forward6 = await call('PUT', `/leaves/${req6Id}/process`, { token: expertA.token, body: {} });
    check('Test 6: HR Expert can now forward the corrected request', forward6.status === 200, forward6);

    const approve6 = await call('PUT', `/leaves/${req6Id}/status`, { token: managerA.token, body: { status: 'approved' } });
    check('Test 6: HR Manager approves the corrected, validated request', approve6.status === 200, approve6);

    // ---- HR Expert has no final-rejection authority (spec change) --------------
    // The HR Expert may only forward a valid request or send it back for
    // correction/clarification; a route/handler for expert-level rejection
    // must not exist at all.
    const req6b = await call('POST', '/leaves', {
        token: employeeA.token,
        body: { leaveType: OVERLAP_LEAVE, startDate: dateOffset(65), endDate: dateOffset(65), reason: 'Should not be rejectable by HR Expert' }
    });
    check('Test 6b: employee submits a request', req6b.status === 201, req6b);

    const expertRejectAttempt = await call('PUT', `/leaves/${req6b.data.data._id}/expert-reject`, {
        token: expertA.token, body: { reason: 'Does not meet policy requirements' }
    });
    check('HR Expert reject route no longer exists (404/Not Found)',
        expertRejectAttempt.status === 404, expertRejectAttempt);

    const stillPending = await call('GET', `/leaves/${req6b.data.data._id}`, { token: expertA.token });
    check('Test 6b: the request is unaffected and still pending after the rejected attempt',
        stillPending.data.data?.status === 'pending', stillPending.data);

    // HR Expert's only two options remain available: send back or forward.
    const sendBack6b = await call('PUT', `/leaves/${req6b.data.data._id}/return`, {
        token: expertA.token, body: { note: 'Send Back / Request Clarification: please clarify the reason.' }
    });
    check('Test 6b: HR Expert can still send the request back for clarification',
        sendBack6b.status === 200 && sendBack6b.data.data?.status === 'returned_for_correction', sendBack6b);

    // ================================================================
    // Test 8 - Ownership: an employee cannot access another employee's request
    // ================================================================
    const ownReq = await call('POST', '/leaves', {
        token: expertA.token,
        body: { leaveType: TEST_LEAVE, startDate: dateOffset(70), endDate: dateOffset(70), reason: 'Expert A\'s own leave' }
    });
    check('Test 8: HR Expert can also submit their own leave request', ownReq.status === 201, ownReq);
    const ownReqId = ownReq.data.data._id;

    const crossView = await call('GET', `/leaves/${ownReqId}`, { token: employeeA.token });
    check('Test 8: another employee cannot view someone else\'s leave request', crossView.status === 403, crossView);

    const crossCancel = await call('PUT', `/leaves/${ownReqId}/cancel`, { token: employeeA.token, body: {} });
    check('Test 8: another employee cannot cancel someone else\'s leave request', crossCancel.status === 403, crossCancel);

    const ownerView = await call('GET', `/leaves/${ownReqId}`, { token: expertA.token });
    check('Test 8: the requester can view their own request', ownerView.status === 200, ownerView);
    check('Test 8: the detail view includes balance context',
        !!ownerView.data.data?.balanceContext, ownerView.data);

    // ================================================================
    // Annual Leave base days are organization-configurable (Issue 2 fix):
    // the +1/year increment and 30-day cap stay fixed, but the starting
    // base now comes from Configuration.leaveTypes, same as every other
    // leave type, instead of always being the hardcoded statutory 21.
    // ================================================================
    const customAnnualRes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: `Annual Leave ${stamp}`, daysPerYear: 15, paid: true, requiresAttachment: false }
    });
    check('Employer A configures a custom Annual Leave base (15 days)', customAnnualRes.status === 201, customAnnualRes);
    const CUSTOM_ANNUAL = `Annual Leave ${stamp}`;

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const tenuredEmployee = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Tenured', lastName: 'Employee',
        email: `leave-tenured-${stamp}@example.com`, role: 'employee', hireDate: twoYearsAgo.toISOString()
    });

    const tenuredBalance = await call('GET', '/leaves/balance', { token: tenuredEmployee.token });
    const tenuredAnnual = (tenuredBalance.data.balances || []).find(b => b.leaveType === CUSTOM_ANNUAL);
    check('Annual Leave base fix: configured base (15) + 2 years tenure = 17, not the hardcoded 21+2=23',
        tenuredAnnual?.entitlement === 17, tenuredAnnual);

    const thirtyYearsAgo = new Date();
    thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
    const veteranEmployee = await makeStaffMember({
        employerToken: employerAToken, firstName: 'Veteran', lastName: 'Employee',
        email: `leave-veteran-${stamp}@example.com`, role: 'employee', hireDate: thirtyYearsAgo.toISOString()
    });
    const veteranBalance = await call('GET', '/leaves/balance', { token: veteranEmployee.token });
    const veteranAnnual = (veteranBalance.data.balances || []).find(b => b.leaveType === CUSTOM_ANNUAL);
    check('Annual Leave base fix: the 30-day cap still applies regardless of the configured base',
        veteranAnnual?.entitlement === 30, veteranAnnual);

    // ---- Organization isolation -------------------------------------------
    const empBRes = await call('POST', '/auth/register', { body: accounts.employerB });
    check('Employer B registers (unrelated organization)', empBRes.status === 201, empBRes);
    const employerBId = new mongoose.Types.ObjectId(empBRes.data.organization._id);
    employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = await login(accounts.employerB);

    // ================================================================
    // Multi-organization leave rules: the same leave-type NAME can carry a
    // different entitlement per organization (user's own example: Org A
    // Marriage Leave = 3 days, Org B Marriage Leave = 5 days).
    // ================================================================
    const marriageAName = `Marriage Leave ${stamp}`;
    const marriageARes = await call('POST', '/config/leave-types', {
        token: employerAToken,
        body: { name: marriageAName, daysPerYear: 3, paid: true, requiresAttachment: false }
    });
    check('Org A configures Marriage Leave = 3 days', marriageARes.status === 201, marriageARes);

    const marriageBRes = await call('POST', '/config/leave-types', {
        token: employerBToken,
        body: { name: marriageAName, daysPerYear: 5, paid: true, requiresAttachment: false }
    });
    check('Org B configures a leave type with the SAME NAME but 5 days', marriageBRes.status === 201, marriageBRes);

    const employeeBRes = await call('POST', '/employers/me/team', {
        token: employerBToken, body: { name: 'Employee B', email: `leave-empB-emp-${stamp}@example.com`, password: PASSWORD, role: 'employee' }
    });
    extraEmails.push(`leave-empB-emp-${stamp}@example.com`);
    check('Org B adds an employee', employeeBRes.status === 201, employeeBRes);
    const employeeBToken = await login({ email: `leave-empB-emp-${stamp}@example.com`, password: PASSWORD });

    const orgABalance = await call('GET', '/leaves/balance', { token: employeeA.token });
    const orgAMarriage = (orgABalance.data.balances || []).find(b => b.leaveType === marriageAName);
    check('Org A\'s employee sees Org A\'s entitlement (3 days) for this leave type name',
        orgAMarriage?.entitlement === 3, orgAMarriage);

    const orgBBalance = await call('GET', '/leaves/balance', { token: employeeBToken });
    const orgBMarriage = (orgBBalance.data.balances || []).find(b => b.leaveType === marriageAName);
    check('Org B\'s employee sees Org B\'s DIFFERENT entitlement (5 days) for the identically-named leave type',
        orgBMarriage?.entitlement === 5, orgBMarriage);

    const crossOrgView = await call('GET', `/leaves/${req1Id}`, { token: employerBToken });
    check('Organization B cannot view Organization A\'s leave request', crossOrgView.status === 403, crossOrgView);

    const crossOrgList = await call('GET', '/leaves', { token: employerBToken });
    check('Organization B\'s leave list never includes Organization A\'s requests',
        crossOrgList.status === 403 || (crossOrgList.data.data || []).every(l => l.employee?.employer !== employerAId.toString()),
        crossOrgList);

    // ---------------------------------------------------------------- summary
    console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : `${failures} TEST(S) FAILED`}`);
    await cleanup();
    await mongoose.disconnect();
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('Self-test crashed:', err);
    try { await cleanup(); } catch (cleanupErr) { console.error('Cleanup also failed:', cleanupErr); }
    process.exit(1);
});
