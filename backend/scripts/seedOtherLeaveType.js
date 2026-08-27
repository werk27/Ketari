/**
 * Seeds a generic "Other" leave type into every Configuration document - the
 * platform defaults (employer: null) and each organization's own copy.
 *
 * The employee's leave-request dropdown is always restricted to whatever
 * leave types are configured (no free-text fallback once any type exists),
 * so a request that doesn't fit any specific category (Annual, Sick,
 * Marriage, Bereavement, Paternity...) previously had nowhere to go. "Other"
 * is a catch-all: the employee picks it and explains the real reason in the
 * (already free-text, required) Reason field; HR reviews it and can either
 * approve it as-is or ask the employee to resubmit once a more specific
 * leave type is added to Configuration.
 *
 * Idempotent: only adds the type when no existing type in that document
 * already matches the name (case-insensitive).
 *
 *   node scripts/seedOtherLeaveType.js
 */
require('./_env');
const mongoose = require('mongoose');
const Configuration = require('../src/models/Configuration');

const OTHER_LEAVE_TYPE = {
    name: 'Other',
    code: 'OTHER',
    // A generous but bounded catch-all allowance, so a request that doesn't
    // fit any specific category isn't blocked outright. If this repeatedly
    // isn't enough for a given case, HR should add a proper, more specific
    // leave type instead of raising this number.
    daysPerYear: 30,
    paid: true,
    carryOver: false,
    requiresAttachment: false,
    description: 'Catch-all for a leave reason that does not fit any other configured type. '
        + 'The employee explains the specific reason in the request; HR reviews and may '
        + 'ask for a more specific leave type to be added to Configuration instead.',
    status: 'active'
};

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const configs = await Configuration.find();
    console.log(`Found ${configs.length} configuration document(s) (platform defaults + per-organization).\n`);

    let added = 0;
    for (const config of configs) {
        const exists = (config.leaveTypes || []).some(
            t => (t.name || '').trim().toLowerCase() === OTHER_LEAVE_TYPE.name.toLowerCase()
        );
        if (exists) {
            console.log(`   [${config.employer ? config.employer : 'platform defaults'}] already has "Other"`);
            continue;
        }

        config.leaveTypes.push(OTHER_LEAVE_TYPE);
        await config.save();
        added += 1;
        console.log(`   [${config.employer ? config.employer : 'platform defaults'}] added "Other"`);
    }

    console.log(added > 0
        ? `\n✅ Added "Other" to ${added} configuration document(s).`
        : '\n✅ Nothing to add - every configuration document already had "Other".');

    await mongoose.disconnect();
};

run().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
