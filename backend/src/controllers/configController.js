const mongoose = require('mongoose');
const Configuration = require('../models/Configuration');
const Employee = require('../models/Employee');
const JobRequisition = require('../models/JobRequisition');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Employer = require('../models/Employer');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

/**
 * Configuration module (spec §19 / §20).
 *
 * Each organization owns its configuration. A document with employer: null holds
 * the platform defaults maintained by the System Administrator; a new employer
 * inherits a copy of those defaults the first time it opens its configuration.
 *
 * CONFIGURABLE  - organizational lookup data: departments, positions, job titles,
 *                 skills, languages, education levels, leave types, training
 *                 types, employment status, termination reasons, licenses...
 * PERSONAL      - religion, marital status and blood type are option lists used
 *                 when completing an EMPLOYEE PROFILE. They are never mandatory
 *                 recruitment criteria and never appear in the vacancy workflow.
 *
 * Organization structure (spec item 14): Departments are the foundation.
 * Positions belong to a Department. Position Ranks are global and reusable
 * (e.g. "Senior" applies across many positions), not owned by one Position -
 * this mirrors the pre-existing schema, with a single fixed `salary` per rank
 * (never a min/max range, matching the same rule already enforced for
 * vacancy salaries). Job Titles and Partners are their own standalone lists:
 * nothing else in the system currently relates a Job Title to a Department,
 * so that relationship is not invented here.
 */

/** Lookup collections an organization may edit. */
const CONFIG_COLLECTIONS = {
    'departments': 'departments',
    'positions': 'positions',
    'position-ranks': 'positionRanks',
    'job-titles': 'jobTitles',
    'skills': 'skills',
    'languages': 'languages',
    'licenses': 'licenses',
    'education-levels': 'educationLevels',
    'employment-status': 'employmentStatus',
    'leave-types': 'leaveTypes',
    'training-types': 'trainingTypes',
    'termination-reasons': 'terminationReasons',
    'deduction-types': 'deductionTypes',
    'nations': 'nations',
    'titles': 'titles',
    'partners': 'partners',
    // Personal-attribute option lists (employee profile only)
    'religions': 'religions',
    'marital-status': 'maritalStatus',
    'blood-types': 'bloodTypes'
};

/** Lists that describe a person, not the organization's structure. */
const PERSONAL_ATTRIBUTE_COLLECTIONS = ['religions', 'maritalStatus', 'bloodTypes'];

/** Cross-referenced by Positions/Departments/Ranks/Leave Types - checked before a hard delete. */
const RELATIONAL_TYPES = ['departments', 'positions', 'position-ranks', 'leave-types'];

/** Case-insensitive exact-match regex escape, matching the convention already used in authController/applicationController. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PARTNER_TYPE_VALUES = Configuration.PARTNER_TYPES.map(t => t.value);

const isActiveStatus = (status) => (['active', 'inactive'].includes(status) ? status : 'active');

/**
 * Resolve the configuration document for a request.
 * Organization members get their own document (seeded from platform defaults on
 * first use); the System Administrator edits the platform defaults.
 */
const resolveConfiguration = async (req, { create = true } = {}) => {
    const employerId = req.employerId || null;

    let config = await Configuration.findOne({ employer: employerId });
    if (config || !create) return config;

    // Seed a new organization from the platform defaults so it starts with
    // sensible lookup values instead of empty dropdowns.
    const defaults = employerId ? await Configuration.findOne({ employer: null }) : null;
    const seed = { employer: employerId };

    if (defaults) {
        const departmentIdMap = new Map();
        const rankIdMap = new Map();

        // Departments and Position Ranks are cloned first (assigning each a
        // brand new _id up front) so Positions - cloned afterwards - can
        // remap their `department`/`rank` references onto the NEW organization's
        // own copies instead of pointing at the platform default's ids, which
        // no longer exist once this document is a separate copy.
        if (Array.isArray(defaults.departments) && defaults.departments.length > 0) {
            seed.departments = defaults.departments.map(item => {
                const plain = item.toObject ? item.toObject() : { ...item };
                const newId = new mongoose.Types.ObjectId();
                departmentIdMap.set(String(plain._id), newId);
                return { ...plain, _id: newId };
            });
        }
        if (Array.isArray(defaults.positionRanks) && defaults.positionRanks.length > 0) {
            seed.positionRanks = defaults.positionRanks.map(item => {
                const plain = item.toObject ? item.toObject() : { ...item };
                const newId = new mongoose.Types.ObjectId();
                rankIdMap.set(String(plain._id), newId);
                return { ...plain, _id: newId };
            });
        }
        if (Array.isArray(defaults.positions) && defaults.positions.length > 0) {
            seed.positions = defaults.positions.map(item => {
                const plain = item.toObject ? item.toObject() : { ...item };
                delete plain._id;
                return {
                    ...plain,
                    department: departmentIdMap.get(String(plain.department)) || plain.department,
                    rank: plain.rank ? (rankIdMap.get(String(plain.rank)) || plain.rank) : null
                };
            });
        }

        Object.values(CONFIG_COLLECTIONS).forEach(field => {
            if (['departments', 'positionRanks', 'positions'].includes(field)) return;
            const items = defaults[field];
            if (Array.isArray(items) && items.length > 0) {
                seed[field] = items.map(item => {
                    const plain = item.toObject ? item.toObject() : { ...item };
                    delete plain._id;
                    return plain;
                });
            }
        });
    }

    return Configuration.create(seed);
};

