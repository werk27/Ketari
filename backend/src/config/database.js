const mongoose = require('mongoose');

const DEFAULT_LOCAL_URI = 'mongodb://127.0.0.1:27017/ketari_local';

const fatal = (title, lines) => {
    console.error('\n' + '='.repeat(70));
    console.error(`FATAL: ${title}`);
    console.error('='.repeat(70));
    lines.forEach(line => console.error(line));
    console.error('='.repeat(70) + '\n');
    process.exit(1);
};

/**
 * Picks the connection string from DB_TARGET.
 *
 * The target is always an explicit choice. An earlier version fell back to a
 * local database automatically when the remote one was unreachable, which
 * started the server against an empty database: valid logins were rejected as
 * "Invalid email or password" and registrations were silently discarded, while
 * /api/health still reported "connected". An unreachable target must stop the
 * server instead of quietly serving different data.
 */
const resolveTarget = () => {
    const raw = (process.env.DB_TARGET || '').trim().toLowerCase();

    if (!raw) {
        // Legacy single-URI setups keep working unchanged.
        if (process.env.MONGODB_URI) {
            return { name: 'custom', uri: process.env.MONGODB_URI };
        }
        fatal('Neither DB_TARGET nor MONGODB_URI is set - the server cannot start.', [
            'The backend has no database connection string.',
            '',
            'Fix: copy backend/.env.example to backend/.env, then set',
            '  DB_TARGET=local   day-to-day development on this machine',
            '  DB_TARGET=atlas   the shared MongoDB Atlas backup',
            '',
            'backend/.env is git-ignored, so it must be created on every machine.'
        ]);
    }

    if (raw === 'local') {
        return { name: 'local', uri: process.env.MONGODB_URI_LOCAL || DEFAULT_LOCAL_URI };
    }

    if (raw === 'atlas') {
        const uri = process.env.MONGODB_URI_ATLAS;
        if (!uri) {
            fatal('DB_TARGET=atlas but MONGODB_URI_ATLAS is not set.', [
                'Set MONGODB_URI_ATLAS in backend/.env, or switch to DB_TARGET=local.'
            ]);
        }
        return { name: 'atlas', uri };
    }

    return fatal(`DB_TARGET="${process.env.DB_TARGET}" is not a valid target.`, [
        'Valid values are:',
        '  local   MongoDB on this machine, the primary working database',
        '  atlas   the MongoDB Atlas backup copy'
    ]);
};

/** Connection strings contain the password, so never log one unmasked. */
const maskUri = (uri) => String(uri).replace(/\/\/([^:/]+):([^@]+)@/, '//$1:***@');

const banner = (lines) => {
    console.log('#'.repeat(70));
    lines.forEach(line => console.log(`#  ${line}`));
    console.log('#'.repeat(70));
};

const connectDB = async () => {
    const target = resolveTarget();

    try {
        const conn = await mongoose.connect(target.uri, { serverSelectionTimeoutMS: 8000 });
        const where = `Database: ${conn.connection.name}   Host: ${conn.connection.host}`;

        if (target.name === 'atlas') {
            banner([
                'DATABASE: ATLAS BACKUP COPY',
                where,
                '',
                'This is the backup, not the day-to-day database. Anything changed',
                'here is overwritten the next time "npm run db:backup" runs.',
                'Switch back with DB_TARGET=local in backend/.env.'
            ]);
        } else if (target.name === 'local') {
            banner([
                'DATABASE: LOCAL - primary working copy',
                where,
                '',
                'This data lives only on this machine. Copy it to the Atlas backup',
                'regularly with "npm run db:backup".'
            ]);
        } else {
            banner(['DATABASE: custom MONGODB_URI', where]);
        }

        return conn;
    } catch (error) {
        const hints = target.name === 'local'
            ? [
                '  - MongoDB is not running on this machine.',
                '    Start it with:  net start MongoDB',
                '    or run mongod manually if it is not installed as a service.',
                '  - MONGODB_URI_LOCAL points at the wrong host or port.'
            ]
            : [
                '  - This IP address is not allowed in MongoDB Atlas.',
                '    Fix: Atlas -> Network Access -> Add IP Address -> Add Current IP Address',
                '  - The user name or password is wrong, or the password was rotated.',
                '  - A special character in the password is not URL-encoded: @ must be %40.',
                '  - No internet connection.'
            ];

        fatal(`Could not connect to the ${target.name} database.`, [
            `Target: DB_TARGET=${target.name}`,
            `URI   : ${maskUri(target.uri)}`,
            `Reason: ${error.message}`,
            '',
            'The server has NOT started, and it will not quietly use a different',
            'database instead - that would reject valid logins with',
            '"Invalid email or password" and hide this error.',
            '',
            'Common causes:',
            ...hints
        ]);
    }
};

module.exports = connectDB;
module.exports.resolveTarget = resolveTarget;
module.exports.maskUri = maskUri;
