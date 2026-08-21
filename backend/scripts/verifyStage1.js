/**
 * Verifies the Stage 1 security and data-integrity fixes.
 *
 *   node scripts/verifyStage1.js
 */
const BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

const results = [];
const record = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    return { status: res.status, data };
};

const login = async (email, password) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data?.message}`);
    return res.data.token;
};

const run = async () => {
    console.log('\n=== Stage 1 verification ===\n');

    console.log('[Candidate PII exposure]');
    const anon = await call('GET', '/candidates');
    record('Anonymous CANNOT list candidates', anon.status === 401, `status ${anon.status}`);

    const expertToken = await login('hr.expert@ketari.et', 'Expert@123');
    const hrView = await call('GET', '/candidates?limit=5', { token: expertToken });
    record('HR Expert CAN list candidates', hrView.status === 200,
        `${hrView.data?.totalCandidates ?? 0} candidate(s)`);

    const sample = hrView.data?.candidates?.[0];
    const leakedFields = sample
        ? ['password', 'resetPasswordToken', 'resetPasswordExpire'].filter(f => f in sample)
        : [];
    record('No credential fields exposed', leakedFields.length === 0,
        leakedFields.length ? leakedFields.join(', ') : 'clean');
    record('Saved jobs not exposed in talent search',
        !sample || !(sample.profile && 'savedJobs' in sample.profile));

    const adminToken = await login('admin@recruitai.com', 'Admin123!');
    const adminView = await call('GET', '/candidates', { token: adminToken });
    record('System Administrator CANNOT browse the talent pool', adminView.status === 403,
        `status ${adminView.status}`);

    console.log('\n[Configuration persistence]');
    const marker = `STAGE1_${Date.now()}`;
    const cases = [
        ['leaveTypes', '/config/leave-types', { name: marker, daysPerYear: 21, paid: true }],
        ['trainingTypes', '/config/training-types', { name: marker }],
        ['licenses', '/config/licenses', { name: marker }],
        ['terminationReasons', '/config/termination-reasons', { name: marker }],
        ['bloodTypes', '/config/blood-types', { name: marker }],
        ['nations', '/config/nations', { name: marker }]
    ];

    for (const [field, path, body] of cases) {
        const post = await call('POST', path, { token: adminToken, body });
        const get = await call('GET', '/config', { token: adminToken });
        const arr = get.data?.data?.[field];
        const persisted = Array.isArray(arr) && arr.some(item => item.name === marker);
        record(`${field} is readable after save`, post.status === 201 && persisted,
            `HTTP ${post.status}`);
    }

    console.log('\n[Stranded legacy data recovered]');
    const cfg = await call('GET', '/config', { token: adminToken });
    const leaveNames = (cfg.data?.data?.leaveTypes || []).map(l => l.name);
    const bloodNames = (cfg.data?.data?.bloodTypes || []).map(b => b.name);
    record('Legacy leave type "polo" now visible', leaveNames.includes('polo'),
        leaveNames.join(', ') || 'none');
    record('Legacy blood type "gudina" now visible', bloodNames.includes('gudina'),
        bloodNames.join(', ') || 'none');

    // Remove the probe records so the configuration is left as found.
    console.log('\n[Cleanup]');
    const cfgAfter = await call('GET', '/config', { token: adminToken });
    let removed = 0;
    for (const [field, path] of cases.map(c => [c[0], c[1]])) {
        const item = (cfgAfter.data?.data?.[field] || []).find(i => i.name === marker);
        if (item) {
            const type = path.split('/').pop();
            const del = await call('DELETE', `/config/${type}/${item._id}`, { token: adminToken });
            if (del.status === 200) removed += 1;
        }
    }
    record('Probe configuration entries removed', removed === cases.length, `${removed}/${cases.length}`);

    const passed = results.filter(r => r.passed).length;
    console.log(`\n=== ${passed}/${results.length} checks passed ===\n`);
    if (passed !== results.length) {
        results.filter(r => !r.passed).forEach(r => console.log(`   - ${r.name} ${r.detail}`));
        process.exit(1);
    }
};

run().catch(error => {
    console.error('\nVerification error:', error.message);
    process.exit(1);
});
