/**
 * Seeds statutory leave types required by Ethiopia's Labour Proclamation
 * No. 1156/2019 (Articles 81-84) into every Configuration document -
 * the platform defaults (employer: null) and each organization's own copy -
 * so employees can pick a proper leave category instead of ad-hoc names.
 *
 * Entitlements are flat day counts; sick leave's tiered pay (full pay ->
 * half pay -> unpaid across the 6-month period) is NOT modeled here, only
 * the maximum day count, since the leave-type schema has no concept of pay
 * tiers yet.
 *
 * Idempotent: only adds a type when no existing type in that document
 * already matches its name (case-insensitive), so running this more than
 * once, or on a document that already has some of these types, is safe.
 *
 *   node scripts/seedStatutoryLeaveTypes.js
 */
require('./_env');
const mongoose = require('mongoose');
const Configuration = require('../src/models/Configuration');

const STATUTORY_LEAVE_TYPES = [
    {
        name: 'Marriage Leave',
        code: 'MARRIAGE',
        daysPerYear: 3,
        paid: true,
        carryOver: false,
        requiresAttachment: true,
        description: "Labour Proclamation 1156/2019 Art. 81: 3 paid working days for the employee's own marriage.",
        status: 'active'
    },
    {
        name: 'Bereavement Leave',
        code: 'BEREAVEMENT',
        daysPerYear: 3,
        paid: true,
        carryOver: false,
        requiresAttachment: true,
        description: 'Labour Proclamation 1156/2019 Art. 81: 3 paid working days on the death of a spouse, descendant, ascendant, brother, sister, uncle or aunt.',
        status: 'active'
    },
    {
        name: 'Paternity Leave',
        code: 'PATERNITY',
        daysPerYear: 3,
        paid: true,
        carryOver: false,
        requiresAttachment: true,
        description: 'Labour Proclamation 1156/2019 Art. 82: 3 consecutive paid days for a male employee on the birth of a child.',
        status: 'active'
    },
    {
        name: 'Sick Leave',
        code: 'SICK',
        // Up to 6 months (approximated as 180 calendar days) per 12-month period.
        // Pay is legally tiered - full pay (month 1), half pay (months 2-3), unpaid
        // (months 4-6) - which this system does not yet compute; `paid: true` only
        // reflects that part of the entitlement is paid, not the tiering itself.
        daysPerYear: 180,
        paid: true,
        carryOver: false,
        requiresAttachment: true,
        description: 'Labour Proclamation 1156/2019 Art. 83-84: up to 6 months per 12-month period when attested by a medical practitioner. Pay tapers from full pay to half pay to unpaid; not modeled by this system yet.',
        status: 'active'
    }
];

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const configs = await Configuration.find();
    console.log(`Found ${configs.length} configuration document(s) (platform defaults + per-organization).\n`);

    let totalAdded = 0;
    for (const config of configs) {
        const existingNames = new Set(
            (config.leaveTypes || []).map(t => (t.name || '').trim().toLowerCase())
        );

        const toAdd = STATUTORY_LEAVE_TYPES.filter(t => !existingNames.has(t.name.toLowerCase()));
        if (toAdd.length === 0) {
            console.log(`   [${config.employer ? config.employer : 'platform defaults'}] already up to date`);
            continue;
        }

        config.leaveTypes.push(...toAdd);
        await config.save();
        totalAdded += toAdd.length;
        console.log(`   [${config.employer ? config.employer : 'platform defaults'}] added: ${toAdd.map(t => t.name).join(', ')}`);
    }

    console.log(totalAdded > 0
        ? `\n✅ Added ${totalAdded} leave type entr(y/ies) across ${configs.length} configuration document(s).`
        : '\n✅ Nothing to add - all configuration documents already had these leave types.');

    await mongoose.disconnect();
};

run().catch(err => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
