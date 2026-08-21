const mongoose = require('mongoose');

const EmployeeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // ✅ Removed required: true - user can be null
        default: null
    },
    // Owning organization. Every HR record belongs to exactly one employer so
    // Employer A can never read or modify Employer B's staff data.
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    employeeId: {
        type: String,
        required: true
    },
    personalInfo: {
        title: { type: String, default: '' },
        firstName: { type: String, required: true },
        middleName: { type: String, default: '' },
        lastName: { type: String, required: true },
        dateOfBirth: { type: Date, default: null },
        gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
        maritalStatus: { type: String, default: '' },
        nationality: { type: String, default: '' },
        religion: { type: String, default: '' },
        bloodType: { type: String, default: '' },
        profilePhoto: { type: String, default: '' }
    },
    contactInfo: {
        phone: { type: String, default: '' },
        mobile: { type: String, default: '' },
        email: { type: String, default: '' },
        personalEmail: { type: String, default: '' },
        address: {
            street: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            country: { type: String, default: '' },
            postalCode: { type: String, default: '' }
        },
        emergencyContact: {
            name: { type: String, default: '' },
            relationship: { type: String, default: '' },
            phone: { type: String, default: '' },
            mobile: { type: String, default: '' }
        }
    },
    employmentInfo: {
        department: { type: mongoose.Schema.Types.ObjectId, ref: 'Configuration', default: null },
        position: { type: mongoose.Schema.Types.ObjectId, ref: 'Configuration', default: null },
        jobTitle: { type: String, default: '' },
        employmentStatus: { type: String, default: 'active' },
        hireDate: { type: Date, default: Date.now },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        terminationReason: { type: String, default: '' },
        terminationDate: { type: Date, default: null },
        supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        workLocation: { type: String, default: '' },
        workSchedule: {
            days: [{ type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }],
            startTime: { type: String, default: '' },
            endTime: { type: String, default: '' }
        }
    },
    compensation: {
        salary: { type: Number, default: 0 },
        currency: { type: String, default: 'ETB' },
        salaryType: { type: String, enum: ['monthly', 'hourly', 'annual'], default: 'monthly' },
        bankName: { type: String, default: '' },
        bankAccount: { type: String, default: '' },
        taxId: { type: String, default: '' }
    },
    documents: [{
        name: { type: String, default: '' },
        type: { type: String, enum: ['id', 'certificate', 'contract', 'other'], default: 'other' },
        fileUrl: { type: String, default: '' },
        uploadDate: { type: Date, default: Date.now },
        expiryDate: { type: Date, default: null }
    }],
    dependents: [{
        name: { type: String, default: '' },
        relationship: { type: String, default: '' },
        dateOfBirth: { type: Date, default: null },
        gender: { type: String, default: '' },
        isStudent: { type: Boolean, default: false },
        isDisabled: { type: Boolean, default: false }
    }],
    // Professional background carried over from the candidate's recruitment
    // record when they are hired. Kept here so onboarding never asks the new
    // employee to re-enter information the organization already holds.
    professional: {
        skills: [{ type: String }],
        languages: [{ type: String }],
        certifications: [{ type: String }],
        education: [{
            degree: { type: String, default: '' },
            field: { type: String, default: '' },
            institution: { type: String, default: '' },
            startYear: { type: String, default: '' },
            endYear: { type: String, default: '' }
        }],
        workExperience: [{
            title: { type: String, default: '' },
            company: { type: String, default: '' },
            startDate: { type: String, default: '' },
            endDate: { type: String, default: '' },
            description: { type: String, default: '' }
        }],
        resume: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', default: null }
    },

    // Where this employee came from, so the hire stays traceable back through
    // the recruitment pipeline.
    recruitment: {
        application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', default: null },
        job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
        appliedPosition: { type: String, default: '' },
        matchScore: { type: Number, default: null },
        hiredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        hiredAt: { type: Date, default: null }
    },

    /**
     * Onboarding workflow.
     *
     * pending_onboarding      -> profile created by hiring, employee not started
     * employee_completing     -> employee is filling in the missing details
     * under_hr_verification   -> submitted, HR Expert is checking it
     * pending_manager_approval-> HR Expert verified and forwarded it
     * approved                -> HR Manager approved
     * needs_correction        -> sent back to the employee with a note
     * complete                -> onboarding finished
     */
    onboarding: {
        status: {
            type: String,
            enum: [
                'pending_onboarding', 'employee_completing', 'under_hr_verification',
                'pending_manager_approval', 'approved', 'needs_correction', 'complete'
            ],
            default: 'pending_onboarding',
            index: true
        },
        invitedAt: { type: Date, default: null },
        submittedAt: { type: Date, default: null },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        verifiedAt: { type: Date, default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approvedAt: { type: Date, default: null },
        correctionNote: { type: String, default: '' },
        history: [{
            status: String,
            changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            changedAt: { type: Date, default: Date.now },
            note: { type: String, default: '' }
        }]
    },

    // Employment lifecycle trail: hire, promotion, transfer, status changes.
    employmentHistory: [{
        type: {
            type: String,
            enum: ['hired', 'promotion', 'transfer', 'status_change', 'other'],
            default: 'other'
        },
        jobTitle: { type: String, default: '' },
        department: { type: mongoose.Schema.Types.ObjectId, ref: 'Configuration', default: null },
        position: { type: mongoose.Schema.Types.ObjectId, ref: 'Configuration', default: null },
        employmentStatus: { type: String, default: '' },
        effectiveDate: { type: Date, default: Date.now },
        note: { type: String, default: '' },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }],

    status: {
        type: String,
        enum: ['active', 'inactive', 'terminated', 'on_leave', 'suspended', 'resigned'],
        default: 'active'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Employee IDs are unique within an organization, not across the whole platform:
// two employers may legitimately both number their first hire EMP0001.
EmployeeSchema.index({ employer: 1, employeeId: 1 }, { unique: true, sparse: true });
EmployeeSchema.index({ employer: 1, status: 1 });
EmployeeSchema.index({ employer: 1, 'onboarding.status': 1 });

/**
 * Information onboarding must collect that recruitment cannot supply.
 * `label` is what the employee sees; `has` decides whether it is filled in.
 */
const REQUIRED_ONBOARDING_FIELDS = [
    { key: 'dateOfBirth', label: 'Date of birth', has: e => !!e.personalInfo?.dateOfBirth },
    { key: 'maritalStatus', label: 'Marital status', has: e => !!e.personalInfo?.maritalStatus },
    { key: 'bloodType', label: 'Blood type', has: e => !!e.personalInfo?.bloodType },
    { key: 'nationality', label: 'Nationality', has: e => !!e.personalInfo?.nationality },
    { key: 'phone', label: 'Phone number', has: e => !!(e.contactInfo?.phone || e.contactInfo?.mobile) },
    { key: 'address', label: 'Residential address', has: e => !!(e.contactInfo?.address?.city && e.contactInfo?.address?.country) },
    { key: 'emergencyContact', label: 'Emergency contact', has: e => !!(e.contactInfo?.emergencyContact?.name && e.contactInfo?.emergencyContact?.phone) },
    { key: 'identification', label: 'Identification document', has: e => (e.documents || []).some(d => d.type === 'id') }
];

/**
 * Profile completion summary: what is already known (mostly carried over from
 * recruitment), what is still missing, and where the record sits in the
 * verification/approval workflow.
 */
EmployeeSchema.methods.completionSummary = function () {
    const completed = [];
    const missing = [];

    for (const field of REQUIRED_ONBOARDING_FIELDS) {
        (field.has(this) ? completed : missing).push({ key: field.key, label: field.label });
    }

    const total = REQUIRED_ONBOARDING_FIELDS.length;
    const percent = total === 0 ? 100 : Math.round((completed.length / total) * 100);

    return {
        percent,
        completed,
        missing,
        transferred: {
            fullName: [this.personalInfo?.firstName, this.personalInfo?.middleName, this.personalInfo?.lastName]
                .filter(Boolean).join(' '),
            email: this.contactInfo?.email || '',
            skills: this.professional?.skills || [],
            languages: this.professional?.languages || [],
            education: (this.professional?.education || []).length,
            workExperience: (this.professional?.workExperience || []).length,
            hasResume: !!this.professional?.resume,
            appliedPosition: this.recruitment?.appliedPosition || ''
        },
        documents: (this.documents || []).map(d => ({ name: d.name, type: d.type })),
        onboardingStatus: this.onboarding?.status || 'pending_onboarding',
        verified: !!this.onboarding?.verifiedAt,
        approved: !!this.onboarding?.approvedAt,
        correctionNote: this.onboarding?.correctionNote || ''
    };
};

module.exports = mongoose.model('Employee', EmployeeSchema);