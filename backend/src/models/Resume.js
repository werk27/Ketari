const mongoose = require('mongoose');

const ResumeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        enum: ['pdf', 'docx'],
        required: true
    },
    parsedData: {
        name: String,
        email: String,
        phone: String,
        education: [{
            institution: String,
            degree: String,
            field: String,
            graduationYear: Number
        }],
        workExperience: [{
            company: String,
            position: String,
            startDate: String,
            endDate: String,
            description: String
        }],
        skills: [String],
        certifications: [String],
        languages: [String]
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Resume', ResumeSchema);
