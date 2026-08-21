/**
 * End-to-end check of the sign-in path against a running backend.
 *
 * Registers a throwaway account, signs in with it through several realistic
 * input variations (padded email, different capitalisation, wrong password),
 * verifies the token works against /api/auth/me, then deletes the account.
 *
 * Usage: node scripts/loginSelfTest.js [apiUrl]
 */
const path = require('path');
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const email = `login-selftest-${Date.now()}@example.com`;
const password = 'SelfTest123!';

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

(async () => {
    console.log(`Testing ${API}\n`);

    const health = await call('GET', '/health');
    check('health reports a connected database', health.data.database === 'connected', health.data);

    const registered = await call('POST', '/auth/register', { name: 'Login Self Test', email, password });
    check('register returns a token', registered.status === 201 && !!registered.data.token, registered);

    const plain = await call('POST', '/auth/login', { email, password });
    check('login with exact credentials', plain.status === 200 && !!plain.data.token, plain);

    const messy = await call('POST', '/auth/login', { email: `  ${email.toUpperCase()}  `, password });
    check('login with padded, upper-case email', messy.status === 200 && !!messy.data.token, messy);

    const wrong = await call('POST', '/auth/login', { email, password: 'not-the-password' });
    check('wrong password is rejected with 401', wrong.status === 401, wrong);
    check('wrong password message is specific', /invalid email or password/i.test(wrong.data.message || ''), wrong.data);

    const missing = await call('POST', '/auth/login', { email });
    check('missing password is rejected with 400', missing.status === 400, missing);

    const me = await call('GET', '/auth/me', null, plain.data.token);
    check('token from login is accepted by /auth/me', me.status === 200 && me.data.user?.email === email, me);

    const badToken = await call('GET', '/auth/me', null, 'not-a-real-token');
    check('invalid token is rejected with 401', badToken.status === 401, badToken);

    // Repeated sign-ins must never be throttled - only failures count.
    let throttled = false;
    for (let i = 0; i < 12; i++) {
        // eslint-disable-next-line no-await-in-loop
        const attempt = await call('POST', '/auth/login', { email, password });
        if (attempt.status !== 200) {
            throttled = true;
            console.log(`      attempt ${i + 1}: ${attempt.status} ${JSON.stringify(attempt.data)}`);
            break;
        }
    }
    check('12 consecutive successful sign-ins are not rate limited', !throttled);

    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const result = await mongoose.connection.collection('users').deleteMany({ email });
    console.log(`\nCleanup: removed ${result.deletedCount} test account(s).`);
    await mongoose.disconnect();

    console.log(failures === 0 ? '\nAll login checks passed.' : `\n${failures} login check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (error) => {
    console.error('Self test crashed:', error);
    try {
        await mongoose.connection.collection('users').deleteMany({ email });
        await mongoose.disconnect();
    } catch (cleanupError) {
        // Nothing else to do - the account name is printed above.
    }
    process.exit(1);
});
