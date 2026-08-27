const mongoose = require('mongoose');

const ConfigurationSchema = new mongoose.Schema({
    // Owning organization. Each employer configures its own departments,
    // positions, skills and policies. A document with employer: null holds the
    // platform-wide defaults maintained by the System Administrator.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },

    // Organization Info
    organization: {
        name: { type: String, default: '' },
        address: { type: String, default: '' },
        phone: { type: String, default: '' },
        email: { type: String, default: '' },
        website: { type: String, default: '' },
        logo: { type: String, default: '' },
        taxId: { type: String, default: '' },
        registrationNumber: { type: String, default: '' }
    },
    
    // Organization Structure
    departments: [{
        name: { type: String, required: true },
        code: { type: String, default: '' },
        description: { type: String },
        parentDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Configuration' },
        manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Positions - the department a position belongs to is mandatory: a
    // Position is meaningless without a real, configured Department. `rank`
    // optionally points at one of the organization's own (global, reusable)
    // Position Ranks below - both are stored as the referenced sub-document's
    // own _id, resolved and validated in configController rather than through
    // a Mongoose `ref` populate (they live inside this same document, not a
    // separate collection).
    positions: [{
        title: { type: String, required: true },
        code: { type: String, default: '' },
        department: { type: mongoose.Schema.Types.ObjectId, required: true },
        rank: { type: mongoose.Schema.Types.ObjectId, default: null },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Position Ranks - global, reusable across every position (e.g. "Senior"
    // applies to many positions), not owned by a single one. `salary` is ONE
    // fixed amount for that rank - never a min/max range - matching the same
    // "one fixed figure" rule already enforced for vacancy salaries (Job.salary).
    positionRanks: [{
        name: { type: String, required: true },
        level: { type: Number },
        salary: { type: Number, min: 0 },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Job Titles - a standalone HR reference list. Deliberately NOT required
    // to belong to a Department: unlike Position (used by Job Requisitions),
    // nothing in the system currently links a Job Title to a Department, so
    // forcing that choice here would be a relationship the business model
    // doesn't actually have.
    jobTitles: [{
        name: { type: String, required: true },
        code: { type: String, default: '' },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Skills
    skills: [{
        name: { type: String, required: true },
        category: { type: String, enum: ['technical', 'soft', 'language', 'other'], default: 'technical' },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Languages
    languages: [{
        name: { type: String, required: true },
        code: { type: String },
        proficiencyLevels: [{ type: String, enum: ['Basic', 'Intermediate', 'Fluent', 'Native'] }],
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Employment Status
    employmentStatus: [{
        name: { type: String, required: true },
        type: { type: String, enum: ['active', 'inactive', 'terminated', 'on_leave'] },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    
    // Education Levels
    educationLevels: [{
        name: { type: String, required: true },
        level: { type: Number },
        description: { type: String },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // ============================================
    // LOOKUPS PREVIOUSLY MISSING FROM THIS SCHEMA
    //
    // The configuration controller has always written to these arrays, but they
    // were never declared here. Mongoose strict mode therefore refused to read
    // them back, so every value saved through these endpoints was invisible to
    // the application even when present in MongoDB.
    // ============================================

    // Licenses / professional certifications
    licenses: [{
        name: { type: String, required: true },
        issuingBody: { type: String, default: '' },
        description: { type: String, default: '' },
        validityPeriod: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Leave types and their policy allowances
    leaveTypes: [{
        name: { type: String, required: true },
        code: { type: String, default: '' },
        daysPerYear: { type: Number, default: 0 },
        paid: { type: Boolean, default: true },
        carryOver: { type: Boolean, default: false },
        requiresAttachment: { type: Boolean, default: false },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Training types
    trainingTypes: [{
        name: { type: String, required: true },
        category: { type: String, default: '' },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Termination reasons
    terminationReasons: [{
        name: { type: String, required: true },
        category: { type: String, default: '' },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Salary deduction types
    deductionTypes: [{
        name: { type: String, required: true },
        percentage: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
        description: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Organization partners - a partner organization this employer works
    // with. The Admin platform-defaults screen already had an implied set of
    // partner types (client/vendor/government/ngo/other) in its UI before
    // this enum existed at the schema level - reused here rather than
    // inventing a new list, and now also exported as PARTNER_TYPES below so
    // every screen (including the Employer-facing Configuration page) uses
    // the same authoritative set instead of duplicating it.
    partners: [{
        name: { type: String, required: true },
        type: {
            type: String,
            enum: ['client', 'vendor', 'government', 'ngo', 'other'],
            required: true
        },
        contactPerson: { type: String, default: '' },
        email: { type: String, default: '' },
        phone: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Nations / nationalities
    nations: [{
        name: { type: String, required: true },
        code: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // Personal titles (Mr, Mrs, Dr, ...)
    titles: [{
        name: { type: String, required: true },
        abbreviation: { type: String, default: '' },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],

    // ============================================
    // PERSONAL-ATTRIBUTE LOOKUPS
    //
    // These exist only as selectable option lists for an employee profile.
    // They are NOT recruitment criteria and must never be required when
    // creating a vacancy or applying for a job.
    // ============================================
    religions: [{
        name: { type: String, required: true },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    maritalStatus: [{
        name: { type: String, required: true },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }],
    bloodTypes: [{
        name: { type: String, required: true },
        status: { type: String, enum: ['active', 'inactive'], default: 'active' }
    }]
}, {
    timestamps: true
});

// One configuration document per organization (plus one platform-default with employer: null).
ConfigurationSchema.index({ employer: 1 }, { unique: true });

/** Human labels for the fixed Partner Type list (see the `partners.type` enum above). */
const PARTNER_TYPES = [
    { value: 'client', label: 'Client' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'government', label: 'Government' },
    { value: 'ngo', label: 'NGO' },
    { value: 'other', label: 'Other' }
];

module.exports = mongoose.model('Configuration', ConfigurationSchema);
module.exports.PARTNER_TYPES = PARTNER_TYPES;