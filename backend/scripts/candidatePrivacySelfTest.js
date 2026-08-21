/**
 * Checks that a candidate's contact details are only visible to an organization
 * they have applied to.
 *
 * The talent pool and AI match lists cover every active candidate on the
 * platform regardless of any relationship, so returning an email there would
 * let any approved organization export the contact list of every registered job
 * seeker. Applying is the point at which a candidate chooses to share.
 *
 * Usage: node scripts/candidatePrivacySelfTest.js [apiUrl]
 */
require('./_env');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const HR_EMAIL = process.env.SELFTEST_HR_EMAIL;
const HR_PASSWORD = process.env.SELFTEST_HR_PASSWORD;

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

(async () => {
    console.log(`Testing ${API}\n`);

    if (!HR_EMAIL || !HR_PASSWORD) {
        console.log('Set SELFTEST_HR_EMAIL and SELFTEST_HR_PASSWORD to an HR account and re-run.');
        process.exitCode = 1;
        return;
    }

    const login = await call('POST', '/auth/login', { email: HR_EMAIL, password: HR_PASSWORD });
    check('HR user can sign in', login.status === 200, login);
    if (login.status !== 200) {
        process.exitCode = 1;
        return;
    }
    const token = login.data.token;

    // ---------- talent pool ----------
    const pool = await call('GET', '/candidates', null, token);
    check('talent pool is readable', pool.status === 200, pool.status);

    const listed = pool.data.candidates || [];
    check('the pool returns candidates', listed.length > 0, { count: listed.length });

    const leakedEmail = listed.filter(c => c.email && c.contactVisible === false);
    check('no email is returned for a candidate marked not visible',
        leakedEmail.length === 0, leakedEmail.map(c => c.name));

    const leakedPhone = listed.filter(c => c.profile?.phone && c.contactVisible === false);
    check('no phone is returned for a candidate marked not visible',
        leakedPhone.length === 0, leakedPhone.map(c => c.name));

    check('every candidate carries a contactVisible flag',
        listed.every(c => typeof c.contactVisible === 'boolean'),
        listed.filter(c => typeof c.contactVisible !== 'boolean').map(c => c.name));

    // Assessment data must survive, otherwise the pool is useless.
    check('names are still returned', listed.every(c => !!c.name), 'a candidate had no name');
    check('profile data is still returned',
        listed.some(c => c.profile && Object.keys(c.profile).length > 0), 'no profile data at all');

    const hidden = listed.filter(c => c.contactVisible === false).length;
    const shown = listed.filter(c => c.contactVisible === true).length;
    console.log(`\n  ${hidden} candidate(s) hidden, ${shown} shown because they applied to this organization.`);

    // ---------- AI matching ----------
    const jobs = await call('GET', '/jobs/employer/my-jobs', null, token);
    const firstJob = (jobs.data?.jobs || jobs.data?.data || [])[0];
    if (firstJob) {
        const matches = await call('GET', `/jobs/${firstJob._id}/matching-candidates`, null, token);
        if (matches.status === 200) {
            const list = matches.data.candidates || [];
            const leaked = list.filter(m => m.candidate?.email && m.candidate?.contactVisible === false);
            check('AI matches do not leak an email for hidden candidates',
                leaked.length === 0, leaked.map(m => m.candidate?.name));
            check('AI matches carry the contactVisible flag',
                list.length === 0 || list.every(m => typeof m.candidate?.contactVisible === 'boolean'),
                'a match had no flag');
        } else {
            console.log(`  SKIP  AI matching returned ${matches.status}`);
        }
    } else {
        console.log('  SKIP  AI matching: this HR account has no vacancy to match against.');
    }

    console.log(failures === 0
        ? '\nAll candidate privacy checks passed.'
        : `\n${failures} candidate privacy check(s) failed.`);
    // Setting the code and letting node close its own handles avoids the libuv
    // assertion that process.exit() triggers on Windows while fetch's keep-alive
    // sockets are still closing.
    process.exitCode = failures === 0 ? 0 : 1;
})().catch(error => {
    console.error('Self test crashed:', error);
    process.exitCode = 1;
});
