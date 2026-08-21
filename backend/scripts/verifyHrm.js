/**
 * Verifies Stages 2-4: HR tenancy, RBAC rebalancing and per-employer configuration.
 *
 *   node scripts/verifyHrm.js
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
    return { token: res.data.token, user: res.data.user };
};

const run = async () => {
    console.log('\n=== HR module verification (Stages 2-4) ===\n');

    const expert = await login('hr.expert@ketari.et', 'Expert@123');
    const manager = await login('hr.manager@ketari.et', 'Manager@123');
    const admin = await login('admin@recruitai.com', 'Admin123!');

    console.log('[Role separation - System Administrator]');
    for (const [label, path] of [
        ['employee directory', '/employees'],
        ['leave requests', '/leaves'],
        ['employee requests', '/requests'],
        ['training programmes', '/training']
    ]) {
        const res = await call('GET', path, { token: admin.token });
        record(`Admin CANNOT read the ${label}`, res.status === 403, `status ${res.status}`);
    }

    console.log('\n[HR Expert - records and processes]');
    const created = await call('POST', '/employees', {
        token: expert.token,
        body: {
            personalInfo: { firstName: 'Verify', lastName: 'Employee', bloodType: 'O+' },
            contactInfo: { email: `verify${Date.now()}@ketari.et` },
            employmentInfo: { jobTitle: 'Test Officer' }
        }
    });
    record('HR Expert CAN record an employee', created.status === 201, `status ${created.status}`);
    const employeeId = created.data?.data?._id;
    record('New employee is owned by the expert\'s organization',
        String(created.data?.data?.employer) === String(expert.user.employer));
    record('Employee number generated per organization',
        /^EMP\d{4}$/.test(created.data?.data?.employeeId || ''), created.data?.data?.employeeId);

    const managerCreate = await call('POST', '/employees', {
        token: manager.token,
        body: { personalInfo: { firstName: 'No', lastName: 'Permission' } }
    });
    record('HR Manager CANNOT record employees', managerCreate.status === 403, `status ${managerCreate.status}`);

    const directory = await call('GET', '/employees', { token: manager.token });
    record('HR Manager CAN read the directory', directory.status === 200,
        `${directory.data?.count ?? 0} employee(s)`);
    const allOwned = (directory.data?.data || [])
        .every(e => String(e.employer) === String(manager.user.employer));
    record('Directory only contains this organization', allOwned);

    console.log('\n[Leave workflow - separation of duties]');
    const leave = await call('POST', '/leaves', {
        token: expert.token,
        body: {
            leaveType: 'Annual Leave',
            startDate: new Date(Date.now() + 7 * 864e5).toISOString(),
            endDate: new Date(Date.now() + 10 * 864e5).toISOString(),
            reason: 'Verification leave request'
        }
    });
    record('Organization member CAN submit leave', leave.status === 201, `status ${leave.status}`);
    const leaveId = leave.data?.data?._id;
    record('Leave day count computed server-side', leave.data?.data?.totalDays === 4,
        `${leave.data?.data?.totalDays} day(s)`);

    const selfApprove = await call('PUT', `/leaves/${leaveId}/status`, {
        token: expert.token, body: { status: 'approved' }
    });
    record('HR Expert CANNOT approve leave', selfApprove.status === 403, `status ${selfApprove.status}`);

    const processed = await call('PUT', `/leaves/${leaveId}/process`, {
        token: expert.token, body: { note: 'Verified and forwarded' }
    });
    record('HR Expert CAN forward leave for approval',
        processed.status === 200 && processed.data?.data?.status === 'under_review');

    const approved = await call('PUT', `/leaves/${leaveId}/status`, {
        token: manager.token, body: { status: 'approved' }
    });
    record('HR Manager CAN approve leave',
        approved.status === 200 && approved.data?.data?.status === 'approved');

    console.log('\n[Employee requests - break-year workflow]');
    const request = await call('POST', '/requests', {
        token: expert.token,
        body: { type: 'break_year', title: 'Verification break-year', reason: 'Study leave' }
    });
    record('Break-year request can be raised', request.status === 201, `status ${request.status}`);
    const requestId = request.data?.data?._id;

    const ownDecision = await call('PUT', `/requests/${requestId}/decision`, {
        token: expert.token, body: { outcome: 'approved' }
    });
    record('Requester CANNOT decide their own request', ownDecision.status === 403,
        `status ${ownDecision.status}`);

    const decided = await call('PUT', `/requests/${requestId}/decision`, {
        token: manager.token, body: { outcome: 'approved' }
    });
    record('HR Manager CAN decide a request',
        decided.status === 200 && decided.data?.data?.status === 'approved');

    console.log('\n[Training lifecycle]');
    const training = await call('POST', '/training', {
        token: expert.token,
        body: {
            title: 'Verification Training', type: 'technical',
            description: 'Automated verification programme', duration: 2,
            startDate: new Date(Date.now() + 14 * 864e5).toISOString(),
            endDate: new Date(Date.now() + 16 * 864e5).toISOString()
        }
    });
    record('HR Expert CAN propose training', training.status === 201, `status ${training.status}`);
    const trainingId = training.data?.data?._id;
    record('Training starts as a proposal', training.data?.data?.status === 'proposed',
        training.data?.data?.status);

    const openBeforeApproval = await call('PUT', `/training/${trainingId}/status`, {
        token: expert.token, body: { status: 'open' }
    });
    record('Training CANNOT open before approval', openBeforeApproval.status === 400,
        `status ${openBeforeApproval.status}`);

    const trainingDecision = await call('PUT', `/training/${trainingId}/decision`, {
        token: manager.token, body: { outcome: 'approved' }
    });
    record('HR Manager CAN approve training', trainingDecision.status === 200);

    console.log('\n[Per-employer configuration]');
    const orgConfig = await call('GET', '/config', { token: expert.token });
    record('Organization has its own configuration scope',
        orgConfig.status === 200 && orgConfig.data?.meta?.scope === 'organization',
        orgConfig.data?.meta?.scope);

    const platformConfig = await call('GET', '/config', { token: admin.token });
    record('Administrator edits the platform defaults',
        platformConfig.status === 200 && platformConfig.data?.meta?.scope === 'platform',
        platformConfig.data?.meta?.scope);

    record('Organization config is a different document',
        orgConfig.data?.data?._id !== platformConfig.data?.data?._id);

    const marker = `HRMTEST_${Date.now()}`;
    const addSkill = await call('POST', '/config/skills', {
        token: manager.token, body: { name: marker, category: 'technical' }
    });
    record('HR Manager CANNOT edit configuration', addSkill.status === 403, `status ${addSkill.status}`);

    console.log('\n[Cleanup]');
    const cancelled = await call('PUT', `/requests/${requestId}/cancel`, { token: expert.token });
    record('Verification request closed', [200, 400].includes(cancelled.status));
    const removedEmployee = await call('DELETE', `/employees/${employeeId}`, { token: manager.token });
    record('Verification employee terminated', removedEmployee.status === 200,
        `status ${removedEmployee.status}`);

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