/**
 * Per-type validation for the configuration lists that carry real
 * relationships or need more than "a name is required". Returns
 * { error: 'specific reason' } or { value: sanitizedFieldsObject }.
 * `editingId` excludes the record being edited from its own duplicate check.
 * Validators may be async (e.g. departments checks the assigned manager
 * against real User records) - always awaited by the callers below.
 */
const VALIDATORS = {
    departments: async (body, config, editingId, req) => {
        const name = (body.name || '').trim();
        if (!name) return { error: 'Department name is required.' };

        const duplicate = config.departments.find(d =>
            d.name.toLowerCase() === name.toLowerCase() && String(d._id) !== String(editingId));
        if (duplicate) return { error: `A department named "${name}" already exists.` };

        // The Department Head: an existing organization member who may raise
        // Job Requisitions on this department's behalf (see
        // requisitionController). Optional - a department can have no head
        // assigned yet - but if one is given it must be a real member of
        // THIS organization, never free text and never another org's user.
        let manager = null;
        if (body.manager) {
            if (!mongoose.Types.ObjectId.isValid(body.manager)) {
                return { error: 'Selected department head does not exist.' };
            }
            const candidate = await User.findById(body.manager).select('employer status');
            if (!candidate || !candidate.employer || String(candidate.employer) !== String(req.employerId)) {
                return { error: 'Selected department head does not exist.' };
            }
            if (candidate.status === 'inactive') {
                return { error: 'Selected department head\'s account is inactive.' };
            }
            manager = candidate._id;
        }

        return {
            value: {
                name,
                code: (body.code || '').trim(),
                description: body.description || '',
                manager,
                status: isActiveStatus(body.status)
            }
        };
    },

    positions: (body, config, editingId) => {
        const title = (body.title || body.name || '').trim();
        if (!title) return { error: 'Position name is required.' };

        if (!body.department) return { error: 'Please select a department.' };
        const department = config.departments.id(body.department);
        if (!department) return { error: 'Selected department does not exist.' };

        let rank = null;
        if (body.rank) {
            rank = config.positionRanks.id(body.rank);
            if (!rank) return { error: 'Selected position rank does not exist.' };
        }

        const duplicate = config.positions.find(p =>
            p.title.toLowerCase() === title.toLowerCase() &&
            String(p.department) === String(department._id) &&
            String(p._id) !== String(editingId));
        if (duplicate) return { error: `A position named "${title}" already exists in this department.` };

        return {
            value: {
                title,
                code: (body.code || '').trim(),
                department: department._id,
                rank: rank ? rank._id : null,
                description: body.description || '',
                status: isActiveStatus(body.status)
            }
        };
    },

    'position-ranks': (body, config, editingId) => {
        const name = (body.name || '').trim();
        if (!name) return { error: 'Position rank name is required.' };

        const duplicate = config.positionRanks.find(r =>
            r.name.toLowerCase() === name.toLowerCase() && String(r._id) !== String(editingId));
        if (duplicate) return { error: `A position rank named "${name}" already exists.` };

        // One fixed salary amount only - never a range - matching the same
        // rule already enforced for vacancy salaries (Job.salary).
        if (body.minSalary !== undefined || body.maxSalary !== undefined) {
            return { error: 'Salary ranges are not supported; provide a single, fixed salary amount.' };
        }

        let salary;
        if (body.salary !== undefined && body.salary !== '' && body.salary !== null) {
            salary = Number(body.salary);
            if (Number.isNaN(salary) || salary <= 0) {
                return { error: 'Salary must be a valid positive number.' };
            }
        }

        let level;
        if (body.level !== undefined && body.level !== '' && body.level !== null) {
            level = Number(body.level);
            if (Number.isNaN(level)) return { error: 'Level must be a valid number.' };
        }

        return {
            value: {
                name,
                level,
                salary,
                description: body.description || '',
                status: isActiveStatus(body.status)
            }
        };
    },

    'job-titles': (body, config, editingId) => {
        const name = (body.name || '').trim();
        if (!name) return { error: 'Job title name is required.' };

        const duplicate = config.jobTitles.find(j =>
            j.name.toLowerCase() === name.toLowerCase() && String(j._id) !== String(editingId));
        if (duplicate) return { error: `A job title named "${name}" already exists.` };

        return {
            value: {
                name,
                code: (body.code || '').trim(),
                description: body.description || '',
                status: isActiveStatus(body.status)
            }
        };
    },

    partners: (body, config, editingId) => {
        const name = (body.name || '').trim();
        if (!name) return { error: 'Partner name is required.' };

        if (!PARTNER_TYPE_VALUES.includes(body.type)) return { error: 'Please select a valid partner type.' };

        const duplicate = config.partners.find(p =>
            p.name.toLowerCase() === name.toLowerCase() && String(p._id) !== String(editingId));
        if (duplicate) return { error: `A partner named "${name}" already exists.` };

        return {
            value: {
                name,
                type: body.type,
                contactPerson: body.contactPerson || '',
                email: body.email || '',
                phone: body.phone || '',
                status: isActiveStatus(body.status)
            }
        };
    },

    // Leave types get their own validator (rather than the generic
    // name-only rule) so that days/year - the actual entitlement rule every
    // leave request is validated against (see leaveController) - can never be
    // saved as missing, non-numeric, zero or negative. Still preserves every
    // other field (paid, carryOver, requiresAttachment, description, ...) via
    // spread exactly like genericValidate did, so editing name/days/status
    // through the new Edit UI can never silently wipe them.
    'leave-types': (body, config, editingId) => {
        const name = (body.name || '').trim();
        if (!name) return { error: 'Leave type name is required.' };

        const duplicate = config.leaveTypes.find(t =>
            t.name.toLowerCase() === name.toLowerCase() && String(t._id) !== String(editingId));
        if (duplicate) return { error: `A leave type named "${name}" already exists.` };

        if (body.daysPerYear === undefined || body.daysPerYear === '' || body.daysPerYear === null) {
            return { error: 'Days/year is required.' };
        }
        const daysPerYear = Number(body.daysPerYear);
        if (Number.isNaN(daysPerYear) || daysPerYear <= 0) {
            return { error: 'Days/year must be a valid positive number.' };
        }

        return {
            value: {
                ...body,
                name,
                daysPerYear,
                status: isActiveStatus(body.status)
            }
        };
    }
};

