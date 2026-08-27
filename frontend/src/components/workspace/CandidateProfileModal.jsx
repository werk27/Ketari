import React, { useState } from 'react';
import { Modal, Button, Row, Col, Badge, Image, Spinner } from 'react-bootstrap';
import {
    FaUser, FaStar, FaCertificate, FaLanguage, FaGraduationCap, FaBriefcase,
    FaInfoCircle, FaEnvelope, FaFileAlt, FaHistory, FaUserCheck, FaCalendarAlt
} from 'react-icons/fa';
import api, { getImageUrl, describeApiError } from '../../services/api';
import { toast } from 'react-toastify';
import { StatusBadge, MatchScore } from './ui';

/**
 * The full candidate profile a recruitment decision is made from, shared by
 * the HR Expert's processing screen and the HR Manager's decision queue.
 *
 * Consolidating this in one place is what lets both roles view everything the
 * workflow asks for - CV, skills, education, experience, AI match, screening
 * trail, interview details and application history - inline in their own
 * workspace, without a second, disconnected page.
 */
const formatDateTime = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const CandidateProfileModal = ({ show, onHide, application }) => {
    const [resumeLoading, setResumeLoading] = useState(false);
    const candidate = application?.applicant || {};
    const resume = application?.resume;

    const handleViewResume = async () => {
        if (!resume?._id) return;
        setResumeLoading(true);
        try {
            const res = await api.get(`/resumes/${resume._id}/file`, { responseType: 'blob' });
            const fileUrl = URL.createObjectURL(
                new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' })
            );
            window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            toast.error(describeApiError(err, 'Could not open this CV'));
        } finally {
            setResumeLoading(false);
        }
    };

    if (!application) return null;

    return (
        <Modal show={show} onHide={onHide} size="lg" scrollable>
            <Modal.Header closeButton>
                <Modal.Title>
                    <FaUser className="me-2" /> Candidate Profile
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {/* Header with photo */}
                <div className="text-center mb-4">
                    {candidate.profile?.profilePhoto ? (
                        <Image
                            src={getImageUrl(candidate.profile.profilePhoto)}
                            roundedCircle
                            style={{ width: '120px', height: '120px', objectFit: 'cover', border: '4px solid #2c3e8f' }}
                        />
                    ) : (
                        <div
                            style={{
                                width: '120px', height: '120px', borderRadius: '50%',
                                background: 'linear-gradient(135deg, #2c3e8f, #1a237e)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: '3rem', margin: '0 auto', border: '4px solid #2c3e8f'
                            }}
                        >
                            {candidate.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                    )}
                    <h5 className="fw-bold mt-2 mb-1">{candidate.name || 'Unknown candidate'}</h5>
                    <div className="text-muted small">{candidate.email}</div>
                    <div className="mt-2 d-flex justify-content-center align-items-center gap-2 flex-wrap">
                        <StatusBadge status={application.status} />
                        {resume?._id && (
                            <Button
                                size="sm"
                                variant="outline-primary"
                                onClick={handleViewResume}
                                disabled={resumeLoading}
                            >
                                {resumeLoading ? <Spinner animation="border" size="sm" /> : <FaFileAlt className="me-1" />}
                                {' '}View CV
                            </Button>
                        )}
                    </div>
                </div>

                {/* AI Match Analysis - decision support only, never an automatic outcome */}
                {typeof application.matchScore === 'number' && (
                    <div className="mb-4 p-3 border rounded" style={{ background: '#F8FAFC' }}>
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="fw-bold mb-0 text-primary">🤖 AI Match Analysis</h6>
                        </div>
                        <MatchScore score={application.matchScore} details={application.matchDetails} />
                        {application.matchDetails?.matchingSkills?.length > 0 && (
                            <div className="mt-2">
                                <small className="fw-bold text-success me-2">Matching Skills:</small>
                                {application.matchDetails.matchingSkills.map((s, i) => (
                                    <Badge key={i} bg="success" className="me-1">{s}</Badge>
                                ))}
                            </div>
                        )}
                        {application.matchDetails?.missingSkills?.length > 0 && (
                            <div className="mt-2">
                                <small className="fw-bold text-danger me-2">Missing Skills:</small>
                                {application.matchDetails.missingSkills.map((s, i) => (
                                    <Badge key={i} bg="danger" className="me-1">{s}</Badge>
                                ))}
                            </div>
                        )}
                        {/* Why the AI scored this candidate the way it did.
                            matchingService records these reasons alongside the
                            score precisely so a human reviewer can weigh the
                            reasoning instead of taking a bare percentage on trust. */}
                        {application.matchDetails?.reasons?.length > 0 && (
                            <div className="mt-3">
                                <small className="fw-bold text-dark d-block mb-1">Why this score</small>
                                <ul className="mb-0 ps-3 text-muted" style={{ fontSize: '0.8rem' }}>
                                    {application.matchDetails.reasons.map((reason, i) => (
                                        <li key={i}>{reason}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <small className="text-muted fst-italic d-block mt-2" style={{ fontSize: '0.78rem' }}>
                            AI scores are decision support only - the hiring decision is always made by an authorised HR user.
                        </small>
                    </div>
                )}

                <hr />

                <Row>
                    <Col md={6}>
                        <h6 className="fw-bold"><FaInfoCircle className="me-2" /> Contact Information</h6>
                        <div className="mb-2">
                            <small className="text-muted">Phone</small>
                            <p className="fw-semibold mb-0">{candidate.profile?.phone || 'Not provided'}</p>
                        </div>
                        <div className="mb-2">
                            <small className="text-muted">Location</small>
                            <p className="fw-semibold mb-0">{candidate.profile?.location || 'Not provided'}</p>
                        </div>
                        <div className="mb-2">
                            <small className="text-muted">Bio</small>
                            <p className="mb-0">{candidate.profile?.bio || 'No bio provided'}</p>
                        </div>
                    </Col>
                    <Col md={6}>
                        <h6 className="fw-bold"><FaStar className="me-2" /> Skills</h6>
                        {candidate.profile?.skills?.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1 mb-3">
                                {candidate.profile.skills.map((skill, idx) => (
                                    <Badge key={idx} bg="primary" className="p-2">{skill}</Badge>
                                ))}
                            </div>
                        ) : <p className="text-muted">No skills listed</p>}

                        <h6 className="fw-bold"><FaCertificate className="me-2" /> Certifications</h6>
                        {candidate.profile?.certifications?.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1 mb-3">
                                {candidate.profile.certifications.map((cert, idx) => (
                                    <Badge key={idx} bg="info" className="p-2">{cert}</Badge>
                                ))}
                            </div>
                        ) : <p className="text-muted">No certifications listed</p>}

                        <h6 className="fw-bold"><FaLanguage className="me-2" /> Languages</h6>
                        {candidate.profile?.languages?.length > 0 ? (
                            <div className="d-flex flex-wrap gap-1">
                                {candidate.profile.languages.map((lang, idx) => (
                                    <Badge key={idx} bg="secondary" className="p-2">{lang}</Badge>
                                ))}
                            </div>
                        ) : <p className="text-muted">No languages listed</p>}
                    </Col>
                </Row>

                <hr />

                <h6 className="fw-bold"><FaGraduationCap className="me-2" /> Education</h6>
                {candidate.profile?.education?.length > 0 ? (
                    candidate.profile.education.map((edu, idx) => (
                        <div key={idx} className="p-2 border-bottom">
                            <div className="fw-semibold">{edu.degree}</div>
                            <div className="text-muted">{edu.institution}</div>
                            <div className="text-muted small">{edu.field} {edu.graduationYear ? `• ${edu.graduationYear}` : ''}</div>
                        </div>
                    ))
                ) : <p className="text-muted">No education listed</p>}

                <hr />

                <h6 className="fw-bold"><FaBriefcase className="me-2" /> Work Experience</h6>
                {candidate.profile?.workExperience?.length > 0 ? (
                    candidate.profile.workExperience.map((exp, idx) => (
                        <div key={idx} className="p-2 border-bottom">
                            <div className="fw-semibold">{exp.position} at {exp.company}</div>
                            <div className="text-muted small">
                                {exp.startDate ? new Date(exp.startDate).getFullYear() : ''}
                                {exp.endDate === 'Present' ? ' - Present' : exp.endDate ? ` - ${new Date(exp.endDate).getFullYear()}` : ''}
                            </div>
                            {exp.description && <div className="text-muted small">{exp.description}</div>}
                        </div>
                    ))
                ) : <p className="text-muted">No work experience listed</p>}

                <hr />

                {/* Screening & interview - what the HR Expert already did, so the
                    HR Manager reviews it rather than repeating it. */}
                <h6 className="fw-bold"><FaUserCheck className="me-2" /> Screening &amp; Interview</h6>
                <Row className="g-2 mb-2">
                    <Col md={6}>
                        <small className="text-muted d-block">Screened by</small>
                        <span className="fw-semibold">
                            {application.screenedBy?.name || 'Not yet screened'}
                            {application.screenedAt ? ` • ${formatDateTime(application.screenedAt)}` : ''}
                        </span>
                    </Col>
                    <Col md={6}>
                        <small className="text-muted d-block">Shortlisted by</small>
                        <span className="fw-semibold">
                            {application.shortlistedBy?.name || 'Not yet shortlisted'}
                            {application.shortlistedAt ? ` • ${formatDateTime(application.shortlistedAt)}` : ''}
                        </span>
                    </Col>
                    <Col md={6}>
                        <small className="text-muted d-block"><FaCalendarAlt className="me-1" />Interview date</small>
                        <span className="fw-semibold">{formatDateTime(application.interviewDate) || 'Not scheduled'}</span>
                    </Col>
                    <Col md={6}>
                        <small className="text-muted d-block">Interview location</small>
                        <span className="fw-semibold">{application.interviewLocation || '—'}</span>
                    </Col>
                    {application.decision?.outcome && application.decision.outcome !== 'pending' && (
                        <Col md={12}>
                            <small className="text-muted d-block">Final decision</small>
                            <span className="fw-semibold">
                                {application.decision.outcome === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                                {application.decision.decidedBy?.name || 'HR Manager'}
                                {application.decision.decidedAt ? ` • ${formatDateTime(application.decision.decidedAt)}` : ''}
                                {application.decision.reason ? ` — ${application.decision.reason}` : ''}
                            </span>
                        </Col>
                    )}
                </Row>

                <hr />

                {/* Application history - every stage this application moved through */}
                <h6 className="fw-bold"><FaHistory className="me-2" /> Application History</h6>
                {application.statusHistory?.length > 0 ? (
                    <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                        {[...application.statusHistory].reverse().map((entry, idx) => (
                            <div key={idx} className="d-flex justify-content-between align-items-start p-2 border-bottom">
                                <div>
                                    <StatusBadge status={entry.status} />
                                    {entry.note && <div className="text-muted small mt-1">{entry.note}</div>}
                                </div>
                                <div className="text-end text-muted small">
                                    {entry.changedBy?.name || 'System'}
                                    <div>{formatDateTime(entry.date)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : <p className="text-muted">No history recorded yet</p>}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
                <Button
                    variant="primary"
                    onClick={() => candidate.email && (window.location.href = `mailto:${candidate.email}`)}
                >
                    <FaEnvelope className="me-2" /> Contact Candidate
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default CandidateProfileModal;
