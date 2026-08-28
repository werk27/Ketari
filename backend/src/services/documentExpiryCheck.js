const Employee = require('../models/Employee');
const notificationService = require('../services/notificationService');

/**
 * Scans every employee's documents for ones expiring soon and raises a
 * `document_expiring` notification - the model and notification type already
 * existed (Employee.documents[].expiryDate, Notification type
 * 'document_expiring') but nothing ever checked them.
 *
 * Re-notification is throttled per document (via expiryNotifiedAt) so an
 * expiring document is flagged periodically rather than on every run once
 * it enters the warning window, and stops once it has actually been
 * renewed (a later expiryDate resets the throttle naturally because the
 * document no longer falls inside the window until it's close again).
 */

const WARNING_WINDOW_DAYS = Number(process.env.DOCUMENT_EXPIRY_WARNING_DAYS || 30);
const RENOTIFY_INTERVAL_DAYS = Number(process.env.DOCUMENT_EXPIRY_RENOTIFY_DAYS || 7);
const DAY_MS = 24 * 60 * 60 * 1000;

/** One run: find expiring documents across every organization and notify. */
const checkExpiringDocuments = async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + WARNING_WINDOW_DAYS * DAY_MS);
    const renotifyBefore = new Date(now.getTime() - RENOTIFY_INTERVAL_DAYS * DAY_MS);

    // Narrow with a query first (documents is an array, so this matches any
    // employee with at least one candidate document); the exact per-document
    // decision (already notified recently or not) is made in JS below, since
    // that comparison needs each document's own expiryNotifiedAt.
    const employees = await Employee.find({
        employer: { $ne: null },
        'documents.expiryDate': { $ne: null, $lte: windowEnd, $gte: now }
    }).select('employer user personalInfo documents');

    let notifiedCount = 0;

    for (const employee of employees) {
        const dueDocuments = employee.documents.filter(doc => (
            doc.expiryDate
            && doc.expiryDate >= now
            && doc.expiryDate <= windowEnd
            && (!doc.expiryNotifiedAt || doc.expiryNotifiedAt <= renotifyBefore)
        ));

        if (dueDocuments.length === 0) continue;

        const employeeName = employee.personalInfo
            ? `${employee.personalInfo.firstName} ${employee.personalInfo.lastName}`.trim()
            : 'An employee';

        for (const doc of dueDocuments) {
            const daysLeft = Math.max(0, Math.ceil((doc.expiryDate - now) / DAY_MS));
            const label = doc.name || doc.type || 'A document';
            const message = `${label} for ${employeeName} expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} `
                + `(${doc.expiryDate.toLocaleDateString()}).`;

            if (employee.user) {
                await notificationService.notify({
                    user: employee.user,
                    employer: employee.employer,
                    type: 'document_expiring',
                    title: 'Your document is expiring soon',
                    message,
                    link: await notificationService.linkForUser(employee.user, 'profile')
                });
            }

            // HR Expert and HR Manager sit under different workspace prefixes
            // (/hr-expert/... vs /hr-manager/...), so each needs its own
            // notifyRoles call with its own correct link - a single shared
            // link would 404 for whichever role it wasn't written for.
            await notificationService.notifyRoles({
                employer: employee.employer,
                roles: ['hr_expert'],
                type: 'document_expiring',
                title: 'An employee document is expiring soon',
                message,
                link: '/hr-expert/employees'
            });
            await notificationService.notifyRoles({
                employer: employee.employer,
                roles: ['hr_manager'],
                type: 'document_expiring',
                title: 'An employee document is expiring soon',
                message,
                link: '/hr-manager/employees'
            });

            doc.expiryNotifiedAt = now;
            notifiedCount += 1;
        }

        // validateBeforeSave: false, matching the pattern used for similar
        // background updates elsewhere (e.g. migrateHrmTenancy.js), since
        // this only touches expiryNotifiedAt and shouldn't be blocked by
        // unrelated validation on a record that was already saved before.
        await employee.save({ validateBeforeSave: false });
    }

    return notifiedCount;
};

let running = false;

const runCheck = async () => {
    if (running) return;
    running = true;
    try {
        const count = await checkExpiringDocuments();
        if (count > 0) {
            console.log(`Document expiry check: sent ${count} reminder(s).`);
        }
    } catch (error) {
        console.error('Document expiry check failed:', error.message);
    } finally {
        running = false;
    }
};

/**
 * Starts the periodic check. Runs shortly after startup and then on a fixed
 * interval, unref'd so it never keeps the process alive on its own -
 * matching the pattern in autoBackup.js.
 */
const start = () => {
    const hours = Number(process.env.DOCUMENT_EXPIRY_CHECK_INTERVAL_HOURS || 24);
    const intervalMs = Math.max(hours, 0.01) * 60 * 60 * 1000;

    setTimeout(runCheck, 10000).unref();
    setInterval(runCheck, intervalMs).unref();
};

module.exports = { start, checkExpiringDocuments };
