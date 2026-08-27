/**
 * Verifies the "fixed salary amount" business rule for job vacancies:
 *
 *   - Every vacancy must declare ONE required, positive numeric salary amount.
 *   - Legacy min/max range payloads and "negotiable" (no amount) are rejected.
 *   - The salary is returned/displayed consistently as {amount, currency, period}.
 *   - Only the authoring HR Expert may edit a vacancy (and thus its salary)
 *     before it is published; nobody else - not the candidate, not another
 *     HR Expert, not the HR Manager - can modify it via the API.
 *
 * Fully self-contained - creates its own throwaway organization, HR team,
 * vacancy and candidate, and removes all of them again at the end.
 *
 * Usage: node scripts/salarySelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'SalaryTest123!';

const accounts = {
    employer: { name: 'Salary Test Employer', email: `salary-employer-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertA: { name: 'Salary Test Expert A', email: `salary-expert-a-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    expertB: { name: 'Salary Test Expert B', email: `salary-expert-b-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    manager: { name: 'Salary Test Manager', email: `salary-manager-${stamp}@example.com`, password: PASSWORD, role: 'hr_manager' },
    candidate: { name: 'Salary Test Candidate', email: `salary-candidate-${stamp}@example.com`, password: PASSWORD }
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

const baseJob = (overrides = {}) => ({
    title: 'Salary Test Role',
    description: 'Temporary vacancy created by the salary self test.',
    department: 'Engineering',
    location: 'Hawassa',
    applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    requiredSkills: ['javascript'],
    experienceRequired: 0,
    ...overrides
});

const created = { emails: Object.values(accounts).map(a => a.email) };

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const users = await db.collection('users').find({ email: { $in: created.emails } }).toArray();
    const userIds = users.map(u => u._id);

    await db.collection('applications').deleteMany({ applicant: { $in: userIds } });
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

    await db.collection('employers').updateOne(
        { _id: created.employerId },
        { $set: { status: 'active', verifiedAt: new Date() } }
    );

    for (const key of ['expertA', 'expertB', 'manager']) {
        const res = await call('POST', '/employers/me/team', { token: employerToken, body: accounts[key] });
        check(`${accounts[key].role} (${key}) added to the organization`, res.status === 201, res);
    }

    const expertAToken = await login(accounts.expertA);
    const expertBToken = await login(accounts.expertB);
    const managerToken = await login(accounts.manager);

    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);
    const candidateToken = candidateReg.data.token;

    // ---- Required, positive numeric salary ------------------------------------
    const noSalary = await call('POST', '/jobs', { token: expertAToken, body: baseJob() });
    check('Vacancy with no salary is rejected (salary is required)', noSalary.status === 400, noSalary);

    const zeroSalary = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ salary: { amount: 0, currency: 'ETB', period: 'monthly' } })
    });
    check('Vacancy with a zero salary is rejected', zeroSalary.status === 400, zeroSalary);

    const negativeSalary = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ salary: { amount: -500, currency: 'ETB', period: 'monthly' } })
    });
    check('Vacancy with a negative salary is rejected', negativeSalary.status === 400, negativeSalary);

    const nonNumericSalary = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ salary: { amount: 'negotiable', currency: 'ETB', period: 'monthly' } })
    });
    check('Vacancy with a non-numeric ("negotiable") salary is rejected', nonNumericSalary.status === 400, nonNumericSalary);

    const rangeSalary = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ salary: { min: 10000, max: 20000, currency: 'ETB' } })
    });
    check('Vacancy with a legacy min/max range is rejected', rangeSalary.status === 400, rangeSalary);

    // ---- Valid vacancy: one fixed salary amount -------------------------------
    const jobRes = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ salary: { amount: 25000, currency: 'ETB', period: 'monthly' } })
    });
    check('Vacancy with a valid fixed salary is accepted', [200, 201].includes(jobRes.status), jobRes);
    const job = jobRes.data.job;
    if (!job) throw new Error('Vacancy was not created; cannot continue.');

    check('Created vacancy reports the exact salary amount', job.salary && job.salary.amount === 25000, job.salary);
    check('Created vacancy reports the currency', job.salary && job.salary.currency === 'ETB', job.salary);
    check('Created vacancy reports the period', job.salary && job.salary.period === 'monthly', job.salary);
    check('Created vacancy carries no legacy min/max fields', job.salary && job.salary.min === undefined && job.salary.max === undefined, job.salary);

    // ---- Salary is visible consistently on public listing/detail -------------
    const publicList = await call('GET', `/jobs?limit=200`);
    const inList = (publicList.data.jobs || []).find(j => j._id === job._id);
    // Vacancy is still a draft at this point, so it should NOT be public yet.
    check('Draft vacancy is not yet publicly listed', !inList, inList);

    const submitted = await call('PUT', `/jobs/${job._id}/submit`, { token: expertAToken });
    check('HR Expert submits the vacancy for approval', submitted.status === 200, submitted);

    const approved = await call('PUT', `/jobs/${job._id}/approve`, { token: managerToken });
    check('HR Manager approves and publishes the vacancy', approved.status === 200 && approved.data.job.status === 'published', approved);

    const publicListAfter = await call('GET', `/jobs?limit=200`);
    const publicJob = (publicListAfter.data.jobs || []).find(j => j._id === job._id);
    check('Published vacancy is publicly listed with its salary amount', publicJob && publicJob.salary && publicJob.salary.amount === 25000, publicJob && publicJob.salary);

    const detail = await call('GET', `/jobs/${job._id}`, { token: candidateToken });
    check('Candidate viewing the vacancy sees the same fixed salary', detail.data.job && detail.data.job.salary && detail.data.job.salary.amount === 25000, detail.data.job && detail.data.job.salary);

    // ---- Salary filtering (getJobs amount range) ------------------------------
    const filterHit = await call('GET', '/jobs?minSalary=20000&maxSalary=30000');
    const filterHitFound = (filterHit.data.jobs || []).some(j => j._id === job._id);
    check('Salary range filter matches a job within range', filterHitFound, filterHit.data.jobs && filterHit.data.jobs.length);

    const filterMiss = await call('GET', '/jobs?minSalary=100000');
    const filterMissFound = (filterMiss.data.jobs || []).some(j => j._id === job._id);
    check('Salary range filter excludes a job outside range', !filterMissFound);

    // ---- Authorization: who can change the salary after publish --------------
    const candidateEdit = await call('PUT', `/jobs/${job._id}`, {
        token: candidateToken,
        body: { salary: { amount: 99999, currency: 'ETB', period: 'monthly' } }
    });
    check('Candidate cannot modify the salary', [401, 403].includes(candidateEdit.status), candidateEdit);

    const otherExpertEdit = await call('PUT', `/jobs/${job._id}`, {
        token: expertBToken,
        body: { salary: { amount: 99999, currency: 'ETB', period: 'monthly' } }
    });
    check('A different HR Expert (not the author) cannot modify the salary', [401, 403].includes(otherExpertEdit.status), otherExpertEdit);

    const managerEdit = await call('PUT', `/jobs/${job._id}`, {
        token: managerToken,
        body: { salary: { amount: 99999, currency: 'ETB', period: 'monthly' } }
    });
    check('HR Manager cannot modify the salary directly', [401, 403].includes(managerEdit.status), managerEdit);

    const authorEditAfterPublish = await call('PUT', `/jobs/${job._id}`, {
        token: expertAToken,
        body: { salary: { amount: 30000, currency: 'ETB', period: 'monthly' } }
    });
    check('Even the authoring HR Expert cannot edit the salary once published (locked after approval)', [400, 403].includes(authorEditAfterPublish.status), authorEditAfterPublish);

    const stillOriginal = await call('GET', `/jobs/${job._id}`, { token: candidateToken });
    check('Published salary remains unchanged after the blocked attempts', stillOriginal.data.job.salary.amount === 25000, stillOriginal.data.job.salary);

    // ---- Authoring HR Expert CAN edit salary on their own vacancy pre-publish -
    const draftJobRes = await call('POST', '/jobs', {
        token: expertAToken,
        body: baseJob({ title: 'Salary Test Draft Role', salary: { amount: 18000, currency: 'ETB', period: 'monthly' } })
    });
    const draftJob = draftJobRes.data.job;
    check('A second (draft) vacancy is created for the pre-publish edit check', draftJobRes.status === 201, draftJobRes);

    const authorEditDraft = await call('PUT', `/jobs/${draftJob._id}`, {
        token: expertAToken,
        body: { salary: { amount: 22000, currency: 'ETB', period: 'monthly' } }
    });
    check('Authoring HR Expert CAN edit the salary while still a draft', authorEditDraft.status === 200 && authorEditDraft.data.job.salary.amount === 22000, authorEditDraft);

    const draftRangeEdit = await call('PUT', `/jobs/${draftJob._id}`, {
        token: expertAToken,
        body: { salary: { min: 10000, max: 20000, currency: 'ETB' } }
    });
    check('Even the authoring HR Expert cannot switch the draft back to a min/max range', draftRangeEdit.status === 400, draftRangeEdit);

    console.log(`\nCleanup: removed the test organization, HR team, vacancies, application and accounts.`);
    await cleanup();
    await mongoose.disconnect();

    console.log(failures === 0 ? '\nAll fixed-salary checks passed.' : `\n${failures} fixed-salary check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('Salary self test crashed:', err);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
