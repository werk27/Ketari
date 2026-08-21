/**
 * End-to-end check of the recruitment -> hire -> onboarding path.
 *
 * Verifies the separation of duties the business rules require: an HR Expert
 * screens, shortlists and interviews a candidate, and only an HR Manager may
 * record the final hiring decision.
 *
 * Fully self-contained - it creates its own throwaway organization, HR team,
 * vacancy and candidate, and removes all of them again at the end. It never
 * touches existing accounts or data.
 *
 * Usage: node scripts/hiringFlowSelfTest.js [apiUrl]
 */
const path = require('path');
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'FlowTest123!';

const accounts = {
    employer: { name: 'Flow Test Employer', email: `flow-employer-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expert: { name: 'Flow Test Expert', email: `flow-expert-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    manager: { name: 'Flow Test Manager', email: `flow-manager-${stamp}@example.com`, password: PASSWORD, role: 'hr_manager' },
    candidate: { name: 'Flow Test Candidate', email: `flow-candidate-${stamp}@example.com`, password: PASSWORD }
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
    if (created.employerId) {
        await db.collection('jobs').deleteMany({ employer: created.employerId });
        await db.collection('employees').deleteMany({ employer: created.employerId });
        await db.collection('employers').deleteMany({ _id: created.employerId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    // ---- Throwaway organization with its own HR team -------------------------
    const employerReg = await call('POST', '/auth/register', { body: accounts.employer });
    check('Employer account created', employerReg.status === 201, employerReg);
    const employerToken = employerReg.data.token;
    created.employerId = new mongoose.Types.ObjectId(employerReg.data.organization._id);

    // A new organization starts as 'pending'; activate it so vacancies can publish.
    await db.collection('employers').updateOne(
        { _id: created.employerId },
        { $set: { status: 'active', verifiedAt: new Date() } }
    );

    for (const key of ['expert', 'manager']) {
        const res = await call('POST', '/employers/me/team', { token: employerToken, body: accounts[key] });
        check(`${accounts[key].role} added to the organization`, res.status === 201, res);
    }

    const expertToken = await login(accounts.expert);
    const managerToken = await login(accounts.manager);

    // ---- HR Expert creates a vacancy, HR Manager approves it -----------------
    const jobRes = await call('POST', '/jobs', {
        token: expertToken,
        body: {
            title: 'Hiring Flow Test Role',
            description: 'Temporary vacancy created by the hiring flow self test.',
            department: 'Engineering',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            requiredSkills: ['javascript'],
            experienceRequired: 0
        }
    });
    check('HR Expert can create a vacancy', [200, 201].includes(jobRes.status), jobRes);
    const job = jobRes.data.job;
    if (!job) throw new Error('Vacancy was not created; cannot continue.');

    if (job.status === 'draft') {
        const submitted = await call('PUT', `/jobs/${job._id}/submit`, { token: expertToken });
        check('HR Expert submits the vacancy for approval', submitted.status === 200, submitted);
    }

    const expertApprove = await call('PUT', `/jobs/${job._id}/approve`, { token: expertToken });
    check('HR Expert cannot approve their own vacancy', expertApprove.status === 403, expertApprove);

    const approved = await call('PUT', `/jobs/${job._id}/approve`, { token: managerToken });
    check('HR Manager approves the vacancy', approved.status === 200, approved);

    // ---- Candidate registers and applies -------------------------------------
    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);
    const candidateToken = candidateReg.data.token;
    const candidateId = new mongoose.Types.ObjectId(candidateReg.data.user.id);

    // Resume upload needs a real file, so the record is inserted directly.
    const resumeInsert = await db.collection('resumes').insertOne({
        user: candidateId,
        title: 'Flow test CV',
        isDefault: true,
        parsedData: { skills: ['javascript'], education: [], workExperience: [] },
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const applied = await call('POST', '/applications', {
        token: candidateToken,
        body: { jobId: job._id, resumeId: resumeInsert.insertedId.toString() }
    });
    check('Candidate applies to the vacancy', applied.status === 201, applied);
    const application = applied.data.application;
    if (!application) throw new Error('Application was not created; cannot continue.');
    check('New application starts as "applied"', application.status === 'applied', application.status);

    // ---- HR Expert processing pipeline ---------------------------------------
    for (const status of ['under_review', 'shortlisted', 'interviewed']) {
        const res = await call('PUT', `/applications/${application._id}/status`, {
            token: expertToken, body: { status }
        });
        check(`HR Expert can set "${status}"`, res.status === 200, res);
    }

    // ---- Separation of duties -------------------------------------------------
    const expertHire = await call('PUT', `/applications/${application._id}/status`, {
        token: expertToken, body: { status: 'hired' }
    });
    check('HR Expert cannot set "hired" via the status endpoint', expertHire.status === 403, expertHire);

    const expertDecision = await call('PUT', `/applications/${application._id}/decision`, {
        token: expertToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('HR Expert cannot use the decision endpoint', expertDecision.status === 403, expertDecision);

    const expertQueue = await call('GET', '/applications/pending-decision', { token: expertToken });
    check('HR Expert cannot read the decision queue', expertQueue.status === 403, expertQueue);

    const employerDecision = await call('PUT', `/applications/${application._id}/decision`, {
        token: employerToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('Employer owner cannot decide either', employerDecision.status === 403, employerDecision);

    // ---- HR Manager decision queue ---------------------------------------------
    const queue = await call('GET', '/applications/pending-decision', { token: managerToken });
    check('HR Manager can read the decision queue', queue.status === 200, queue);
    const queued = (queue.data.applications || []).find(a => a._id === application._id);
    check('Candidate appears in the decision queue', !!queued, queue.data.count);
    check('Queue entry is actionable by this manager', queued?.canDecide === true, queued?.canDecide);
    check('Queue entry carries the vacancy title', queued?.job?.title === 'Hiring Flow Test Role', queued?.job);

    // ---- HR Manager hires --------------------------------------------------------
    const decision = await call('PUT', `/applications/${application._id}/decision`, {
        token: managerToken,
        body: { outcome: 'approved', status: 'hired', reason: 'Strong fit (self test)' }
    });
    check('HR Manager can record the hire', decision.status === 200, decision);
    check('Application status becomes "hired"', decision.data.application?.status === 'hired', decision.data.application?.status);
    check('Decision records who approved it', !!decision.data.application?.decision?.decidedBy, decision.data.application?.decision);

    const onboarding = decision.data.onboarding;
    check('Employee record created for onboarding', !!onboarding?.employeeId && !onboarding?.error, onboarding);

    // ---- The hired candidate becomes an employee ----------------------------------
    const me = await call('GET', '/auth/me', { token: candidateToken });
    check('Hired candidate is now role "employee"', me.data.user?.role === 'employee', me.data.user?.role);

    const employeeCount = await db.collection('employees').countDocuments({ user: candidateId });
    check('Exactly one employee record exists', employeeCount === 1, employeeCount);

    // ---- Re-deciding must not duplicate anything ------------------------------------
    const again = await call('PUT', `/applications/${application._id}/decision`, {
        token: managerToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('Re-deciding a hired application is refused', again.status === 400, again);

    const queueAfter = await call('GET', '/applications/pending-decision', { token: managerToken });
    const stillQueued = (queueAfter.data.applications || []).some(a => a._id === application._id);
    check('Hired candidate leaves the decision queue', !stillQueued, queueAfter.data.count);

    // ---- An expert may not overwrite an authorised decision --------------------------
    const reopen = await call('PUT', `/applications/${application._id}/status`, {
        token: expertToken, body: { status: 'rejected' }
    });
    check('HR Expert cannot overwrite a recorded decision', reopen.status === 403, reopen);

    const afterReopen = await call('GET', `/applications/job/${job._id}`, { token: managerToken });
    const untouched = (afterReopen.data.applications || []).find(a => a._id === application._id);
    check('Application is still "hired" after the attempt', untouched?.status === 'hired', untouched?.status);

    // ---- A hire whose onboarding failed must be recoverable ---------------------------
    // Simulate the bridge having failed by removing the employee record.
    await db.collection('employees').deleteMany({ user: candidateId });

    const strandedQueue = await call('GET', '/applications/pending-decision', { token: managerToken });
    const stranded = (strandedQueue.data.applications || []).find(a => a._id === application._id);
    check('Hire with no employee record reappears in the queue', !!stranded, strandedQueue.data.count);
    check('Queue flags the failed onboarding', stranded?.onboardingFailed === true, stranded?.onboardingFailed);

    const retry = await call('PUT', `/applications/${application._id}/decision`, {
        token: managerToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('HR Manager can retry the failed onboarding', retry.status === 200, retry);
    check('Retry recreates the employee record', !!retry.data.onboarding?.employeeId, retry.data.onboarding);

    const finalCount = await db.collection('employees').countDocuments({ user: candidateId });
    check('Retry produced exactly one employee record', finalCount === 1, finalCount);

    await cleanup();
    console.log('\nCleanup: removed the test organization, HR team, vacancy, application and accounts.');
    await mongoose.disconnect();

    console.log(failures === 0 ? '\nAll hiring flow checks passed.' : `\n${failures} hiring flow check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self test crashed:', error.message);
    try {
        await cleanup();
        console.error('Cleanup completed.');
        await mongoose.disconnect();
    } catch (cleanupError) {
        console.error('Cleanup also failed:', cleanupError.message);
    }
    process.exit(1);
});
