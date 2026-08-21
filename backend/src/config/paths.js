const path = require('path');
const fs = require('fs');

/**
 * Single source of truth for upload storage locations.
 *
 * These paths were previously computed independently in three places and had
 * drifted apart:
 *   - app.js served    <project>/uploads        (via src/../../uploads)
 *   - upload.js saved  backend/uploads/profiles (via src/routes/../../uploads)
 *   - resumes.js saved uploads/ relative to the CURRENT WORKING DIRECTORY
 *
 * The result was that profile photos uploaded successfully, were written to
 * disk, and then returned 404 because Express was serving a different folder.
 * Resolving every path from this module keeps saving and serving in step.
 */
const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');

const UPLOAD_PATHS = {
    root: UPLOADS_ROOT,
    profiles: path.join(UPLOADS_ROOT, 'profiles'),
    resumes: path.join(UPLOADS_ROOT, 'resumes'),
    documents: path.join(UPLOADS_ROOT, 'documents')
};

/** Create every upload directory if it does not already exist. */
const ensureUploadDirectories = () => {
    Object.values(UPLOAD_PATHS).forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

/**
 * Convert an absolute file path into the web path stored on the record,
 * e.g. uploads/profiles/profile-123.jpg
 */
const toPublicPath = (absolutePath) =>
    path.relative(path.dirname(UPLOADS_ROOT), absolutePath).split(path.sep).join('/');

/** Resolve a stored web path back to a location on disk. */
const toAbsolutePath = (publicPath) => {
    if (!publicPath) return null;
    const normalised = String(publicPath).replace(/^\/+/, '');
    return path.join(path.dirname(UPLOADS_ROOT), normalised);
};

module.exports = {
    UPLOADS_ROOT,
    UPLOAD_PATHS,
    ensureUploadDirectories,
    toPublicPath,
    toAbsolutePath
};
