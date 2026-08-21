const Application = require('../models/Application');

/**
 * Candidate contact privacy.
 *
 * A candidate's email and phone are visible to an organization once that
 * candidate has applied to it: applying is the moment they choose to share
 * their details, and HR needs them to make contact.
 *
 * They are hidden while browsing the talent pool or reviewing AI matches. Those
 * views list every active candidate on the platform regardless of any
 * relationship, so returning contact details there would let any approved
 * organization export the contact list of every job seeker who ever registered,
 * for a purpose none of them agreed to. Name, skills, experience and rating are
 * still returned, which is what deciding whether to approach someone needs.
 */

/** Candidate ids that have applied to this employer, so contact may be shown. */
const applicantIdsFor = async (employerId) => {
    if (!employerId) return new Set();
    const applications = await Application.find({ employer: employerId }).select('applicant');
    return new Set(applications.map(a => String(a.applicant)));
};

/**
 * Returns a copy with contact details removed unless this viewer may see them.
 * `contactVisible` is included so the interface can explain the absence rather
 * than rendering a blank space that looks like missing data.
 */
const maskCandidate = (candidate, revealIds, { isAdmin = false } = {}) => {
    const plain = typeof candidate.toObject === 'function' ? candidate.toObject() : { ...candidate };
    // The matching service reshapes a candidate as { id, name, ... }, so accept
    // either key rather than silently failing to match and hiding everything.
    const id = String(plain._id ?? plain.id ?? '');
    const reveal = isAdmin || revealIds.has(id);

    if (reveal) {
        return { ...plain, contactVisible: true };
    }

    const { email, ...rest } = plain;
    if (rest.profile) {
        const { phone, ...profileRest } = rest.profile;
        rest.profile = profileRest;
    }
    return { ...rest, contactVisible: false };
};

/** Convenience for a list, resolving the viewer's applicants once. */
const maskCandidates = async (candidates, req) => {
    const isAdmin = req.user?.role === 'admin';
    const revealIds = isAdmin ? new Set() : await applicantIdsFor(req.employerId || req.user?.employer);
    return candidates.map(c => maskCandidate(c, revealIds, { isAdmin }));
};

module.exports = { applicantIdsFor, maskCandidate, maskCandidates };
