const mongoose = require('mongoose');

/**
 * Employer / Organization
 *
 * Represents the COMPANY that uses the recruitment platform.
 * HR Experts and HR Managers are members of an Employer - they are not employers themselves.
 * All recruitment data (vacancies, applications, interviews) is owned by an Employer,
 * which is the tenant boundary used to isolate one organization's data from another's.
 */
const EmployerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add an organization name'],
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        index: true
    },
    logo: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    industry: {
        type: String,
        default: ''
    },
    website: {
        type: String,
        default: ''
    },
    address: {
        street: { type: String, default: '' },
        city: { type: String, default: '' },
        region: { type: String, default: '' },
        country: { type: String, default: 'Ethiopia' }
    },
    contact: {
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        contactPerson: { type: String, default: '' }
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'suspended', 'inactive'],
        default: 'pending'
    },

    // The user account that owns/administers this organization (role: employer)
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    // ============================================
    // ORGANIZATION STRUCTURE (per-employer configuration)
    // ============================================
    departments: [{
        name: { type: String, required: true },
        code: { type: String, default: '' },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    positions: [{
        title: { type: String, required: true },
        department: { type: String, default: '' },
        level: { type: String, default: '' },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    jobTitles: [{
        name: { type: String, required: true },
        category: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    branches: [{
        name: { type: String, required: true },
        location: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Recruitment preferences scoped to this organization
    recruitmentSettings: {
        requireManagerApproval: { type: Boolean, default: true },
        allowSelfApproval: { type: Boolean, default: false },
        autoRunAIMatching: { type: Boolean, default: true },
        minimumMatchScore: { type: Number, default: 0, min: 0, max: 100 }
    },

    verifiedAt: {
        type: Date,
        default: null
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

EmployerSchema.pre('validate', function (next) {
    if (!this.slug && this.name) {
        const base = this.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        this.slug = `${base || 'employer'}-${this._id.toString().slice(-6)}`;
    }
    next();
});

EmployerSchema.index({ name: 'text', industry: 'text' });

module.exports = mongoose.model('Employer', EmployerSchema);
