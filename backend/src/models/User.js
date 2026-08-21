const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a name'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['candidate', 'employee', 'hr_expert', 'hr_manager', 'admin', 'employer'],
        default: 'candidate'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'active'
    },

    // ============================================
    // ORGANIZATION MEMBERSHIP
    // ============================================
    // The organization this user belongs to.
    // - employer  : the account that owns the organization
    // - hr_expert  / hr_manager : staff members of the organization
    // - candidate / admin : null (platform-level or independent users)
    employer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employer',
        default: null,
        index: true
    },
    department: {
        type: String,
        default: ''
    },
    jobTitle: {
        type: String,
        default: ''
    },
    // Optional per-user permission overrides granted by the employer.
    // Base capabilities always come from the role; these only extend it.
    permissions: {
        type: [String],
        default: []
    },
    profile: {
        phone: {
            type: String,
            default: ''
        },
        location: {
            type: String,
            default: ''
        },
        bio: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: ''
        },
        availabilityStatus: {
            type: String,
            enum: ['Available now', 'Busy', 'Available part-time', 'Not available'],
            default: 'Available now'
        },
        expectedSalary: {
            amount: { type: Number, default: 0 },
            currency: { type: String, default: 'ETB' },
            rateType: { type: String, enum: ['Hourly', 'Fixed', 'Monthly'], default: 'Hourly' }
        },
        successRate: {
            type: Number,
            default: 100 // mock initial percentage
        },
        rating: {
            score: { type: Number, default: 0 },
            reviews: { type: Number, default: 0 }
        },
        savedJobs: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Job'
        }],
        profilePhoto: {
            type: String,
            default: null
        },
        skills: {
            type: [String],
            default: []
        },
        certifications: {
            type: [String],
            default: []
        },
        languages: {
            type: [String],
            default: []
        },
        education: [{
            institution: {
                type: String,
                default: ''
            },
            degree: {
                type: String,
                default: ''
            },
            field: {
                type: String,
                default: ''
            },
            graduationYear: {
                type: Number,
                default: null
            }
        }],
        workExperience: [{
            company: {
                type: String,
                default: ''
            },
            position: {
                type: String,
                default: ''
            },
            startDate: {
                type: Date,
                default: null
            },
            endDate: {
                type: Date,
                default: null
            },
            description: {
                type: String,
                default: ''
            },
            currentlyWorking: {
                type: Boolean,
                default: false
            }
        }]
    },
    company: {
        name: {
            type: String,
            default: ''
        },
        description: {
            type: String,
            default: ''
        },
        website: {
            type: String,
            default: ''
        },
        location: {
            type: String,
            default: ''
        }
    },
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordExpire: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        // Calling next() explicitly keeps the hook correct for every Mongoose
        // middleware style; without it the chain relied on promise resolution
        // alone, which is easy to break with a later refactor.
        return next();
    } catch (error) {
        return next(error);
    }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
    // `password` is `select: false`, so a document fetched without `+password`
    // has no hash. bcrypt.compare throws on undefined, which turned a normal
    // failed comparison into a 500 "Login failed" - return false instead.
    if (!this.password || typeof enteredPassword !== 'string' || !enteredPassword) {
        return false;
    }
    return bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password reset token
UserSchema.methods.getResetPasswordToken = function() {
    // Generate token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // Hash token and set to resetPasswordToken field
    this.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Set expire (10 minutes)
    this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    return resetToken;
};

module.exports = mongoose.model('User', UserSchema);