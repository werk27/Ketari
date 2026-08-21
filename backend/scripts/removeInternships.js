/**
 * Removes the Internship module (spec Phase 16).
 *
 * Internships were a separate concept layered onto Job. The platform is a
 * recruitment and HR management system, so internship vacancies and their
 * applications are removed.
 *
 * The records are exported to a JSON backup BEFORE deletion so the removal is
 * recoverable even though it is permanent in the database.
 *
 *   node scripts/removeInternships.js --dry-run     # report only
 *   node scripts/removeInternships.js               # export, then delete
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Job = require('../src/models/Job');
const Application = require('../src/models/Application');
const Interview = require('../src/models/Interview');

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const dryRun = process.argv.includes('--dry-run');

    const internships = await Job.find({ isInternship: true });
    const internshipIds = internships.map(job => job._id);

    const applications = await Application.find({ job: { $in: internshipIds } });
    const interviews = await Interview.find({ job: { $in: internshipIds } });

    console.log(`Internship vacancies : ${internships.length}`);
    console.log(`Linked applications  : ${applications.length}`);
    console.log(`Linked interviews    : ${interviews.length}`);

    if (internships.length === 0) {
        console.log('\nNothing to remove.');
        await mongoose.disconnect();
        return;
    }

    internships.forEach(job => console.log(`   - ${job.title} (${job.status})`));

    if (dryRun) {
        console.log('\nDry run: no records were changed.');
        await mongoose.disconnect();
        return;
    }

    // ------------------------------------------------------------------
    // Export a backup before deleting anything
    // ------------------------------------------------------------------
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `internships-${stamp}.json`);

    fs.writeFileSync(backupFile, JSON.stringify({
        exportedAt: new Date().toISOString(),
        jobs: internships,
        applications,
        interviews
    }, null, 2));

    console.log(`\nBackup written to: ${backupFile}`);

    // ------------------------------------------------------------------
    // Delete
    // ------------------------------------------------------------------
    const removedInterviews = await Interview.deleteMany({ job: { $in: internshipIds } });
    const removedApplications = await Application.deleteMany({ job: { $in: internshipIds } });
    const removedJobs = await Job.deleteMany({ _id: { $in: internshipIds } });

    console.log(`\nDeleted interviews   : ${removedInterviews.deletedCount}`);
    console.log(`Deleted applications : ${removedApplications.deletedCount}`);
    console.log(`Deleted vacancies    : ${removedJobs.deletedCount}`);

    const remaining = await Job.countDocuments({ isInternship: true });
    console.log(`\nRemaining internship records: ${remaining}`);
    console.log(remaining === 0 ? '✅ Internship data removed.' : '⚠️ Some records remain.');

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Removal failed:', error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
