const Configuration = require('../models/Configuration');

/**
 * Department Head scope.
 *
 * A Department Head is NOT a role. It is an employee who has additionally been
 * assigned as a department's head (`Configuration.departments[].manager`) by
 * the Employer. They keep every normal employee service and gain read access to
 * their own department plus the right to raise Job Requisitions for it - never
 * HR Expert or HR Manager powers.
 *
 * Every helper here resolves that standing from the organization's own
 * Configuration, so it is always the tenant's current, authoritative answer
 * rather than something cached on the user account that could drift.
 */

const sameId = (a, b) => !!a && !!b && String(a) === String(b);

/** Only departments the organization still has switched on can be headed. */
const isUsable = (department) => department && department.status !== 'inactive';

/**
 * The organization's configuration, or null. Kept lean: callers only read
 * departments/positions and never save through this document.
 */
const loadConfiguration = (employerId) =>
    Configuration.findOne({ employer: employerId }).select('departments positions positionRanks').lean();

/**
 * Departments this user heads inside `employerId`.
 *
 * Returns the department sub-documents themselves so callers get the name,
 * code and description without a second read.
 */
const headedDepartments = async (user, employerId, config = undefined) => {
    if (!user || !employerId) return [];

    const configuration = config === undefined ? await loadConfiguration(employerId) : config;
    if (!configuration || !Array.isArray(configuration.departments)) return [];

    return configuration.departments.filter(d => isUsable(d) && sameId(d.manager, user._id || user.id));
};

/** Positions configured under the given departments. */
const positionsForDepartments = (config, departmentIds) => {
    const wanted = departmentIds.map(String);
    return ((config && config.positions) || [])
        .filter(p => wanted.includes(String(p.department)));
};

/**
 * True when this user heads the given department. The single authorization
 * question the requisition workflow asks.
 */
const headsDepartment = async (user, employerId, departmentId) => {
    const departments = await headedDepartments(user, employerId);
    return departments.some(d => sameId(d._id, departmentId));
};

/**
 * Express guard for the Department Head workspace.
 *
 * Mount AFTER withEmployerScope. Exposes `req.headedDepartments` (the
 * sub-documents), `req.headedDepartmentIds` and `req.orgConfiguration` so a
 * handler never has to re-read the configuration, and refuses the request
 * outright when the caller heads nothing - there is no department-scoped
 * answer to give them.
 */
const withDepartmentHeadScope = async (req, res, next) => {
    try {
        const config = await loadConfiguration(req.employerId);
        const departments = await headedDepartments(req.user, req.employerId, config);

        if (departments.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'This area is for Department Heads. You are not assigned as the head of any department.'
            });
        }

        // A head may hold more than one department. `?department=` narrows the
        // answer to one of them, and is validated against what they actually
        // head so it can never be used to read a department they do not.
        let scoped = departments;
        if (req.query.department) {
            scoped = departments.filter(d => sameId(d._id, req.query.department));
            if (scoped.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not the head of that department.'
                });
            }
        }

        req.orgConfiguration = config;
        req.headedDepartments = scoped;
        req.headedDepartmentIds = scoped.map(d => d._id);
        next();
    } catch (error) {
        console.error('withDepartmentHeadScope error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports = {
    loadConfiguration,
    headedDepartments,
    positionsForDepartments,
    headsDepartment,
    withDepartmentHeadScope,
    sameId
};
