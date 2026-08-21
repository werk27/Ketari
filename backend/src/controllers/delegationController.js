const Delegation = require('../models/Delegation');
const User = require('../models/User');

/**
 * Delegation of responsibility (spec §15).
 *
 * A delegation temporarily transfers responsibility from one member of an
 * organization to another - for example while the delegator is on leave.
 * Delegations never cross an organization boundary and expire automatically.
 */

/** Mark any delegation whose end date has passed as completed. */
const expireOverdueDelegations = async (employerId) => {
    await Delegation.updateMany(
        { employer: employerId, status: 'active', endDate: { $lt: new Date() } },
        { $set: { status: 'completed', completedDate: new Date() } }
    );
};

// @desc    Create a delegation
// @route   POST /api/delegations
// @access  Private (delegation:create)
exports.createDelegation = async (req, res) => {
    try {
        const { delegate, type, title, description, startDate, endDate, permissions, notes } = req.body;

        if (!delegate || !type || !title || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Delegate, type, title, start date and end date are required'
            });
        }

        if (new Date(endDate) < new Date(startDate)) {
            return res.status(400).json({
                success: false,
                message: 'The end date cannot be before the start date'
            });
        }

        if (delegate === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delegate responsibility to yourself'
            });
        }

        // The delegate must belong to the same organization.
        const delegateUser = await User.findById(delegate).select('employer status name');
        const sameOrg = delegateUser && delegateUser.employer
            && delegateUser.employer.toString() === req.employerId.toString();

        if (!sameOrg) {
            return res.status(400).json({
                success: false,
                message: 'The delegate must be a member of your organization'
            });
        }

        if (delegateUser.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'The delegate account is not active'
            });
        }

        const delegation = await Delegation.create({
            employer: req.employerId,
            delegator: req.user.id,
            delegate,
            type,
            title,
            description: description || '',
            startDate,
            endDate,
            permissions: permissions || [],
            notes: notes || '',
            // Active immediately when the period has already started.
            status: new Date(startDate) <= new Date() ? 'active' : 'pending'
        });

        res.status(201).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Create Delegation Error:', error);
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

// @desc    Delegations involving the signed-in user
// @route   GET /api/delegations
// @access  Private
exports.getDelegations = async (req, res) => {
    try {
        if (req.user.employer) await expireOverdueDelegations(req.user.employer);

        const delegations = await Delegation.find({
            $or: [{ delegator: req.user.id }, { delegate: req.user.id }]
        })
            .populate('delegator', 'name email')
            .populate('delegate', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: delegations });
    } catch (error) {
        console.error('Get Delegations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    All delegations within the organization
// @route   GET /api/delegations/organization
// @access  Private (delegation:view)
exports.getOrganizationDelegations = async (req, res) => {
    try {
        await expireOverdueDelegations(req.employerId);

        const query = { employer: req.employerId };
        if (req.query.status) query.status = req.query.status;

        const delegations = await Delegation.find(query)
            .populate('delegator', 'name email role')
            .populate('delegate', 'name email role')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: delegations.length, data: delegations });
    } catch (error) {
        console.error('Get Organization Delegations Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update delegation status
// @route   PUT /api/delegations/:id/status
// @access  Private (delegator or delegate)
exports.updateDelegationStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;
        const allowed = ['active', 'completed', 'revoked'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(', ')}`
            });
        }

        const delegation = await Delegation.findById(req.params.id);
        if (!delegation) {
            return res.status(404).json({ success: false, message: 'Delegation not found' });
        }

        const isDelegator = delegation.delegator.toString() === req.user.id;
        const isDelegate = delegation.delegate.toString() === req.user.id;

        if (!isDelegator && !isDelegate) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Only the delegator may withdraw a delegation they granted.
        if (status === 'revoked' && !isDelegator) {
            return res.status(403).json({
                success: false,
                message: 'Only the delegator can revoke a delegation'
            });
        }

        delegation.status = status;
        if (status === 'completed' || status === 'revoked') {
            delegation.completedDate = new Date();
        }
        if (notes) delegation.notes = notes;

        await delegation.save();

        res.status(200).json({ success: true, data: delegation });
    } catch (error) {
        console.error('Update Delegation Error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
