/**
 * ROLE / CAPABILITY MATRIX
 *
 * Single source of truth for what each role may do.
 *
 * Business rules enforced here (see project spec §32 / role principle):
 *   SYSTEM ADMINISTRATOR -> manages the PLATFORM (never company HR work)
 *   EMPLOYER             -> owns the ORGANIZATION and its HR environment
 *   HR EXPERT            -> RECORDS / PROCESSES / SUBMITS
 *   HR MANAGER           -> VIEWS / REVIEWS / APPROVES / SUPERVISES
 *   EMPLOYEE             -> uses employee HR services for themselves
 *   CANDIDATE            -> SEARCHES / APPLIES / PARTICIPATES
 */

const CAPABILITIES = {
    // ---------- Recruitment: vacancy lifecycle ----------
    VACANCY_CREATE: 'vacancy:create',
    VACANCY_EDIT: 'vacancy:edit',
    VACANCY_SUBMIT: 'vacancy:submit',
    VACANCY_APPROVE: 'vacancy:approve',
    VACANCY_REJECT: 'vacancy:reject',
    VACANCY_DELETE: 'vacancy:delete',
    VACANCY_VIEW: 'vacancy:view',

    // ---------- Recruitment: applications ----------
    APPLICATION_VIEW: 'application:view',
    APPLICATION_PROCESS: 'application:process',
    APPLICATION_SHORTLIST: 'application:shortlist',
    APPLICATION_DECIDE: 'application:decide',

    CANDIDATE_VIEW: 'candidate:view',

    INTERVIEW_SCHEDULE: 'interview:schedule',
    INTERVIEW_EVALUATE: 'interview:evaluate',
    INTERVIEW_REVIEW: 'interview:review',

    AI_MATCH: 'ai:match',

    // ---------- Employee information ----------
    EMPLOYEE_VIEW: 'employee:view',
    EMPLOYEE_RECORD: 'employee:record',   // create / edit employee records
    EMPLOYEE_DELETE: 'employee:delete',

    // ---------- Leave ----------
    LEAVE_REQUEST: 'leave:request',       // raise own leave
    LEAVE_VIEW: 'leave:view',
    LEAVE_PROCESS: 'leave:process',       // HR Expert records / forwards
    LEAVE_APPROVE: 'leave:approve',       // HR Manager decides

    // ---------- Employee requests (break-year, resignation, transfer...) ----------
    REQUEST_RAISE: 'request:raise',
    REQUEST_VIEW: 'request:view',
    REQUEST_PROCESS: 'request:process',
    REQUEST_APPROVE: 'request:approve',

    // ---------- Training ----------
    TRAINING_VIEW: 'training:view',
    TRAINING_RECORD: 'training:record',
    TRAINING_APPROVE: 'training:approve',
    TRAINING_PARTICIPATE: 'training:participate',

    // ---------- Delegation ----------
    DELEGATION_VIEW: 'delegation:view',
    DELEGATION_CREATE: 'delegation:create',

    // ---------- Attendance ----------
    ATTENDANCE_SELF: 'attendance:self',
    ATTENDANCE_VIEW: 'attendance:view',
    ATTENDANCE_RECORD: 'attendance:record',

    // ---------- Complaints ----------
    COMPLAINT_RAISE: 'complaint:raise',
    COMPLAINT_VIEW: 'complaint:view',
    COMPLAINT_HANDLE: 'complaint:handle',

    // ---------- Documents ----------
    DOCUMENT_SELF: 'document:self',
    DOCUMENT_VIEW: 'document:view',
    DOCUMENT_MANAGE: 'document:manage',

    // ---------- Reports ----------
    REPORT_RECRUITMENT: 'report:recruitment',
    REPORT_MANAGER: 'report:manager',
    REPORT_EMPLOYER: 'report:employer',
    REPORT_HR: 'report:hr',
    REPORT_SYSTEM: 'report:system',

    // ---------- Organization (employer scope) ----------
    ORG_MANAGE: 'org:manage',
    ORG_TEAM_MANAGE: 'org:team',
    ORG_CONFIG: 'org:config',

    // ---------- Platform (system administrator scope) ----------
    PLATFORM_EMPLOYERS: 'platform:employers',
    PLATFORM_USERS: 'platform:users',
    PLATFORM_ROLES: 'platform:roles',
    PLATFORM_CONFIG: 'platform:config',
    PLATFORM_AUDIT: 'platform:audit'
};

const C = CAPABILITIES;

/** Operational HR work: record, process, submit. */
const HR_EXPERT_CAPABILITIES = [
    // Recruitment
    C.VACANCY_CREATE, C.VACANCY_EDIT, C.VACANCY_SUBMIT, C.VACANCY_DELETE, C.VACANCY_VIEW,
    C.APPLICATION_VIEW, C.APPLICATION_PROCESS, C.APPLICATION_SHORTLIST,
    C.CANDIDATE_VIEW, C.INTERVIEW_SCHEDULE, C.INTERVIEW_EVALUATE, C.AI_MATCH,
    // Employee information
    C.EMPLOYEE_VIEW, C.EMPLOYEE_RECORD,
    // HR operations - records and forwards, never approves
    C.LEAVE_VIEW, C.LEAVE_PROCESS, C.LEAVE_REQUEST,
    C.REQUEST_VIEW, C.REQUEST_PROCESS, C.REQUEST_RAISE,
    C.TRAINING_VIEW, C.TRAINING_RECORD, C.TRAINING_PARTICIPATE,
    C.DELEGATION_VIEW,
    C.ATTENDANCE_SELF, C.ATTENDANCE_VIEW, C.ATTENDANCE_RECORD,
    C.COMPLAINT_RAISE, C.COMPLAINT_VIEW, C.COMPLAINT_HANDLE,
    C.DOCUMENT_SELF, C.DOCUMENT_VIEW, C.DOCUMENT_MANAGE,
    C.REPORT_RECRUITMENT
];

