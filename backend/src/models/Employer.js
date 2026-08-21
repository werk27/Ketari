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
        enum: ['pending', 'active', 'suspended', 'inactive', 'rejected'],
        default: 'pending'
    },

    // ============================================
    // VERIFICATION EVIDENCE
    // ============================================
    // An administrator approves an organization before it may publish vacancies
    // or add team members. Without recorded evidence that decision would rest on
    // nothing more than the name the applicant typed, so the identifying details
    // and their supporting documents are captured here.
    organizationType: {
        type: String,
        enum: ['private_company', 'government', 'ngo', 'sole_proprietor', 'other'],
        default: 'private_company'
    },
    /** Registered name exactly as it appears on the trade licence. */
    legalName: {
        type: String,
        default: '',
        trim: true
    },
    /** Tax Identification Number. */
    tin: {
        type: String,
        default: '',
        trim: true
    },
    businessLicenceNumber: {
        type: String,
        default: '',
        trim: true
    },
    licenceExpiryDate: {
        type: Date,
        default: null
    },
    /**
     * Scans of the licence, TIN certificate or authorisation letter.
     * `path` points into private-uploads, never the statically served folder,
     * and is streamed by an authenticated route.
     */
    verificationDocuments: [{
        label: { type: String, default: 'Document' },
        path: { type: String, required: true },
        originalName: { type: String, default: '' },
        mimeType: { type: String, default: '' },
        size: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now }
    }],
    submittedForReviewAt: {
        type: Date,
        default: null
    },
    /** Why an administrator rejected the application, shown to the employer. */
    rejectionReason: {
        type: String,
        default: ''
    },
    reviewedAt: {
        type: Date,
        default: null
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
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

/**
 * The checks an administrator works through before approving an organization.
 *
 * Returned to both sides so the rules are stated once: the employer sees what
 * is still missing, and the administrator reviews the same list rather than
 * approving on a name alone. Government bodies and NGOs are not issued a trade
 * licence, so they are asked for their authorising letter instead.
 */
EmployerSchema.methods.verificationChecklist = function () {
    const licenceExempt = ['government', 'ngo'].includes(this.organizationType);
    const docs = this.verificationDocuments || [];
    const expiry = this.licenceExpiryDate ? new Date(this.licenceExpiryDate) : null;
    const contactEmail = this.contact?.email || '';
    const domain = contactEmail.split('@')[1] || '';
    const freeEmail = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com']
        .includes(domain.toLowerCase());

    return [
        {
            key: 'legalName',
            label: 'Registered legal name provided',
            met: Boolean(this.legalName && this.legalName.trim()),
            detail: this.legalName || 'Not provided'
        },
        {
            key: 'tin',
            label: 'Tax Identification Number provided',
            met: Boolean(this.tin && this.tin.trim()),
            detail: this.tin || 'Not provided'
        },
        {
            key: 'licence',
            label: licenceExempt
                ? 'Authorising letter reference provided'
                : 'Business / trade licence number provided',
            met: licenceExempt || Boolean(this.businessLicenceNumber && this.businessLicenceNumber.trim()),
            detail: this.businessLicenceNumber || (licenceExempt ? 'Not required for this organization type' : 'Not provided')
        },
        {
            key: 'licenceCurrent',
            label: 'Licence has not expired',
            met: licenceExempt || (expiry ? expiry.getTime() > Date.now() : false),
            detail: expiry
                ? `${expiry.toISOString().slice(0, 10)}${expiry.getTime() > Date.now() ? '' : ' - EXPIRED'}`
                : (licenceExempt ? 'Not required' : 'No expiry date recorded')
        },
        {
            key: 'documents',
            label: 'Supporting document uploaded',
            met: docs.length > 0,
            detail: docs.length ? `${docs.length} file(s)` : 'None uploaded'
        },
        {
            key: 'contact',
            label: 'Contact phone provided',
            met: Boolean(this.contact?.phone && this.contact.phone.trim()),
            detail: this.contact?.phone || 'Not provided'
        },
        {
            key: 'address',
            label: 'Physical address provided',
            met: Boolean(this.address?.city && this.address.city.trim()),
            detail: [this.address?.street, this.address?.city, this.address?.region]
                .filter(Boolean).join(', ') || 'Not provided'
        },
        {
            key: 'representative',
            label: 'Representative uses an organization email domain',
            met: Boolean(domain) && !freeEmail,
            // A free address is a prompt to confirm authority by other means,
            // not an automatic rejection - many small firms have no domain.
            detail: contactEmail
                ? (freeEmail ? `${contactEmail} - free email, confirm authority separately` : contactEmail)
                : 'No contact email'
        }
    ];
};

module.exports = mongoose.model('Employer', EmployerSchema);
