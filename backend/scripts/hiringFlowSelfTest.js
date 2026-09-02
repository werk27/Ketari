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
            experienceRequired: 0,
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
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
    check('Decision response flags that the vacancy was auto-closed', decision.data.vacancyClosed === true, decision.data.vacancyClosed);

    // ---- Filling the vacancy's one required position closes it automatically --------
    // This job defaulted to numberOfPositions: 1, so the single hire above
    // should already have filled it.
    const jobAfterHire = await call('GET', `/jobs/${job._id}`, { token: managerToken });
    check('Vacancy status becomes "closed" once its one required position is filled',
        jobAfterHire.data.job?.status === 'closed', jobAfterHire.data.job?.status);
    check('Vacancy detail reports fulfillment stats (1 of 1 filled)',
        jobAfterHire.data.vacancy?.hired === 1 && jobAfterHire.data.vacancy?.required === 1 && jobAfterHire.data.vacancy?.isFull === true,
        jobAfterHire.data.vacancy);

    const publicListingAfterFill = await call('GET', '/jobs');
    const stillPubliclyListed = (publicListingAfterFill.data.jobs || []).some(j => j._id === job._id);
    check('A fully-filled, auto-closed vacancy no longer appears on the public job board',
        !stillPubliclyListed, publicListingAfterFill.data.totalJobs);

    // ---- The hire does not by itself grant the employee workspace -------------------
    // The role changes only when the person follows their activation link, so a
    // candidate who is signed in is not moved into a different workspace by a
    // decision someone else just made. See authController.activateEmployee and
    // scripts/hiringActivationSelfTest.js for the activation half.
    const me = await call('GET', '/auth/me', { token: candidateToken });
    check('Hired candidate stays a candidate until they activate',
        me.data.user?.role === 'candidate', me.data.user?.role);
    check('The hire reports that activation is still pending',
        onboarding?.accountActivationPending === true, onboarding);

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

    // ================================================================
    // Vacancy fulfillment - multi-position headcount, over-hire guard,
    // and manual close (spec: numberOfPositions vs. hires).
    // ================================================================
    let candidateSeq = 0;
    const registerCandidate = async () => {
        candidateSeq += 1;
        const email = `flow-candidate-${stamp}-${candidateSeq}@example.com`;
        const reg = await call('POST', '/auth/register', {
            body: { name: `Flow Test Candidate ${candidateSeq}`, email, password: PASSWORD }
        });
        check(`Extra candidate ${candidateSeq} registers`, reg.status === 201, reg);
        created.emails.push(email);
        const id = new mongoose.Types.ObjectId(reg.data.user.id);
        const resumeInsert2 = await db.collection('resumes').insertOne({
            user: id, title: `Flow test CV ${candidateSeq}`, isDefault: true,
            parsedData: { skills: ['javascript'], education: [], workExperience: [] },
            createdAt: new Date(), updatedAt: new Date()
        });
        return { token: reg.data.token, id, resumeId: resumeInsert2.insertedId.toString() };
    };

    /** Apply, run through the HR Expert pipeline, and record the HR Manager's hire decision. */
    const applyAndHire = async (jobId, candidate) => {
        const appliedRes = await call('POST', '/applications', {
            token: candidate.token, body: { jobId, resumeId: candidate.resumeId }
        });
        if (appliedRes.status !== 201) return { appliedRes, hireRes: null };
        const appId = appliedRes.data.application._id;
        for (const status of ['under_review', 'shortlisted', 'interviewed']) {
            await call('PUT', `/applications/${appId}/status`, { token: expertToken, body: { status } });
        }
        const hireRes = await call('PUT', `/applications/${appId}/decision`, {
            token: managerToken, body: { outcome: 'approved', status: 'hired' }
        });
        return { appliedRes, hireRes };
    };

    // ---- A 2-position vacancy stays open with one opening remaining ------------------
    const job2Res = await call('POST', '/jobs', {
        token: expertToken,
        body: {
            title: 'Hiring Flow Test Role (2 positions)',
            description: 'Temporary 2-position vacancy created by the hiring flow self test.',
            department: 'Engineering',
            location: 'Hawassa',
            numberOfPositions: 2,
            applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
        }
    });
    const job2 = job2Res.data.job;
    check('A 2-position vacancy is created', [200, 201].includes(job2Res.status) && !!job2, job2Res);
    if (job2.status === 'draft') await call('PUT', `/jobs/${job2._id}/submit`, { token: expertToken });
    await call('PUT', `/jobs/${job2._id}/approve`, { token: managerToken });

    const candidate2 = await registerCandidate();
    const { hireRes: hire1of2 } = await applyAndHire(job2._id, candidate2);
    check('First of two positions is hired', hire1of2?.status === 200 && hire1of2.data.application?.status === 'hired', hire1of2?.data);
    check('Vacancy is NOT auto-closed with one opening still remaining', hire1of2?.data.vacancyClosed === false, hire1of2?.data.vacancyClosed);

    const job2AfterOneHire = await call('GET', `/jobs/${job2._id}`, { token: managerToken });
    check('Vacancy stays published with 1 of 2 filled', job2AfterOneHire.data.job?.status === 'published', job2AfterOneHire.data.job?.status);
    check('Vacancy reports 1 remaining opening',
        job2AfterOneHire.data.vacancy?.hired === 1 && job2AfterOneHire.data.vacancy?.remaining === 1 && job2AfterOneHire.data.vacancy?.isFull === false,
        job2AfterOneHire.data.vacancy);

    const candidate3 = await registerCandidate();
    const applyWhileOneRemains = await call('POST', '/applications', {
        token: candidate3.token, body: { jobId: job2._id, resumeId: candidate3.resumeId }
    });
    check('A new candidate can still apply while one position remains', applyWhileOneRemains.status === 201, applyWhileOneRemains);

    // candidate3 already applied above; run their application through the
    // pipeline and hire them directly rather than re-applying.
    const appId3 = applyWhileOneRemains.data.application._id;
    for (const status of ['under_review', 'shortlisted', 'interviewed']) {
        await call('PUT', `/applications/${appId3}/status`, { token: expertToken, body: { status } });
    }
    const hire2Res = await call('PUT', `/applications/${appId3}/decision`, {
        token: managerToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('Second of two positions is hired', hire2Res.status === 200 && hire2Res.data.application?.status === 'hired', hire2Res.data);
    check('Vacancy IS auto-closed once both positions are filled', hire2Res.data.vacancyClosed === true, hire2Res.data.vacancyClosed);

    const candidate4 = await registerCandidate();
    const applyAfterFull = await call('POST', '/applications', {
        token: candidate4.token, body: { jobId: job2._id, resumeId: candidate4.resumeId }
    });
    check('A new candidate cannot apply once both positions are filled and the vacancy has closed',
        applyAfterFull.status === 400, applyAfterFull);

    // ---- Defensive over-hire guard: the headcount check blocks applications  --------
    // even for a vacancy whose status was somehow left public (belt-and-braces
    // check in applyJob, independent of the auto-close in decideApplication).
    await db.collection('jobs').updateOne({ _id: new mongoose.Types.ObjectId(job2._id) }, { $set: { status: 'published' } });
    const candidate5 = await registerCandidate();
    const applyDespiteReopenedStatus = await call('POST', '/applications', {
        token: candidate5.token, body: { jobId: job2._id, resumeId: candidate5.resumeId }
    });
    check('The headcount guard blocks a new application even if the vacancy status is reopened',
        applyDespiteReopenedStatus.status === 400 && /filled/i.test(applyDespiteReopenedStatus.data.message || ''),
        applyDespiteReopenedStatus);

    // ---- Manual close still works, and does not disturb an application already in the pipeline ----
    const job3Res = await call('POST', '/jobs', {
        token: expertToken,
        body: {
            title: 'Hiring Flow Test Role (manual close)',
            description: 'Temporary vacancy for the manual-close self test.',
            department: 'Engineering',
            location: 'Hawassa',
            numberOfPositions: 2,
            applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
        }
    });
    const job3 = job3Res.data.job;
    if (job3.status === 'draft') await call('PUT', `/jobs/${job3._id}/submit`, { token: expertToken });
    await call('PUT', `/jobs/${job3._id}/approve`, { token: managerToken });

    const candidate6 = await registerCandidate();
    const applyJob3 = await call('POST', '/applications', {
        token: candidate6.token, body: { jobId: job3._id, resumeId: candidate6.resumeId }
    });
    check('Candidate applies to the manual-close test vacancy', applyJob3.status === 201, applyJob3);
    const appId6 = applyJob3.data.application._id;

    const expertCloseAttempt = await call('PUT', `/jobs/${job3._id}/close`, { token: expertToken });
    check('HR Expert cannot manually close a vacancy (HR Manager / Employer only)', expertCloseAttempt.status === 403, expertCloseAttempt);

    const managerClose = await call('PUT', `/jobs/${job3._id}/close`, { token: managerToken });
    check('HR Manager can manually close a vacancy with an opening still remaining', managerClose.status === 200, managerClose);
    check('Manually closed vacancy status is "closed"', managerClose.data.job?.status === 'closed', managerClose.data.job?.status);

    const candidate7 = await registerCandidate();
    const applyAfterManualClose = await call('POST', '/applications', {
        token: candidate7.token, body: { jobId: job3._id, resumeId: candidate7.resumeId }
    });
    check('A new candidate cannot apply to a manually closed vacancy', applyAfterManualClose.status === 400, applyAfterManualClose);

    // Closing must not affect an application already in the pipeline before the close.
    for (const status of ['under_review', 'shortlisted', 'interviewed']) {
        await call('PUT', `/applications/${appId6}/status`, { token: expertToken, body: { status } });
    }
    const hireAfterClose = await call('PUT', `/applications/${appId6}/decision`, {
        token: managerToken, body: { outcome: 'approved', status: 'hired' }
    });
    check('An application already in the pipeline can still be hired after the vacancy was manually closed',
        hireAfterClose.status === 200 && hireAfterClose.data.application?.status === 'hired', hireAfterClose.data);

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
