/**
 * Derived, read-only summaries of a candidate's profile for recruitment review.
 *
 * The applicant report needs to filter and sort on things the profile only
 * implies - "how many years has this person worked", "what did they study" -
 * and the same numbers have to appear in the table the HR user is reading.
 * Deriving them in one place keeps the filter and the displayed value from
 * disagreeing, which is the sort of mismatch that quietly destroys trust in a
 * report.
 *
 * Nothing here is persisted: these are computed from the candidate's own
 * profile every time, so they always reflect the current record.
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Total years of recorded work experience.
 *
 * Uses real start/end dates where the candidate supplied them, treating an
 * open-ended or explicitly current role as running until today. Overlapping
 * roles are merged rather than added together, so someone holding two
 * concurrent positions is not credited with double the experience.
 *
 * Roles with no usable dates fall back to a nominal 1.5 years each - the same
 * assumption matchingService already makes when scoring experience - so a
 * sparsely filled profile still produces a comparable figure instead of zero.
 */
const experienceYearsFor = (profile) => {
    const roles = Array.isArray(profile?.workExperience) ? profile.workExperience : [];
    if (roles.length === 0) return 0;

    const now = Date.now();
    const intervals = [];
    let undatedRoles = 0;

    roles.forEach(role => {
        const start = role?.startDate ? new Date(role.startDate).getTime() : NaN;
        if (!Number.isFinite(start)) {
            undatedRoles += 1;
            return;
        }

        const rawEnd = role?.currentlyWorking ? now : new Date(role?.endDate ?? now).getTime();
        const end = Number.isFinite(rawEnd) ? rawEnd : now;
        if (end <= start) {
            undatedRoles += 1;
            return;
        }

        intervals.push([start, Math.min(end, now)]);
    });

    intervals.sort((a, b) => a[0] - b[0]);

    let coveredMs = 0;
    let currentStart = null;
    let currentEnd = null;

    intervals.forEach(([start, end]) => {
        if (currentStart === null) {
            currentStart = start;
            currentEnd = end;
            return;
        }
        if (start <= currentEnd) {
            currentEnd = Math.max(currentEnd, end);
        } else {
            coveredMs += currentEnd - currentStart;
            currentStart = start;
            currentEnd = end;
        }
    });

    if (currentStart !== null) {
        coveredMs += currentEnd - currentStart;
    }

    const years = (coveredMs / MS_PER_YEAR) + (undatedRoles * 1.5);
    return Math.round(years * 10) / 10;
};

/** The candidate's highest/most recent qualification, as one readable line. */
const educationSummaryFor = (profile) => {
    const entries = Array.isArray(profile?.education) ? profile.education : [];
    if (entries.length === 0) return '';

    const best = [...entries].sort(
        (a, b) => (Number(b?.graduationYear) || 0) - (Number(a?.graduationYear) || 0)
    )[0];

    return [best?.degree, best?.field].filter(Boolean).join(', ')
        || best?.institution
        || '';
};

/**
 * Everything the applicant table shows about a candidate beyond their name,
 * bundled so a caller adds one field rather than three.
 */
const insightsFor = (profile) => ({
    experienceYears: experienceYearsFor(profile),
    educationSummary: educationSummaryFor(profile)
});

module.exports = { experienceYearsFor, educationSummaryFor, insightsFor };