/** Supervisory HR work: view, review, approve, supervise. */
const HR_MANAGER_CAPABILITIES = [
    // Recruitment oversight
    C.VACANCY_VIEW, C.VACANCY_APPROVE, C.VACANCY_REJECT,
    C.APPLICATION_VIEW, C.APPLICATION_DECIDE,
    C.CANDIDATE_VIEW, C.INTERVIEW_REVIEW, C.AI_MATCH,
    // Employee information (read-only oversight, plus authorised termination)
    C.EMPLOYEE_VIEW, C.EMPLOYEE_DELETE,
    // HR approvals
    C.LEAVE_VIEW, C.LEAVE_APPROVE, C.LEAVE_REQUEST,
    C.REQUEST_VIEW, C.REQUEST_APPROVE, C.REQUEST_RAISE,
    C.TRAINING_VIEW, C.TRAINING_APPROVE,
    C.DELEGATION_VIEW, C.DELEGATION_CREATE,
    C.ATTENDANCE_SELF, C.ATTENDANCE_VIEW,
    C.COMPLAINT_VIEW, C.COMPLAINT_HANDLE, C.COMPLAINT_RAISE,
    C.DOCUMENT_SELF, C.DOCUMENT_VIEW,
    C.REPORT_RECRUITMENT, C.REPORT_MANAGER, C.REPORT_HR
];

/** Employee self-service only - always limited to their own records. */
const EMPLOYEE_CAPABILITIES = [
    C.LEAVE_REQUEST,
    C.REQUEST_RAISE,
    C.TRAINING_PARTICIPATE,
    C.ATTENDANCE_SELF,
    C.COMPLAINT_RAISE,
    C.DOCUMENT_SELF
];

const ROLE_CAPABILITIES = {
    // Platform-level only. Deliberately excludes every recruitment and HR
    // operation so an administrator can never act as a company's HR user.
    admin: [
        C.PLATFORM_EMPLOYERS,
        C.PLATFORM_USERS,
        C.PLATFORM_ROLES,
        C.PLATFORM_CONFIG,
        C.PLATFORM_AUDIT,
        C.REPORT_SYSTEM
    ],

    // Owns the organization: oversight, team management, org configuration.
    // Sees the whole HR environment but does not do HR Expert day-to-day work.
    employer: [
        C.ORG_MANAGE, C.ORG_TEAM_MANAGE, C.ORG_CONFIG,
        C.VACANCY_VIEW, C.APPLICATION_VIEW, C.CANDIDATE_VIEW,
        C.EMPLOYEE_VIEW,
        C.LEAVE_VIEW, C.REQUEST_VIEW, C.TRAINING_VIEW,
        C.DELEGATION_VIEW, C.DELEGATION_CREATE,
        C.ATTENDANCE_VIEW, C.COMPLAINT_VIEW, C.DOCUMENT_VIEW,
        C.REPORT_EMPLOYER, C.REPORT_RECRUITMENT, C.REPORT_HR
    ],

    hr_expert: HR_EXPERT_CAPABILITIES,
    hr_manager: HR_MANAGER_CAPABILITIES,
    employee: EMPLOYEE_CAPABILITIES,

    // Candidates act only on their own recruitment participation.
    // Ownership is additionally enforced per-record in the controllers.
    candidate: [
        C.COMPLAINT_RAISE,
        C.DOCUMENT_SELF
    ]
};

/** Roles that belong to an employer organization. */
const ORG_ROLES = ['employer', 'hr_expert', 'hr_manager', 'employee'];

/** Roles that perform recruitment/HR work inside an organization. */
const HR_ROLES = ['hr_expert', 'hr_manager'];

/** Roles an employer may create inside its own organization. */
const EMPLOYER_MANAGEABLE_ROLES = ['hr_expert', 'hr_manager', 'employee'];

/**
 * Resolve every capability a user holds: role baseline + employer-granted overrides.
 */
function capabilitiesFor(user) {
    if (!user || !user.role) return [];
    const base = ROLE_CAPABILITIES[user.role] || [];
    const extra = Array.isArray(user.permissions) ? user.permissions : [];
    return [...new Set([...base, ...extra])];
}

function userCan(user, capability) {
    return capabilitiesFor(user).includes(capability);
}

module.exports = {
    CAPABILITIES,
    ROLE_CAPABILITIES,
    ORG_ROLES,
    HR_ROLES,
    EMPLOYER_MANAGEABLE_ROLES,
    capabilitiesFor,
    userCan
};
