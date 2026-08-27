/**
 * End-to-end check of the redesigned Configuration module (Departments,
 * Positions, Position Ranks, Job Titles, Partners).
 *
 * Verifies the actual root cause fix: Position.department/rank are now real
 * relationships (validated against the organization's own configured lists,
 * never free text), every validation failure returns the SPECIFIC reason
 * instead of a generic "Invalid"/"Validation Error", and referenced records
 * cannot be hard-deleted.
 *
 * Fully self-contained - creates its own throwaway organization and removes
 * it again at the end. Never touches real organizations' data.
 *
 * Usage: node scripts/configurationSelfTest.js [apiUrl]
 */
require('./_env');
const mongoose = require('mongoose');

const API = process.argv[2] || `http://localhost:${process.env.PORT || 5000}/api`;
const stamp = Date.now();
const PASSWORD = 'ConfigTest123!';

const employer = { name: 'Configuration Test Employer', email: `cfg-test-employer-${stamp}@example.com`, password: PASSWORD, role: 'employer' };

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

const login = async ({ email, password }) => {
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.data.message}`);
    return res.data.token;
};

const created = { emails: [employer.email] };

const cleanup = async () => {
    if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    }
    const db = mongoose.connection;
    const users = await db.collection('users').find({ email: { $in: created.emails } }).toArray();
    const userIds = users.map(u => u._id);
    if (created.employerId) {
        await db.collection('configurations').deleteMany({ employer: created.employerId });
        await db.collection('employers').deleteMany({ _id: created.employerId });
    }
    await db.collection('users').deleteMany({ _id: { $in: userIds } });
};

(async () => {
    console.log(`Testing ${API}\n`);
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection;

    const reg = await call('POST', '/auth/register', { body: employer });
    check('Employer registers', reg.status === 201, reg);
    const token = reg.data.token;
    created.employerId = new mongoose.Types.ObjectId(reg.data.organization._id);
    await db.collection('employers').updateOne({ _id: created.employerId }, { $set: { status: 'active', verifiedAt: new Date() } });

    // ---- Department ------------------------------------------------------------
    const noNameDept = await call('POST', '/config/departments', { token, body: { code: 'X' } });
    check('Department name required -> specific message', noNameDept.status === 400 && noNameDept.data.message === 'Department name is required.', noNameDept);

    const deptRes = await call('POST', '/config/departments', { token, body: { name: 'Information Technology', code: 'IT' } });
    check('Department creation succeeds', deptRes.status === 201, deptRes);
    const itDept = deptRes.data.data.departments.find(d => d.name === 'Information Technology');
    check('Department was actually saved', Boolean(itDept), deptRes.data.data.departments);

    const dupDept = await call('POST', '/config/departments', { token, body: { name: 'information technology' } });
    check('Duplicate department name rejected with specific message',
        dupDept.status === 400 && dupDept.data.message === 'A department named "information technology" already exists.', dupDept);

    const financeRes = await call('POST', '/config/departments', { token, body: { name: 'Finance', code: 'FIN' } });
    const financeDept = financeRes.data.data.departments.find(d => d.name === 'Finance');
    check('A second department (Finance) is created', Boolean(financeDept), financeRes);

    // ---- Position ---------------------------------------------------------------
    const noNamePos = await call('POST', '/config/positions', { token, body: { department: itDept._id } });
    check('Position name required -> specific message', noNamePos.status === 400 && noNamePos.data.message === 'Position name is required.', noNamePos);

    const noDeptPos = await call('POST', '/config/positions', { token, body: { title: 'Software Developer' } });
    check('Position without a department -> specific message', noDeptPos.status === 400 && noDeptPos.data.message === 'Please select a department.', noDeptPos);

    const freeTextDeptPos = await call('POST', '/config/positions', { token, body: { title: 'Software Developer', department: 'Information Technology' } });
    check('Free-text department is rejected with a specific message (the original bug)',
        freeTextDeptPos.status === 400 && freeTextDeptPos.data.message === 'Selected department does not exist.', freeTextDeptPos);

    const fakeIdPos = await call('POST', '/config/positions', { token, body: { title: 'Software Developer', department: new mongoose.Types.ObjectId().toString() } });
    check('A well-formed but non-existent department id is rejected',
        fakeIdPos.status === 400 && fakeIdPos.data.message === 'Selected department does not exist.', fakeIdPos);

    const posRes = await call('POST', '/config/positions', { token, body: { title: 'Software Developer', department: itDept._id, code: 'IT-SD' } });
    check('Position creation succeeds with a real department id', posRes.status === 201, posRes);
    const devPosition = posRes.data.data.positions.find(p => p.title === 'Software Developer');
    check('Position stores the department ObjectId (not a name string)', String(devPosition?.department) === String(itDept._id), devPosition);

    const acctPosRes = await call('POST', '/config/positions', { token, body: { title: 'Accountant', department: financeDept._id, code: 'FIN-ACC' } });
    const acctPosition = acctPosRes.data.data.positions.find(p => p.title === 'Accountant');
    check('A second position (Accountant, Finance) is created', Boolean(acctPosition), acctPosRes);

    const dupPos = await call('POST', '/config/positions', { token, body: { title: 'Software Developer', department: itDept._id } });
    check('Duplicate position within the same department is rejected',
        dupPos.status === 400 && dupPos.data.message === 'A position named "Software Developer" already exists in this department.', dupPos);

    const samePosOtherDept = await call('POST', '/config/positions', { token, body: { title: 'Software Developer', department: financeDept._id } });
    check('The same position title is allowed in a DIFFERENT department', samePosOtherDept.status === 201, samePosOtherDept);

    // ---- Position Rank (global, reusable) ---------------------------------------
    const noNameRank = await call('POST', '/config/position-ranks', { token, body: {} });
    check('Position rank name required -> specific message', noNameRank.status === 400 && noNameRank.data.message === 'Position rank name is required.', noNameRank);

    const rangeRank = await call('POST', '/config/position-ranks', { token, body: { name: 'Senior', minSalary: 25000, maxSalary: 35000 } });
    check('A min/max salary range is rejected (one fixed salary only, same rule as vacancies)',
        rangeRank.status === 400 && rangeRank.data.message === 'Salary ranges are not supported; provide a single, fixed salary amount.', rangeRank);

    const badSalaryRank = await call('POST', '/config/position-ranks', { token, body: { name: 'Senior', salary: 'thirty thousand' } });
    check('Non-numeric salary is rejected with a specific message',
        badSalaryRank.status === 400 && badSalaryRank.data.message === 'Salary must be a valid positive number.', badSalaryRank);

    const zeroSalaryRank = await call('POST', '/config/position-ranks', { token, body: { name: 'Senior', salary: 0 } });
    check('A zero salary is rejected', zeroSalaryRank.status === 400 && zeroSalaryRank.data.message === 'Salary must be a valid positive number.', zeroSalaryRank);

    const rankRes = await call('POST', '/config/position-ranks', { token, body: { name: 'Senior', level: 3, salary: 30000 } });
    check('Position rank creation succeeds with a valid fixed salary', rankRes.status === 201, rankRes);
    const seniorRank = rankRes.data.data.positionRanks.find(r => r.name === 'Senior');
    check('Position rank stores one fixed numeric salary (not a range)', seniorRank?.salary === 30000, seniorRank);

    // Assign the global rank to a position (Position -> Rank relationship).
    const assignRankRes = await call('PUT', `/config/positions/${devPosition._id}`, {
        token, body: { title: devPosition.title, department: itDept._id, code: devPosition.code, rank: seniorRank._id }
    });
    check('A position can be assigned one of the organization\'s global ranks', assignRankRes.status === 200, assignRankRes);
    const updatedDev = assignRankRes.data.data.positions.find(p => p._id === devPosition._id);
    check('The position now stores the rank\'s real id', String(updatedDev?.rank) === String(seniorRank._id), updatedDev);

    const fakeRankPos = await call('POST', '/config/positions', { token, body: { title: 'IT Support Officer', department: itDept._id, rank: new mongoose.Types.ObjectId().toString() } });
    check('A non-existent rank id is rejected with a specific message',
        fakeRankPos.status === 400 && fakeRankPos.data.message === 'Selected position rank does not exist.', fakeRankPos);

    // ---- Job Title (standalone, not linked to Department) ----------------------
    const noNameTitle = await call('POST', '/config/job-titles', { token, body: {} });
    check('Job title name required -> specific message', noNameTitle.status === 400 && noNameTitle.data.message === 'Job title name is required.', noNameTitle);

    const titleRes = await call('POST', '/config/job-titles', { token, body: { name: 'Software Engineer', code: 'SE-001' } });
    check('Job title creation succeeds', titleRes.status === 201, titleRes);
    const jobTitle = titleRes.data.data.jobTitles.find(j => j.name === 'Software Engineer');
    check('Job title does not require/store a department', Boolean(jobTitle) && jobTitle.department === undefined, jobTitle);

    // ---- Partner (predefined type enum) -----------------------------------------
    const noTypePartner = await call('POST', '/config/partners', { token, body: { name: 'Acme Staffing' } });
    check('Partner without a valid type is rejected with a specific message',
        noTypePartner.status === 400 && noTypePartner.data.message === 'Please select a valid partner type.', noTypePartner);

    const badTypePartner = await call('POST', '/config/partners', { token, body: { name: 'Acme Staffing', type: 'made_up_type' } });
    check('An arbitrary partner type string is rejected', badTypePartner.status === 400 && badTypePartner.data.message === 'Please select a valid partner type.', badTypePartner);

    const partnerRes = await call('POST', '/config/partners', { token, body: { name: 'Acme Staffing', type: 'vendor' } });
    check('Partner creation succeeds with a valid predefined type', partnerRes.status === 201, partnerRes);

    // ---- Referential integrity: cannot hard-delete what's in use ----------------
    const deleteUsedDept = await call('DELETE', `/config/departments/${itDept._id}`, { token });
    check('Cannot delete a department that has positions under it',
        deleteUsedDept.status === 409 && /positions configured under it/.test(deleteUsedDept.data.message), deleteUsedDept);

    const deleteUsedRank = await call('DELETE', `/config/position-ranks/${seniorRank._id}`, { token });
    check('Cannot delete a position rank assigned to a position',
        deleteUsedRank.status === 409 && /assigned to one or more positions/.test(deleteUsedRank.data.message), deleteUsedRank);

    const deactivateDept = await call('PUT', `/config/departments/${itDept._id}`, { token, body: { name: 'Information Technology', code: 'IT', status: 'inactive' } });
    check('A department can be deactivated instead of deleted', deactivateDept.status === 200, deactivateDept);
    const deactivated = deactivateDept.data.data.departments.find(d => d._id === itDept._id);
    check('Deactivated department shows status inactive', deactivated?.status === 'inactive', deactivated);

    // A never-referenced department/rank should still delete cleanly.
    const unusedDeptRes = await call('POST', '/config/departments', { token, body: { name: 'Marketing', code: 'MKT' } });
    const marketingDept = unusedDeptRes.data.data.departments.find(d => d.name === 'Marketing');
    const deleteUnusedDept = await call('DELETE', `/config/departments/${marketingDept._id}`, { token });
    check('An unused department deletes cleanly', deleteUnusedDept.status === 200, deleteUnusedDept);

    // ---- Meta: partner type options are served, not hardcoded on the client ----
    const metaRes = await call('GET', '/config', { token });
    check('Partner type options are exposed via the API meta', Array.isArray(metaRes.data.meta?.partnerTypes) && metaRes.data.meta.partnerTypes.length > 0, metaRes.data.meta);

    console.log('\nCleanup: removed the test organization, configuration and account.');
    await cleanup();
    await mongoose.disconnect();

    console.log(failures === 0 ? '\nAll configuration module checks passed.' : `\n${failures} configuration check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(async (err) => {
    console.error('Configuration self test crashed:', err);
    try { await cleanup(); await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
