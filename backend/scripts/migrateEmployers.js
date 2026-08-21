/**
 * Migration: introduce Employer/Organization tenancy.
 *
 * Existing data pre-dates the Employer model: company details lived on User.company
 * and vacancies pointed at individual users. This backfills real organizations and
 * links users, vacancies and applications to them so tenant isolation works on
 * historical records.
 *
 * Safe to run repeatedly - every step is idempotent.
 *
 *   node scripts/migrateEmployers.js
 */
require('./_env');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Employer = require('../src/models/Employer');
const Job = require('../src/models/Job');
const Application = require('../src/models/Application');

const connect = async () => {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
};

/** Create (or reuse) the organization owned by an employer user. */
const ensureOrganizationForOwner = async (owner) => {
    const existing = await Employer.findOne({ owner: owner._id });
    if (existing) return existing;

    const company = owner.company || {};
    const organization = await Employer.create({
        name: company.name || `${owner.name}'s Organization`,
        description: company.description || '',
        website: company.website || '',
        address: { city: company.location || '' },
        contact: { email: owner.email, contactPerson: owner.name },
        owner: owner._id,
        status: 'active',
        verifiedAt: new Date()
    });

    console.log(`   + created organization "${organization.name}"`);
    return organization;
};

/** Create (or reuse) the holding organization for records with no resolvable owner. */
const ensureDefaultOrganization = async () => {
    let organization = await Employer.findOne({ name: 'Default Organization' });
    if (!organization) {
        organization = await Employer.create({
            name: 'Default Organization',
            description: 'Automatically created during the Employer/Organization migration. '
                + 'Reassign these records to their real organization.',
            status: 'active',
            verifiedAt: new Date()
        });
        console.log('   + created "Default Organization"');
    }
    return organization;
};

const run = async () => {
    await connect();

    // ------------------------------------------------------------------
    // 1. Every employer user owns exactly one organization
    // ------------------------------------------------------------------
    const employerUsers = await User.find({ role: 'employer' });
    console.log(`\n[1/5] Employer accounts found: ${employerUsers.length}`);

    for (const owner of employerUsers) {
        const organization = await ensureOrganizationForOwner(owner);
        if (!owner.employer || owner.employer.toString() !== organization._id.toString()) {
            owner.employer = organization._id;
            await owner.save({ validateBeforeSave: false });
            console.log(`   ↳ linked ${owner.email} to ${organization.name}`);
        }
    }

    // ------------------------------------------------------------------
    // 2. HR users without an organization join a default one
    // ------------------------------------------------------------------
    const orphanHrUsers = await User.find({
        role: { $in: ['hr_expert', 'hr_manager'] },
        $or: [{ employer: null }, { employer: { $exists: false } }]
    });
    console.log(`\n[2/5] HR users without an organization: ${orphanHrUsers.length}`);

    let defaultOrg = null;
    if (orphanHrUsers.length > 0) {
        defaultOrg = await ensureDefaultOrganization();

        for (const hrUser of orphanHrUsers) {
            hrUser.employer = defaultOrg._id;
            await hrUser.save({ validateBeforeSave: false });
        }
        console.log(`   ↳ linked ${orphanHrUsers.length} HR user(s) to "${defaultOrg.name}"`);
    }

    // ------------------------------------------------------------------
    // 3. Vacancies gain an owning organization
    //    The legacy `employer` field referenced a User, so any value that is not
    //    a real Employer document is stale and must be remapped.
    // ------------------------------------------------------------------
    const validOrgIds = new Set((await Employer.find().select('_id')).map(e => e._id.toString()));
    const allJobs = await Job.find();
    const jobs = allJobs.filter(job => !job.employer || !validOrgIds.has(job.employer.toString()));
    console.log(`\n[3/5] Vacancies needing an organization: ${jobs.length} of ${allJobs.length}`);

    let migratedJobs = 0;
    for (const job of jobs) {
        let organizationId = null;

        // Resolve through the legacy user reference, the creator, or the assigned HR expert.
        const candidateUserIds = [job.employer, job.createdByUser, job.hr_expert].filter(Boolean);
        for (const userId of candidateUserIds) {
            const relatedUser = await User.findById(userId);
            if (relatedUser && relatedUser.employer) {
                organizationId = relatedUser.employer;
                if (!job.createdByUser) job.createdByUser = relatedUser._id;
                break;
            }
        }

        // Orphaned records (their original owner no longer exists) go to a holding organization.
        if (!organizationId) {
            defaultOrg = defaultOrg || await ensureDefaultOrganization();
            organizationId = defaultOrg._id;
        }

        job.employer = organizationId;

        if (!job.statusHistory || job.statusHistory.length === 0) {
            job.statusHistory = [{
                status: job.status,
                changedAt: job.createdAt || new Date(),
                note: 'Imported during organization migration'
            }];
        }

        await job.save({ validateBeforeSave: false });
        migratedJobs += 1;
    }
    console.log(`   ↳ updated ${migratedJobs} vacancy record(s)`);

    // ------------------------------------------------------------------
    // 4. Applications inherit the organization from their vacancy
    // ------------------------------------------------------------------
    const allApplications = await Application.find().populate('job', 'employer');
    const applications = allApplications.filter(
        app => !app.employer || !validOrgIds.has(app.employer.toString())
    );
    console.log(`\n[4/5] Applications needing an organization: ${applications.length} of ${allApplications.length}`);

    let migratedApplications = 0;
    for (const application of applications) {
        if (!application.job || !application.job.employer) continue;
        application.employer = application.job.employer;
        await application.save({ validateBeforeSave: false });
        migratedApplications += 1;
    }
    console.log(`   ↳ updated ${migratedApplications} application record(s)`);

    // ------------------------------------------------------------------
    // 5. Summary
    // ------------------------------------------------------------------
    const [orgCount, jobsWithOrg, appsWithOrg] = await Promise.all([
        Employer.countDocuments(),
        Job.countDocuments({ employer: { $ne: null } }),
        Application.countDocuments({ employer: { $ne: null } })
    ]);

    console.log('\n[5/5] Migration complete');
    console.log(`   organizations : ${orgCount}`);
    console.log(`   vacancies linked : ${jobsWithOrg}`);
    console.log(`   applications linked : ${appsWithOrg}`);

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
