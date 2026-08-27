/**
 * Shared logic for syncing an approved Job Requisition's essential staffing
 * fields into the Job it creates - used by both jobController (creating a
 * vacancy from a requisition) and requisitionController (re-syncing a linked
 * vacancy after an amendment is re-approved), so the mapping only lives in
 * one place.
 */

/**
 * Essential staffing fields that came from an approved Job Requisition and
 * must never be changed silently once the vacancy exists - only the
 * requisition amendment + re-approval workflow may change them.
 */
const REQUISITION_LOCKED_FIELDS = [
    'title', 'department', 'position', 'numberOfPositions', 'employmentType',
    'requirements', 'salary', 'responsibilities', 'competencies'
];

/** Map the requisition's staffing level onto the vacancy's experience level. */
const LEVEL_TO_EXPERIENCE = {
    Beginner: 'Entry',
    Junior: 'Entry',
    Intermediate: 'Intermediate',
    Senior: 'Expert'
};

/** Build the vacancy fields an approved requisition pre-fills, so the HR Expert never re-types them. */
const buildFieldsFromRequisition = (requisition) => ({
    title: requisition.positionTitle,
    department: requisition.departmentName,
    position: requisition.positionTitle,
    numberOfPositions: requisition.numberOfPositions,
    employmentType: requisition.employmentType,
    experienceLevel: LEVEL_TO_EXPERIENCE[requisition.level] || 'Any',
    responsibilities: requisition.responsibilities,
    competencies: requisition.competencies,
    requirements: {
        education: requisition.education,
        experience: requisition.experience,
        skills: requisition.skills,
        languages: requisition.languages,
        certifications: requisition.licenses
    },
    salary: {
        amount: requisition.salary.amount,
        currency: requisition.salary.currency,
        period: requisition.salary.period
    }
});

module.exports = { REQUISITION_LOCKED_FIELDS, LEVEL_TO_EXPERIENCE, buildFieldsFromRequisition };
