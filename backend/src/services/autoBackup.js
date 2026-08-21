const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Periodic copy of the local database to the Atlas backup.
 *
 * The backup runs from inside the server rather than from a Windows scheduled
 * task: a scheduled task reports success without ever launching its action on
 * a restricted machine, which would leave the project with a backup that only
 * appears to work.
 *
 * The timestamp of the last successful run is kept on disk, so restarting the
 * server does not start a backup every time.
 */

const BACKEND = path.join(__dirname, '..', '..');
const LOG_DIR = path.join(BACKEND, 'backups');
const LOG_FILE = path.join(LOG_DIR, 'backup-log.txt');
const STATE_FILE = path.join(LOG_DIR, 'last-backup.json');

const readState = () => {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (error) {
        return {};
    }
};

const writeState = (state) => {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.warn(`Auto-backup: could not save state - ${error.message}`);
    }
};

let running = false;

const runBackup = (reason) => {
    if (running) return;
    running = true;

    const child = spawn(
        process.execPath,
        [path.join(BACKEND, 'scripts', 'backupDaily.js')],
        { cwd: BACKEND, windowsHide: true, stdio: 'ignore', detached: false }
    );

    child.on('error', (error) => {
        running = false;
        console.warn(`Auto-backup: could not start - ${error.message}`);
    });

    child.on('close', (code) => {
        running = false;
        const state = readState();
        if (code === 0) {
            state.lastSuccess = new Date().toISOString();
            delete state.lastFailure;
            console.log(`Auto-backup: local database copied to Atlas (${reason}).`);
        } else {
            state.lastFailure = new Date().toISOString();
            console.warn('#'.repeat(70));
            console.warn(`#  AUTO-BACKUP FAILED (exit code ${code}).`);
            console.warn('#  Atlas still holds the previous backup - nothing was overwritten.');
            console.warn(`#  Details: backend/backups/backup-log.txt`);
            console.warn('#'.repeat(70));
        }
        writeState(state);
    });
};

const start = () => {
    if (String(process.env.AUTO_BACKUP).toLowerCase() !== 'true') return;

    // Only the local database is a primary that needs copying out, and there
    // is nowhere to copy it to without the Atlas connection string.
    const target = (process.env.DB_TARGET || '').trim().toLowerCase();
    if (target !== 'local') {
        console.log(`Auto-backup: disabled, DB_TARGET is "${target || 'unset'}" rather than "local".`);
        return;
    }
    if (!process.env.MONGODB_URI_ATLAS) {
        console.warn('Auto-backup: disabled, MONGODB_URI_ATLAS is not set.');
        return;
    }

    const hours = Number(process.env.AUTO_BACKUP_INTERVAL_HOURS || 24);
    const intervalMs = Math.max(hours, 0.01) * 60 * 60 * 1000;

    const last = readState().lastSuccess;
    const age = last ? Date.now() - new Date(last).getTime() : Infinity;

    if (age >= intervalMs) {
        const when = last ? `last backup ${Math.round(age / 3600000)}h ago` : 'no previous backup';
        console.log(`Auto-backup: enabled, running now (${when}).`);
        setTimeout(() => runBackup('startup'), 5000).unref();
    } else {
        const dueIn = Math.round((intervalMs - age) / 60000);
        console.log(`Auto-backup: enabled, next run in about ${dueIn} minute(s).`);
    }

    // unref so a pending backup timer never keeps the process alive on its own.
    setInterval(() => {
        const state = readState();
        const since = state.lastSuccess ? Date.now() - new Date(state.lastSuccess).getTime() : Infinity;
        if (since >= intervalMs) runBackup('scheduled');
    }, Math.min(intervalMs, 30 * 60 * 1000)).unref();
};

module.exports = { start, runBackup, LOG_FILE, STATE_FILE };
