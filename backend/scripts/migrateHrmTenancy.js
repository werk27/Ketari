/**
 * Migration: extend Employer/Organization tenancy to the HR modules.
 *
 * Stage 2 adds an `employer` reference to Employee, Leave, Training, Delegation,
 * Attendance, Complaint and Interview. This backfills that reference on records
 * created before tenancy existed, so employer isolation also applies to history.
 *
 * Resolution order for each record:
 *   1. an already-set employer
 *   2. the linked employee's employer
 *   3. the linked user's employer
 *   4. the linked job's employer
 *   5. the single-organization fallback (only when exactly one org exists)
 *
 * Records that still cannot be resolved are reported rather than guessed at.
 * To place those legacy orphans in a holding organization, opt in explicitly:
 *
 *   node scripts/migrateHrmTenancy.js
 *   node scripts/migrateHrmTenancy.js --fallback "Default Organization"
 */
require('./_env');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Employer = require('../src/models/Employer');
const Employee = require('../src/models/Employee');
const Leave = require('../src/models/Leave');
const Training = require('../src/models/Training');
const Delegation = require('../src/models/Delegation');
const Attendance = require('../src/models/Attendance');
const Complaint = require('../src/models/Complaint');
const Interview = require('../src/models/Interview');
const Job = require('../src/models/Job');

const summary = [];

const resolveFromUser = async (userId) => {
    if (!userId) return null;
    const user = await User.findById(userId).select('employer');
    return user ? user.employer : null;
};

const resolveFromEmployee = async (employeeId) => {
    if (!employeeId) return null;
    const employee = await Employee.findById(employeeId).select('employer user');
    if (!employee) return null;
    return employee.employer || await resolveFromUser(employee.user);
};

