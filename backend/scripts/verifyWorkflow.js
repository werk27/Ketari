/**
 * End-to-end verification of the recruitment workflow and role separation.
 * Exercises the live API exactly as the frontend does.
 *
 *   node scripts/verifyWorkflow.js
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
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data };
};

const login = async (email, password) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data?.message}`);
    return { token: res.data.token, user: res.data.user };
};

const run = async () => {
    console.log('\n=== Recruitment workflow verification ===\n');

    console.log('[Authentication]');
    const expert = await login('hr.expert@ketari.et', 'Expert@123');
    record('HR Expert can sign in', !!expert.token);
    record('HR Expert is linked to an organization', !!expert.user.employer,
        expert.user.employer ? `org ${expert.user.employer}` : 'no organization');

    const manager = await login('hr.manager@ketari.et', 'Manager@123');
    record('HR Manager can sign in', !!manager.token);
    record('HR Expert and HR Manager share an organization',
        String(expert.user.employer) === String(manager.user.employer));

    console.log('\n[Capabilities - role separation]');
    const expertCaps = expert.user.capabilities || [];
    const managerCaps = manager.user.capabilities || [];
    record('HR Expert can create vacancies', expertCaps.includes('vacancy:create'));
    record('HR Expert CANNOT approve vacancies', !expertCaps.includes('vacancy:approve'));
    record('HR Manager can approve vacancies', managerCaps.includes('vacancy:approve'));
    record('HR Manager CANNOT create vacancies', !managerCaps.includes('vacancy:create'));

    console.log('\n[Vacancy creation - HR Expert]');
    const draft = await call('POST', '/jobs', {
        token: expert.token,
        body: {
            title: `Verification Engineer ${Date.now()}`,
            department: 'Engineering',
            description: 'Automated verification vacancy.',
            location: 'Hawassa',
            employmentType: 'Full-Time',
            workMode: 'Hybrid',
            applicationDeadline: new Date(Date.now() + 30 * 864e5).toISOString(),
            requirements: { skills: ['JavaScript', 'Testing'], education: 'BSc', experience: '2 years' },
            // Attempt to self-publish: the backend must ignore this.
            status: 'published'
        }
    });
    const job = draft.data?.job;
    record('HR Expert can create a vacancy', draft.status === 201, `status ${draft.status}`);
    record('Vacancy starts as draft (self-publish attempt ignored)', job?.status === 'draft',
        `got "${job?.status}"`);
    record('Vacancy is owned by the expert\'s organization',
        String(job?.employer) === String(expert.user.employer));

    console.log('\n[Approval workflow]');
    const submitted = await call('PUT', `/jobs/${job._id}/submit`, { token: expert.token });
    record('HR Expert can submit for approval',
        submitted.status === 200 && submitted.data?.job?.status === 'pending_approval',
        `status ${submitted.status}`);

    const selfApprove = await call('PUT', `/jobs/${job._id}/approve`, { token: expert.token });
    record('HR Expert CANNOT approve their own vacancy', selfApprove.status === 403,
        `status ${selfApprove.status}`);

    const managerCreate = await call('POST', '/jobs', {
        token: manager.token,
        body: {
            title: 'Manager Should Not Create',
            department: 'Engineering',
            description: 'x',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 864e5).toISOString()
        }
    });
    record('HR Manager CANNOT create a vacancy', managerCreate.status === 403,
        `status ${managerCreate.status}`);

    const pending = await call('GET', '/jobs/pending-approval', { token: manager.token });
    const foundInQueue = (pending.data?.jobs || []).some(item => item._id === job._id);
    record('Vacancy appears in HR Manager approval queue', foundInQueue);

    const rejectNoReason = await call('PUT', `/jobs/${job._id}/reject`, { token: manager.token, body: {} });
    record('Rejection requires written feedback', rejectNoReason.status === 400,
        `status ${rejectNoReason.status}`);

    const rejected = await call('PUT', `/jobs/${job._id}/reject`, {
        token: manager.token,
        body: { reason: 'Requirements need more detail.' }
    });
    record('HR Manager can reject with feedback',
        rejected.status === 200 && rejected.data?.job?.status === 'rejected');

    const resubmitted = await call('PUT', `/jobs/${job._id}/submit`, { token: expert.token });
    record('HR Expert can resubmit after correction',
        resubmitted.status === 200 && resubmitted.data?.job?.status === 'pending_approval');

    const approved = await call('PUT', `/jobs/${job._id}/approve`, { token: manager.token });
    record('HR Manager can approve and publish',
        approved.status === 200 && approved.data?.job?.status === 'published',
        `status ${approved.data?.job?.status}`);

    console.log('\n[Public visibility]');
    const publicList = await call('GET', '/jobs?limit=100');
    const isPublic = (publicList.data?.jobs || []).some(item => item._id === job._id);
    record('Published vacancy is visible on the public job board', isPublic);

    const draft2 = await call('POST', '/jobs', {
        token: expert.token,
        body: {
            title: `Hidden Draft ${Date.now()}`,
            department: 'Engineering',
            description: 'Should stay private.',
            location: 'Hawassa',
            applicationDeadline: new Date(Date.now() + 864e5).toISOString()
        }
    });
    const anonDraft = await call('GET', `/jobs/${draft2.data.job._id}`);
    record('Draft vacancy is NOT publicly readable', anonDraft.status === 403,
        `status ${anonDraft.status}`);

    console.log('\n[AI matching]');
    const matches = await call('GET', `/jobs/${job._id}/matches`, { token: expert.token });
    const hasExplanation = (matches.data?.candidates || [])
        .every(match => Array.isArray(match.matchDetails?.reasons));
    record('AI matching endpoint returns results', matches.status === 200,
        `${matches.data?.count ?? 0} candidate(s)`);
    record('Every match includes an explanation', hasExplanation);
    record('AI response states it is advisory only', !!matches.data?.disclaimer);

    console.log('\n[Tenant isolation]');
    const otherOrgJobs = await call('GET', '/jobs/hr-expert/me', { token: expert.token });
    const allOwned = (otherOrgJobs.data?.jobs || [])
        .every(item => String(item.employer) === String(expert.user.employer));
    record('HR Expert only sees their own organization\'s vacancies', allOwned,
        `${otherOrgJobs.data?.jobs?.length ?? 0} vacancy record(s)`);

    console.log('\n[Cleanup]');
    const del1 = await call('DELETE', `/jobs/${draft2.data.job._id}`, { token: expert.token });
    record('Draft vacancy removed', del1.status === 200);

    const passed = results.filter(r => r.passed).length;
    console.log(`\n=== ${passed}/${results.length} checks passed ===\n`);

    if (passed !== results.length) {
        console.log('Failed checks:');
        results.filter(r => !r.passed).forEach(r => console.log(`   - ${r.name} ${r.detail}`));
        process.exit(1);
    }
};

run().catch(error => {
    console.error('\nVerification error:', error.message);
    process.exit(1);
});
