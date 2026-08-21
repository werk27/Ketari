const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { userCan, capabilitiesFor, ORG_ROLES } = require('../config/permissions');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id);
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        if (req.user.status === 'inactive') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated'
            });
        }
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route'
        });
    }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        const userRole = req.user?.role;

        if (!userRole || !roles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: `User role ${userRole} is not authorized to access this route`
            });
        }
        next();
    };
};

/**
 * Capability-based authorization.
 * Preferred over role checks: it encodes the business rules from the role matrix,
 * so a role can never silently gain another role's responsibilities.
 */
exports.can = (...capabilities) => {
    return (req, res, next) => {
        const granted = capabilities.every(capability => userCan(req.user, capability));

        if (!granted) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to perform this action'
            });
        }
        next();
    };
};

/**
 * Tenant guard: resolves the employer organization the request operates within
 * and exposes it as req.employerId. Every recruitment query must be filtered by
 * this value so Employer A can never read or modify Employer B's data.
 */
exports.withEmployerScope = async (req, res, next) => {
    const user = req.user;

    if (!user || !ORG_ROLES.includes(user.role)) {
        return res.status(403).json({
            success: false,
            message: 'This route requires an organization membership'
        });
    }

    if (!user.employer) {
        return res.status(403).json({
            success: false,
            message: 'Your account is not linked to an organization. Contact your employer administrator.'
        });
    }

    req.employerId = user.employer;
    next();
};

/** Expose the caller's effective capabilities (used by the frontend to build navigation). */
exports.attachCapabilities = (req, res, next) => {
    req.capabilities = capabilitiesFor(req.user);
    next();
};

/**
 * Populates req.user when a valid token is present but never rejects the request.
 * Used on public endpoints that reveal extra data to authorised organization members.
 */
exports.optionalAuth = async (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer')) {
        return next();
    }

    try {
        const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user && user.status !== 'inactive') {
            req.user = user;
        }
    } catch (error) {
        // Anonymous access remains valid on these routes.
    }

    next();
};