/** Every other list (skills, languages, leave types, ...) keeps the original simple name-based rule. */
const genericValidate = (body, config, editingId, field, label) => {
    const name = (body.name || '').trim();
    if (!name) return { error: `${label} name is required.` };

    const duplicate = (config[field] || []).find(item =>
        String(item.name).toLowerCase() === name.toLowerCase() && String(item._id) !== String(editingId));
    if (duplicate) return { error: `"${name}" already exists in this list.` };

    return { value: { ...body, name } };
};

/**
 * Before a hard delete, make sure nothing still points at this record -
 * mirrors the business rule already used for Employees/Vacancies: deactivate,
 * don't destroy, anything still referenced.
 */
const findReferenceBlockingDelete = async (type, item, config, req) => {
    if (type === 'departments') {
        if (config.positions.some(p => String(p.department) === String(item._id))) {
            return 'This department has positions configured under it. Remove or reassign those positions first, or set this department to inactive instead of deleting it.';
        }
        if (req.employerId) {
            const usedByEmployee = await Employee.exists({ employer: req.employerId, 'employmentInfo.department': item._id });
            if (usedByEmployee) return 'This department is assigned to one or more employees. Set it to inactive instead of deleting it.';
            const usedByRequisition = await JobRequisition.exists({ employer: req.employerId, department: item._id });
            if (usedByRequisition) return 'This department is referenced by one or more job requisitions. Set it to inactive instead of deleting it.';
        }
    }

    if (type === 'positions') {
        if (req.employerId) {
            const usedByEmployee = await Employee.exists({ employer: req.employerId, 'employmentInfo.position': item._id });
            if (usedByEmployee) return 'This position is assigned to one or more employees. Set it to inactive instead of deleting it.';
            const usedByRequisition = await JobRequisition.exists({ employer: req.employerId, position: item._id });
            if (usedByRequisition) return 'This position is referenced by one or more job requisitions. Set it to inactive instead of deleting it.';
        }
    }

    if (type === 'position-ranks') {
        if (config.positions.some(p => p.rank && String(p.rank) === String(item._id))) {
            return 'This position rank is assigned to one or more positions. Remove that assignment first, or set the rank to inactive instead of deleting it.';
        }
    }

    // Historical Leave requests store a plain-text snapshot of the leave
    // type's name (Leave.leaveTypeName), never a live reference - editing or
    // renaming a leave type elsewhere never rewrites past requests. But a
    // hard DELETE of the leave type itself must still be blocked while any
    // request (of any status - approved, rejected, cancelled all remain
    // real history) still names it, the same "deactivate, don't destroy"
    // rule already applied to departments/positions/ranks above.
    if (type === 'leave-types' && req.employerId) {
        const usedByLeave = await Leave.exists({
            employer: req.employerId,
            leaveTypeName: { $regex: new RegExp(`^${escapeRegex(item.name)}$`, 'i') }
        });
        if (usedByLeave) {
            return 'This leave type has already been used in one or more leave requests. Set it to inactive instead of deleting it.';
        }
    }

    return null;
};

