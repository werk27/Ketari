/**
 * Development helper: sets the same password on every account so each role can
 * be signed into while testing.
 *
 *     node scripts/resetAllPasswords.js "<password>" [--yes] [--role hr_manager]
 *
 * Refuses to run against a production environment. Passwords go through the
 * User model so the pre-save hook hashes them exactly as a normal sign-up
 * would; writing to the collection directly would store plain text and every
 * login would then fail.
 */
require('./_env');
const readline = require('readline');
const mongoose = require('mongoose');
const User = require('../src/models/User');

const args = process.argv.slice(2);
const password = args.find(a => !a.startsWith('--'));
const roleFlagIndex = args.indexOf('--role');
const role = roleFlagIndex !== -1 ? args[roleFlagIndex + 1] : null;

const die = (message) => {
    console.error(`\n${message}\n`);
    process.exit(1);
};

if (!password) {
    die('Usage: node scripts/resetAllPasswords.js "<password>" [--yes] [--role <role>]');
}

if (password.length < 6) {
    die(`The password must be at least 6 characters - the User model rejects anything shorter.`);
}

if (process.env.NODE_ENV === 'production') {
    die('Refusing to run: NODE_ENV=production.\n'
        + 'Giving every account the same known password would let anyone sign in as anyone.');
}

const confirm = async (question) => {
    if (args.includes('--yes')) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return answer.trim().toLowerCase() === 'yes';
};

(async () => {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`\nDatabase: ${mongoose.connection.name}   Host: ${mongoose.connection.host}`);

    const filter = role ? { role } : {};
    const users = await User.find(filter).select('+password');

    if (!users.length) {
        console.log(role ? `No accounts with role "${role}".` : 'No accounts found.');
        await mongoose.disconnect();
        process.exit(0);
    }

    console.log(`\nThis will set the SAME password on ${users.length} account(s):`);
    users.forEach(u => console.log(`   ${String(u.role).padEnd(12)} ${u.email}`));

    const ok = await confirm(`\nType "yes" to continue: `);
    if (!ok) {
        console.log('Cancelled. No password was changed.');
        await mongoose.disconnect();
        process.exit(0);
    }

    let changed = 0;
    const failed = [];
    for (const user of users) {
        user.password = password;
        try {
            // eslint-disable-next-line no-await-in-loop
            await user.save();
            changed++;
        } catch (error) {
            failed.push(`${user.email}: ${error.message.split('\n')[0]}`);
        }
    }

    console.log(`\n${changed} of ${users.length} password(s) updated.`);
    if (failed.length) {
        console.log('Failed:');
        failed.forEach(f => console.log(`   ${f}`));
    }

    // Prove the stored hash actually verifies, rather than trusting the write.
    const sample = await User.findOne(filter).select('+password');
    const works = await sample.matchPassword(password);
    console.log(`Verification: signing in as ${sample.email} with the new password ${works ? 'WORKS' : 'FAILS'}.`);

    await mongoose.disconnect();
    process.exit(works && !failed.length ? 0 : 1);
})().catch(async (error) => {
    console.error('\nFailed:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
