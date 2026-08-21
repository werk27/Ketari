const mongoose = require('mongoose');
const User = require('../src/models/User');

require('./_env');

async function fixEmailCase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/recruitment_platform', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Find all users with uppercase emails
        const users = await User.find({});
        console.log('Total users:', users.length);

        let fixedCount = 0;
        for (const user of users) {
            if (user.email !== user.email.toLowerCase()) {
                console.log(`Found uppercase email: ${user.email}`);
                
                // Update email to lowercase
                await User.updateOne(
                    { _id: user._id },
                    { $set: { email: user.email.toLowerCase() } }
                );
                
                console.log(`✓ Updated to: ${user.email.toLowerCase()}`);
                fixedCount++;
            }
        }

        if (fixedCount === 0) {
            console.log('No uppercase emails found');
        } else {
            console.log(`✅ Fixed ${fixedCount} email(s) to lowercase`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixEmailCase();
