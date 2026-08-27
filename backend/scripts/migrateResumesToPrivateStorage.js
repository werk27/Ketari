/**
 * Migration: move existing resume files out of the public uploads folder.
 *
 * Resumes used to be written to uploads/resumes, which app.js serves
 * statically with no authentication - anyone holding (or guessing) the URL
 * could read a candidate's CV. New uploads now go to private-uploads/resumes
 * and are only readable through the authenticated GET /api/resumes/:id/file
 * route (see resumeController.viewResumeFile). This moves resumes uploaded
 * before that change and updates their stored filePath to match.
 *
 * Safe to run repeatedly - a resume already under PRIVATE_PATHS.resumes is
 * left alone, and a resume whose file is already missing is reported rather
 * than failing the whole run.
 *
 *   node scripts/migrateResumesToPrivateStorage.js
 */
require('./_env');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Resume = require('../src/models/Resume');
const { PRIVATE_PATHS, ensureUploadDirectories } = require('../src/config/paths');

const connect = async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not configured in .env');
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
};

const run = async () => {
    await connect();
    ensureUploadDirectories();

    const resumes = await Resume.find({});
    let moved = 0, alreadyPrivate = 0, missing = 0;

    for (const resume of resumes) {
        const current = resume.filePath;
        if (!current) { missing += 1; continue; }

        const targetDir = path.resolve(PRIVATE_PATHS.resumes);
        if (path.resolve(path.dirname(current)) === targetDir) {
            alreadyPrivate += 1;
            continue;
        }

        if (!fs.existsSync(current)) {
            console.warn(`⚠️  Missing on disk, skipping: ${resume._id} (${current})`);
            missing += 1;
            continue;
        }

        const destination = path.join(PRIVATE_PATHS.resumes, path.basename(current));
        fs.copyFileSync(current, destination);
        fs.unlinkSync(current);

        resume.filePath = destination;
        await resume.save();
        moved += 1;
        console.log(`Moved ${resume._id}: ${current} -> ${destination}`);
    }

    console.log(`\nDone. Moved ${moved}, already private ${alreadyPrivate}, missing ${missing}, total ${resumes.length}.`);
    await mongoose.disconnect();
};

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
