const User = require('../models/User');
const Employer = require('../models/Employer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { capabilitiesFor } = require('../config/permissions');

// Generate JWT Token
// JWT_EXPIRE is optional: when it is missing jwt.sign throws, which would reject
// a login *after* the password was already verified. A sane default keeps a
// correct password working on a partially configured environment.
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

const generateToken = (id) => {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured on the server');
    }
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: JWT_EXPIRE
    });
};

/** Escape a value so it can be used inside a RegExp as a literal string. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when an error means "the database could not answer", not "the request was
 * wrong". These deserve a 503 and a clear message rather than a generic 500 that
 * users read as "my password is wrong".
 */
const isDatabaseUnavailable = (error) => (
    error &&
    (['MongooseServerSelectionError', 'MongoNetworkError', 'MongoTimeoutError'].includes(error.name) ||
        /buffering timed out|failed to connect|connection .*closed|topology/i.test(error.message || ''))
);

/**
 * Shape the authenticated user payload consistently across auth responses.
 *
 * Login, register and /auth/me all return this exact shape so the client never
 * has to re-fetch the profile just to get a complete user object. Both `id` and
 * `_id` are exposed because call sites in the UI use either spelling.
 */
const buildAuthPayload = (user) => ({
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status || 'active',
    employer: user.employer || null,
    department: user.department || '',
    jobTitle: user.jobTitle || '',
    profile: user.profile,
    company: user.company,
    capabilities: capabilitiesFor(user)
});

/** The organization a user belongs to, using one projection everywhere. */
const loadOrganization = async (user) => {
    if (!user.employer) return null;
    return Employer.findById(user.employer).select('name logo industry status slug');
};

// @desc    Register user
// @route   POST /api/auth/register
// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstErrorMsg = errors.array().map(e => e.msg).join(', ');
            return res.status(400).json({
                success: false,
                message: firstErrorMsg || 'Invalid input data',
                errors: errors.array()
            });
        }

        const { name, email, password, role, profile, company } = req.body;
        const normalizedEmail = email ? email.trim().toLowerCase() : '';

        // Check if user exists (case-insensitive)
        const userExists = await User.findOne({ 
            email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') } 
        });

        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'A user with this email address already exists'
            });
        }

        // Force role to candidate for public signups, unless they explicitly choose employer
        const assignedRole = (role === 'employer') ? 'employer' : 'candidate';

        // Create user
        const user = await User.create({
            name,
            email: normalizedEmail,
            password,
            role: assignedRole,
            status: 'active',
            profile: profile || {},
            company: company || {}
        });

        // An employer signup creates the organization it will own. HR Experts and
        // HR Managers are later added as members of this organization by the employer.
        if (assignedRole === 'employer') {
            const org = company || {};
            const organization = await Employer.create({
                name: org.name ? org.name : `${name}'s Organization`,
                legalName: org.legalName || org.name || '',
                organizationType: org.organizationType || 'private_company',
                tin: org.tin || '',
                businessLicenceNumber: org.businessLicenceNumber || '',
                licenceExpiryDate: org.licenceExpiryDate || null,
                industry: org.industry || '',
                description: org.description || '',
                website: org.website || '',
                contact: {
                    email: org.contactEmail || normalizedEmail,
                    phone: org.phone || '',
                    contactPerson: name
                },
                address: {
                    street: org.street || '',
                    city: org.city || org.location || '',
                    region: org.region || ''
                },
                owner: user._id,
                status: 'pending'
            });

            user.employer = organization._id;
            await user.save({ validateBeforeSave: false });
        }

        // Generate token
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            user: buildAuthPayload(user),
            organization: await loadOrganization(user)
        });
    } catch (error) {
        console.error('Registration Error:', error);

        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({
                success: false,
                message: 'The database is currently unreachable. Please try again in a moment.'
            });
        }

        // A racing duplicate signup hits the unique index instead of the check above.
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A user with this email address already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Server Error during registration'
        });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const firstErrorMsg = errors.array().map(e => e.msg).join(', ');
            return res.status(400).json({
                success: false,
                message: firstErrorMsg || 'Invalid input data',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;
        if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Normalize email to lowercase
        const normalizedEmail = email.trim().toLowerCase();

        // Case-insensitive lookup. Legacy records may exist under different
        // capitalisations of the same address, so every match is considered and
        // the one whose password verifies wins. Limiting this query can skip the
        // actual account when old duplicate records exist.
        const candidates = await User.find({
            email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') }
        })
            .select('+password')
            .sort({ updatedAt: -1, createdAt: -1 });

        if (candidates.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        let user = null;
        for (const candidate of candidates) {
            // eslint-disable-next-line no-await-in-loop
            if (await candidate.matchPassword(password)) {
                user = candidate;
                break;
            }
        }

        if (!user) {
            // A record with no usable hash can never authenticate. It is logged
            // for the operator, but the client always gets the same message so
            // the endpoint cannot be used to discover which emails exist.
            const hasUsableHash = candidates.some(c => typeof c.password === 'string' && c.password.length > 0);
            if (!hasUsableHash) {
                console.warn(`Login blocked: account ${normalizedEmail} has no usable password hash.`);
            }

            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check account status
        if (user.status === 'inactive') {
            return res.status(401).json({
                success: false,
                message: 'Your account has been deactivated. Please contact the System Administrator.'
            });
        }

        // Generate token
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            token,
            user: buildAuthPayload(user),
            organization: await loadOrganization(user)
        });
    } catch (error) {
        console.error('Login Error:', error);

        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({
                success: false,
                message: 'The database is currently unreachable. Please try again in a moment.'
            });
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Server Error during login'
        });
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            user: buildAuthPayload(user),
            organization: await loadOrganization(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Update user profile
// @route   PUT /api/auth/updateprofile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, profile, company } = req.body;
        const user = await User.findById(req.user.id);

        if (name) user.name = name;
        if (profile) {
            const existingProfile = user.profile ? (user.profile.toObject ? user.profile.toObject() : user.profile) : {};
            user.profile = { ...existingProfile, ...profile };
            user.markModified('profile');
        }
        if (company) {
            const existingCompany = user.company ? (user.company.toObject ? user.company.toObject() : user.company) : {};
            user.company = { ...existingCompany, ...company };
            user.markModified('company');
        }

        await user.save();

        res.status(200).json({
            success: true,
            user: buildAuthPayload(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// ============================================
// PASSWORD RESET FUNCTIONALITY
// ============================================

// @desc    Forgot password - Generate reset token
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Validate email
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an email address'
            });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No user found with this email'
            });
        }

        // Get reset token
        const resetToken = user.getResetPasswordToken();
        await user.save({ validateBeforeSave: false });

        // Create reset URL (for frontend)
        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;

        // TODO: Send email with reset URL
        // For now, return the token in response for testing
        res.status(200).json({
            success: true,
            message: 'Password reset token generated. Check your email for the reset link.',
            resetToken: resetToken,
            resetUrl: resetUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Reset password
// @route   PUT /api/auth/resetpassword/:resetToken
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        const { password } = req.body;

        // Validate password
        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a password with at least 6 characters'
            });
        }

        // Hash the token from URL
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resetToken)
            .digest('hex');

        // Find user with matching token and not expired
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token. Please request a new password reset.'
            });
        }

        // Set new password
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        // Generate new JWT token for immediate login
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profile: user.profile,
                company: user.company
            },
            message: 'Password reset successful! You are now logged in.'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Verify reset token
