/**
 * Self test: Employee -> User Account -> Organizational Role workflow.
 *
 * Exercises exactly the Employee/Account/Role separation the business rule
 * requires: a role such as hr_expert or hr_manager may only ever be granted
 * to the user account already linked to an existing Employee record, never
 * created independently of one - and only the organization's employer may
 * grant it. Also proves tenant isolation between two organizations.
 *
 * Fully self-contained: creates two throwaway organizations and removes
 * everything again at the end.
 *
 * Usage: node scripts/employeeRoleWorkflowSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'RoleFlowTest123!';

const accounts = {
    employerA: { name: 'Role Flow Employer A', email: `roleflow-empA-${stamp}@example.com`, password: PASSWORD, role: 'employer' },
    employerB: { name: 'Role Flow Employer B', email: `roleflow-empB-${stamp}@example.com`, password: PASSWORD, role: 'employer' }
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
    try { data = await res.json(); } catch (e) { data = { message: '<non-JSON response>' }; }
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

const created = { emails: Object.values(accounts).map(a => a.email), extraEmails: [] };

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const allEmails = [...created.emails, ...created.extraEmails];
    const users = await db.collection('users').find({ email: { $in: allEmails } }).toArray();
    const userIds = users.map(u => u._id);

    for (const employerId of created.employerIds || []) {
        await db.collection('employees').deleteMany({ employer: employerId });
        await db.collection('employers').deleteMany({ _id: employerId });
    }
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;
    created.employerIds = [];

    // ---------------------------------------------------------------- setup
    const empARes = await call('POST', '/auth/register', { body: accounts.employerA });
    check('Employer A account created', empARes.status === 201, empARes);
    const employerAId = new mongoose.Types.ObjectId(empARes.data.organization._id);
    created.employerIds.push(employerAId);
    await db.collection('employers').updateOne({ _id: employerAId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerAToken = await login(accounts.employerA);

    const empBRes = await call('POST', '/auth/register', { body: accounts.employerB });
    check('Employer B account created (unrelated org)', empBRes.status === 201, empBRes);
    const employerBId = new mongoose.Types.ObjectId(empBRes.data.organization._id);
    created.employerIds.push(employerBId);
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const employerBToken = await login(accounts.employerB);

    // ================================================================
    // Test A - Create Employee
    // ================================================================
    const createRes = await call('POST', '/employees', {
        token: employerAToken,
        body: {
            personalInfo: { firstName: 'Hana', lastName: 'Worku', gender: 'female' },
            contactInfo: { email: `hana-${stamp}@example.com`, phone: '0911000000' },
            employmentInfo: { jobTitle: 'HR Manager', employmentStatus: 'active' }
        }
    });
    check('Test A: HR administrator can add an employee', createRes.status === 201, createRes);
    const employeeId = createRes.data.data?._id;
    const assignedNumber = createRes.data.data?.employeeId;
    check('Test A: employee is assigned a unique employee number', !!assignedNumber, createRes.data);

    const directoryRes = await call('GET', '/employees', { token: employerAToken });
    const inDirectory = (directoryRes.data.data || []).some(e => e._id === employeeId);
    check('Test A: employee appears in the Employee Directory', inDirectory, directoryRes.data.count);

    // A second employee, to become an HR Expert later.
    const createRes2 = await call('POST', '/employees', {
        token: employerAToken,
        body: {
            personalInfo: { firstName: 'Abebe', lastName: 'Kebede', gender: 'male' },
            contactInfo: { email: `abebe-${stamp}@example.com` },
            employmentInfo: { jobTitle: 'HR Officer', employmentStatus: 'active' }
        }
    });
    check('Test A: a second employee can be added', createRes2.status === 201, createRes2);
    const employee2Id = createRes2.data.data?._id;

    // ================================================================
    // Test B - Create Account
    // ================================================================
    const hanaEmail = `hana-account-${stamp}@example.com`;
    created.extraEmails.push(hanaEmail, `abebe-account-${stamp}@example.com`);

    const accountRes = await call('POST', `/employees/${employeeId}/account`, {
        token: employerAToken,
        body: { email: hanaEmail, password: PASSWORD, role: 'employee' }
    });
    check('Test B: account can be created for the employee', accountRes.status === 201, accountRes);

    const afterAccount = await call('GET', `/employees/${employeeId}`, { token: employerAToken });
    check('Test B: account is linked to the employee record', !!afterAccount.data.data?.user, afterAccount.data.data);
    check('Test B: linked account starts with the "employee" role',
        afterAccount.data.data?.user?.role === 'employee', afterAccount.data.data?.user);

    const duplicateAccount = await call('POST', `/employees/${employeeId}/account`, {
        token: employerAToken, body: { email: `other-${stamp}@example.com`, password: PASSWORD, role: 'employee' }
    });
    check('Test B: cannot create a second account for the same employee', duplicateAccount.status === 400, duplicateAccount);

    // Second employee gets an account too, ready for the HR Expert role.
    const account2Res = await call('POST', `/employees/${employee2Id}/account`, {
        token: employerAToken,
        body: { email: `abebe-account-${stamp}@example.com`, password: PASSWORD, role: 'employee' }
    });
    check('Test B: account can be created for the second employee', account2Res.status === 201, account2Res);

    // ================================================================
    // Test C - Assign HR Expert
    // ================================================================
    const noAccountEmployee = await call('POST', '/employees', {
        token: employerAToken,
        body: { personalInfo: { firstName: 'NoAccount', lastName: 'Yet' } }
    });
    const noAccountId = noAccountEmployee.data.data?._id;
    const roleWithoutAccount = await call('PUT', `/employees/${noAccountId}/role`, {
        token: employerAToken, body: { role: 'hr_expert' }
    });
    check('Role cannot be assigned before an account exists (business rule)',
        roleWithoutAccount.status === 400, roleWithoutAccount);

    const assignExpert = await call('PUT', `/employees/${employee2Id}/role`, {
        token: employerAToken, body: { role: 'hr_expert' }
    });
    check('Test C: HR Expert role can be assigned', assignExpert.status === 200, assignExpert);
    check('Test C: response reflects the new role', assignExpert.data.data?.role === 'hr_expert', assignExpert.data.data);

    const afterExpert = await call('GET', `/employees/${employee2Id}`, { token: employerAToken });
    check('Test C: employee now displays the HR Expert role',
        afterExpert.data.data?.user?.role === 'hr_expert', afterExpert.data.data?.user);

    const duplicateRole = await call('PUT', `/employees/${employee2Id}/role`, {
        token: employerAToken, body: { role: 'hr_expert' }
    });
    check('Duplicate role assignment is refused', duplicateRole.status === 400, duplicateRole);

    const expertToken = await login({ email: `abebe-account-${stamp}@example.com`, password: PASSWORD });

    // ================================================================
    // Test D - Assign HR Manager
    // ================================================================
    const assignManager = await call('PUT', `/employees/${employeeId}/role`, {
        token: employerAToken, body: { role: 'hr_manager' }
    });
    check('Test D: HR Manager role can be assigned to another employee', assignManager.status === 200, assignManager);

    const afterManager = await call('GET', `/employees/${employeeId}`, { token: employerAToken });
    check('Test D: employee now displays the HR Manager role',
        afterManager.data.data?.user?.role === 'hr_manager', afterManager.data.data?.user);

    // ================================================================
    // Test E - Permission Check (HR Expert cannot do HR Manager / employer-only actions)
    // ================================================================
    const expertDecisionQueue = await call('GET', '/applications/pending-decision', { token: expertToken });
    check('Test E: HR Expert cannot read the hiring decision queue (HR Manager only)',
        expertDecisionQueue.status === 403, expertDecisionQueue);

    const expertAssignsRole = await call('PUT', `/employees/${employeeId}/role`, {
        token: expertToken, body: { role: 'hr_manager' }
    });
    check('Test E: HR Expert cannot assign organizational roles', expertAssignsRole.status === 403, expertAssignsRole);

    const expertCreatesAccount = await call('POST', `/employees/${noAccountId}/account`, {
        token: expertToken, body: { email: `blocked-${stamp}@example.com`, password: PASSWORD, role: 'employee' }
    });
    check('Test E: HR Expert cannot create user accounts (org:team is employer-only)',
        expertCreatesAccount.status === 403, expertCreatesAccount);

    const expertRecordsEmployee = await call('POST', '/employees', {
        token: expertToken,
        body: { personalInfo: { firstName: 'Recorded', lastName: 'ByExpert' } }
    });
    check('Test E: HR Expert can still record employee information (their real job)',
        expertRecordsEmployee.status === 201, expertRecordsEmployee);

    // ================================================================
    // Test F - Organization Isolation
    // ================================================================
    const crossOrgRead = await call('GET', `/employees/${employeeId}`, { token: employerBToken });
    check('Test F: Organization B cannot read Organization A\'s employee', crossOrgRead.status === 403, crossOrgRead);

    const crossOrgEdit = await call('PUT', `/employees/${employeeId}`, {
        token: employerBToken, body: { employmentInfo: { jobTitle: 'Hacked' } }
    });
    check('Test F: Organization B cannot edit Organization A\'s employee', crossOrgEdit.status === 403, crossOrgEdit);

    const crossOrgRole = await call('PUT', `/employees/${employeeId}/role`, {
        token: employerBToken, body: { role: 'hr_manager' }
    });
    check('Test F: Organization B cannot assign a role to Organization A\'s employee',
        crossOrgRole.status === 403, crossOrgRole);

    const orgBDirectory = await call('GET', '/employees', { token: employerBToken });
    const leaked = (orgBDirectory.data.data || []).some(e => e._id === employeeId || e._id === employee2Id);
    check('Test F: Organization B\'s directory never lists Organization A\'s employees', !leaked, orgBDirectory.data.count);

    // ------------------------------------------------------------ extra: link / status
    const unlinked = await call('GET', '/employees/accounts/unlinked', { token: employerAToken });
    check('Unlinked-accounts list loads for the employer', unlinked.status === 200, unlinked);

    const deactivate = await call('PUT', `/employees/${employeeId}/account/status`, {
        token: employerAToken, body: { status: 'inactive' }
    });
    check('Employer can deactivate a linked account', deactivate.status === 200 && deactivate.data.data?.status === 'inactive', deactivate);

    const reactivate = await call('PUT', `/employees/${employeeId}/account/status`, {
        token: employerAToken, body: { status: 'active' }
    });
    check('Employer can reactivate a linked account', reactivate.status === 200 && reactivate.data.data?.status === 'active', reactivate);

    console.log('\nCleanup: removed the test organizations, employees and accounts.');
    await cleanup();

    if (failures > 0) {
        console.log(`\n${failures} check(s) failed.`);
        process.exit(1);
    }
    console.log('\nAll employee/account/role workflow checks passed.');
    process.exit(0);
})().catch(async (err) => {
    console.error('Self test crashed:', err);
    try { await cleanup(); } catch (_) { /* best effort */ }
    process.exit(1);
});
