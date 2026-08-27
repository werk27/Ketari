const Resume = require('../models/Resume');
const Application = require('../models/Application');
const Employee = require('../models/Employee');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');

const RESUME_CONTENT_TYPES = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

/**
 * Whether the caller may read this CV file.
 *
 * A CV belongs to the candidate. It also reaches an HR Expert, HR Manager or
 * Employer, but only once there is a real relationship: the candidate applied
 * to that organization, or was hired by it. Browsing the wider candidate pool
 * (AI matching / candidate list) never grants this - see candidatePrivacy.js,
 * which deliberately keeps even contact details hidden until an application
 * exists. An administrator gets no special access either: recruitment data is
 * not a platform administration concern.
 */
const canReadResume = async (resume, user) => {
    if (resume.user.toString() === user.id) return true;

    if (!['hr_expert', 'hr_manager', 'employer'].includes(user.role) || !user.employer) {
        return false;
    }

    const employerId = user.employer;
    const [appliedHere, employedHere] = await Promise.all([
        Application.exists({ resume: resume._id, employer: employerId }),
        Employee.exists({ 'professional.resume': resume._id, employer: employerId })
    ]);

    return !!(appliedHere || employedHere);
};

// @desc    Upload resume
// @route   POST /api/resumes
// @access  Private (Job Seeker)
exports.uploadResume = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        const fileType = req.file.originalname.split('.').pop().toLowerCase();
        if (!['pdf', 'docx'].includes(fileType)) {
            return res.status(400).json({
                success: false,
                message: 'Only PDF and DOCX files are supported'
            });
        }

        let parsedData = {
            name: req.body.name || '',
            email: '',
            phone: '',
            education: [],
            workExperience: [],
            skills: [],
            certifications: [],
            languages: []
        };

        // Extract text and call Python AI service
        try {
            let text = '';
            if (req.file.mimetype === 'application/pdf') {
                const dataBuffer = fs.readFileSync(req.file.path);
                const data = await pdf(dataBuffer);
                text = data.text;
            } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const result = await mammoth.extractRawText({path: req.file.path});
                text = result.value;
            }

            if (text) {
                // Call Python AI Service
                const aiResponse = await axios.post('http://localhost:5001/api/parse-resume', { text });
                if (aiResponse.data && aiResponse.data.success && aiResponse.data.data) {
                    const aiData = aiResponse.data.data;
                    parsedData.name = aiData.name || parsedData.name;
                    parsedData.email = aiData.email || '';
                    parsedData.skills = aiData.skills || [];
                    parsedData.education = aiData.education || [];
                    parsedData.workExperience = aiData.work_experience || [];
                }
            }
        } catch (aiError) {
            console.error('AI Parsing Error:', aiError.message);
            // Non-fatal error, we still save the resume
        }

        const resume = await Resume.create({
            user: req.user.id,
            fileName: req.file.originalname,
            filePath: req.file.path,
            fileType: fileType,
            parsedData: parsedData
        });

        const resumeCount = await Resume.countDocuments({ user: req.user.id });
        if (resumeCount === 1) {
            resume.isDefault = true;
            await resume.save();
        }

        res.status(201).json({
            success: true,
            resume
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Get user's resumes
// @route   GET /api/resumes
// @access  Private (Job Seeker)
exports.getResumes = async (req, res) => {
    try {
        const resumes = await Resume.find({ user: req.user.id }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            resumes
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Set default resume
// @route   PUT /api/resumes/:id/default
// @access  Private (Job Seeker)
exports.setDefaultResume = async (req, res) => {
    try {
        const resume = await Resume.findById(req.params.id);
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found'
            });
        }

        if (resume.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        await Resume.updateMany({ user: req.user.id }, { isDefault: false });

        resume.isDefault = true;
        await resume.save();

        res.status(200).json({
            success: true,
            resume
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Delete resume
// @route   DELETE /api/resumes/:id
// @access  Private (Job Seeker)
exports.deleteResume = async (req, res) => {
    try {
        const resume = await Resume.findById(req.params.id);
        if (!resume) {
            return res.status(404).json({
                success: false,
                message: 'Resume not found'
            });
        }

        if (resume.user.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        if (fs.existsSync(resume.filePath)) {
            fs.unlinkSync(resume.filePath);
        }

        await resume.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Resume deleted successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};

// @desc    Stream the CV file itself (not just its parsed data)
// @route   GET /api/resumes/:id/file
// @access  Private (the owning candidate, or an HR user from an organization
//          the candidate applied to / was hired by)
exports.viewResumeFile = async (req, res) => {
    try {
        const resume = await Resume.findById(req.params.id);
        if (!resume) {
            return res.status(404).json({ success: false, message: 'Resume not found' });
        }

        if (!(await canReadResume(resume, req.user))) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this CV'
            });
        }

        if (!fs.existsSync(resume.filePath)) {
            return res.status(404).json({ success: false, message: 'The stored CV file is missing' });
        }

        res.setHeader('Content-Type', RESUME_CONTENT_TYPES[resume.fileType] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${resume.fileName}"`);
        fs.createReadStream(resume.filePath).pipe(res);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};