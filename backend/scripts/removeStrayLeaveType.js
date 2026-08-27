/**
 * Removes the stray "polo" leave type (name: "polo", code: "78",
 * daysPerYear: 8) from every Configuration document - the platform defaults
 * (employer: null) and each organization's own copy. It was a leftover
 * placeholder entry (created while testing the Configuration -> Leave Types
 * screen) that propagated into every organization because new organizations
 * clone the platform defaults the first time they open their configuration.
 *
 * Leave.leaveTypeName is a plain string snapshot, not a reference to this
 * config entry, so existing leave requests that used "polo" keep their
 * history intact - only the entry in the dropdown/config lists is removed.
 *
 *   node scripts/removeStrayLeaveType.js
 */
require('./_env');
const mongoose = require('mongoose');
const Configuration = require('../src/models/Configuration');

const STRAY_NAME = 'polo';

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const configs = await Configuration.find({ 'leaveTypes.name': STRAY_NAME });
    console.log(`Found ${configs.length} configuration document(s) with a "${STRAY_NAME}" leave type.\n`);

    let removedCount = 0;
    for (const config of configs) {
        const before = config.leaveTypes.length;
        config.leaveTypes = config.leaveTypes.filter(
            t => (t.name || '').trim().toLowerCase() !== STRAY_NAME
        );
        const removed = before - config.leaveTypes.length;
        if (removed > 0) {
            await config.save();
            removedCount += removed;
            console.log(`   [${config.employer ? config.employer : 'platform defaults'}] removed ${removed} entr(y/ies)`);
        }
    }

    console.log(removedCount > 0
        ? `\n✅ Removed "${STRAY_NAME}" from ${configs.length} configuration document(s).`
        : `\n✅ Nothing to remove - no configuration document had a "${STRAY_NAME}" leave type.`);

    await mongoose.disconnect();
};

run().catch(err => {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
});
