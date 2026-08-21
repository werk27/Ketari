/**
 * Shared environment loader for the scripts in this folder.
 *
 * Loads backend/.env by absolute path, so a script works from any working
 * directory, and resolves DB_TARGET into MONGODB_URI. The scripts predate the
 * local/atlas split and still read MONGODB_URI, so this keeps them pointed at
 * whichever database the server itself would use instead of letting the two
 * drift apart.
 *
 * Usage, as the first require in a script:
 *     require('./_env');
 */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { resolveTarget } = require('../src/config/database');

if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = resolveTarget().uri;
}

module.exports = {};
