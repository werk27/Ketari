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

    // ---------- Job seeking (acting on your own behalf) ----------
    // Held by candidates and by employees alike. Being hired does not end a
    // person's job search: the applications and CV are theirs, not the
    // organization's, and someone hired by one employer must still be able to
    // follow up or withdraw an application they made to another.
    JOB_SEEK: 'jobseek:apply',            // apply, withdraw, save a vacancy
    JOB_SEEK_PROFILE: 'jobseek:profile',  // own CVs

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

    // ---------- Job Requisition / Manpower Request ----------
    // The bridge between a department's staffing need and vacancy creation.
    // Deliberately separate from VACANCY_* so approving a requisition never
    // implies the ability to approve the vacancy created from it, and vice versa.
    // Note: REQUISITION_CREATE is granted to the `employer` role only. A
    // Department Head is NOT a separate role - it is any organization member
    // assigned as a Department's `manager` (Configuration.departments[].manager),
    // authorized per-department in requisitionController.createRequisition
    // rather than through this role-capability table.
    REQUISITION_CREATE: 'requisition:create',   // raise/edit a requisition (Employer, or a Department Head for their own department)
    REQUISITION_VIEW: 'requisition:view',
    REQUISITION_PROCESS: 'requisition:process', // review/return/prepare for approval (HR Expert)
    REQUISITION_APPROVE: 'requisition:approve', // approve/reject (HR Manager)

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
    // Job Requisition - reviews and forwards what a Department Head (or the
    // Employer) originates; never raises its own, so the review step is a
    // genuine second pair of eyes rather than checking its own request. See
    // requisitionController.createRequisition for who may originate one.
    C.REQUISITION_VIEW, C.REQUISITION_PROCESS,
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
    // Job Requisition - approves/rejects only, never creates or processes.
    // Deliberately excludes ORG_CONFIG: reviewing staffing requests never
    // grants the ability to manage the organization's configuration.
    C.REQUISITION_VIEW, C.REQUISITION_APPROVE,
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
    C.DOCUMENT_SELF,
    // Being hired does not end a job search. Without these an employee loses
    // sight of applications they already made to other organizations and
    // cannot even withdraw them.
    C.JOB_SEEK,
    C.JOB_SEEK_PROFILE,
    // Job Requisition: broad at the role level (any employee may attempt to
    // raise one), same pattern as VACANCY_EDIT - the REAL restriction is
    // enforced per-department in requisitionController.createRequisition,
    // which only allows it when this specific user is the assigned
    // Department Head (Configuration.departments[].manager) of the
    // department named on the requisition. An employee with no department
    // headed will always be rejected there.
    C.REQUISITION_CREATE, C.REQUISITION_VIEW
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
    //
    // EMPLOYEE_RECORD is the one exception: a brand-new organization has no
    // HR Expert yet, and a role may only ever be granted to the account
    // already linked to an existing Employee record (never created
    // independently of one - see employeeController.assignEmployeeRole).
    // Without it the employer could never record that first Employee to
    // become its own HR Expert or HR Manager through the correct path.
    employer: [
        C.ORG_MANAGE, C.ORG_TEAM_MANAGE, C.ORG_CONFIG,
        C.VACANCY_VIEW, C.APPLICATION_VIEW, C.CANDIDATE_VIEW,
        C.EMPLOYEE_VIEW, C.EMPLOYEE_RECORD,
        // Raises staffing needs on behalf of a department (the organization's
        // authorized requester in the absence of a separate department-head
        // role) but never processes or approves them - that stays with HR.
        C.REQUISITION_CREATE, C.REQUISITION_VIEW,
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
        C.JOB_SEEK,
        C.JOB_SEEK_PROFILE,
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
 * Resolve every capability a user holds: role baseline + employer-granted overrides
 * + anything temporarily inherited via an active delegation (see auth.js `protect`,
 * which attaches `delegatedCapabilities` before this runs).
 */
function capabilitiesFor(user) {
    if (!user || !user.role) return [];
    const base = ROLE_CAPABILITIES[user.role] || [];
    const extra = Array.isArray(user.permissions) ? user.permissions : [];
    const delegated = Array.isArray(user.delegatedCapabilities) ? user.delegatedCapabilities : [];
    return [...new Set([...base, ...extra, ...delegated])];
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
