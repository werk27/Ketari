const mongoose = require('mongoose');
const path = require('path');
require('./_env');

const User = require('../src/models/User');

async function migrateRoles() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        const jobseekers = await User.updateMany({ role: 'jobseeker' }, { $set: { role: 'candidate' } });
        console.log(`Migrated ${jobseekers.modifiedCount} 'jobseeker' users to 'candidate'`);

        const employers = await User.updateMany({ role: 'employer' }, { $set: { role: 'hr_expert' } });
        console.log(`Migrated ${employers.modifiedCount} 'employer' users to 'hr_expert'`);

        console.log('Migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Error during role migration:', error);
        process.exit(1);
    }
}

migrateRoles();