// @route   GET /api/auth/verifyresettoken/:resetToken
// @access  Public
exports.verifyResetToken = async (req, res) => {
    try {
        // Hash the token from URL
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resetToken)
            .digest('hex');

        // Find user with matching token and not expired
        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Token is valid',
            email: user.email
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

/**
 * Look up a pending employee activation without consuming it, so the page can
 * greet the person by name and fail early on a stale link.
 */
// @desc    Check an employee activation token
// @route   GET /api/auth/activate-employee/:token
// @access  Public
exports.verifyEmployeeActivation = async (req, res) => {
    try {
        const user = await User.findOne({
            employeeActivationToken: User.hashActivationToken(req.params.token),
            employeeActivationExpire: { $gt: Date.now() }
        }).select('name email pendingEmployerActivation');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'This activation link is invalid or has expired. Ask your HR team to send a new one.'
            });
        }

        const organization = user.pendingEmployerActivation
            ? await Employer.findById(user.pendingEmployerActivation).select('name')
            : null;

        res.status(200).json({
            success: true,
            name: user.name,
            email: user.email,
            organization: organization ? organization.name : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

/**
 * Complete employee activation.
 *
 * Being hired records the employment but does not grant the employee
 * workspace; this is where that happens, on an action the person takes
 * themselves. Setting a password is optional because the account already
 * exists from when they applied - they are not a new user, and forcing a reset
 * on someone who remembers their password only adds a way to get locked out.
 */
// @desc    Activate a hired candidate's employee account
// @route   POST /api/auth/activate-employee/:token
// @access  Public
exports.activateEmployee = async (req, res) => {
    try {
        const { password } = req.body;

        if (password !== undefined && String(password).length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A new password must be at least 6 characters.'
            });
        }

        const user = await User.findOne({
            employeeActivationToken: User.hashActivationToken(req.params.token),
            employeeActivationExpire: { $gt: Date.now() }
        }).select('+password +employeeActivationToken +employeeActivationExpire');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'This activation link is invalid or has expired. Ask your HR team to send a new one.'
            });
        }

        const employerId = user.pendingEmployerActivation;
        if (!employerId) {
            return res.status(400).json({
                success: false,
                message: 'This activation is not linked to an organization. Contact your HR team.'
            });
        }

        // A hire only ever grants the employee role. Any other role would hand
        // over a workspace the person was never given, so this link can never
        // widen access beyond the employee portal.
        user.role = 'employee';
        user.employer = employerId;
        user.status = 'active';

        if (password) {
            user.password = password; // the pre-save hook hashes it
        }

        // Single use.
        user.employeeActivationToken = null;
        user.employeeActivationExpire = null;
        user.pendingEmployerActivation = null;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Your employee account is active.',
            token: generateToken(user._id),
            user: buildAuthPayload(user),
            organization: await loadOrganization(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};