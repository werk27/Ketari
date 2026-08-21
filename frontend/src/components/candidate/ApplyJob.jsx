import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Badge, Modal, ProgressBar, Alert } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaUpload, FaCheckCircle, FaRobot, FaMoneyBillWave, FaClock, FaBriefcase, FaBookmark, FaRegBookmark, FaBuilding, FaUserCheck } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import './ApplyJob.css';

const ApplyJob = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { t } = useLanguage();
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    
    const [job, setJob] = useState(null);
    const [resumes, setResumes] = useState([]);
    
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [selectedResume, setSelectedResume] = useState('');
    const [coverLetter, setCoverLetter] = useState('');
    
    const [isSaved, setIsSaved] = useState(false);
    const [matchScore, setMatchScore] = useState(null);
    const [hasApplied, setHasApplied] = useState(false);

    useEffect(() => {
        fetchJobAndResumes();
    }, [jobId]);

    const fetchJobAndResumes = async () => {
        try {
            const [jobRes, resumeRes] = await Promise.all([
                api.get(`/jobs/${jobId}`),
                user ? api.get('/resumes') : Promise.resolve({ data: { resumes: [] } })
            ]);
            
            setJob(jobRes.data.job);
            
            if (user) {
                // Check if already applied
                const appsRes = await api.get('/applications/me');
                const applied = appsRes.data.applications.some(app => app.job._id === jobId);
                setHasApplied(applied);

                // Setup resumes
                setResumes(resumeRes.data.resumes || []);
                if (resumeRes.data.resumes?.length > 0) {
                    const defaultResume = resumeRes.data.resumes.find(r => r.isDefault);
                    setSelectedResume(defaultResume?._id || resumeRes.data.resumes[0]._id);
                }

                // Check saved status
                setIsSaved(user.profile?.savedJobs?.includes(jobId) || jobRes.data.job.savedBy?.includes(user._id));
                
                // Calculate score
                calculateMatchScore(jobRes.data.job);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error(t('apply.load_error') || 'Failed to load job details');
        } finally {
            setLoading(false);
        }
    };

    const calculateMatchScore = (jobData) => {
        if (!user?.profile?.skills) return;
        const jobSkills = jobData?.requirements?.skills || [];
        const userSkills = user.profile.skills || [];
        
        if (jobSkills.length > 0 && userSkills.length > 0) {
            const matchedSkills = jobSkills.filter(skill => 
                userSkills.some(us => us.toLowerCase().includes(skill.toLowerCase()))
            );
            setMatchScore(Math.round((matchedSkills.length / jobSkills.length) * 100));
        } else if (jobSkills.length === 0) {
            setMatchScore(100);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('resume', file);

        try {
            setUploading(true);
            const res = await api.post('/resumes', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResumes([...resumes, res.data.resume]);
            setSelectedResume(res.data.resume._id);
            toast.success(t('apply.resume_uploaded') || 'Resume uploaded successfully');
        } catch (error) {
            console.error('Error uploading resume:', error);
            toast.error(t('apply.upload_error') || 'Failed to upload resume');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmitApplication = async (e) => {
        e.preventDefault();
        if (!selectedResume) {
            toast.error(t('apply.select_resume_error') || 'Please select or upload a resume');
            return;
        }

        try {
            setSubmitting(true);
            await api.post('/applications', {
                jobId,
                resumeId: selectedResume,
                coverLetter
            });
            
            toast.success(t('apply.submitted') || 'Application submitted successfully!');
            setShowApplyModal(false);
            setHasApplied(true);
        } catch (error) {
            console.error('Error submitting application:', error);
            toast.error(error.response?.data?.message || t('apply.submit_error') || 'Failed to submit application');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSaveJob = async () => {
        if (!user) return toast.info(t('jobs.login_to_save') || "Please login to save jobs.");
        try {
            const res = await api.post(`/jobs/${jobId}/save`);
            if (res.data.success) setIsSaved(res.data.isSaved);
        } catch (err) {
            console.error("Error saving job", err);
        }
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center min-vh-100">
                <Spinner animation="border" variant="primary" />
            </div>
        );
    }

    if (!job) {
        return (
            <Container className="py-5 text-center">
                <h2>{t('apply.job_not_found')}</h2>
                <Button variant="primary" onClick={() => navigate('/jobs')} className="mt-3">{t('apply.back_to_jobs')}</Button>
            </Container>
        );
    }

    return (
        <section className="job-details-page bg-light py-5 min-vh-100">
            <Container>
                <Button variant="link" className="text-decoration-none text-muted mb-4 p-0 fw-bold" onClick={() => navigate(-1)}>
                    <FaArrowLeft className="me-2" /> {t('apply.back_to_search')}
                </Button>

                <Row className="g-4">
                    {/* LEFT COLUMN: JOB INFO */}
                    <Col lg={8}>
                        <Card className="border-0 shadow-sm rounded-4 mb-4">
                            <Card.Body className="p-4 p-md-5">
                                <h1 className="fw-bold mb-2 text-dark">{job.title}</h1>
                                <p className="text-muted fs-5 mb-4">
                                    <span className="text-primary fw-bold">{job.hr_expert?.name || 'Company Name'}</span> • {job.location} • Posted {new Date(job.createdAt).toLocaleDateString()}
                                </p>

                                {user && matchScore !== null && (
                                    <Alert variant={matchScore >= 70 ? 'success' : matchScore >= 40 ? 'warning' : 'danger'} className="d-flex align-items-center rounded-3 border-0">
                                        <FaRobot className="fs-4 me-3" />
                                        <div>
                                            <div className="fw-bold mb-1">{t('apply.ai_match_score')}: {matchScore}%</div>
                                            <ProgressBar 
                                                now={matchScore} 
                                                variant={matchScore >= 70 ? 'success' : matchScore >= 40 ? 'warning' : 'danger'} 
                                                style={{height: '6px', backgroundColor: 'rgba(0,0,0,0.1)'}}
                                            />
                                        </div>
                                    </Alert>
                                )}

                                <div className="mt-5">
                                    <h4 className="fw-bold mb-3 border-bottom pb-2">{t('apply.job_description')}</h4>
                                    <div className="text-muted" style={{whiteSpace: 'pre-line', lineHeight: '1.8'}}>
                                        {job.description}
                                    </div>
                                </div>

                                <div className="mt-5">
                                    <h4 className="fw-bold mb-3 border-bottom pb-2">Skills & Requirements</h4>
                                    <div className="d-flex flex-wrap gap-2">
                                        {job.requirements?.skills?.length > 0 ? (
                                            job.requirements.skills.map((skill, index) => (
                                                <span key={index} className="skill-pill-large">{skill}</span>
                                            ))
                                        ) : (
                                            <span className="text-muted">No specific skills listed.</span>
                                        )}
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>

                    {/* RIGHT COLUMN: META & ACTIONS */}
                    <Col lg={4}>
                        <div className="sticky-sidebar">
                            
                            {/* ACTION CARD */}
                            <Card className="border-0 shadow-sm rounded-4 mb-4 border-top border-primary border-4">
                                <Card.Body className="p-4">
                                    {hasApplied ? (
                                        <Button variant="success" size="lg" className="w-100 fw-bold rounded-pill mb-3" disabled>
                                            <FaCheckCircle className="me-2"/> Applied
                                        </Button>
                                    ) : (
                                        <Button 
                                            variant="primary" 
                                            size="lg" 
                                            className="w-100 fw-bold rounded-pill mb-3"
                                            onClick={() => user ? setShowApplyModal(true) : navigate('/login')}
                                        >
                                            Apply Now
                                        </Button>
                                    )}
                                    <Button 
                                        variant="outline-secondary" 
                                        className="w-100 fw-bold rounded-pill d-flex justify-content-center align-items-center"
                                        onClick={toggleSaveJob}
                                    >
                                        {isSaved ? <FaBookmark className="text-primary me-2"/> : <FaRegBookmark className="me-2"/>}
                                        {isSaved ? 'Saved' : 'Save Job'}
                                    </Button>
                                </Card.Body>
                            </Card>

                            {/* META DATA CARD */}
                            <Card className="border-0 shadow-sm rounded-4 mb-4">
                                <Card.Body className="p-4">
                                    <h5 className="fw-bold mb-4">Job Details</h5>
                                    
                                    <div className="d-flex align-items-start mb-3">
                                        <div className="meta-icon-box bg-light rounded text-muted me-3">
                                            <FaMoneyBillWave />
                                        </div>
                                        <div>
                                            <h6 className="fw-bold mb-0">Budget</h6>
                                            <small className="text-muted">{job.budgetType || 'Negotiable'} ({job.salary?.min ? `${job.salary.min} - ${job.salary.max}` : 'Not specified'})</small>
                                        </div>
                                    </div>

                                    <div className="d-flex align-items-start mb-3">
                                        <div className="meta-icon-box bg-light rounded text-muted me-3">
                                            <FaClock />
                                        </div>
                                        <div>
                                            <h6 className="fw-bold mb-0">Duration</h6>
                                            <small className="text-muted">{job.expectedDuration || 'More than 6 months'}</small>
                                        </div>
                                    </div>

                                    <div className="d-flex align-items-start mb-3">
                                        <div className="meta-icon-box bg-light rounded text-muted me-3">
                                            <FaBriefcase />
                                        </div>
                                        <div>
                                            <h6 className="fw-bold mb-0">Experience</h6>
                                            <small className="text-muted">{job.experienceLevel || 'Intermediate'}</small>
                                        </div>
                                    </div>

                                    <div className="d-flex align-items-start">
                                        <div className="meta-icon-box bg-light rounded text-muted me-3">
                                            <FaUserCheck />
                                        </div>
                                        <div>
                                            <h6 className="fw-bold mb-0">Proposals</h6>
                                            <small className="text-muted">{job.proposalsCount || 0} submitted</small>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>

                            {/* EMPLOYER CARD */}
                            <Card className="border-0 shadow-sm rounded-4">
                                <Card.Body className="p-4">
                                    <h5 className="fw-bold mb-4">About the Client</h5>
                                    <div className="d-flex align-items-center mb-3">
                                        <FaBuilding className="text-muted fs-4 me-3"/>
                                        <span className="fw-bold fs-5">{job.hr_expert?.name || 'Company Name'}</span>
                                    </div>
                                    <div className="d-flex align-items-center text-muted mb-2 small">
                                        <FaCheckCircle className="text-success me-2"/> Payment Verified
                                    </div>
                                    <div className="text-muted small">
                                        Member since {new Date(job.hr_expert?.createdAt || Date.now()).getFullYear()}
                                    </div>
                                </Card.Body>
                            </Card>
                        </div>
                    </Col>
                </Row>
            </Container>

            {/* APPLICATION MODAL */}
            <Modal show={showApplyModal} onHide={() => setShowApplyModal(false)} size="lg" centered>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold">Submit Application</Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-4">
                    <Form onSubmit={handleSubmitApplication}>
                        {/* Resume Selection */}
                        <div className="mb-4">
                            <h6 className="fw-bold mb-3 border-bottom pb-2">1. Select your Resume</h6>
                            
                            <div className="d-flex justify-content-between align-items-center mb-3">
                                <span className="text-muted small">Use an existing resume or upload a new one.</span>
                                <div>
                                    <input
                                        type="file"
                                        id="resumeUpload"
                                        className="d-none"
                                        accept=".pdf,.doc,.docx"
                                        onChange={handleFileUpload}
                                    />
                                    <label htmlFor="resumeUpload" className="btn btn-outline-primary btn-sm rounded-pill fw-bold" style={{cursor: 'pointer'}}>
                                        <FaUpload className="me-2" /> Upload New
                                    </label>
                                </div>
                            </div>

                            {uploading && (
                                <div className="text-center py-2"><Spinner animation="border" size="sm" /> Uploading...</div>
                            )}

                            {resumes.length === 0 ? (
                                <div className="text-center py-4 bg-light rounded text-muted">
                                    No resumes uploaded yet.
                                </div>
                            ) : (
                                <div className="resume-selector-grid">
                                    {resumes.map(resume => (
                                        <div 
                                            key={resume._id} 
                                            className={`resume-card p-3 border rounded mb-2 ${selectedResume === resume._id ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                                            onClick={() => setSelectedResume(resume._id)}
                                            style={{cursor: 'pointer'}}
                                        >
                                            <Form.Check
                                                type="radio"
                                                id={`resume-${resume._id}`}
                                                checked={selectedResume === resume._id}
                                                onChange={() => setSelectedResume(resume._id)}
                                                label={<span className="fw-bold">{resume.fileName}</span>}
                                            />
                                            <div className="text-muted small ms-4 mt-1">
                                                Uploaded: {new Date(resume.createdAt).toLocaleDateString()}
                                                {resume.isDefault && <Badge bg="secondary" className="ms-2">Default</Badge>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Cover Letter */}
                        <div className="mb-4">
                            <h6 className="fw-bold mb-3 border-bottom pb-2">2. Cover Letter</h6>
                            <Form.Control
                                as="textarea"
                                rows={5}
                                placeholder="Write a brief cover letter explaining why you're a perfect fit..."
                                value={coverLetter}
                                onChange={(e) => setCoverLetter(e.target.value)}
                                className="bg-light border-0 p-3"
                                style={{resize: 'none'}}
                            />
                        </div>

                        <div className="d-flex justify-content-end gap-2 pt-3 border-top">
                            <Button variant="light" onClick={() => setShowApplyModal(false)} className="rounded-pill px-4">
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                variant="primary" 
                                className="rounded-pill px-4 fw-bold"
                                disabled={submitting || !selectedResume}
                            >
                                {submitting ? <Spinner animation="border" size="sm" /> : 'Submit Application'}
                            </Button>
                        </div>
                    </Form>
                </Modal.Body>
            </Modal>
        </section>
    );
};

export default ApplyJob;