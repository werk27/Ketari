const { loadConfiguration } = require('./departmentScope');

/**
 * Single source of truth for how an account `role` is worded on screen.
 *
 * Kept here - instead of copy-pasted in every controller that happens to
 * return a `role` field - so a label never drifts between the Employee
 * Directory, the delegation screens, credential emails, etc.
 */
const ROLE_LABELS = {
    admin: 'System Administrator',
    employer: 'Employer',
    hr_expert: 'HR Expert',
    hr_manager: 'HR Manager',
    employee: 'Employee',
    candidate: 'Candidate'
};

const roleLabel = (role) => ROLE_LABELS[role] || role || '';

/**
 * Department Head is NOT a stored role (see departmentScope.js) - it is an
 * employee additionally assigned as a department's
 * `Configuration.departments[].manager`. Every screen that lists more than
 * one organization member independently re-derived (or simply forgot to
 * derive) that fact, so someone heading a department kept showing as a bare
 * "Employee" everywhere except their own signed-in dashboard, which reads it
 * from the `/auth/me` payload (authController.loadEmployment).
 *
 * This is the one place that answers "who currently heads which department(s)
 * in this organization", reused by every listing/detail endpoint that
 * displays more than one member so the answer is always the organization's
 * current, authoritative Configuration - never something cached or
 * recomputed inconsistently per screen.
 *
 * Returns a Map keyed by user id string -> [{ id, name }] of the usable
 * departments they head, for O(1) lookups while annotating a list. A user
 * absent from the map heads nothing.
 */
const loadDepartmentHeadIndex = async (employerId, config = undefined) => {
    if (!employerId) return new Map();
    const configuration = config === undefined ? await loadConfiguration(employerId) : config;
    const departments = (configuration && configuration.departments) || [];
    const index = new Map();
    departments
        .filter(d => d && d.status !== 'inactive' && d.manager)
        .forEach(d => {
            const key = String(d.manager);
            const entry = { id: d._id, name: d.name };
            if (index.has(key)) index.get(key).push(entry);
            else index.set(key, [entry]);
        });
    return index;
};

/**
 * The single label a member should be called wherever more than their bare
 * account role matters: their assigned organizational role, exactly as
 * assigned - Department Head outranks the generic "Employee" label the same
 * way it outranks a generic position title in describeEmployment on the
 * frontend (workspace/navigationConfig.js), so a signed-in member and every
 * list that mentions them agree.
 */
const resolveDisplayRole = (role, isDepartmentHead) =>
    (isDepartmentHead ? 'Department Head' : roleLabel(role));

/**
 * Annotate a single user/account plain object with `isDepartmentHead` and
 * `headOfDepartments` from an already-loaded department-head index, plus the
 * ready-to-render `displayRole` label. Safe to call on `null`/`undefined`.
 */
const annotateAccount = (account, headIndex) => {
    if (!account) return account;
    const id = String(account._id || account.id || '');
    const headOf = headIndex.get(id) || [];
    return {
        ...account,
        isDepartmentHead: headOf.length > 0,
        headOfDepartments: headOf,
        displayRole: resolveDisplayRole(account.role, headOf.length > 0)
    };
};

module.exports = {
    ROLE_LABELS,
    roleLabel,
    loadDepartmentHeadIndex,
    resolveDisplayRole,
    annotateAccount
};