const resolveFromJob = async (jobId) => {
    if (!jobId) return null;
    const job = await Job.findById(jobId).select('employer');
    return job ? job.employer : null;
};

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    // A single-tenant deployment can safely attribute orphaned records.
    const organizations = await Employer.find().select('_id name');
    let soleOrganization = organizations.length === 1 ? organizations[0]._id : null;
    if (soleOrganization) {
        console.log(`Only one organization exists - unresolved records will be attributed to it.\n`);
    }

    // Explicit opt-in holding organization for legacy orphans (--fallback "Name").
    const fallbackIndex = process.argv.indexOf('--fallback');
    if (fallbackIndex !== -1) {
        const fallbackName = process.argv[fallbackIndex + 1];
        const fallbackOrg = organizations.find(org => org.name === fallbackName);
        if (!fallbackOrg) {
            throw new Error(`No organization named "${fallbackName}". Available: `
                + organizations.map(o => `"${o.name}"`).join(', '));
        }
        soleOrganization = fallbackOrg._id;
        console.log(`Fallback organization: "${fallbackOrg.name}" - unresolved records will be attributed to it.\n`);
    }

    // ------------------------------------------------------------------
    // 0. Drop the legacy platform-wide unique index on employeeId.
    //    Employee numbers are unique per organization, not globally, so the old
    //    index would reject a second employer numbering their first hire EMP0001.
    // ------------------------------------------------------------------
    try {
        const indexes = await mongoose.connection.db.collection('employees').indexes();
        const legacy = indexes.find(index => index.name === 'employeeId_1');
        if (legacy) {
            await mongoose.connection.db.collection('employees').dropIndex('employeeId_1');
            console.log('[0/7] Dropped legacy global unique index employeeId_1');
        } else {
            console.log('[0/7] No legacy employeeId index to drop');
        }
    } catch (error) {
        console.log(`[0/7] Index cleanup skipped: ${error.message}`);
    }

    // ------------------------------------------------------------------
    // 1. Employees - resolve through their linked user account
    // ------------------------------------------------------------------
    const employees = await Employee.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let employeeUpdates = 0;
    let employeeIdBackfills = 0;

    for (const employee of employees) {
        const employerId = await resolveFromUser(employee.user) || soleOrganization;

        // Older records could be created without an employee number.
        if (!employee.employeeId) {
            employee.employeeId = `EMP${Date.now()}${Math.floor(Math.random() * 100)}`;
            employeeIdBackfills += 1;
        }

        if (employerId) {
            employee.employer = employerId;
            await employee.save({ validateBeforeSave: false });
            employeeUpdates += 1;
        } else if (employeeIdBackfills) {
            await employee.save({ validateBeforeSave: false });
        }
    }
    summary.push(['Employees', employees.length, employeeUpdates]);
    console.log(`[1/7] Employees            : ${employeeUpdates}/${employees.length} linked`
        + (employeeIdBackfills ? ` (${employeeIdBackfills} employee number(s) generated)` : ''));

    // ------------------------------------------------------------------
    // 2. Leave - inherit from the employee
    // ------------------------------------------------------------------
    const leaves = await Leave.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let leaveUpdates = 0;
    for (const leave of leaves) {
        const employerId = await resolveFromEmployee(leave.employee) || soleOrganization;
        if (!employerId) continue;
        leave.employer = employerId;
        await leave.save({ validateBeforeSave: false });
        leaveUpdates += 1;
    }
    summary.push(['Leave requests', leaves.length, leaveUpdates]);
    console.log(`[2/7] Leave requests       : ${leaveUpdates}/${leaves.length} linked`);

    // ------------------------------------------------------------------
    // 3. Training - inherit from the first participant, else fallback
    // ------------------------------------------------------------------
    const trainings = await Training.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let trainingUpdates = 0;
    for (const training of trainings) {
        const firstParticipant = training.participants && training.participants[0];
        const employerId = await resolveFromEmployee(firstParticipant && firstParticipant.employee)
            || soleOrganization;
        if (!employerId) continue;
        training.employer = employerId;
        await training.save({ validateBeforeSave: false });
        trainingUpdates += 1;
    }
    summary.push(['Training', trainings.length, trainingUpdates]);
    console.log(`[3/7] Training             : ${trainingUpdates}/${trainings.length} linked`);

    // ------------------------------------------------------------------
    // 4. Delegations - inherit from the delegator
    // ------------------------------------------------------------------
    const delegations = await Delegation.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let delegationUpdates = 0;
    for (const delegation of delegations) {
        const employerId = await resolveFromUser(delegation.delegator) || soleOrganization;
        if (!employerId) continue;
        delegation.employer = employerId;
        await delegation.save({ validateBeforeSave: false });
        delegationUpdates += 1;
    }
    summary.push(['Delegations', delegations.length, delegationUpdates]);
    console.log(`[4/7] Delegations          : ${delegationUpdates}/${delegations.length} linked`);

    // ------------------------------------------------------------------
    // 5. Attendance - inherit from the employee
    // ------------------------------------------------------------------
    const attendances = await Attendance.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let attendanceUpdates = 0;
    for (const attendance of attendances) {
        const employerId = await resolveFromEmployee(attendance.employee) || soleOrganization;
        if (!employerId) continue;
        attendance.employer = employerId;
        await attendance.save({ validateBeforeSave: false });
        attendanceUpdates += 1;
    }
    summary.push(['Attendance', attendances.length, attendanceUpdates]);
    console.log(`[5/7] Attendance           : ${attendanceUpdates}/${attendances.length} linked`);

    // ------------------------------------------------------------------
    // 6. Complaints - inherit from the employee, and backfill the raiser
    // ------------------------------------------------------------------
    const complaints = await Complaint.find({
        $or: [
            { employer: null }, { employer: { $exists: false } },
            { raisedBy: null }, { raisedBy: { $exists: false } }
        ]
    });
    let complaintUpdates = 0;
    for (const complaint of complaints) {
        const employee = complaint.employee
            ? await Employee.findById(complaint.employee).select('employer user')
            : null;

        if (!complaint.raisedBy && employee && employee.user) {
            complaint.raisedBy = employee.user;
        }
        if (!complaint.category) {
            complaint.category = 'employee';
        }

        const employerId = complaint.employer
            || (employee ? employee.employer || await resolveFromUser(employee.user) : null)
            || soleOrganization;

        if (employerId) complaint.employer = employerId;
        await complaint.save({ validateBeforeSave: false });
        complaintUpdates += 1;
    }
    summary.push(['Complaints', complaints.length, complaintUpdates]);
    console.log(`[6/7] Complaints           : ${complaintUpdates}/${complaints.length} linked`);

    // ------------------------------------------------------------------
    // 7. Interviews - inherit from the vacancy
    // ------------------------------------------------------------------
    const interviews = await Interview.find({ $or: [{ employer: null }, { employer: { $exists: false } }] });
    let interviewUpdates = 0;
    for (const interview of interviews) {
        const employerId = await resolveFromJob(interview.job) || soleOrganization;
        if (!employerId) continue;
        interview.employer = employerId;
        await interview.save({ validateBeforeSave: false });
        interviewUpdates += 1;
    }
    summary.push(['Interviews', interviews.length, interviewUpdates]);
    console.log(`[7/7] Interviews           : ${interviewUpdates}/${interviews.length} linked`);

    // ------------------------------------------------------------------
    // Report anything still unattributed
    // ------------------------------------------------------------------
    console.log('\nRemaining records without an organization:');
    const models = [
        ['Employee', Employee], ['Leave', Leave], ['Training', Training],
        ['Delegation', Delegation], ['Attendance', Attendance],
        ['Complaint', Complaint], ['Interview', Interview]
    ];
    let outstanding = 0;
    for (const [name, model] of models) {
        const count = await model.countDocuments({ $or: [{ employer: null }, { employer: { $exists: false } }] });
        outstanding += count;
        console.log(`   ${name.padEnd(12)} : ${count}`);
    }

    console.log(outstanding === 0
        ? '\n✅ Every HR record is attributed to an organization.'
        : `\n⚠️ ${outstanding} record(s) could not be attributed automatically and need manual assignment.`);

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
