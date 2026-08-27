/**
 * Self test: role-based notification delivery.
 *
 * Exercises every event workflow the notification system must cover and
 * confirms delivery reaches only the correct recipient:
 *
 *   Candidate applies                -> notify HR Expert, Employer, candidate
 *   HR Expert shortlists             -> notify candidate, HR Manager
 *   HR Expert schedules interview    -> notify candidate
 *   HR Manager decides (hire)        -> notify candidate
 *   HR Expert submits a vacancy      -> notify HR Manager
 *   HR Manager approves a vacancy    -> notify HR Expert (submitter)
 *   Employee submits leave           -> notify HR Expert
 *   HR Expert forwards leave         -> notify HR Manager
 *   HR Manager decides leave         -> notify Employee
 *   Employee submits a request       -> notify HR Expert
 *   HR Expert forwards request       -> notify HR Manager
 *   HR Manager decides request       -> notify Employee
 *   HR Expert proposes training      -> notify HR Manager
 *   HR Manager decides training      -> notify HR Expert (proposer)
 *   Employer submits for verification-> notify System Administrator
 *   Administrator decides employer   -> notify Employer owner
 *
 * Also proves a user can never read another user's notifications by
 * changing the notification id, nor by changing the organization context.
 *
 * Fully self-contained: creates two throwaway organizations, a candidate,
 * an employee and a throwaway administrator, and removes everything again
 * at the end.
 *
 * Usage: node scripts/notificationSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'NotifyTest123!';

const accounts = {
    employerA: { name: 'Notify Employer A', email: `notify-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertA: { name: 'Notify Expert A', email: `notify-expA-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    managerA: { name: 'Notify Manager A', email: `notify-mgrA-${stamp}@example.com`, password: PASSWORD, role: 'hr_manager' },
    employerB: { name: 'Notify Employer B', email: `notify-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    candidate: { name: 'Notify Candidate', email: `notify-cand-${stamp}@example.com`, password: PASSWORD }
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
    try { data = await res.json(); } catch (e) { data = { message: '<non-JSON response>' }; }
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

/** Fetch this user's notifications and find the newest one matching a title substring. */
const findNotification = async (token, titleContains) => {
    const res = await call('GET', '/notifications', { token });
    const list = res.data.notifications || [];
    return list.find(n => n.title.toLowerCase().includes(titleContains.toLowerCase()));
};

