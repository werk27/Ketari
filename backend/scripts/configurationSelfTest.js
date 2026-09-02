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
        await db.collection('leaves').deleteMany({ employer: created.employerId });
        await db.collection('employees').deleteMany({ employer: created.employerId });
        await db.collection('configurations').deleteMany({ employer: created.employerId });
        await db.collection('employers').deleteMany({ _id: created.employerId });
    }
    if (created.employerBId) {
        await db.collection('leaves').deleteMany({ employer: created.employerBId });
        await db.collection('employees').deleteMany({ employer: created.employerBId });
        await db.collection('configurations').deleteMany({ employer: created.employerBId });
        await db.collection('employers').deleteMany({ _id: created.employerBId });
    }
    await db.collection('employees').deleteMany({ user: { $in: userIds } });
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

    // ---- Leave Types: create, edit in place, validation, deletion safety -------
    // A stamped, unique name avoids colliding with the "Marriage Leave" every
    // new organization already inherits from the platform defaults.
    const MARRIAGE_LEAVE = `Marriage Leave ${stamp}`;

    const noNameLeave = await call('POST', '/config/leave-types', { token, body: { daysPerYear: 3 } });
    check('Leave type name required -> specific message',
        noNameLeave.status === 400 && noNameLeave.data.message === 'Leave type name is required.', noNameLeave);

    const noDaysLeave = await call('POST', '/config/leave-types', { token, body: { name: MARRIAGE_LEAVE } });
    check('Leave type without days/year -> specific message',
        noDaysLeave.status === 400 && noDaysLeave.data.message === 'Days/year is required.', noDaysLeave);

    for (const bad of [0, -5, 'abc']) {
        const badDaysLeave = await call('POST', '/config/leave-types', { token, body: { name: MARRIAGE_LEAVE, daysPerYear: bad } });
        check(`Invalid days/year (${JSON.stringify(bad)}) is rejected with a specific message`,
            badDaysLeave.status === 400 && badDaysLeave.data.message === 'Days/year must be a valid positive number.', badDaysLeave);
    }

    const marriageRes = await call('POST', '/config/leave-types', { token, body: { name: MARRIAGE_LEAVE, daysPerYear: 3 } });
    check('Leave type creation succeeds with a valid positive days/year', marriageRes.status === 201, marriageRes);
    const marriageLeave = marriageRes.data.data.leaveTypes.find(t => t.name === MARRIAGE_LEAVE);
    check('Leave type was actually saved with the configured days/year', marriageLeave?.daysPerYear === 3, marriageLeave);

    const dupLeave = await call('POST', '/config/leave-types', { token, body: { name: MARRIAGE_LEAVE.toLowerCase(), daysPerYear: 5 } });
    check('Duplicate leave type name (case-insensitive) rejected with a specific message',
        dupLeave.status === 400 && dupLeave.data.message === `A leave type named "${MARRIAGE_LEAVE.toLowerCase()}" already exists.`, dupLeave);

    // The core fix: an existing leave type can be EDITED in place - no
    // delete-and-recreate required to change its entitlement.
    const editLeave = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token, body: { name: MARRIAGE_LEAVE, daysPerYear: 5 } });
    check('An existing leave type can be edited (3 -> 5 days) without deleting it first', editLeave.status === 200, editLeave);
    const editedLeave = editLeave.data.data.leaveTypes.find(t => t._id === marriageLeave._id);
    check('The edited leave type reflects the new days/year value', editedLeave?.daysPerYear === 5, editedLeave);
    check('The edited leave type keeps the same id (not a new record)', editedLeave?._id === marriageLeave._id, editedLeave);

    const editInvalidDays = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token, body: { name: MARRIAGE_LEAVE, daysPerYear: -1 } });
    check('Editing a leave type with an invalid days/year is also rejected', editInvalidDays.status === 400, editInvalidDays);

    // ---- Leave Types: only the applicable Employer/HR role may edit --------
    const leaveEmployeeEmail = `leave-cfg-employee-${stamp}@example.com`;
    const leaveExpertEmail = `leave-cfg-expert-${stamp}@example.com`;
    created.emails.push(leaveEmployeeEmail, leaveExpertEmail);

    const empRecordRes = await call('POST', '/employees', {
        token, body: { personalInfo: { firstName: 'Config', lastName: 'Employee' }, contactInfo: { email: leaveEmployeeEmail } }
    });
    const empRecordId = empRecordRes.data.data._id;
    await call('POST', `/employees/${empRecordId}/account`, { token, body: { email: leaveEmployeeEmail, password: PASSWORD, role: 'employee' } });
    const employeeToken = await login({ email: leaveEmployeeEmail, password: PASSWORD });

    const expertRecordRes = await call('POST', '/employees', {
        token, body: { personalInfo: { firstName: 'Config', lastName: 'Expert' }, contactInfo: { email: leaveExpertEmail } }
    });
    const expertRecordId = expertRecordRes.data.data._id;
    await call('POST', `/employees/${expertRecordId}/account`, { token, body: { email: leaveExpertEmail, password: PASSWORD, role: 'employee' } });
    await call('PUT', `/employees/${expertRecordId}/role`, { token, body: { role: 'hr_expert' } });
    const expertToken = await login({ email: leaveExpertEmail, password: PASSWORD });

    const employeeEditAttempt = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token: employeeToken, body: { name: MARRIAGE_LEAVE, daysPerYear: 10 } });
    check('An employee cannot edit a leave type (denied)', employeeEditAttempt.status === 403, employeeEditAttempt);

    const employeeCreateAttempt = await call('POST', '/config/leave-types', { token: employeeToken, body: { name: `Employee Leave ${stamp}`, daysPerYear: 1 } });
    check('An employee cannot create a leave type (denied)', employeeCreateAttempt.status === 403, employeeCreateAttempt);

    const employeeDeleteAttempt = await call('DELETE', `/config/leave-types/${marriageLeave._id}`, { token: employeeToken });
    check('An employee cannot delete a leave type (denied)', employeeDeleteAttempt.status === 403, employeeDeleteAttempt);

    const expertEditAttempt = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token: expertToken, body: { name: MARRIAGE_LEAVE, daysPerYear: 10 } });
    check('HR Expert cannot modify leave configuration (org:config is not part of the HR Expert role)', expertEditAttempt.status === 403, expertEditAttempt);

    const readOnlyForEmployee = await call('GET', '/config', { token: employeeToken });
    check('An employee CAN still read the configuration (needed to fill in forms)', readOnlyForEmployee.status === 200, readOnlyForEmployee);

    // ---- Leave Types: an already-used leave type cannot be hard-deleted -----
    const leaveReq = await call('POST', '/leaves', {
        token: employeeToken,
        body: { leaveType: MARRIAGE_LEAVE, startDate: new Date(Date.now() + 30 * 864e5).toISOString(), endDate: new Date(Date.now() + 31 * 864e5).toISOString(), reason: 'Getting married' }
    });
    check('Employee submits a leave request against this leave type', leaveReq.status === 201, leaveReq);

    const deleteUsedLeave = await call('DELETE', `/config/leave-types/${marriageLeave._id}`, { token });
    check('Cannot delete a leave type already referenced by a leave request', deleteUsedLeave.status === 409, deleteUsedLeave);

    const deactivateUsedLeave = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token, body: { name: MARRIAGE_LEAVE, daysPerYear: 5, status: 'inactive' } });
    check('An in-use leave type CAN be deactivated instead of deleted', deactivateUsedLeave.status === 200, deactivateUsedLeave);
    const deactivatedLeave = deactivateUsedLeave.data.data.leaveTypes.find(t => t._id === marriageLeave._id);
    check('Deactivated leave type shows status inactive', deactivatedLeave?.status === 'inactive', deactivatedLeave);

    const historicalLeaveAfter = await call('GET', '/leaves/me', { token: employeeToken });
    const historicalLeave = (historicalLeaveAfter.data.data || []).find(l => l._id === leaveReq.data.data._id);
    check('The historical leave request keeps its original leave type name and day count unchanged',
        historicalLeave?.leaveTypeName === MARRIAGE_LEAVE && historicalLeave?.totalDays === leaveReq.data.data.totalDays,
        historicalLeave);

    const unusedLeaveRes = await call('POST', '/config/leave-types', { token, body: { name: `Unused Leave ${stamp}`, daysPerYear: 2 } });
    const unusedLeave = unusedLeaveRes.data.data.leaveTypes.find(t => t.name === `Unused Leave ${stamp}`);
    const deleteUnusedLeave = await call('DELETE', `/config/leave-types/${unusedLeave._id}`, { token });
    check('A never-referenced leave type still deletes cleanly', deleteUnusedLeave.status === 200, deleteUnusedLeave);

    // ---- Leave Types: organization isolation --------------------------------
    const employerB = { name: 'Configuration Test Employer B', email: `cfg-test-employerB-${stamp}@example.com`, password: PASSWORD, role: 'employer' };
    created.emails.push(employerB.email);
    const regB = await call('POST', '/auth/register', { body: employerB });
    check('A second, unrelated organization registers', regB.status === 201, regB);
    const employerBId = new mongoose.Types.ObjectId(regB.data.organization._id);
    created.employerBId = employerBId;
    await db.collection('employers').updateOne({ _id: employerBId }, { $set: { status: 'active', verifiedAt: new Date() } });
    const tokenB = regB.data.token;

    const marriageBRes = await call('POST', '/config/leave-types', { token: tokenB, body: { name: MARRIAGE_LEAVE, daysPerYear: 5 } });
    check('Org B configures the SAME-NAMED leave type with a different days/year (5)', marriageBRes.status === 201, marriageBRes);
    const marriageBLeave = marriageBRes.data.data.leaveTypes.find(t => t.name === MARRIAGE_LEAVE);

    const editBLeave = await call('PUT', `/config/leave-types/${marriageBLeave._id}`, { token: tokenB, body: { name: MARRIAGE_LEAVE, daysPerYear: 7 } });
    check('Org B can edit its own leave type', editBLeave.status === 200, editBLeave);

    const orgAConfigAfter = await call('GET', '/config', { token });
    const orgAMarriageAfter = orgAConfigAfter.data.data.leaveTypes.find(t => t._id === marriageLeave._id);
    check('Org A\'s leave type is completely unaffected by Org B\'s edit (still 5 days, still inactive)',
        orgAMarriageAfter?.daysPerYear === 5 && orgAMarriageAfter?.status === 'inactive', orgAMarriageAfter);

    const crossOrgEdit = await call('PUT', `/config/leave-types/${marriageBLeave._id}`, { token, body: { name: MARRIAGE_LEAVE, daysPerYear: 99 } });
    check('Org A cannot edit Org B\'s leave type by id (not found in Org A\'s own configuration)', crossOrgEdit.status === 404, crossOrgEdit);

    // ---- Connected to employee leave validation: the UPDATED rule is used ---
    const balanceAfterEdit = await call('GET', '/leaves/balance', { token: employeeToken });
    check('The balance endpoint no longer offers the now-inactive Marriage Leave',
        !(balanceAfterEdit.data.balances || []).some(b => b.leaveType === MARRIAGE_LEAVE), balanceAfterEdit.data);

    const reactivateRes = await call('PUT', `/config/leave-types/${marriageLeave._id}`, { token, body: { name: MARRIAGE_LEAVE, daysPerYear: 5, status: 'active' } });
    check('Marriage Leave is reactivated for the next check', reactivateRes.status === 200, reactivateRes);

    const overLimitReq = await call('POST', '/leaves', {
        token: employeeToken,
        body: { leaveType: MARRIAGE_LEAVE, startDate: new Date(Date.now() + 60 * 864e5).toISOString(), endDate: new Date(Date.now() + 64 * 864e5).toISOString(), reason: 'Testing the updated limit' }
    });
    check('A request for MORE days than the newly configured 5-day limit is rejected using the UPDATED rule (not the original 3)',
        overLimitReq.status === 400 && /insufficient/i.test(overLimitReq.data.message || ''), overLimitReq);

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
