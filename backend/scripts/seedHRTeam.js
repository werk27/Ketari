/**
 * Seed a demo HR team (HR Expert + HR Manager) inside an existing organization.
 *
 * Recruitment requires both roles to demonstrate separation of duties:
 * the HR Expert creates and submits vacancies, the HR Manager approves them.
 *
 * Usage:
 *   node scripts/seedHRTeam.js                 # uses the first active organization
 *   node scripts/seedHRTeam.js "Org Name"      # target a specific organization
 */
require('./_env');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Employer = require('../src/models/Employer');

const MEMBERS = [
    {
        name: 'Selam Bekele',
        email: 'hr.expert@ketari.et',
        password: 'Expert@123',
        role: 'hr_expert',
        department: 'Human Resources',
        jobTitle: 'Recruitment Officer'
    },
    {
        name: 'Dawit Mekonnen',
        email: 'hr.manager@ketari.et',
        password: 'Manager@123',
        role: 'hr_manager',
        department: 'Human Resources',
        jobTitle: 'HR Manager'
    },
    {
        name: 'Meron Tesfaye',
        email: 'employee@ketari.et',
        password: 'Employee@123',
        role: 'employee',
        department: 'Engineering',
        jobTitle: 'Software Engineer'
    }
];

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const requestedName = process.argv[2];
    const organization = requestedName
        ? await Employer.findOne({ name: requestedName })
        : await Employer.findOne({ owner: { $ne: null } }).sort({ createdAt: 1 });

    if (!organization) {
        throw new Error(requestedName
            ? `No organization named "${requestedName}" was found`
            : 'No organization found. Register an employer account first.');
    }

    // A verified organization is required before vacancies can be published.
    if (organization.status !== 'active') {
        organization.status = 'active';
        organization.verifiedAt = new Date();
        await organization.save();
        console.log(`   activated organization "${organization.name}"`);
    }

    console.log(`\nSeeding HR team into: ${organization.name}`);

    for (const member of MEMBERS) {
        const existing = await User.findOne({ email: member.email });

        if (existing) {
            existing.employer = organization._id;
            existing.role = member.role;
            existing.status = 'active';
            existing.department = member.department;
            existing.jobTitle = member.jobTitle;
            // Reset the password too (the pre-save hook re-hashes it). Without
            // this the script printed credentials that no longer worked for an
            // account seeded earlier, which looked like a broken login.
            existing.password = member.password;
            await existing.save({ validateBeforeSave: false });
            console.log(`   ↻ updated ${member.role.padEnd(10)} ${member.email}  (password reset to: ${member.password})`);
        } else {
            await User.create({ ...member, status: 'active', employer: organization._id });
            console.log(`   + created ${member.role.padEnd(10)} ${member.email}  (password: ${member.password})`);
        }
    }

    console.log('\nDone. Sign in with these accounts to test the approval workflow:');
    MEMBERS.forEach(m => console.log(`   ${m.role.padEnd(10)} ${m.email} / ${m.password}`));

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Seed failed:', error.message);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
