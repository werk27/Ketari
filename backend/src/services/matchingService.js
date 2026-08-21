// Calculate detailed match score breakdown between job and candidate
/** Keep every persisted score a finite 0-100 number, whatever the input data. */
const safeScore = (value, fallback = 0) =>
    Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), 100) : fallback;

exports.calculateMatchDetails = (job, candidateData) => {
    let skillsScore = 100;
    let educationScore = 100;
    let experienceScore = 100;
    let locationScore = 100;
    let languageScore = 100;

    const jobSkills = job.requirements?.skills || [];
    const candidateSkills = candidateData?.skills || [];

    let matchingSkills = [];
    let missingSkills = [];

    // 1. Skills matching (40% weight)
    if (jobSkills.length > 0) {
        matchingSkills = jobSkills.filter(skill =>
            candidateSkills.some(cSkill =>
                cSkill.toLowerCase().includes(skill.toLowerCase()) ||
                skill.toLowerCase().includes(cSkill.toLowerCase())
            )
        );
        missingSkills = jobSkills.filter(skill => !matchingSkills.includes(skill));
        skillsScore = Math.round((matchingSkills.length / jobSkills.length) * 100);
    }

    // 2. Education matching (25% weight)
    const jobEducation = job.requirements?.education || '';
    const candidateEducation = candidateData?.education || [];

    if (jobEducation && candidateEducation.length > 0) {
        educationScore = 50;
        const jobEducationLower = jobEducation.toLowerCase();
        for (const edu of candidateEducation) {
            const candidateEduStr = `${edu.degree || ''} ${edu.field || ''} ${edu.institution || ''}`.toLowerCase();
            if (candidateEduStr.includes(jobEducationLower) || jobEducationLower.includes(candidateEduStr)) {
                educationScore = 100;
                break;
            }
        }
    } else if (jobEducation && candidateEducation.length === 0) {
        educationScore = 30;
    }

    // 3. Experience matching (25% weight)
    const jobExperience = job.requirements?.experience || '';
    const candidateExperience = candidateData?.workExperience || [];

    if (jobExperience) {
        const yearsMatch = jobExperience.match(/(\d+)/);
        const requiredYears = yearsMatch ? parseInt(yearsMatch[1], 10) : NaN;

        if (Number.isFinite(requiredYears) && requiredYears > 0) {
            const totalExperience = candidateExperience.length * 1.5;
            experienceScore = Math.min(Math.round((totalExperience / requiredYears) * 100), 100);
        } else if (Number.isFinite(requiredYears)) {
            // A stated requirement of 0 years means the vacancy is open to
            // candidates with no experience, so everyone satisfies it. Dividing
            // by it produced NaN, which Mongoose then refused to store.
            experienceScore = 100;
        } else {
            experienceScore = candidateExperience.length > 0 ? 85 : 50;
        }
    }

    // 4. Location matching (10% weight)
    const jobLocation = job.location || '';
    const candidateLocation = candidateData?.location || '';

    if (jobLocation && candidateLocation) {
        locationScore = jobLocation.toLowerCase().includes(candidateLocation.toLowerCase()) ||
            candidateLocation.toLowerCase().includes(jobLocation.toLowerCase()) ? 100 : 60;
    } else {
        locationScore = 75;
    }

    // 5. Language matching
    const jobLanguages = job.requirements?.languages || [];
    const candidateLanguages = candidateData?.languages || [];
    let matchingLanguages = [];
    let missingLanguages = [];

    if (jobLanguages.length > 0) {
        matchingLanguages = jobLanguages.filter(language =>
            candidateLanguages.some(cLanguage =>
                cLanguage.toLowerCase().includes(language.toLowerCase()) ||
                language.toLowerCase().includes(cLanguage.toLowerCase())
            )
        );
        missingLanguages = jobLanguages.filter(language => !matchingLanguages.includes(language));
        languageScore = Math.round((matchingLanguages.length / jobLanguages.length) * 100);
    }

    // Preferred (nice-to-have) skills do not affect the required-skills score,
    // but are surfaced so HR can differentiate between similarly ranked candidates.
    const preferredSkills = job.requirements?.preferredSkills || [];
    const matchingPreferredSkills = preferredSkills.filter(skill =>
        candidateSkills.some(cSkill =>
            cSkill.toLowerCase().includes(skill.toLowerCase()) ||
            skill.toLowerCase().includes(cSkill.toLowerCase())
        )
    );

    // Weighted Overall Score calculation
    const weights = jobLanguages.length > 0
        ? { skills: 0.35, education: 0.22, experience: 0.23, location: 0.08, language: 0.12 }
        : { skills: 0.40, education: 0.25, experience: 0.25, location: 0.10, language: 0 };

    const overallScore = Math.round(
        (skillsScore * weights.skills) +
        (educationScore * weights.education) +
        (experienceScore * weights.experience) +
        (locationScore * weights.location) +
        (languageScore * weights.language)
    );

    const reasons = exports.buildMatchReasons({
        matchingSkills,
        missingSkills,
        matchingPreferredSkills,
        matchingLanguages,
        missingLanguages,
        educationScore,
        experienceScore,
        locationScore,
        candidateData
    });

    return {
        score: safeScore(overallScore),
        details: {
            skillsScore: safeScore(skillsScore),
            educationScore: safeScore(educationScore),
            experienceScore: safeScore(experienceScore),
            locationScore: safeScore(locationScore),
            languageScore: safeScore(languageScore),
            matchingSkills,
            missingSkills,
            matchingPreferredSkills,
            matchingLanguages,
            missingLanguages,
            reasons,
            analyzedAt: new Date()
        }
    };
};

