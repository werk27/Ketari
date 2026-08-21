const express = require('express');
const router = express.Router();
const {
    getConfigurations,
    updateOrganization,
    addConfigEntry,
    updateConfigEntry,
    deleteConfigItem
} = require('../controllers/configController');
const { protect } = require('../middleware/auth');
const { userCan, CAPABILITIES } = require('../config/permissions');

/**
 * Resolve which configuration the caller may edit.
 *
 *   System Administrator -> the platform defaults (employer: null)
 *   Organization members -> their own organization's configuration
 *
 * This keeps platform administration and company configuration separate while
 * sharing one controller, and guarantees an employer can never reach another
 * organization's lookup data.
 */
const resolveConfigScope = (req, res, next) => {
    if (userCan(req.user, CAPABILITIES.PLATFORM_CONFIG)) {
        req.employerId = null;
        return next();
    }

    if (userCan(req.user, CAPABILITIES.ORG_CONFIG)) {
        if (!req.user.employer) {
            return res.status(403).json({
                success: false,
                message: 'Your account is not linked to an organization'
            });
        }
        req.employerId = req.user.employer;
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage configuration'
    });
};

/**
 * Read access is wider than write access: any organization member needs the
 * lookup lists to fill in forms, but only configuration owners may change them.
 */
const resolveReadScope = (req, res, next) => {
    if (userCan(req.user, CAPABILITIES.PLATFORM_CONFIG)) {
        req.employerId = null;
        return next();
    }

    if (req.user.employer) {
        req.employerId = req.user.employer;
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Your account is not linked to an organization'
    });
};

// @route   GET /api/config
// @desc    Read the applicable configuration
// @access  Private (organization members / System Administrator)
router.get('/', protect, resolveReadScope, getConfigurations);

// @route   PUT /api/config/organization
// @desc    Update organization information
// @access  Private (org:config / platform:config)
router.put('/organization', protect, resolveConfigScope, updateOrganization);

// @route   POST /api/config/:type
// @desc    Add an item to a configuration list
// @access  Private (org:config / platform:config)
router.post('/:type', protect, resolveConfigScope, addConfigEntry);

// @route   PUT /api/config/:type/:id
// @desc    Update a configuration item
// @access  Private (org:config / platform:config)
router.put('/:type/:id', protect, resolveConfigScope, updateConfigEntry);

// @route   DELETE /api/config/:type/:id
// @desc    Remove a configuration item
// @access  Private (org:config / platform:config)
router.delete('/:type/:id', protect, resolveConfigScope, deleteConfigItem);

module.exports = router;
