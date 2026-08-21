const Configuration = require('../models/Configuration');

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
        Object.values(CONFIG_COLLECTIONS).forEach(field => {
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

const addConfigItem = async (req, res, field) => {
    try {
        if (!req.body || !req.body.name) {
            return res.status(400).json({ success: false, message: 'A name is required' });
        }

        const config = await resolveConfiguration(req);

        if (!Array.isArray(config[field])) config[field] = [];

        const exists = config[field].some(
            item => String(item.name).toLowerCase() === String(req.body.name).toLowerCase()
        );
        if (exists) {
            return res.status(400).json({
                success: false,
                message: `"${req.body.name}" already exists in this list`
            });
        }

        config[field].push(req.body);
        await config.save();

        res.status(201).json({ success: true, data: config });
    } catch (error) {
        console.error(`Add ${field} Error:`, error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation Error',
                errors: Object.values(error.errors).map(e => e.message)
            });
        }
        res.status(500).json({ success: false, message: 'Server Error' });
    }
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
                personalAttributeCollections: PERSONAL_ATTRIBUTE_COLLECTIONS
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

// @desc    Add an item to a configuration list
// @route   POST /api/config/:type
// @access  Private (org:config / platform:config)
exports.addConfigEntry = async (req, res) => {
    const field = CONFIG_COLLECTIONS[req.params.type];

    if (!field) {
        return res.status(404).json({
            success: false,
            message: `Unknown configuration list "${req.params.type}". Available: ${Object.keys(CONFIG_COLLECTIONS).join(', ')}`
        });
    }

    return addConfigItem(req, res, field);
};

// @desc    Update an item in a configuration list
// @route   PUT /api/config/:type/:id
// @access  Private (org:config / platform:config)
exports.updateConfigEntry = async (req, res) => {
    try {
        const field = CONFIG_COLLECTIONS[req.params.type];
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

        const { _id, ...updates } = req.body;
        Object.assign(item, updates);
        await config.save();

        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Update Config Entry Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Delete an item from a configuration list
// @route   DELETE /api/config/:type/:id
// @access  Private (org:config / platform:config)
exports.deleteConfigItem = async (req, res) => {
    try {
        const field = CONFIG_COLLECTIONS[req.params.type];
        if (!field) {
            return res.status(404).json({ success: false, message: 'Unknown configuration list' });
        }

        const config = await resolveConfiguration(req, { create: false });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Configuration not found' });
        }

        const before = (config[field] || []).length;
        config[field] = (config[field] || []).filter(item => item._id.toString() !== req.params.id);

        if (config[field].length === before) {
            return res.status(404).json({ success: false, message: 'Configuration item not found' });
        }

        await config.save();
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error('Delete Config Item Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

module.exports.CONFIG_COLLECTIONS = CONFIG_COLLECTIONS;
module.exports.PERSONAL_ATTRIBUTE_COLLECTIONS = PERSONAL_ATTRIBUTE_COLLECTIONS;
