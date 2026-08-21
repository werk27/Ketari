/**
 * End-to-end check of profile photo upload and retrieval.
 *
 *   node scripts/verifyUploads.js
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_BASE || 'http://127.0.0.1:5000';
const API = `${BASE}/api`;

const results = [];
const record = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Smallest valid PNG, used so the test needs no fixture file on disk. */
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

const run = async () => {
    console.log('\n=== Profile photo upload verification ===\n');

    const loginRes = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'hr.expert@ketari.et', password: 'Expert@123' })
    });
    const loginData = await loginRes.json();
    if (!loginData.token) throw new Error(`Login failed: ${loginData.message}`);
    const token = loginData.token;

    console.log('[Upload]');
    const form = new FormData();
    form.append('photo', new Blob([PNG_BYTES], { type: 'image/png' }), 'verify-avatar.png');

    const uploadRes = await fetch(`${API}/upload/profile-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
    });
    const uploadData = await uploadRes.json();

    record('Photo upload accepted', uploadRes.status === 200, `status ${uploadRes.status}`);
    const storedPath = uploadData?.data?.profilePhoto;
    record('Stored path uses the served prefix', /^uploads\/profiles\//.test(storedPath || ''), storedPath);

    console.log('\n[File on disk]');
    const { toAbsolutePath, UPLOAD_PATHS } = require('../src/config/paths');
    const absolute = toAbsolutePath(storedPath);
    record('File written to the served directory', absolute && fs.existsSync(absolute),
        absolute ? path.relative(process.cwd(), absolute) : 'no path');
    record('File is inside uploads/profiles',
        absolute ? absolute.startsWith(UPLOAD_PATHS.profiles) : false);

    console.log('\n[Retrieval over HTTP]');
    const imageRes = await fetch(`${BASE}/${storedPath}`);
    record('Photo is downloadable', imageRes.status === 200, `status ${imageRes.status}`);
    record('Served with an image content type',
        (imageRes.headers.get('content-type') || '').startsWith('image/'),
        imageRes.headers.get('content-type'));
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    record('Downloaded bytes match the upload', bytes.length === PNG_BYTES.length,
        `${bytes.length} of ${PNG_BYTES.length} byte(s)`);

    console.log('\n[Profile reflects the photo]');
    const meRes = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    const meData = await meRes.json();
    record('Saved on the user profile', meData?.user?.profile?.profilePhoto === storedPath,
        meData?.user?.profile?.profilePhoto);

    console.log('\n[Cleanup]');
    const removeRes = await fetch(`${API}/upload/profile-photo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    record('Photo removal succeeds', removeRes.status === 200, `status ${removeRes.status}`);
    record('File deleted from disk', absolute ? !fs.existsSync(absolute) : false);

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
