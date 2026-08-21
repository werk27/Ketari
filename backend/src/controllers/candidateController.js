const User = require('../models/User');

// Fields safe to expose to authorised HR users when browsing the talent pool.
// Deliberately excludes saved jobs, reset tokens and other private account data.
const CANDIDATE_FIELDS = [
    'name', 'email', 'createdAt',
    'profile.title', 'profile.bio', 'profile.location', 'profile.phone',
    'profile.skills', 'profile.languages', 'profile.certifications',
    'profile.education', 'profile.workExperience',
    'profile.availabilityStatus', 'profile.profilePhoto', 'profile.rating'
].join(' ');

// @desc    Search the candidate pool
// @route   GET /api/candidates
// @access  Private (authorised HR users)
exports.getCandidates = async (req, res) => {
    try {
        const { search, location, skills, minRating, page = 1, limit = 12 } = req.query;

        // Only active candidate accounts are discoverable.
        let query = { role: 'candidate', status: 'active' };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'profile.title': { $regex: search, $options: 'i' } },
                { 'profile.bio': { $regex: search, $options: 'i' } }
            ];
        }

        if (location) {
            query['profile.location'] = { $regex: location, $options: 'i' };
        }

        if (skills) {
            const skillsArray = skills.split(',');
            query['profile.skills'] = { $in: skillsArray.map(s => new RegExp(s.trim(), 'i')) };
        }

        if (minRating) {
            query['profile.rating.score'] = { $gte: parseFloat(minRating) };
        }

        const candidates = await User.find(query)
            .select(CANDIDATE_FIELDS)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            candidates,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalCandidates: count
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server Error'
        });
    }
};
