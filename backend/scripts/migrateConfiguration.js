/**
 * Migration: move configuration from a single global document to per-employer scope.
 *
 * Two things are corrected here:
 *
 * 1. Legacy unique indexes. `unique: true` was declared inside array subdocuments
 *    (departments.code, positions.code, jobTitles.code), which builds a
 *    COLLECTION-WIDE unique index. As soon as a second organization has a
 *    department without a code, MongoDB rejects the insert with a duplicate
 *    null key. Uniqueness belongs per organization, not across the platform.
 *
 * 2. The existing configuration document becomes the explicit platform default
 *    (employer: null) from which each new organization is seeded.
 *
 * Safe to run repeatedly.
 *
 *   node scripts/migrateConfiguration.js
 */
require('./_env');
const mongoose = require('mongoose');

const Configuration = require('../src/models/Configuration');

/** Indexes that must never exist: uniqueness inside array subdocuments. */
const isSubdocumentUniqueIndex = (index) =>
    index.unique === true && Object.keys(index.key).some(field => field.includes('.'));

const run = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const collection = mongoose.connection.db.collection('configurations');

    // ------------------------------------------------------------------
    // 1. Drop every collection-wide unique index built on an array subdocument
    // ------------------------------------------------------------------
    const indexes = await collection.indexes();
    console.log(`[1/3] Existing indexes: ${indexes.map(i => i.name).join(', ')}`);

    let dropped = 0;
    for (const index of indexes) {
        if (isSubdocumentUniqueIndex(index)) {
            await collection.dropIndex(index.name);
            console.log(`      dropped ${index.name} (unique on ${Object.keys(index.key).join(', ')})`);
            dropped += 1;
        }
    }
    console.log(`      ${dropped} legacy unique index(es) removed`);

    // ------------------------------------------------------------------
    // 2. Mark the existing document as the platform default
    // ------------------------------------------------------------------
    const withoutEmployer = await collection.updateMany(
        { employer: { $exists: false } },
        { $set: { employer: null } }
    );
    console.log(`\n[2/3] Documents marked as platform defaults: ${withoutEmployer.modifiedCount}`);

    // ------------------------------------------------------------------
    // 3. Report the resulting configuration scopes
    // ------------------------------------------------------------------
    const configs = await Configuration.find().select('employer');
    console.log('\n[3/3] Configuration documents:');
    for (const config of configs) {
        console.log(`      ${config.employer ? `organization ${config.employer}` : 'platform defaults'}`);
    }

    const finalIndexes = await collection.indexes();
    console.log(`\nRemaining indexes: ${finalIndexes.map(i => i.name).join(', ')}`);
    console.log('\n✅ Configuration migration complete.');

    await mongoose.disconnect();
};

run()
    .then(() => process.exit(0))
    .catch(async (error) => {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect().catch(() => {});
        process.exit(1);
    });
