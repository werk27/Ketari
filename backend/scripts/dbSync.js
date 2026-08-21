/**
 * Copies every collection between the local database and the Atlas backup.
 *
 * The local database is the primary working copy; Atlas is the backup.
 *
 *   node scripts/dbSync.js backup   local -> atlas   (refresh the backup)
 *   node scripts/dbSync.js pull     atlas -> local   (restore / seed local)
 *   node scripts/dbSync.js status   show both without changing anything
 *
 * Add --yes to skip the confirmation prompt in a script.
 *
 * The destination is replaced, so a truncated source would otherwise destroy
 * the copy on the other side. Two guards prevent that: a source with no
 * documents at all is always refused, and a source holding fewer users than
 * the destination requires --force.
 */
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');
const { maskUri } = require('../src/config/database');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/ketari_local';
const LOCAL_URI = process.env.MONGODB_URI_LOCAL || DEFAULT_LOCAL_URI;
const ATLAS_URI = process.env.MONGODB_URI_ATLAS;

const MODES = {
    backup: { from: 'local', to: 'atlas' },
    pull: { from: 'atlas', to: 'local' }
};

const endpoints = {
    local: { label: 'LOCAL', uri: LOCAL_URI },
    atlas: { label: 'ATLAS', uri: ATLAS_URI }
};

const die = (message) => {
    console.error(`\n${message}\n`);
    process.exit(1);
};

const connect = async (key) => {
    const { uri, label } = endpoints[key];
    if (!uri) {
        die(`${label} connection string is not set in backend/.env.`);
    }
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    try {
        await client.connect();
    } catch (error) {
        die(`Could not connect to ${label}.\nURI   : ${maskUri(uri)}\nReason: ${error.message}`);
    }
    return { client, db: client.db() };
};

const summarise = async (db) => {
    const names = (await db.listCollections().toArray())
        .map(c => c.name)
        .filter(n => !n.startsWith('system.'));
    const counts = {};
    let total = 0;
    for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        counts[name] = await db.collection(name).countDocuments();
        total += counts[name];
    }
    return { names, counts, total };
};

const confirm = async (question) => {
    if (process.argv.includes('--yes')) return true;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return answer.trim().toLowerCase() === 'yes';
};

const copyCollection = async (sourceDb, targetDb, name) => {
    const docs = await sourceDb.collection(name).find({}).toArray();
    const target = targetDb.collection(name);
    await target.deleteMany({});
    if (docs.length) {
        // Batched so a large collection cannot exceed the 16MB command limit.
        for (let i = 0; i < docs.length; i += 500) {
            // eslint-disable-next-line no-await-in-loop
            await target.insertMany(docs.slice(i, i + 500), { ordered: false });
        }
    }
    return docs.length;
};

const copyIndexes = async (sourceDb, targetDb, name) => {
    let created = 0;
    const indexes = await sourceDb.collection(name).indexes();
    for (const index of indexes) {
        if (index.name === '_id_') continue;
        const { key, name: indexName, v, ns, background, ...options } = index;
        try {
            // eslint-disable-next-line no-await-in-loop
            await targetDb.collection(name).createIndex(key, { name: indexName, ...options });
            created++;
        } catch (error) {
            console.log(`     note: index ${indexName} skipped (${error.message.split('\n')[0]})`);
        }
    }
    return created;
};

