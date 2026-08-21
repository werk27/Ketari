/**
 * Removes records created by the automated verification suites.
 * Run after verifyStage1 / verifyWorkflow / verifyHrm to leave the database clean.
 *
 *   node scripts/cleanupVerificationData.js
 */
require('./_env');
const mongoose = require('mongoose');

const Job = require('../src/models/Job');
const Application = require('../src/models/Application');
const Employee = require('../src/models/Employee');
const Leave = require('../src/models/Leave');
const Training = require('../src/models/Training');
const EmployeeRequest = require('../src/models/EmployeeRequest');
const Configuration = require('../src/models/Configuration');

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const report = [];

    const verificationJobs = await Job.find({
        title: { $regex: /^(Verification Engineer|Hidden Draft|Manager Should Not Create)/ }
    }).select('_id');
    const jobIds = verificationJobs.map(j => j._id);

    report.push(['Applications on verification vacancies',
        (await Application.deleteMany({ job: { $in: jobIds } })).deletedCount]);
    report.push(['Verification vacancies',
        (await Job.deleteMany({ _id: { $in: jobIds } })).deletedCount]);
    report.push(['Verification employees',
        (await Employee.deleteMany({ 'personalInfo.firstName': 'Verify' })).deletedCount]);
    report.push(['Verification leave requests',
        (await Leave.deleteMany({ reason: /^Verification leave request/ })).deletedCount]);
    report.push(['Verification training',
        (await Training.deleteMany({ title: /^Verification Training/ })).deletedCount]);
    report.push(['Verification requests',
        (await EmployeeRequest.deleteMany({ title: /^Verification break-year/ })).deletedCount]);

    // Configuration probes (STAGE1_/HRMTEST_ markers)
    const configs = await Configuration.find();
    let configItemsRemoved = 0;
    for (const config of configs) {
        let changed = false;
        for (const [key, value] of Object.entries(config.toObject())) {
            if (!Array.isArray(value) || key === 'statusHistory') continue;
            const filtered = (config[key] || []).filter(
                item => !(item && item.name && /^(STAGE1_|HRMTEST_|AUDIT_TEST)/.test(item.name))
            );
            if (filtered.length !== (config[key] || []).length) {
                configItemsRemoved += (config[key] || []).length - filtered.length;
                config[key] = filtered;
                changed = true;
            }
        }
        if (changed) await config.save();
    }
    report.push(['Configuration probe entries', configItemsRemoved]);

    console.log('Removed:');
    report.forEach(([label, count]) => console.log(`   ${label.padEnd(40)} ${count}`));

    console.log('\nRemaining data:');
    console.log(`   vacancies    : ${await Job.countDocuments()}`);
    console.log(`   applications : ${await Application.countDocuments()}`);
    console.log(`   employees    : ${await Employee.countDocuments()}`);
    console.log(`   leave        : ${await Leave.countDocuments()}`);
    console.log(`   training     : ${await Training.countDocuments()}`);
    console.log(`   requests     : ${await EmployeeRequest.countDocuments()}`);

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Cleanup failed:', error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