// @desc    Get the caller's configuration
// @route   GET /api/config
// @access  Private (organization members / System Administrator)
exports.getConfigurations = async (req, res) => {
    try {
        const config = await resolveConfiguration(req);

        res.status(200).json({
            success: true,
            data: config || {},
            meta: {
                scope: req.employerId ? 'organization' : 'platform',
                personalAttributeCollections: PERSONAL_ATTRIBUTE_COLLECTIONS,
                partnerTypes: Configuration.PARTNER_TYPES
            }
        });
    } catch (error) {
        console.error('Get Configurations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update organization information
// @route   PUT /api/config/organization
// @access  Private (org:config / platform:config)
exports.updateOrganization = async (req, res) => {
    try {
        const config = await resolveConfiguration(req);
        const existing = config.organization
            ? (config.organization.toObject ? config.organization.toObject() : config.organization)
            : {};

        config.organization = { ...existing, ...req.body };
        config.markModified('organization');
        await config.save();

        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Update Organization Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/** Human-readable label for a config type, used in generic validator error messages. */
const LABELS = {
    'skills': 'Skill', 'languages': 'Language', 'licenses': 'License',
    'education-levels': 'Education level', 'employment-status': 'Employment status',
    'leave-types': 'Leave type', 'training-types': 'Training type',
    'termination-reasons': 'Termination reason', 'deduction-types': 'Deduction type',
    'nations': 'Nation', 'titles': 'Title', 'religions': 'Religion',
    'marital-status': 'Marital status', 'blood-types': 'Blood type'
};

/**
 * Optionally tell a newly assigned Department Head about their new
 * responsibility - an in-app notification always, plus an email when
 * requested (defaults to on, opt-out via body.notifyHead === false).
 *
 * Never touches a password or login token: the departments validator above
 * only ever accepts an existing, active member of the organization as
 * manager, so there is nothing to "activate" here, only something to
 * announce. Failures are logged and swallowed - the department/manager
 * assignment itself has already succeeded by the time this runs and must
 * never be rolled back by a notification problem.
 */
const notifyDepartmentHead = async (req, { managerId, departmentName }) => {
    try {
        const manager = await User.findById(managerId).select('name email');
        if (!manager) return;

        await notificationService.notify({
            user: manager._id,
            employer: req.employerId,
            type: 'account_update',
            title: 'You are now a Department Head',
            message: `You have been assigned as the Department Head of "${departmentName}".`,
            link: await notificationService.linkForUser(manager._id, 'department')
        });

        if (req.body.notifyHead === false || !manager.email) return;

        const organization = await Employer.findById(req.employerId).select('name');
        await emailService.sendDepartmentHeadAssigned({
            to: manager.email,
            name: manager.name,
            organizationName: organization?.name || 'your organization',
            departmentName,
            loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`
        });
    } catch (error) {
        console.error('Department Head notification failed:', error.message);
    }
};

// @desc    Add an item to a configuration list
// @route   POST /api/config/:type
// @access  Private (org:config / platform:config)
exports.addConfigEntry = async (req, res) => {
    try {
        const type = req.params.type;
        const field = CONFIG_COLLECTIONS[type];
        if (!field) {
            return res.status(404).json({
                success: false,
                message: `Unknown configuration list "${type}". Available: ${Object.keys(CONFIG_COLLECTIONS).join(', ')}`
            });
        }

        const config = await resolveConfiguration(req);
        const validate = VALIDATORS[type] || ((body, cfg, id) => genericValidate(body, cfg, id, field, LABELS[type] || 'Item'));
        const result = await validate(req.body || {}, config, null, req);

        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }

        config[field].push(result.value);
        await config.save();

        if (type === 'departments' && result.value.manager) {
            await notifyDepartmentHead(req, { managerId: result.value.manager, departmentName: result.value.name });
        }

        res.status(201).json({ success: true, data: config });
    } catch (error) {
        console.error(`Add ${req.params.type} Error:`, error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Please check the values you entered.'
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update an item in a configuration list
// @route   PUT /api/config/:type/:id
// @access  Private (org:config / platform:config)
exports.updateConfigEntry = async (req, res) => {
    try {
        const type = req.params.type;
        const field = CONFIG_COLLECTIONS[type];
        if (!field) {
            return res.status(404).json({ success: false, message: 'Unknown configuration list' });
        }

        const config = await resolveConfiguration(req, { create: false });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Configuration not found' });
        }

        const item = (config[field] || []).id(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Configuration item not found' });
        }

        const validate = VALIDATORS[type] || ((body, cfg, id) => genericValidate(body, cfg, id, field, LABELS[type] || 'Item'));
        const result = await validate(req.body || {}, config, req.params.id, req);

        if (result.error) {
            return res.status(400).json({ success: false, message: result.error });
        }

        // Captured before the overwrite so a real change of head can be told
        // apart from an unrelated edit (renaming the department, toggling its
        // status) that happens to resubmit the same manager - re-notifying
        // an unchanged head on every edit would be noise, not news.
        const previousManagerId = type === 'departments' && item.manager ? item.manager.toString() : null;

        Object.assign(item, result.value);
        await config.save();

        if (type === 'departments' && result.value.manager
            && result.value.manager.toString() !== previousManagerId) {
            await notifyDepartmentHead(req, { managerId: result.value.manager, departmentName: result.value.name });
        }

        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Update Config Entry Error:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors || {}).map(e => e.message).join(', ') || 'Please check the values you entered.'
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Remove an item from a configuration list
// @route   DELETE /api/config/:type/:id
// @access  Private (org:config / platform:config)
exports.deleteConfigItem = async (req, res) => {
    try {
        const type = req.params.type;
        const field = CONFIG_COLLECTIONS[type];
        if (!field) {
            return res.status(404).json({ success: false, message: 'Unknown configuration list' });
        }

        const config = await resolveConfiguration(req, { create: false });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Configuration not found' });
        }

        const item = (config[field] || []).id(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Configuration item not found' });
        }

        if (RELATIONAL_TYPES.includes(type)) {
            const blockingReason = await findReferenceBlockingDelete(type, item, config, req);
            if (blockingReason) {
                return res.status(409).json({ success: false, message: blockingReason });
            }
        }

        config[field].pull(req.params.id);
        await config.save();

        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Delete Config Item Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports.CONFIG_COLLECTIONS = CONFIG_COLLECTIONS;
module.exports.PERSONAL_ATTRIBUTE_COLLECTIONS = PERSONAL_ATTRIBUTE_COLLECTIONS;
