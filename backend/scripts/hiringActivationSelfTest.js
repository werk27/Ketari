/**
 * End-to-end check of recruitment through to an activated employee account.
 *
 *   candidate applies -> HR Expert screens and shortlists -> interview
 *   -> HR Manager decides -> rejected notifies, or hired creates the employee
 *
 * The point being protected: being hired records the employment, it does not
 * hand over the employee workspace. A candidate who is signed in must not be
 * moved into a different workspace by a decision someone else made, so the role
 * only changes when they follow the activation link themselves.
 *
 * Usage: node scripts/hiringActivationSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();

const HR_EXPERT_EMAIL = process.env.SELFTEST_HR_EMAIL;
const HR_MANAGER_EMAIL = process.env.SELFTEST_HRM_EMAIL;
const STAFF_PASSWORD = process.env.SELFTEST_HR_PASSWORD;

const candidateEmail = `hire-flow-${stamp}@example.com`;
const candidatePassword = 'HireFlow123!';
const newPassword = 'ActivatedPass456!';

const call = async (method, endpoint, body, token) => {
    const res = await fetch(`${API}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
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

const cleanup = async (ids) => {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const oid = (v) => new mongoose.Types.ObjectId(String(v));
    let removed = 0;
    if (ids.applicationId) {
        await db.collection('employees').deleteMany({ 'recruitment.application': oid(ids.applicationId) });
        await db.collection('applications').deleteOne({ _id: oid(ids.applicationId) });
        removed++;
    }
    if (ids.resumeId) {
        await db.collection('resumes').deleteOne({ _id: oid(ids.resumeId) });
    }
    const users = await db.collection('users').deleteMany({ email: candidateEmail });
    await db.collection('notifications').deleteMany({ user: ids.candidateId ? oid(ids.candidateId) : null });
    await mongoose.disconnect();
    console.log(`\nCleanup: removed ${users.deletedCount} account(s) and ${removed} application(s).`);
};

(async () => {
    console.log(`Testing ${API}\n`);
    const ids = {};

    if (!HR_EXPERT_EMAIL || !HR_MANAGER_EMAIL || !STAFF_PASSWORD) {
        console.log('Set SELFTEST_HR_EMAIL, SELFTEST_HRM_EMAIL and SELFTEST_HR_PASSWORD and re-run.');
        process.exitCode = 1;
        return;
    }

    // ---------- staff ----------
    const expert = await call('POST', '/auth/login', { email: HR_EXPERT_EMAIL, password: STAFF_PASSWORD });
    const manager = await call('POST', '/auth/login', { email: HR_MANAGER_EMAIL, password: STAFF_PASSWORD });
    check('HR Expert can sign in', expert.status === 200, expert.status);
    check('HR Manager can sign in', manager.status === 200, manager.status);
    if (expert.status !== 200 || manager.status !== 200) { process.exitCode = 1; return; }
    const expertToken = expert.data.token;
    const managerToken = manager.data.token;

    // ---------- a vacancy belonging to this HR team's own organization ----------
    // GET /jobs is public and spans every employer, so picking the first result
    // would usually hand back another organization's vacancy and every
    // subsequent step would be refused by the tenant guard.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const hrUser = await mongoose.connection.db.collection('users')
        .findOne({ email: HR_EXPERT_EMAIL });
    const openJob = await mongoose.connection.db.collection('jobs').findOne({
        employer: hrUser?.employer,
        status: { $in: ['published', 'approved', 'open'] }
    });
    await mongoose.disconnect();

    if (!openJob) {
        console.log(`  SKIP  no published vacancy belongs to ${HR_EXPERT_EMAIL}'s organization.`);
        process.exitCode = 1;
        return;
    }

    // ---------- candidate applies ----------
    const registered = await call('POST', '/auth/register', {
        name: 'Hire Flow Candidate', email: candidateEmail, password: candidatePassword
    });
    check('candidate can register', registered.status === 201, registered);
    const candidateToken = registered.data.token;
    ids.candidateId = registered.data.user?.id || registered.data.user?._id;
    check('a new account is a candidate', registered.data.user?.role === 'candidate', registered.data.user);

    // Applying requires a CV on file. Uploading one exercises multer and file
    // parsing, which is not what this test is about, so the record is written
    // directly and removed again in cleanup.
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const resumeInsert = await mongoose.connection.db.collection('resumes').insertOne({
        user: new mongoose.Types.ObjectId(String(ids.candidateId)),
        fileName: `selftest-${stamp}.pdf`,
        filePath: `uploads/resumes/selftest-${stamp}.pdf`,
        fileType: 'pdf',
        isDefault: true,
        parsedData: {
            name: 'Hire Flow Candidate',
            email: candidateEmail,
            phone: '+251900000000',
            skills: ['JavaScript', 'Node.js'],
            education: [{ institution: 'Hawassa University', degree: 'BSc', field: 'Computer Science' }],
            workExperience: [{ company: 'Prior Employer', position: 'Developer' }]
        },
        createdAt: new Date(),
        updatedAt: new Date()
    });
    await mongoose.disconnect();
    ids.resumeId = String(resumeInsert.insertedId);

    const applied = await call('POST', '/applications', {
        jobId: openJob._id,
        resumeId: ids.resumeId,
        coverLetter: 'Applying through the hiring flow self test.'
    }, candidateToken);
    check('candidate can apply', applied.status === 201, applied);
    ids.applicationId = applied.data.application?._id || applied.data.data?._id;
    if (!ids.applicationId) { await cleanup(ids); process.exitCode = 1; return; }

    // ---------- HR Expert screens ----------
    for (const status of ['under_review', 'shortlisted', 'interview_scheduled', 'interviewed']) {
        // eslint-disable-next-line no-await-in-loop
        const step = await call('PUT', `/applications/${ids.applicationId}/status`,
            { status, note: `self test -> ${status}` }, expertToken);
        check(`HR Expert can move the application to ${status}`, step.status === 200, step);
    }

    // ---------- HR Manager hires ----------
    const decision = await call('PUT', `/applications/${ids.applicationId}/decision`,
        { outcome: 'approved', status: 'hired', reason: 'Self test hire' }, managerToken);
    check('HR Manager can record the hire', decision.status === 200, decision);
    check('an employee record is created', !!decision.data.onboarding?.employeeId, decision.data.onboarding);
    check('the hire reports that activation is still pending',
        decision.data.onboarding?.accountActivationPending === true, decision.data.onboarding);

    // ---------- the hire must not have granted anything ----------
    const meAfterHire = await call('GET', '/auth/me', null, candidateToken);
    check('the hired person is still a candidate until they activate',
        meAfterHire.data.user?.role === 'candidate', meAfterHire.data.user);

    // Reading their own employee record is harmless - it is their data. What
    // must not happen is reaching anything belonging to the organization.
    const directory = await call('GET', '/employees', null, candidateToken);
    check('they cannot list the organization employee directory before activating',
        directory.status === 403 || directory.status === 401, directory.status);

    // ---------- read the activation token the way the recipient would ----------
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const notif = await mongoose.connection.db.collection('notifications')
        .findOne({ user: new mongoose.Types.ObjectId(String(ids.candidateId)), title: /activate/i });
    await mongoose.disconnect();
    const rawToken = notif?.link?.split('/').pop();
    check('an activation link is issued', !!rawToken, notif?.link);
    if (!rawToken) { await cleanup(ids); process.exitCode = 1; return; }

    // ---------- activation ----------
    const badToken = await call('GET', '/auth/activate-employee/not-a-real-token');
    check('an invalid activation token is refused', badToken.status === 400, badToken.status);

    const preview = await call('GET', `/auth/activate-employee/${rawToken}`);
    check('the activation link can be inspected before use', preview.status === 200, preview);
    check('it names the organization', !!preview.data.organization, preview.data);

    const shortPw = await call('POST', `/auth/activate-employee/${rawToken}`, { password: '123' });
    check('a too-short password is refused', shortPw.status === 400, shortPw.status);

    const activated = await call('POST', `/auth/activate-employee/${rawToken}`, { password: newPassword });
    check('activation succeeds', activated.status === 200, activated);
    check('activation grants the employee role', activated.data.user?.role === 'employee', activated.data.user);
    check('activation returns a session', !!activated.data.token, 'no token');

    const reuse = await call('POST', `/auth/activate-employee/${rawToken}`, {});
    check('the activation link cannot be used twice', reuse.status === 400, reuse.status);

    // ---------- the employee can now work ----------
    const newLogin = await call('POST', '/auth/login', { email: candidateEmail, password: newPassword });
    check('the employee can sign in with the password they chose', newLogin.status === 200, newLogin.status);
    check('their role is employee', newLogin.data.user?.role === 'employee', newLogin.data.user);
    const employeeToken = newLogin.data.token;

    const own = await call('GET', '/employees/me', null, employeeToken);
    check('the employee can read their own record', own.status === 200, own.status);

    // ---------- and nothing more ----------
    const forbidden = [
        ['GET', '/employers', 'the platform employer list'],
        ['GET', '/employers/me/team', 'the HR team'],
        ['GET', '/candidates', 'the candidate pool'],
        ['GET', '/applications/pending-decision', 'applications awaiting a decision'],
        ['GET', '/admin/stats', 'the administrator statistics']
    ];
    for (const [method, endpoint, label] of forbidden) {
        // eslint-disable-next-line no-await-in-loop
        const res = await call(method, endpoint, null, employeeToken);
        check(`an employee cannot reach ${label}`, res.status === 403 || res.status === 404, {
            endpoint, status: res.status
        });
    }

    // ---------- repeating the hire must not duplicate ----------
    const again = await call('PUT', `/applications/${ids.applicationId}/decision`,
        { outcome: 'approved', status: 'hired', reason: 'Repeat' }, managerToken);
    if (again.status === 200) {
        check('repeating the hire creates no second employee record',
            again.data.onboarding?.created === false, again.data.onboarding);
    } else {
        check('a decided application cannot be decided again', again.status === 400, again.status);
    }

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const employeeCount = await mongoose.connection.db.collection('employees')
        .countDocuments({ 'recruitment.application': new mongoose.Types.ObjectId(String(ids.applicationId)) });
    await mongoose.disconnect();
    check('exactly one employee record exists for the application', employeeCount === 1, { employeeCount });

    await cleanup(ids);

    console.log(failures === 0
        ? '\nAll hiring and activation checks passed.'
        : `\n${failures} hiring and activation check(s) failed.`);
    process.exitCode = failures === 0 ? 0 : 1;
})().catch(async (error) => {
    console.error('Self test crashed:', error);
    try { await mongoose.disconnect(); } catch (e) { /* nothing else to do */ }
    process.exitCode = 1;
});
