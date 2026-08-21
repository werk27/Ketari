import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaSave, FaTimes, FaArrowLeft, FaPlus, FaTrash } from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';

const EditJob = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        department: '',
        description: '',
        location: '',
        employmentType: 'Full-Time',
        applicationDeadline: '',
        status: 'open',
        requirements: {
            education: '',
            experience: '',
            skills: [],
            qualifications: []
        },
        salary: {
            min: '',
            max: '',
            currency: 'ETB'
        }
    });
    const [newSkill, setNewSkill] = useState('');
    const [newQualification, setNewQualification] = useState('');

    useEffect(() => {
        fetchJob();
    }, [id]);

    const fetchJob = async () => {
        try {
            const response = await api.get(`/jobs/${id}`);
            const job = response.data.job;
            setFormData({
                title: job.title || '',
                department: job.department || '',
                description: job.description || '',
                location: job.location || '',
                employmentType: job.employmentType || 'Full-Time',
                applicationDeadline: job.applicationDeadline ? new Date(job.applicationDeadline).toISOString().split('T')[0] : '',
                status: job.status || 'open',
                requirements: {
                    education: job.requirements?.education || '',
                    experience: job.requirements?.experience || '',
                    skills: job.requirements?.skills || [],
                    qualifications: job.requirements?.qualifications || []
                },
                salary: {
                    min: job.salary?.min || '',
                    max: job.salary?.max || '',
                    currency: job.salary?.currency || 'ETB'
                }
            });
        } catch (error) {
            console.error('Error fetching job:', error);
            setError('Failed to load job details');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('requirements.')) {
            const field = name.split('.')[1];
            setFormData({
                ...formData,
                requirements: { ...formData.requirements, [field]: value }
            });
        } else if (name.startsWith('salary.')) {
            const field = name.split('.')[1];
            setFormData({
                ...formData,
                salary: { ...formData.salary, [field]: value }
            });
        } else {
            setFormData({ ...formData, [name]: value });
        }
        setError('');
    };

    const handleAddSkill = () => {
        if (newSkill.trim() && !formData.requirements.skills.includes(newSkill.trim())) {
            setFormData({
                ...formData,
                requirements: {
                    ...formData.requirements,
                    skills: [...formData.requirements.skills, newSkill.trim()]
                }
            });
            setNewSkill('');
        }
    };

    const handleRemoveSkill = (skill) => {
        setFormData({
            ...formData,
            requirements: {
                ...formData.requirements,
                skills: formData.requirements.skills.filter(s => s !== skill)
            }
        });
    };

    const handleAddQualification = () => {
        if (newQualification.trim() && !formData.requirements.qualifications.includes(newQualification.trim())) {
            setFormData({
                ...formData,
                requirements: {
                    ...formData.requirements,
                    qualifications: [...formData.requirements.qualifications, newQualification.trim()]
                }
            });
            setNewQualification('');
        }
    };

    const handleRemoveQualification = (qual) => {
        setFormData({
            ...formData,
            requirements: {
                ...formData.requirements,
                qualifications: formData.requirements.qualifications.filter(q => q !== qual)
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');

        if (!formData.title || !formData.department || !formData.description || !formData.location || !formData.applicationDeadline) {
            setError('Please fill in all required fields');
            setSubmitting(false);
            return;
        }

        try {
            await api.put(`/jobs/${id}`, formData);
            toast.success('Job updated successfully!');
            navigate('/hr-expert/vacancies');
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to update job';
            setError(msg);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading job details...</p>
            </Container>
        );
    }

    return (
        <section className="edit-job-section py-4">
            <Container>
                <BackButton to="/hr-expert/vacancies" />
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <Button 
                            variant="link" 
                            className="text-decoration-none p-0 mb-2 d-inline-flex align-items-center gap-2"
                            onClick={() => navigate('/hr-expert/vacancies')}
                        >
                            <FaArrowLeft /> Back to Jobs
                        </Button>
                        <h2 className="fw-bold mb-0">Edit Job</h2>
                        <p className="text-muted">Update the job posting details</p>
                    </div>
                </div>

                <Row>
                    <Col lg={8} className="mx-auto">
                        <Card className="shadow-sm">
                            <Card.Body className="p-4 p-md-5">
                                {error && (
                                    <Alert variant="danger">{error}</Alert>
                                )}

                                <Form onSubmit={handleSubmit}>
                                    {/* Basic Information */}
                                    <h5 className="fw-bold mb-3">Basic Information</h5>
                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Job Title <span className="text-danger">*</span></Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="title"
                                                value={formData.title}
                                                onChange={handleChange}
                                                placeholder="e.g., Software Developer"
                                                className="form-control-custom"
                                                required
                                            />
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Department <span className="text-danger">*</span></Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="department"
                                                value={formData.department}
                                                onChange={handleChange}
                                                placeholder="e.g., ICT"
                                                className="form-control-custom"
                                                required
                                            />
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Location <span className="text-danger">*</span></Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="location"
                                                value={formData.location}
                                                onChange={handleChange}
                                                placeholder="e.g., Hawassa"
                                                className="form-control-custom"
                                                required
                                            />
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Employment Type</Form.Label>
                                            <Form.Select
                                                name="employmentType"
                                                value={formData.employmentType}
                                                onChange={handleChange}
                                                className="form-control-custom"
                                            >
                                                <option value="Full-Time">Full-Time</option>
                                                <option value="Part-Time">Part-Time</option>
                                                <option value="Contract">Contract</option>
                                            </Form.Select>
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Status</Form.Label>
                                            <Form.Select
                                                name="status"
                                                value={formData.status}
                                                onChange={handleChange}
                                                className="form-control-custom"
                                            >
                                                <option value="open">Open</option>
                                                <option value="closed">Closed</option>
                                                <option value="draft">Draft</option>
                                            </Form.Select>
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Application Deadline <span className="text-danger">*</span></Form.Label>
                                            <Form.Control
                                                type="date"
                                                name="applicationDeadline"
                                                value={formData.applicationDeadline}
                                                onChange={handleChange}
                                                className="form-control-custom"
                                                required
                                            />
                                        </Col>
                                    </Row>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">Job Description <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            as="textarea"
                                            rows={5}
                                            name="description"
                                            value={formData.description}
                                            onChange={handleChange}
                                            placeholder="Describe the job responsibilities and requirements..."
                                            className="form-control-custom"
                                            required
                                        />
                                    </Form.Group>

                                    <hr className="my-4" />

                                    {/* Requirements */}
                                    <h5 className="fw-bold mb-3">Requirements</h5>
                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Education</Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="requirements.education"
                                                value={formData.requirements.education}
                                                onChange={handleChange}
                                                placeholder="e.g., B.Sc. Computer Science"
                                                className="form-control-custom"
                                            />
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Experience</Form.Label>
                                            <Form.Control
                                                type="text"
                                                name="requirements.experience"
                                                value={formData.requirements.experience}
                                                onChange={handleChange}
                                                placeholder="e.g., 2+ Years"
                                                className="form-control-custom"
                                            />
                                        </Col>
                                    </Row>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">Skills</Form.Label>
                                        <div className="d-flex gap-2 mb-2">
                                            <Form.Control
                                                type="text"
                                                value={newSkill}
                                                onChange={(e) => setNewSkill(e.target.value)}
                                                placeholder="Enter a skill"
                                                className="form-control-custom"
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddSkill()}
                                            />
                                            <Button onClick={handleAddSkill} variant="primary-gradient">
                                                <FaPlus />
                                            </Button>
                                        </div>
                                        <div className="d-flex flex-wrap gap-2">
                                            {formData.requirements.skills.map((skill, idx) => (
                                                <span key={idx} className="badge bg-primary p-2 d-flex align-items-center gap-2">
                                                    {skill}
                                                    <Button
                                                        variant="link"
                                                        className="p-0 text-white"
                                                        onClick={() => handleRemoveSkill(skill)}
                                                        style={{ fontSize: '0.7rem' }}
                                                    >
                                                        <FaTrash />
                                                    </Button>
                                                </span>
                                            ))}
                                        </div>
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">Qualifications</Form.Label>
                                        <div className="d-flex gap-2 mb-2">
                                            <Form.Control
                                                type="text"
                                                value={newQualification}
                                                onChange={(e) => setNewQualification(e.target.value)}
                                                placeholder="Enter a qualification"
                                                className="form-control-custom"
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddQualification()}
                                            />
                                            <Button onClick={handleAddQualification} variant="primary-gradient">
                                                <FaPlus />
                                            </Button>
                                        </div>
                                        <div className="d-flex flex-wrap gap-2">
                                            {formData.requirements.qualifications.map((qual, idx) => (
                                                <span key={idx} className="badge bg-info p-2 d-flex align-items-center gap-2">
                                                    {qual}
                                                    <Button
                                                        variant="link"
                                                        className="p-0 text-white"
                                                        onClick={() => handleRemoveQualification(qual)}
                                                        style={{ fontSize: '0.7rem' }}
                                                    >
                                                        <FaTrash />
                                                    </Button>
                                                </span>
                                            ))}
                                        </div>
                                    </Form.Group>

                                    <hr className="my-4" />

                                    {/* Salary Information */}
                                    <h5 className="fw-bold mb-3">Salary Information</h5>
                                    <Row>
                                        <Col md={4} className="mb-3">
                                            <Form.Label className="fw-semibold">Min Salary</Form.Label>
                                            <Form.Control
                                                type="number"
                                                name="salary.min"
                                                value={formData.salary.min}
                                                onChange={handleChange}
                                                placeholder="Min"
                                                className="form-control-custom"
                                            />
                                        </Col>
                                        <Col md={4} className="mb-3">
                                            <Form.Label className="fw-semibold">Max Salary</Form.Label>
                                            <Form.Control
                                                type="number"
                                                name="salary.max"
                                                value={formData.salary.max}
                                                onChange={handleChange}
                                                placeholder="Max"
                                                className="form-control-custom"
                                            />
                                        </Col>
                                        <Col md={4} className="mb-3">
                                            <Form.Label className="fw-semibold">Currency</Form.Label>
                                            <Form.Select
                                                name="salary.currency"
                                                value={formData.salary.currency}
                                                onChange={handleChange}
                                                className="form-control-custom"
                                            >
                                                <option value="ETB">ETB</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                            </Form.Select>
                                        </Col>
                                    </Row>

                                    <div className="d-flex gap-3 mt-4">
                                        <Button
                                            type="submit"
                                            variant="primary-gradient"
                                            className="flex-grow-1"
                                            disabled={submitting}
                                        >
                                            {submitting ? (
                                                <Spinner animation="border" size="sm" className="me-2" />
                                            ) : (
                                                <FaSave className="me-2" />
                                            )}
                                            Update Job
                                        </Button>
                                        <Button
                                            variant="outline-secondary"
                                            onClick={() => navigate('/hr-expert/vacancies')}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default EditJob;