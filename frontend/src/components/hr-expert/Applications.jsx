import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Spinner, Alert, Button, Modal, Form, Image } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
    FaArrowLeft, FaCheck, FaTimes, FaCalendar, FaEnvelope, 
    FaUser, FaBriefcase, FaGraduationCap, FaStar, FaCertificate, 
    FaLanguage, FaPhone, FaMapMarkerAlt, FaInfoCircle 
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api, { getImageUrl, describeApiError } from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';
import { StatusBadge } from '../workspace/ui';

/**
 * The HR Expert's processing pipeline, mirroring the backend's allowed
 * transitions. Statuses must match the Application schema enum exactly - the
 * screen previously used 'pending'/'reviewed'/'offered', which no longer exist,
 * so its buttons never appeared and the ones that did were rejected by the API.
 */
const STAGE_LABELS = {
    applied: 'Applied',
    under_review: 'Under Review',
    ai_analyzed: 'AI Analyzed',
    shortlisted: 'Shortlisted',
    interview_scheduled: 'Interview Scheduled',
    interviewed: 'Interviewed',
    selected: 'Selected',
    offered: 'Offered',
    hired: 'Hired',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
};

// Once the HR Manager owns the record, the HR Expert can no longer change it.
const CLOSED_STATUSES = ['selected', 'offered', 'hired', 'rejected', 'withdrawn'];

/**
 * Merge a processing response into a row without losing populated data.
 *
 * The status and interview endpoints populate only `job`, so `applicant` and
 * `resume` come back as bare ids. Spreading the whole response over the row
 * replaced the populated candidate with a string and the name/avatar turned into
 * "Unknown" until the page was reloaded, so only the fields the response is
 * authoritative for are copied across.
 */
const mergeProcessed = (row, updated = {}, fallback = {}) => ({
    ...row,
    status: updated.status || fallback.status || row.status,
    statusHistory: updated.statusHistory || row.statusHistory,
    screenedBy: updated.screenedBy ?? row.screenedBy,
    screenedAt: updated.screenedAt ?? row.screenedAt,
    shortlistedBy: updated.shortlistedBy ?? row.shortlistedBy,
    shortlistedAt: updated.shortlistedAt ?? row.shortlistedAt,
    interviewDate: updated.interviewDate ?? fallback.interviewDate ?? row.interviewDate,
    interviewLocation: updated.interviewLocation ?? fallback.interviewLocation ?? row.interviewLocation
});

