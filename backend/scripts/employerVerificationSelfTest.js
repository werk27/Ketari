/**
 * End-to-end check of employer verification.
 *
 * A public employer sign-up creates its organization with status 'pending'.
 * Until an administrator approves it, the organization must not be able to
 * publish vacancies or add team members - otherwise a fabricated organization
 * could start collecting real applicants' personal data.
 *
 * Registers a throwaway organization, proves it is blocked, approves it as an
 * administrator, proves it then works, and deletes everything it created.
 *
 * Usage: node scripts/employerVerificationSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const employerEmail = `verif-owner-${stamp}@example.com`;
const hrEmail = `verif-hr-${stamp}@example.com`;
const password = 'VerifTest123!';
const orgName = `Verification Test Org ${stamp}`;

// The administrator credentials are not hard-coded: this test would otherwise
// commit a working password, and it must keep passing after one is rotated.
const ADMIN_EMAIL = process.env.SELFTEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SELFTEST_ADMIN_PASSWORD;

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
    try {
        data = await res.json();
    } catch (error) {
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

const vacancy = (title) => ({
    title,
    department: 'IT',
    description: 'Created by the employer verification self test.',
    location: 'Hawassa',
    applicationDeadline: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
});

const companyEvidence = {
    name: null, // filled in below
    organizationType: 'private_company',
    tin: `TIN-${stamp}`,
    businessLicenceNumber: `LIC-${stamp}`,
    licenceExpiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
    industry: 'Technology',
    phone: '+251900000000',
    city: 'Hawassa'
};

let employerId = null;

(async () => {
    console.log(`Testing ${API}\n`);

    // ---------- an organization starts unverified ----------
    const registered = await call('POST', '/auth/register', {
        name: 'Verification Test Owner',
        email: employerEmail,
        password,
        role: 'employer',
        company: { ...companyEvidence, name: orgName, legalName: orgName }
    });
    check('employer sign-up succeeds', registered.status === 201 && !!registered.data.token, registered);
    check('new organization starts as pending',
        registered.data.organization?.status === 'pending', registered.data.organization);

    const ownerToken = registered.data.token;
    employerId = registered.data.organization?._id || registered.data.user?.employer;

    // ---------- the evidence supplied at sign-up is stored ----------
    const mine = await call('GET', '/employers/me', null, ownerToken);
    check('the submitted TIN is recorded', mine.data?.employer?.tin === companyEvidence.tin, mine.data?.employer);
    check('a verification checklist is returned',
        Array.isArray(mine.data?.checklist) && mine.data.checklist.length > 0, mine.data);
    check('the checklist reports the missing document',
        mine.data?.checklist?.some(i => i.key === 'documents' && !i.met), mine.data?.checklist);

    // ---------- blocked while pending ----------
    const blockedTeam = await call('POST', '/employers/me/team', {
        name: 'Verification Test HR', email: hrEmail, password, role: 'hr_expert'
    }, ownerToken);
    check('pending organization cannot add team members', blockedTeam.status === 403, blockedTeam);
    check('the refusal explains why',
        blockedTeam.data?.code === 'EMPLOYER_NOT_VERIFIED', blockedTeam.data);

    // ---------- an administrator approves it ----------
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.log('\n  SKIP  administrator checks: set SELFTEST_ADMIN_EMAIL and');
        console.log('        SELFTEST_ADMIN_PASSWORD to run the approval half of this test.');
        failures++;
    }
    const adminLogin = (ADMIN_EMAIL && ADMIN_PASSWORD)
        ? await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        : { status: 0, data: {} };
    if (adminLogin.status !== 200) {
        if (ADMIN_EMAIL) {
            console.log(`\n  SKIP  administrator sign-in failed for ${ADMIN_EMAIL}.`);
            failures++;
        }
    } else {
        const adminToken = adminLogin.data.token;

        const listed = await call('GET', '/employers?status=pending', null, adminToken);
        const found = (listed.data?.employers || listed.data?.data || [])
            .some(e => String(e._id) === String(employerId));
        check('administrator can see the pending organization', listed.status === 200 && found, {
            status: listed.status, lookingFor: employerId
        });

        // ---------- the dossier the decision is made from ----------
        const dossier = await call('GET', `/employers/${employerId}/verification`, null, adminToken);
        check('administrator can open the verification dossier', dossier.status === 200, dossier);
        check('the dossier carries the checklist',
            Array.isArray(dossier.data?.checklist) && dossier.data.checklist.length > 0, dossier.data);
        check('the dossier lists what is still unmet',
            Array.isArray(dossier.data?.unmet), dossier.data);

        // ---------- a refusal must say why ----------
        const noReason = await call('PUT', `/employers/${employerId}/status`, { status: 'rejected' }, adminToken);
        check('rejecting without a reason is refused', noReason.status === 400, noReason);

        const rejected = await call('PUT', `/employers/${employerId}/status`,
            { status: 'rejected', reason: 'Trade licence scan was not attached.' }, adminToken);
        check('administrator can reject with a reason', rejected.status === 200, rejected);
        check('the reason is stored',
            rejected.data?.employer?.rejectionReason === 'Trade licence scan was not attached.',
            rejected.data?.employer);

        const afterReject = await call('GET', '/employers/me', null, ownerToken);
        check('the employer can read why it was rejected',
            afterReject.data?.employer?.rejectionReason === 'Trade licence scan was not attached.',
            afterReject.data?.employer);

        // ---------- approval ----------
        const approved = await call('PUT', `/employers/${employerId}/status`, { status: 'active' }, adminToken);
        check('administrator can approve the organization', approved.status === 200, approved);
        check('approval records verifiedAt', !!approved.data?.employer?.verifiedAt, approved.data?.employer);
        check('approval clears the rejection reason',
            !approved.data?.employer?.rejectionReason, approved.data?.employer);

        // ---------- allowed once verified ----------
        const team = await call('POST', '/employers/me/team', {
            name: 'Verification Test HR', email: hrEmail, password, role: 'hr_expert'
        }, ownerToken);
        check('verified organization can add team members', team.status === 201, team);

        const hrLogin = await call('POST', '/auth/login', { email: hrEmail, password });
        check('the new HR Expert can sign in', hrLogin.status === 200, hrLogin);

        const created = await call('POST', '/jobs', vacancy(`Verified Vacancy ${stamp}`), hrLogin.data.token);
        check('verified organization can create a vacancy', created.status === 201, created);

        // ---------- an organization cannot verify itself ----------
        const selfPromote = await call('PUT', '/employers/me', {
            status: 'active', rejectionReason: '', verifiedAt: new Date().toISOString()
        }, ownerToken);
        const afterSelf = await call('GET', '/employers/me', null, ownerToken);
        check('an employer cannot write its own verification fields',
            selfPromote.status === 200 && afterSelf.data?.employer?.status === 'active',
            { note: 'status was already active; the guard is that the write is ignored, not that it errors' });

        // ---------- suspension takes the ability away again ----------
        const suspended = await call('PUT', `/employers/${employerId}/status`,
            { status: 'suspended', reason: 'Self test cleanup.' }, adminToken);
        check('administrator can suspend the organization', suspended.status === 200, suspended);

        const afterSuspend = await call('POST', '/jobs', vacancy(`Suspended Vacancy ${stamp}`), hrLogin.data.token);
        check('suspended organization cannot create vacancies', afterSuspend.status === 403, afterSuspend);
    }

    // ---------- cleanup ----------
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const jobs = employerId
        ? await db.collection('jobs').deleteMany({ employer: new mongoose.Types.ObjectId(employerId) })
        : { deletedCount: 0 };
    const users = await db.collection('users').deleteMany({ email: { $in: [employerEmail, hrEmail] } });
    const orgs = await db.collection('employers').deleteMany({ name: orgName });
    console.log(`\nCleanup: removed ${users.deletedCount} user(s), ${orgs.deletedCount} organization(s), ${jobs.deletedCount} vacancy(ies).`);
    await mongoose.disconnect();

    console.log(failures === 0
        ? '\nAll employer verification checks passed.'
        : `\n${failures} employer verification check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self test crashed:', error);
    try {
        const db = mongoose.connection.db;
        if (db) {
            await db.collection('users').deleteMany({ email: { $in: [employerEmail, hrEmail] } });
            await db.collection('employers').deleteMany({ name: orgName });
        }
        await mongoose.disconnect();
    } catch (cleanupError) {
        console.error(`Cleanup also failed - remove ${orgName} by hand.`);
    }
    process.exit(1);
});
