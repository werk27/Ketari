/**
 * Unattended daily backup: copies the local database to the Atlas copy and
 * appends the result to backend/backups/backup-log.txt.
 *
 * Registered as the Windows scheduled task "KETARI daily database backup".
 * Run it by hand at any time with:  npm run db:backup:auto
 *
 * This wrapper exists so the scheduled task can invoke node directly. A .cmd
 * wrapper needs quoting that Windows Task Scheduler mangles when the project
 * path contains a space, and it failed silently with exit code 0.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND = path.join(__dirname, '..');
const LOG_DIR = path.join(BACKEND, 'backups');
const LOG_FILE = path.join(LOG_DIR, 'backup-log.txt');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

fs.mkdirSync(LOG_DIR, { recursive: true });

// Keep the log from growing without bound; one rotation is enough history.
try {
    if (fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
} catch (error) {
    if (error.code !== 'ENOENT') {
        console.error(`Could not rotate the log: ${error.message}`);
    }
}

const lines = [];
const record = (text) => {
    lines.push(text);
    process.stdout.write(`${text}\n`);
};

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
record('');
record('='.repeat(70));
record(`Backup started ${stamp}`);
record('='.repeat(70));

const child = spawn(process.execPath, [path.join(__dirname, 'dbSync.js'), 'backup', '--yes'], {
    cwd: BACKEND,
    windowsHide: true
});

const capture = (buffer) => {
    String(buffer).split(/\r?\n/).forEach(line => {
        if (line.trim()) record(line);
    });
};

child.stdout.on('data', capture);
child.stderr.on('data', capture);

child.on('error', (error) => {
    record(`Could not start the sync process: ${error.message}`);
});

child.on('close', (code) => {
    const done = new Date().toISOString().replace('T', ' ').slice(0, 19);
    if (code === 0) {
        record(`Backup finished OK ${done}`);
    } else {
        record(`BACKUP FAILED with exit code ${code} at ${done}`);
        record('Nothing was written to Atlas - the previous backup is still intact.');
        record('A refusal about "fewer users" is the safety guard, not a crash. If the');
        record('local database really is correct, run this once by hand:');
        record('    node scripts/dbSync.js backup --yes --force');
    }

    try {
        fs.appendFileSync(LOG_FILE, `${lines.join('\r\n')}\r\n`, 'utf8');
    } catch (error) {
        console.error(`Could not write the log: ${error.message}`);
    }

    process.exit(code === 0 ? 0 : 1);
});
