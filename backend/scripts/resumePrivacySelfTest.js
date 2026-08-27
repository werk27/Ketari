/**
 * Self test: who may read a candidate's CV file.
 *
 * GET /api/resumes/:id/file is what "View CV" in the HR Expert and HR
 * Manager screens calls. It must behave like every other candidate privacy
 * boundary in this app: the owner can always read it; an HR user can read it
 * only once their organization has actually received an application (or hire)
 * built on it; nobody else - including an unrelated organization's HR team,
 * another candidate, or a platform administrator - can.
 *
 * Fully self-contained: creates two throwaway organizations, one candidate,
 * a real uploaded PDF, and removes everything again at the end.
 *
 * Usage: node scripts/resumePrivacySelfTest.js [apiUrl]
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');
const FormData = require('form-data');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'ResumeTest123!';

const accounts = {
    employerA: { name: 'Resume Test Employer A', email: `resume-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertA: { name: 'Resume Test Expert A', email: `resume-expA-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    employerB: { name: 'Resume Test Employer B', email: `resume-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    expertB: { name: 'Resume Test Expert B', email: `resume-expB-${stamp}@example.com`, password: PASSWORD, role: 'hr_expert' },
    candidate: { name: 'Resume Test Candidate', email: `resume-cand-${stamp}@example.com`, password: PASSWORD },
    otherCandidate: { name: 'Resume Test Other Candidate', email: `resume-cand2-${stamp}@example.com`, password: PASSWORD }
};

const call = async (method, endpoint, { body, token, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) {
        Object.assign(headers, form.getHeaders());
        // Node's built-in fetch does not reliably stream a form-data
        // instance; buffering it keeps this test simple and the CV here is
        // tiny anyway.
        payload = form.getBuffer();
        headers['Content-Length'] = form.getLengthSync();
    } else if (body) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }
    const res = await fetch(`${API}${endpoint}`, { method, headers, body: payload });
    const contentType = res.headers.get('content-type') || '';
    let data;
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = { byteLength: (await res.arrayBuffer()).byteLength };
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

    const resumes = await db.collection('resumes').find({ user: { $in: userIds } }).toArray();
    for (const r of resumes) {
        if (r.filePath && fs.existsSync(r.filePath)) fs.unlinkSync(r.filePath);
    }

    await db.collection('applications').deleteMany({ applicant: { $in: userIds } });
    await db.collection('resumes').deleteMany({ user: { $in: userIds } });
    await db.collection('notifications').deleteMany({ user: { $in: userIds } });
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

    // ---- Two unrelated throwaway organizations --------------------------------
    const empARes = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A account created', empARes.status === 201, empARes);
    const employerAId = new mongoose.Types.ObjectId(empARes.data.organization._id);
    created.employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const addExpertA = await call('POST', '/employers/me/team', { token: empARes.data.token, body: accounts.expertA });
    check('HR Expert A added to organization A', addExpertA.status === 201, addExpertA);

    const empBRes = await call('POST', '/auth/register', { body: accounts.employerB });
    check('Employer B account created', empBRes.status === 201, empBRes);
    const employerBId = new mongoose.Types.ObjectId(empBRes.data.organization._id);
    created.employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const addExpertB = await call('POST', '/employers/me/team', { token: empBRes.data.token, body: accounts.expertB });
    check('HR Expert B added to organization B (unrelated)', addExpertB.status === 201, addExpertB);

    const expertAToken = await login(accounts.expertA);
    const expertBToken = await login(accounts.expertB);

    // ---- Organization A posts a vacancy ---------------------------------------
    const jobRes = await call('POST', '/jobs', {
        token: expertAToken,
        body: {
            title: 'Resume Privacy Test Role',
            description: 'Temporary vacancy created by the resume privacy self test.',
            department: 'Engineering',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            requiredSkills: ['javascript'],
            experienceRequired: 0,
            salary: { amount: 20000, currency: 'ETB', period: 'monthly' }
        }
    });
    check('HR Expert A can create a vacancy', [200, 201].includes(jobRes.status), jobRes);
    const job = jobRes.data.job;
    if (job.status === 'draft') {
        await call('PUT', `/jobs/${job._id}/submit`, { token: expertAToken });
        // Self-approval is blocked by design; flip status directly so the test
        // does not need a second HR Manager account just to open the vacancy.
        await db.collection('jobs').updateOne({ _id: new mongoose.Types.ObjectId(job._id) }, { $set: { status: 'published' } });
    }

    // ---- Candidate registers, uploads a real CV file, and applies ------------
    const candidateReg = await call('POST', '/auth/register', { body: accounts.candidate });
    check('Candidate registers', candidateReg.status === 201, candidateReg);
    const candidateToken = candidateReg.data.token;

    const otherCandidateReg = await call('POST', '/auth/register', { body: accounts.otherCandidate });
    check('A second, unrelated candidate registers', otherCandidateReg.status === 201, otherCandidateReg);
    const otherCandidateToken = otherCandidateReg.data.token;

    const tmpFile = path.join(os.tmpdir(), `resume-privacy-test-${stamp}.pdf`);
    // Minimal but valid PDF so pdf-parse does not throw while extracting text.
    fs.writeFileSync(tmpFile, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>');

    const uploadForm = new FormData();
    uploadForm.append('resume', fs.readFileSync(tmpFile), { filename: 'candidate-cv.pdf', contentType: 'application/pdf' });
    const uploadRes = await call('POST', '/resumes', { token: candidateToken, form: uploadForm });
    check('Candidate uploads a real CV file', uploadRes.status === 201, uploadRes);
    const resumeId = uploadRes.data.resume?._id;
    fs.unlinkSync(tmpFile);

    const appliedRes = await call('POST', '/applications', {
        token: candidateToken,
        body: { jobId: job._id, resumeId }
    });
    check('Candidate applies to organization A\'s vacancy', appliedRes.status === 201, appliedRes);

    // ---- Who may read the CV file ---------------------------------------------
    const ownerView = await call('GET', `/resumes/${resumeId}/file`, { token: candidateToken });
    check('The candidate can view their own CV', ownerView.status === 200 && ownerView.data.byteLength > 0, ownerView);

    const orgAView = await call('GET', `/resumes/${resumeId}/file`, { token: expertAToken });
    check('HR Expert A (received the application) can view the CV', orgAView.status === 200 && orgAView.data.byteLength > 0, orgAView);

    const orgBView = await call('GET', `/resumes/${resumeId}/file`, { token: expertBToken });
    check('HR Expert B (unrelated organization) cannot view the CV', orgBView.status === 403, orgBView);

    const otherCandidateView = await call('GET', `/resumes/${resumeId}/file`, { token: otherCandidateToken });
    check('An unrelated candidate cannot view someone else\'s CV', otherCandidateView.status === 403, otherCandidateView);

    const noAuthView = await call('GET', `/resumes/${resumeId}/file`, {});
    check('An unauthenticated request is rejected', noAuthView.status === 401, noAuthView);

    console.log(`\nCleanup: removed the test organizations, vacancy, application, resume and accounts.`);
    await cleanup();

    if (failures > 0) {
        console.log(`\n${failures} check(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll resume privacy checks passed.');
    process.exit(0);
})().catch(async (err) => {
    console.error('Self test crashed:', err);
    try { await cleanup(); } catch (_) { /* best effort */ }
    process.exit(1);
});