(async () => {
    const mode = (process.argv[2] || '').toLowerCase();

    if (mode === 'status') {
        for (const key of ['local', 'atlas']) {
            if (!endpoints[key].uri) {
                console.log(`\n${endpoints[key].label}: not configured`);
                continue;
            }
            const { client, db } = await connect(key);
            const { names, counts, total } = await summarise(db);
            console.log(`\n${endpoints[key].label}  ${maskUri(endpoints[key].uri)}`);
            console.log(`  database: ${db.databaseName}`);
            console.log(`  ${names.length} collections, ${total} documents`);
            console.log(`  users: ${counts.users ?? 0}   jobs: ${counts.jobs ?? 0}   applications: ${counts.applications ?? 0}`);
            await client.close();
        }
        console.log('');
        process.exit(0);
    }

    if (!MODES[mode]) {
        die('Usage: node scripts/dbSync.js <backup|pull|status> [--yes] [--force]\n\n'
            + '  backup   local -> atlas   refresh the Atlas backup from this machine\n'
            + '  pull     atlas -> local   overwrite local with the Atlas backup\n'
            + '  status   show both databases without changing anything');
    }

    const { from, to } = MODES[mode];
    const source = await connect(from);
    const target = await connect(to);

    const sourceInfo = await summarise(source.db);
    const targetInfo = await summarise(target.db);

    console.log('');
    console.log(`SOURCE      ${endpoints[from].label}  db "${source.db.databaseName}"`);
    console.log(`            ${sourceInfo.names.length} collections, ${sourceInfo.total} documents, ${sourceInfo.counts.users ?? 0} users`);
    console.log(`DESTINATION ${endpoints[to].label}  db "${target.db.databaseName}"`);
    console.log(`            ${targetInfo.names.length} collections, ${targetInfo.total} documents, ${targetInfo.counts.users ?? 0} users`);
    console.log('');

    if (sourceInfo.total === 0) {
        await source.client.close();
        await target.client.close();
        die(`Refusing to continue: the ${endpoints[from].label} source is empty.\n`
            + `Copying it would erase all ${targetInfo.total} documents in ${endpoints[to].label}.`);
    }

    const sourceUsers = sourceInfo.counts.users ?? 0;
    const targetUsers = targetInfo.counts.users ?? 0;
    if (sourceUsers < targetUsers && !process.argv.includes('--force')) {
        await source.client.close();
        await target.client.close();
        die(`Refusing to continue: the source has fewer users (${sourceUsers}) than the`
            + ` destination (${targetUsers}).\nThat usually means the wrong direction was chosen.`
            + ` Re-run with --force if this is intended.`);
    }

    const ok = await confirm(
        `This REPLACES every listed collection in ${endpoints[to].label} `
        + `("${target.db.databaseName}") with the contents of ${endpoints[from].label}.\n`
        + `Type "yes" to continue: `
    );
    if (!ok) {
        await source.client.close();
        await target.client.close();
        console.log('Cancelled. Nothing was changed.');
        process.exit(0);
    }

    console.log('');
    let copied = 0;
    for (const name of sourceInfo.names) {
        // eslint-disable-next-line no-await-in-loop
        const n = await copyCollection(source.db, target.db, name);
        // eslint-disable-next-line no-await-in-loop
        const idx = await copyIndexes(source.db, target.db, name);
        copied += n;
        console.log(`  ${name.padEnd(20)} ${String(n).padStart(6)} documents, ${idx} indexes`);
    }

    // Collections that exist only in the destination are stale copies of data
    // already deleted at the source, so drop them to keep the two identical.
    const extra = targetInfo.names.filter(n => !sourceInfo.names.includes(n));
    for (const name of extra) {
        // eslint-disable-next-line no-await-in-loop
        await target.db.collection(name).drop().catch(() => {});
        console.log(`  ${name.padEnd(20)} dropped (not present in source)`);
    }

    const after = await summarise(target.db);
    console.log('');
    console.log(`Done. ${copied} documents copied to ${endpoints[to].label}.`);
    console.log(`${endpoints[to].label} now has ${after.names.length} collections and ${after.total} documents.`);

    if (after.total !== sourceInfo.total) {
        console.log(`\nWARNING: destination total (${after.total}) differs from source (${sourceInfo.total}).`);
    }

    await source.client.close();
    await target.client.close();
    process.exit(0);
})().catch(error => {
    console.error('\nSync failed:', error.message);
    process.exit(1);
});
