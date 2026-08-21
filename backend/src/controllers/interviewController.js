const Interview = require('../models/Interview');
const Application = require('../models/Application');
const Job = require('../models/Job');

// @desc    Schedule an interview
// @route   POST /api/interviews
// @access  Private (HR Expert/Employer/HR Manager/Admin)
exports.scheduleInterview = async (req, res) => {
    try {
        const { applicationId, scheduledDate, time, type, locationOrLink, notes, title } = req.body;

        const application = await Application.findById(applicationId).populate('job').populate('applicant');
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }

        const interview = await Interview.create({
            job: application.job._id,
            applicant: application.applicant._id,
            application: application._id,
            interviewer: req.user.id,
            title: title || `Interview for ${application.job.title}`,
            scheduledDate: scheduledDate || new Date(),
            time: time || '10:00 AM',
            type: type || 'Online (Video Call)',
            locationOrLink: locationOrLink || '',
            notes: notes || ''
        });

        // Update application status to 'interview'
        application.status = 'interview';
        application.interviewDate = scheduledDate;
        application.interviewLocation = locationOrLink;
        application.statusHistory.push({
            status: 'interview',
            date: new Date(),
            note: `Interview scheduled for ${new Date(scheduledDate).toLocaleDateString()} at ${time}`
        });
        await application.save();

        res.status(201).json({ success: true, interview });
    } catch (error) {
        console.error('Schedule interview error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get interviews for a job
// @route   GET /api/interviews/job/:jobId
// @access  Private (HR Expert/Employer/HR Manager/Admin)
exports.getJobInterviews = async (req, res) => {
    try {
        const interviews = await Interview.find({ job: req.params.jobId })
            .populate('applicant', 'name email profile')
            .populate('interviewer', 'name email')
            .sort({ scheduledDate: 1 });

        res.status(200).json({ success: true, count: interviews.length, interviews });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Get current user's interviews (Candidate or HR)
// @route   GET /api/interviews/me
// @access  Private
exports.getMyInterviews = async (req, res) => {
    try {
        const query = req.user.role === 'candidate' || req.user.role === 'candidate'
            ? { applicant: req.user.id }
            : { interviewer: req.user.id };

        const interviews = await Interview.find(query)
            .populate('job', 'title department location')
            .populate('applicant', 'name email profile')
            .populate('interviewer', 'name email')
            .sort({ scheduledDate: 1 });

        res.status(200).json({ success: true, count: interviews.length, interviews });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// @desc    Update interview status/evaluation
// @route   PUT /api/interviews/:id
// @access  Private (HR Expert/Employer/HR Manager/Admin)
exports.updateInterview = async (req, res) => {
    try {
        const { status, result, evaluationScore, evaluationComments, notes, locationOrLink, scheduledDate, time } = req.body;

        const interview = await Interview.findById(req.params.id);
        if (!interview) {
            return res.status(404).json({ success: false, message: 'Interview record not found' });
        }

        if (status) interview.status = status;
        if (result) interview.result = result;
        if (evaluationScore !== undefined) interview.evaluationScore = evaluationScore;
        if (evaluationComments !== undefined) interview.evaluationComments = evaluationComments;
        if (notes !== undefined) interview.notes = notes;
        if (locationOrLink !== undefined) interview.locationOrLink = locationOrLink;
        if (scheduledDate) interview.scheduledDate = scheduledDate;
        if (time) interview.time = time;

        await interview.save();

        // Sync result with application status if selected or rejected
        if (result === 'selected' || result === 'passed') {
            const app = await Application.findById(interview.application);
            if (app) {
                app.status = 'selected';
                app.statusHistory.push({ status: 'selected', date: new Date(), note: 'Passed interview evaluation' });
                await app.save();
            }
        } else if (result === 'rejected' || result === 'failed') {
            const app = await Application.findById(interview.application);
            if (app) {
                app.status = 'rejected';
                app.statusHistory.push({ status: 'rejected', date: new Date(), note: 'Interview result: not selected' });
                await app.save();
            }
        }

        res.status(200).json({ success: true, interview });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