/**
 * Produce human-readable justifications for a match.
 * These answer "Why is this candidate recommended?" so that HR - not the AI -
 * makes the final decision on an informed basis.
 */
exports.buildMatchReasons = ({
    matchingSkills = [],
    missingSkills = [],
    matchingPreferredSkills = [],
    matchingLanguages = [],
    missingLanguages = [],
    educationScore = 0,
    experienceScore = 0,
    locationScore = 0,
    candidateData = {}
}) => {
    const reasons = [];

    if (matchingSkills.length > 0) {
        reasons.push(`Matches ${matchingSkills.length} required skill(s): ${matchingSkills.join(', ')}`);
    }
    if (matchingPreferredSkills.length > 0) {
        reasons.push(`Also brings preferred skill(s): ${matchingPreferredSkills.join(', ')}`);
    }
    if (missingSkills.length > 0) {
        reasons.push(`Skill gap - missing: ${missingSkills.join(', ')}`);
    }
    if (educationScore >= 90) {
        reasons.push('Education fully meets the stated requirement');
    } else if (educationScore < 50) {
        reasons.push('Education does not clearly match the stated requirement');
    }

    const experienceCount = (candidateData?.workExperience || []).length;
    if (experienceScore >= 90) {
        reasons.push(`Relevant experience across ${experienceCount} recorded role(s)`);
    } else if (experienceScore < 50) {
        reasons.push('Experience appears below the requested level');
    }

    if (matchingLanguages.length > 0) {
        reasons.push(`Speaks required language(s): ${matchingLanguages.join(', ')}`);
    }
    if (missingLanguages.length > 0) {
        reasons.push(`Missing required language(s): ${missingLanguages.join(', ')}`);
    }
    if (locationScore === 100) {
        reasons.push('Located in the vacancy’s work location');
    }

    return reasons;
};

exports.calculateMatchScore = async (job, candidateData) => {
    const result = exports.calculateMatchDetails(job, candidateData);
    return result.score;
};

// Match candidates for a job
exports.matchCandidates = async (job, candidates, existingApplicantIds = []) => {
    const matchedCandidates = [];

    for (const candidate of candidates) {
        if (existingApplicantIds.includes(candidate._id.toString())) {
            continue;
        }

        const { score, details } = exports.calculateMatchDetails(job, candidate.profile);

        matchedCandidates.push({
            candidate: {
                id: candidate._id,
                name: candidate.name,
                email: candidate.email,
                profile: candidate.profile
            },
            matchScore: score,
            matchDetails: details,
            skills: candidate.profile?.skills || [],
            education: candidate.profile?.education || [],
            experience: candidate.profile?.workExperience || []
        });
    }

    return matchedCandidates.sort((a, b) => b.matchScore - a.matchScore);
};