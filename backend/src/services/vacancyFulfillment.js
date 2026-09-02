const Job = require('../models/Job');
const Application = require('../models/Application');

/**
 * Vacancy fulfillment (headcount vs. hires).
 *
 * Job.numberOfPositions already existed, and Application.status already had
 * a 'hired' value, but nothing ever connected the two: a vacancy could be
 * over-hired indefinitely with no warning, and a fully-staffed job never
 * left the public job board. This is the single place that counts hires
 * against the configured headcount, so every caller (apply, decide, list)
 * agrees on the same number.
 */

// Statuses in which a vacancy is still visible/open to candidates. Mirrors
// jobController.PUBLIC_STATUSES / applicationController.OPEN_STATUSES - kept
// as its own copy here to avoid a circular require between the two controllers.
const PUBLIC_STATUSES = ['published', 'approved', 'open'];

/** How many candidates have actually been hired for this job. */
const hiredCountFor = (jobId) => Application.countDocuments({ job: jobId, status: 'hired' });

/** Required headcount, hires so far, and how many openings remain. */
const vacancyStats = async (job) => {
    const required = job.numberOfPositions || 1;

    // When the caller already populated `applications` with at least
    // `status` (getJob, getEmployerJobs), count from that instead of
    // issuing a second query per job - important for list views.
    const alreadyPopulated = typeof job.populated === 'function' && job.populated('applications');
    const hired = alreadyPopulated
        ? job.applications.filter(a => a && a.status === 'hired').length
        : await hiredCountFor(job._id);

    return {
        required,
        hired,
        remaining: Math.max(0, required - hired),
        isFull: hired >= required
    };
};

/**
 * If every configured position has now been filled, close the vacancy
 * automatically - the same effect an HR Manager gets from the manual
 * "Close" action, recorded the same way in statusHistory. Only ever acts on
 * a currently public vacancy; never reopens or overrides a job that is
 * already closed/archived/rejected for some other reason.
 */
const autoCloseIfFilled = async (jobId, actorUserId) => {
    const job = await Job.findById(jobId);
    if (!job || !PUBLIC_STATUSES.includes(job.status)) return null;

    const { hired, required, isFull } = await vacancyStats(job);
    if (!isFull) return null;

    job.status = 'closed';
    job.statusHistory.push({
        status: 'closed',
        changedBy: actorUserId,
        changedAt: new Date(),
        note: `Automatically closed - all ${required} position(s) filled (${hired} hired)`
    });
    await job.save();
    return job;
};

module.exports = { PUBLIC_STATUSES, hiredCountFor, vacancyStats, autoCloseIfFilled };