const Applications = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { user, can } = useAuth();
    // This screen is mounted under both /hr-expert and /hr-manager, so every
    // link and action must follow the caller's role rather than assume HR Expert.
    const basePath = user?.role === 'hr_manager' ? '/hr-manager' : '/hr-expert';
    const canProcess = can('application:process');
    const canDecide = can('application:decide');
    const [loading, setLoading] = useState(true);
    const [applications, setApplications] = useState([]);
    const [job, setJob] = useState(null);
    const [error, setError] = useState('');
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [selectedApp, setSelectedApp] = useState(null);
    const [selectedCandidate, setSelectedCandidate] = useState(null);
    const [interviewData, setInterviewData] = useState({
        interviewDate: '',
        interviewLocation: '',
        note: ''
    });

    useEffect(() => {
        fetchApplications();
    }, [jobId]);

    const fetchApplications = async () => {
        try {
            const [appRes, jobRes] = await Promise.all([
                api.get(`/applications/job/${jobId}`),
                api.get(`/jobs/${jobId}`)
            ]);
            setApplications(appRes.data.applications || []);
            setJob(jobRes.data.job);
        } catch (error) {
            console.error('Error fetching applications:', error);
            setError('Failed to load applications');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (applicationId, status) => {
        try {
            const res = await api.put(`/applications/${applicationId}/status`, { status });
            setApplications(applications.map(app =>
                app._id === applicationId ? mergeProcessed(app, res.data.application, { status }) : app
            ));
            toast.success(`Application moved to ${STAGE_LABELS[status] || status}`);
        } catch (error) {
            toast.error(describeApiError(error, 'Failed to update status'));
        }
    };

    const handleScheduleInterview = async (e) => {
        e.preventDefault();
        try {
            const res = await api.put(`/applications/${selectedApp._id}/schedule-interview`, interviewData);
            setApplications(applications.map(app =>
                app._id === selectedApp._id
                    // The backend sets `interview_scheduled`; the interview has not
                    // happened yet, so claiming `interviewed` here skipped a stage.
                    ? mergeProcessed(app, res.data.application, {
                        status: 'interview_scheduled',
                        interviewDate: interviewData.interviewDate,
                        interviewLocation: interviewData.interviewLocation
                    })
                    : app
            ));
            toast.success('Interview scheduled successfully');
            setShowInterviewModal(false);
            setSelectedApp(null);
            setInterviewData({ interviewDate: '', interviewLocation: '', note: '' });
        } catch (error) {
            toast.error(describeApiError(error, 'Failed to schedule interview'));
        }
    };

    const handleViewProfile = (application) => {
        setSelectedCandidate(application.applicant);
        setShowProfileModal(true);
    };

    const getMatchScoreClass = (score) => {
        if (score >= 70) return 'match-high';
        if (score >= 40) return 'match-medium';
        return 'match-low';
    };

    const formatDate = (date) => {
        if (!date) return 'Not scheduled';
        return new Date(date).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading applications...</p>
            </Container>
        );
    }

    if (error) {
        return (
            <Container className="py-5">
                <Alert variant="danger">{error}</Alert>
                <Button as={Link} to={`${basePath}/vacancies`} variant="outline-primary">
                    <FaArrowLeft className="me-2" /> Back to Jobs
                </Button>
            </Container>
        );
    }

    return (
        <section className="applications-section py-4">
            <Container>
                <BackButton to={`${basePath}/vacancies`} />
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <Button 
                            variant="link" 
                            className="text-decoration-none p-0 mb-2 d-inline-flex align-items-center gap-2"
                            onClick={() => navigate(`${basePath}/vacancies`)}
                        >
                            <FaArrowLeft /> Back to Jobs
                        </Button>
                        <h2 className="fw-bold mb-0">Applications for {job?.title}</h2>
                        <p className="text-muted">{job?.department} • {job?.location}</p>
                    </div>
                    <Badge bg="primary" className="fs-6 p-2">
                        {applications.length} Applicants
                    </Badge>
                </div>

                {applications.length === 0 ? (
                    <Card className="text-center py-5">
                        <Card.Body>
                            <div className="mb-3" style={{ fontSize: '4rem' }}>📭</div>
                            <h4>No applications yet</h4>
                            <p className="text-muted">There are no applications for this job yet</p>
                        </Card.Body>
                    </Card>
                ) : (
                    <Card className="shadow-sm">
                        <Card.Body className="p-0">
                            <div className="table-responsive">
                                <Table hover className="mb-0">
                                    <thead className="bg-light">
                                        <tr>
                                            <th>Candidate</th>
                                            <th>Applied Date</th>
                                            <th>Match Score</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {applications.map((app) => (
                                            <tr key={app._id}>
                                                <td>
                                                    <div className="d-flex align-items-center gap-2">
                                                        {/* Candidate Photo */}
                                                        {app.applicant?.profile?.profilePhoto ? (
                                                            <Image 
                                                                src={getImageUrl(app.applicant.profile.profilePhoto)} 
                                                                roundedCircle 
                                                                style={{ 
                                                                    width: '40px', 
                                                                    height: '40px', 
                                                                    objectFit: 'cover',
                                                                    border: '2px solid #2c3e8f'
                                                                }} 
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div 
                                                                style={{ 
                                                                    width: '40px', 
                                                                    height: '40px', 
                                                                    borderRadius: '50%',
                                                                    background: 'linear-gradient(135deg, #2c3e8f, #1a237e)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: 'var(--surface)',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '1rem'
                                                                }}
                                                            >
                                                                {app.applicant?.name?.charAt(0)?.toUpperCase() || 'U'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="fw-semibold">{app.applicant?.name || 'Unknown'}</div>
                                                            <div className="text-muted small">{app.applicant?.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{new Date(app.createdAt).toLocaleDateString()}</td>
                                                <td>
                                                    {app.matchScore ? (
                                                        <span className={`match-score ${getMatchScoreClass(app.matchScore)}`}>
                                                            {app.matchScore}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted">—</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge status={app.status} />
                                                </td>
                                                <td>
                                                    <div className="d-flex gap-1 flex-wrap">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-info"
                                                            onClick={() => handleViewProfile(app)}
                                                            title="View Profile"
                                                        >
                                                            <FaUser />
                                                        </Button>
                                                        {canProcess && app.status === 'applied' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-success"
                                                                    onClick={() => handleStatusUpdate(app._id, 'under_review')}
                                                                    title="Start screening"
                                                                >
                                                                    <FaCheck className="me-1" /> Screen
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-danger"
                                                                    onClick={() => handleStatusUpdate(app._id, 'rejected')}
                                                                    title="Reject"
                                                                >
                                                                    <FaTimes />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {canProcess && ['under_review', 'ai_analyzed'].includes(app.status) && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-success"
                                                                    onClick={() => handleStatusUpdate(app._id, 'shortlisted')}
                                                                    title="Shortlist"
                                                                >
                                                                    Shortlist
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-danger"
                                                                    onClick={() => handleStatusUpdate(app._id, 'rejected')}
                                                                    title="Reject"
                                                                >
                                                                    <FaTimes />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {canProcess && ['shortlisted', 'interview_scheduled'].includes(app.status) && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline-primary"
                                                                onClick={() => {
                                                                    setSelectedApp(app);
                                                                    setShowInterviewModal(true);
                                                                }}
                                                                title="Schedule Interview"
                                                            >
                                                                <FaCalendar className="me-1" />
                                                                {app.status === 'interview_scheduled' ? 'Reschedule' : 'Interview'}
                                                            </Button>
                                                        )}
                                                        {canProcess && app.status === 'interview_scheduled' && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline-success"
                                                                onClick={() => handleStatusUpdate(app._id, 'interviewed')}
                                                                title="Mark the interview as completed"
                                                            >
                                                                Mark Interviewed
                                                            </Button>
                                                        )}
                                                        {/* Final outcomes belong to the HR Manager. The expert hands
                                                            the candidate over instead of deciding here. */}
                                                        {canProcess && app.status === 'interviewed' && (
                                                            <Badge bg="info" className="align-self-center">
                                                                Awaiting HR Manager decision
                                                            </Badge>
                                                        )}
                                                        {canDecide && ['shortlisted', 'interview_scheduled', 'interviewed', 'selected', 'offered'].includes(app.status) && (
                                                            <Button
                                                                size="sm"
                                                                variant="success"
                                                                as={Link}
                                                                to="/hr-manager/shortlists"
                                                                title="Go to the decision queue"
                                                            >
                                                                Decide
                                                            </Button>
                                                        )}
                                                        {CLOSED_STATUSES.includes(app.status) && (
                                                            <span className="text-muted small align-self-center">
                                                                {STAGE_LABELS[app.status]}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </div>
                        </Card.Body>
                    </Card>
                )}

                {/* Interview Modal */}
                <Modal show={showInterviewModal} onHide={() => setShowInterviewModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>Schedule Interview</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form onSubmit={handleScheduleInterview}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Interview Date <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="datetime-local"
                                    value={interviewData.interviewDate}
                                    onChange={(e) => setInterviewData({ ...interviewData, interviewDate: e.target.value })}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Interview Location</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={interviewData.interviewLocation}
                                    onChange={(e) => setInterviewData({ ...interviewData, interviewLocation: e.target.value })}
                                    placeholder="e.g., SITA Office, Hawassa"
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Additional Note</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={3}
                                    value={interviewData.note}
                                    onChange={(e) => setInterviewData({ ...interviewData, note: e.target.value })}
                                    placeholder="Add any instructions or notes for the candidate"
                                />
                            </Form.Group>
                            <div className="d-flex gap-2">
                                <Button type="submit" variant="primary-gradient">
                                    <FaCalendar className="me-2" /> Schedule Interview
                                </Button>
                                <Button variant="outline-secondary" onClick={() => setShowInterviewModal(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </Form>
                    </Modal.Body>
                </Modal>

                {/* Candidate Profile Modal */}
                <Modal show={showProfileModal} onHide={() => setShowProfileModal(false)} size="lg">
                    <Modal.Header closeButton>
                        <Modal.Title>
                            <FaUser className="me-2" /> Candidate Profile
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {selectedCandidate && (
                            <div>
                                {/* Header with Photo */}
                                <div className="text-center mb-4">
                                    {selectedCandidate.profile?.profilePhoto ? (
                                        <Image 
                                            src={getImageUrl(selectedCandidate.profile.profilePhoto)} 
                                            roundedCircle 
                                            style={{ 
                                                width: '120px', 
                                                height: '120px', 
                                                objectFit: 'cover',
                                                border: '4px solid #2c3e8f'
                                            }} 
                                        />
                                    ) : (
                                        <div 
                                            style={{ 
                                                width: '120px', 
                                                height: '120px', 
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #2c3e8f, #1a237e)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: 'var(--surface)',
                                                fontSize: '3rem',
                                                margin: '0 auto',
                                                border: '4px solid #2c3e8f'
                                            }}
                                        >
                                            {selectedCandidate.name?.charAt(0)?.toUpperCase() || 'U'}
                                        </div>
                                    )}
                                    <Badge bg="primary" className="px-3 py-2">{selectedCandidate.role?.toUpperCase()}</Badge>
                                </div>

                                {/* Transparent AI Matching Analysis Breakdown */}
                                {selectedApp?.matchScore !== undefined && (
                                    <Card className="mb-4 border-0 shadow-sm" style={{ background: 'var(--surface-hover)', borderRadius: '12px' }}>
                                        <Card.Body className="p-4">
                                            <div className="d-flex justify-content-between align-items-center mb-3">
                                                <h6 className="fw-bold mb-0 text-primary">
                                                    🤖 AI Decision-Support Match Analysis
                                                </h6>
                                                <Badge bg="success" className="fs-6 px-3 py-2">
                                                    Overall Match: {selectedApp.matchScore}%
                                                </Badge>
                                            </div>

                                            <Row className="g-3 mb-3">
                                                <Col md={3} xs={6}>
                                                    <div className="p-2 border rounded text-center bg-white">
                                                        <small className="text-muted d-block">Skills Match</small>
                                                        <strong className="text-primary">{selectedApp.matchDetails?.skillsScore ?? selectedApp.matchScore}%</strong>
                                                    </div>
                                                </Col>
                                                <Col md={3} xs={6}>
                                                    <div className="p-2 border rounded text-center bg-white">
                                                        <small className="text-muted d-block">Education Match</small>
                                                        <strong className="text-info">{selectedApp.matchDetails?.educationScore ?? 100}%</strong>
                                                    </div>
                                                </Col>
                                                <Col md={3} xs={6}>
                                                    <div className="p-2 border rounded text-center bg-white">
                                                        <small className="text-muted d-block">Experience Match</small>
                                                        <strong className="text-warning">{selectedApp.matchDetails?.experienceScore ?? 85}%</strong>
                                                    </div>
                                                </Col>
                                                <Col md={3} xs={6}>
                                                    <div className="p-2 border rounded text-center bg-white">
                                                        <small className="text-muted d-block">Location Match</small>
                                                        <strong className="text-success">{selectedApp.matchDetails?.locationScore ?? 100}%</strong>
                                                    </div>
                                                </Col>
                                            </Row>

                                            {/* Matching vs Missing Skills */}
                                            {selectedApp.matchDetails?.matchingSkills?.length > 0 && (
                                                <div className="mb-2">
                                                    <small className="fw-bold text-success me-2">Matching Skills:</small>
                                                    {selectedApp.matchDetails.matchingSkills.map((s, i) => (
                                                        <Badge key={i} bg="success" className="me-1">{s}</Badge>
                                                    ))}
                                                </div>
                                            )}
                                            {selectedApp.matchDetails?.missingSkills?.length > 0 && (
                                                <div className="mb-2">
                                                    <small className="fw-bold text-danger me-2">Missing Skills:</small>
                                                    {selectedApp.matchDetails.missingSkills.map((s, i) => (
                                                        <Badge key={i} bg="outline-danger" className="me-1 border text-danger">{s}</Badge>
                                                    ))}
                                                </div>
                                            )}

                                            <small className="text-muted fst-italic d-block mt-2" style={{ fontSize: '0.78rem' }}>
                                                ℹ️ AI scores are automated decision-support recommendations to assist human HR reviewers.
                                            </small>
                                        </Card.Body>
                                    </Card>
                                )}

                                <hr />

                                <Row>
                                    {/* Contact Info */}
                                    <Col md={6}>
                                        <h6 className="fw-bold"><FaInfoCircle className="me-2" /> Contact Information</h6>
                                        <div className="mb-2">
                                            <small className="text-muted">Phone</small>
                                            <p className="fw-semibold mb-0">
                                                {selectedCandidate.profile?.phone || 'Not provided'}
                                            </p>
                                        </div>
                                        <div className="mb-2">
                                            <small className="text-muted">Location</small>
                                            <p className="fw-semibold mb-0">
                                                {selectedCandidate.profile?.location || 'Not provided'}
                                            </p>
                                        </div>
                                        <div className="mb-2">
                                            <small className="text-muted">Bio</small>
                                            <p className="mb-0">
                                                {selectedCandidate.profile?.bio || 'No bio provided'}
                                            </p>
                                        </div>
                                    </Col>

                                    {/* Skills */}
                                    <Col md={6}>
                                        <h6 className="fw-bold"><FaStar className="me-2" /> Skills</h6>
                                        {selectedCandidate.profile?.skills?.length > 0 ? (
                                            <div className="d-flex flex-wrap gap-1">
                                                {selectedCandidate.profile.skills.map((skill, idx) => (
                                                    <Badge key={idx} bg="primary" className="p-2">
                                                        {skill}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-muted">No skills listed</p>
                                        )}

                                        <div className="mt-3">
                                            <h6 className="fw-bold"><FaCertificate className="me-2" /> Certifications</h6>
                                            {selectedCandidate.profile?.certifications?.length > 0 ? (
                                                <div className="d-flex flex-wrap gap-1">
                                                    {selectedCandidate.profile.certifications.map((cert, idx) => (
                                                        <Badge key={idx} bg="info" className="p-2">
                                                            {cert}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-muted">No certifications listed</p>
                                            )}
                                        </div>

                                        <div className="mt-3">
                                            <h6 className="fw-bold"><FaLanguage className="me-2" /> Languages</h6>
                                            {selectedCandidate.profile?.languages?.length > 0 ? (
                                                <div className="d-flex flex-wrap gap-1">
                                                    {selectedCandidate.profile.languages.map((lang, idx) => (
                                                        <Badge key={idx} bg="secondary" className="p-2">
                                                            {lang}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-muted">No languages listed</p>
                                            )}
                                        </div>
                                    </Col>
                                </Row>

                                <hr />

                                {/* Education */}
                                <h6 className="fw-bold"><FaGraduationCap className="me-2" /> Education</h6>
                                {selectedCandidate.profile?.education?.length > 0 ? (
                                    selectedCandidate.profile.education.map((edu, idx) => (
                                        <div key={idx} className="p-2 border-bottom">
                                            <div className="fw-semibold">{edu.degree}</div>
                                            <div className="text-muted">{edu.institution}</div>
                                            <div className="text-muted small">{edu.field} {edu.graduationYear ? `• ${edu.graduationYear}` : ''}</div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-muted">No education listed</p>
                                )}

                                <hr />

                                {/* Work Experience */}
                                <h6 className="fw-bold"><FaBriefcase className="me-2" /> Work Experience</h6>
                                {selectedCandidate.profile?.workExperience?.length > 0 ? (
                                    selectedCandidate.profile.workExperience.map((exp, idx) => (
                                        <div key={idx} className="p-2 border-bottom">
                                            <div className="fw-semibold">{exp.position} at {exp.company}</div>
                                            <div className="text-muted small">
                                                {exp.startDate ? new Date(exp.startDate).getFullYear() : ''} 
                                                {exp.endDate === 'Present' ? ' - Present' : exp.endDate ? ` - ${new Date(exp.endDate).getFullYear()}` : ''}
                                            </div>
                                            {exp.description && (
                                                <div className="text-muted small">{exp.description}</div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-muted">No work experience listed</p>
                                )}

                                <hr />

                                {/* Match Score Summary */}
                                <div className="bg-light p-3 rounded">
                                    <h6 className="fw-bold"><FaStar className="me-2 text-warning" /> AI Match Summary</h6>
                                    <div className="d-flex align-items-center gap-3">
                                        <div className="text-center">
                                            <div className="display-6 fw-bold">{selectedCandidate.matchScore || 'N/A'}</div>
                                            <small className="text-muted">Overall Match</small>
                                        </div>
                                        <div className="flex-grow-1">
                                            <div className="d-flex justify-content-between small">
                                                <span>Skills: {selectedCandidate.matchScore || 0}%</span>
                                                <span>Education: {selectedCandidate.matchScore || 0}%</span>
                                                <span>Experience: {selectedCandidate.matchScore || 0}%</span>
                                            </div>
                                            <div className="progress" style={{ height: '8px' }}>
                                                <div 
                                                    className={`progress-bar ${selectedCandidate.matchScore >= 70 ? 'bg-success' : selectedCandidate.matchScore >= 40 ? 'bg-warning' : 'bg-danger'}`}
                                                    style={{ width: `${selectedCandidate.matchScore || 0}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowProfileModal(false)}>
                            Close
                        </Button>
                        <Button 
                            variant="primary-gradient"
                            onClick={() => {
                                if (selectedCandidate) {
                                    window.location.href = `mailto:${selectedCandidate.email}`;
                                }
                            }}
                        >
                            <FaEnvelope className="me-2" /> Contact Candidate
                        </Button>
                    </Modal.Footer>
                </Modal>
            </Container>
        </section>
    );
};

export default Applications;