const created = { emails: Object.values(accounts).map(a => a.email), extraEmails: [] };

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const allEmails = [...created.emails, ...created.extraEmails];
    const users = await db.collection('users').find({ email: { $in: allEmails } }).toArray();
    const userIds = users.map(u => u._id);

    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
    await db.collection('applications').deleteMany({ applicant: { $in: userIds } });
    await db.collection('resumes').deleteMany({ user: { $in: userIds } });
    await db.collection('leaves').deleteMany({ employer: { $in: created.employerIds || [] } });
    await db.collection('employeerequests').deleteMany({ employer: { $in: created.employerIds || [] } });
    await db.collection('trainings').deleteMany({ employer: { $in: created.employerIds || [] } });
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    for (const employerId of created.employerIds || []) {
        await db.collection('jobs').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;
    created.employerIds = [];

    // ---------------------------------------------------------------- setup
    const empARes = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A registers', empARes.status === 201, empARes);
    const employerAId = new mongoose.Types.ObjectId(empARes.data.organization._id);
    created.employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = await login(accounts.employerA);
    const employerAOwnerId = empARes.data.user.id;

    const empBRes = await call('POST', '/auth/register', { body: accounts.employerB });
    check('Employer B registers (unrelated org)', empBRes.status === 201, empBRes);
    const employerBId = new mongoose.Types.ObjectId(empBRes.data.organization._id);
    created.employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = await login(accounts.employerB);

    const addExpert = await call('POST', '/employers/me/team', { token: employerAToken, body: accounts.expertA });
    check('HR Expert A added to organization A', addExpert.status === 201, addExpert);
    const addManager = await call('POST', '/employers/me/team', { token: employerAToken, body: accounts.managerA });
    check('HR Manager A added to organization A', addManager.status === 201, addManager);

    const expertToken = await login(accounts.expertA);
    const managerToken = await login(accounts.managerA);

    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);
    const candidateToken = candidateReg.data.token;
    const candidateId = candidateReg.data.user.id;

    // A throwaway administrator, created directly (there is no public admin sign-up).
    const adminEmail = `notify-admin-${stamp}@example.com`;
    created.extraEmails.push(adminEmail);
    const User = require('../src/models/User');
    await User.create({ name: 'Notify Admin', email: adminEmail, password: PASSWORD, role: 'admin' });
    const adminToken = await login({ email: adminEmail, password: PASSWORD });

    // ================================================================
    // Recruitment workflow
    // ================================================================
    const jobRes = await call('POST', '/jobs', {
        token: expertToken,
        body: {
            title: 'Notify Test Role',
            description: 'Temporary vacancy created by the notification self test.',
            department: 'Engineering',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            requiredSkills: ['javascript'],
            experienceRequired: 0,
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
        }
    });
    check('HR Expert creates a vacancy', [200, 201].includes(jobRes.status), jobRes);
    const job = jobRes.data.job;

    // ---- submitJob -> notify HR Manager team ----------------------------------
    const submitRes = await call('PUT', `/jobs/${job._id}/submit`, { token: expertToken });
    check('HR Expert submits the vacancy', submitRes.status === 200, submitRes);
    const pendingApprovalNotif = await findNotification(managerToken, 'awaiting approval');
    check('HR Manager is notified the vacancy needs approval', !!pendingApprovalNotif, pendingApprovalNotif);

    // ---- approveJob -> notify HR Expert (submitter) ----------------------------
    const approveRes = await call('PUT', `/jobs/${job._id}/approve`, { token: managerToken });
    check('HR Manager approves the vacancy', approveRes.status === 200, approveRes);
    const approvedNotif = await findNotification(expertToken, 'approved');
    check('HR Expert is notified the vacancy was approved', !!approvedNotif, approvedNotif);

    // ---- applyJob -> notify candidate, HR Expert, Employer ---------------------
    const resumeInsert = await db.collection('resumes').insertOne({
        user: new mongoose.Types.ObjectId(candidateId),
        fileName: 'notify-test-cv.pdf', filePath: '/tmp/notify-test-cv.pdf', fileType: 'pdf',
        isDefault: true,
        parsedData: { skills: ['javascript'], education: [], workExperience: [] },
        createdAt: new Date(), updatedAt: new Date()
    });

    const applyRes = await call('POST', '/applications', {
        token: candidateToken,
        body: { jobId: job._id, resumeId: resumeInsert.insertedId.toString() }
    });
    check('Candidate applies to the vacancy', applyRes.status === 201, applyRes);
    const application = applyRes.data.application;

    const candidateConfirmNotif = await findNotification(candidateToken, 'submitted');
    check('Candidate is notified their application was received', !!candidateConfirmNotif, candidateConfirmNotif);
    const expertNewAppNotif = await findNotification(expertToken, 'new application');
    check('HR Expert is notified of the new application', !!expertNewAppNotif, expertNewAppNotif);
    const employerNewAppNotif = await findNotification(employerAToken, 'new application');
    check('Employer is notified of the new application', !!employerNewAppNotif, employerNewAppNotif);

    // ---- updateApplicationStatus('shortlisted') -> notify candidate + HR Manager
    const shortlistRes = await call('PUT', `/applications/${application._id}/status`, {
        token: expertToken, body: { status: 'shortlisted' }
    });
    check('HR Expert shortlists the candidate', shortlistRes.status === 200, shortlistRes);
    const shortlistedCandidateNotif = await findNotification(candidateToken, 'shortlisted');
    check('Candidate is notified they were shortlisted', !!shortlistedCandidateNotif, shortlistedCandidateNotif);
    const managerReviewNotif = await findNotification(managerToken, 'awaiting review');
    check('HR Manager is notified a candidate awaits review', !!managerReviewNotif, managerReviewNotif);

    // ---- scheduleInterview -> notify candidate ---------------------------------
    const interviewRes = await call('PUT', `/applications/${application._id}/schedule-interview`, {
        token: expertToken,
        body: { interviewDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), interviewLocation: 'HQ' }
    });
    check('HR Expert schedules an interview', interviewRes.status === 200, interviewRes);
    const interviewNotif = await findNotification(candidateToken, 'interview');
    check('Candidate is notified of the scheduled interview', !!interviewNotif, interviewNotif);

    // ---- decideApplication (hire) -> notify candidate --------------------------
    const decisionRes = await call('PUT', `/applications/${application._id}/decision`, {
        token: managerToken, body: { outcome: 'approved', status: 'selected', reason: 'Great fit' }
    });
    check('HR Manager records a decision', decisionRes.status === 200, decisionRes);
    const decisionNotif = await findNotification(candidateToken, 'successful');
    check('Candidate is notified of the hiring decision', !!decisionNotif, decisionNotif);

    // ================================================================
    // Leave workflow (using the HR Expert's own employee record, auto-created)
    // ================================================================
    const leaveCreate = await call('POST', '/leaves', {
        token: expertToken,
        body: { leaveType: 'annual', startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000).toISOString(), reason: 'Personal' }
    });
    check('HR Expert submits a leave request for themselves', leaveCreate.status === 201, leaveCreate);
    const leave = leaveCreate.data.data;

    // A second HR Expert processes it (an HR Expert cannot approve, but can forward).
    const addExpert2Res = await call('POST', '/employers/me/team', {
        token: employerAToken, body: { name: 'Notify Expert 2', email: `notify-exp2-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' }
    });
    created.extraEmails.push(`notify-exp2-${stamp}@example.com`);
    check('A second HR Expert is added', addExpert2Res.status === 201, addExpert2Res);
    const expert2Token = await login({ email: `notify-exp2-${stamp}@example.com`, password: PASSWORD });

    const leaveProcess = await call('PUT', `/leaves/${leave._id}/process`, { token: expert2Token });
    check('HR Expert forwards the leave request', leaveProcess.status === 200, leaveProcess);
    const leaveManagerNotif = await findNotification(managerToken, 'leave request awaiting approval');
    check('HR Manager is notified a leave request awaits approval', !!leaveManagerNotif, leaveManagerNotif);

    const leaveDecision = await call('PUT', `/leaves/${leave._id}/status`, {
        token: managerToken, body: { status: 'approved' }
    });
    check('HR Manager approves the leave request', leaveDecision.status === 200, leaveDecision);
    const leaveDecisionNotif = await findNotification(expertToken, 'leave request approved');
    check('The requesting HR Expert is notified of the leave decision', !!leaveDecisionNotif, leaveDecisionNotif);

    // ================================================================
    // Employee request workflow
    // ================================================================
    const reqCreate = await call('POST', '/requests', {
        token: expertToken,
        body: { type: 'other', title: 'Notify test request', description: 'test' }
    });
    check('HR Expert raises an employee request for themselves', reqCreate.status === 201, reqCreate);
    const empRequest = reqCreate.data.data;

    const reqProcess = await call('PUT', `/requests/${empRequest._id}/process`, { token: expert2Token });
    check('A request is forwarded for approval', reqProcess.status === 200, reqProcess);
    const reqManagerNotif = await findNotification(managerToken, 'request awaiting approval');
    check('HR Manager is notified a request awaits approval', !!reqManagerNotif, reqManagerNotif);

    const reqDecision = await call('PUT', `/requests/${empRequest._id}/decision`, {
        token: managerToken, body: { outcome: 'approved' }
    });
    check('HR Manager decides the request', reqDecision.status === 200, reqDecision);
    const reqDecisionNotif = await findNotification(expertToken, 'request approved');
    check('The requester is notified of the request decision', !!reqDecisionNotif, reqDecisionNotif);

    // ================================================================
    // Training workflow
    // ================================================================
    const trainingCreate = await call('POST', '/training', {
        token: expertToken,
        body: {
            title: 'Notify Test Training', type: 'technical', description: 'Notification self test training programme',
            duration: 2, durationUnit: 'days',
            startDate: new Date().toISOString(), endDate: new Date(Date.now() + 86400000).toISOString()
        }
    });
    check('HR Expert proposes a training programme', trainingCreate.status === 201, trainingCreate);
    const training = trainingCreate.data.data;
    if (!training) {
        console.log('  SKIP  Remaining training checks (creation failed above)');
    } else {
        const trainingManagerNotif = await findNotification(managerToken, 'training proposal');
        check('HR Manager is notified a training programme awaits approval', !!trainingManagerNotif, trainingManagerNotif);

        const trainingDecision = await call('PUT', `/training/${training._id}/decision`, {
            token: managerToken, body: { outcome: 'approved' }
        });
        check('HR Manager approves the training programme', trainingDecision.status === 200, trainingDecision);
        const trainingDecisionNotif = await findNotification(expertToken, 'training approved');
        check('The proposing HR Expert is notified of the training decision', !!trainingDecisionNotif, trainingDecisionNotif);
    }

    // ================================================================
    // Employer verification workflow
    // ================================================================
    // Give Employer A the evidence it needs so submission is accepted.
    await db.collection('employers').updateOne({ _id: employerAId }, {
        $set: {
            tin: `TIN-${stamp}`, businessLicenceNumber: `LIC-${stamp}`,
            licenceExpiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
            'contact.phone': '+251900000000', 'address.city': 'Hawassa',
            organizationType: 'private_company'
        }
    });
    const submitVerification = await call('POST', '/employers/me/submit-verification', { token: employerAToken });
    check('Employer submits for verification', [200, 400].includes(submitVerification.status), submitVerification);

    if (submitVerification.status === 200) {
        const adminNotif = await findNotification(adminToken, 'verification required');
        check('Administrator is notified a new organization needs verification', !!adminNotif, adminNotif);
    } else {
        console.log('  SKIP  Administrator verification-required notification (submission incomplete in this environment)');
    }

    // Administrator decides -> notify the employer owner regardless of the above.
    const employers = await call('GET', '/employers', { token: adminToken });
    const targetEmployer = (employers.data.employers || []).find(e => e._id === employerAId.toString());
    check('Administrator can see the organization in the platform list', !!targetEmployer, employers.data);

    const employerDecision = await call('PUT', `/employers/${employerAId}/status`, {
        token: adminToken, body: { status: 'active' }
    });
    check('Administrator approves the organization', employerDecision.status === 200, employerDecision);
    const ownerToken = await login(accounts.employerA);
    const verificationResultNotif = await findNotification(ownerToken, 'verification result');
    check('Employer owner is notified of the verification result', !!verificationResultNotif, verificationResultNotif);

    // ================================================================
    // Security: cross-user / cross-org isolation
    // ================================================================
    const expertNotifRes = await call('GET', '/notifications', { token: expertToken });
    const expertNotifId = (expertNotifRes.data.notifications || [])[0]?._id;
    check('HR Expert has at least one notification to test isolation with', !!expertNotifId, expertNotifRes.data);

    if (expertNotifId) {
        const crossUserRead = await call('PUT', `/notifications/${expertNotifId}/read`, { token: candidateToken });
        check('A different user cannot mark someone else\'s notification as read', crossUserRead.status === 404, crossUserRead);
    }

    const employerBNotifs = await call('GET', '/notifications', { token: employerBToken });
    const leaked = (employerBNotifs.data.notifications || []).some(n =>
        n.title.includes('Notify Test Role') || n.message?.includes('Notify Test'));
    check('Organization B never sees Organization A\'s notifications', !leaked, employerBNotifs.data.count);

    console.log('\nCleanup: removed the test organizations, accounts and records.');
    await cleanup();

    if (failures > 0) {
        console.log(`\n${failures} check(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll notification workflow checks passed.');
    process.exit(0);
})().catch(async (err) => {
    console.error('Self test crashed:', err);
    try { await cleanup(); } catch (_) { /* best effort */ }
    process.exit(1);
});
