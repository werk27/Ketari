const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('./_env');

const User = require('../src/models/User');

async function createOrPromoteAdmin() {
    try {
        const email = process.argv[2] || 'admin@recruitai.com';
        const password = process.argv[3] || 'Admin123!';
        const name = process.argv[4] || 'System Administrator';

        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        const normalizedEmail = email.toLowerCase().trim();
        let user = await User.findOne({ email: normalizedEmail });

        if (user) {
            console.log(`Found existing user with email: ${normalizedEmail}`);
            user.role = 'admin';
            if (password) {
                user.password = password; // pre-save hook will hash password
            }
            await user.save();
            console.log(`✅ Updated existing user "${user.name}" (${normalizedEmail}) to role: 'admin'`);
        } else {
            console.log(`Creating new admin user: ${normalizedEmail}...`);
            user = await User.create({
                name: name,
                email: normalizedEmail,
                password: password,
                role: 'admin'
            });
            console.log(`✅ Successfully created System Admin user:`);
            console.log(`   Email:    ${normalizedEmail}`);
            console.log(`   Password: ${password}`);
            console.log(`   Role:     admin`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating/promoting admin:', error);
        process.exit(1);
    }
}

createOrPromoteAdmin();
