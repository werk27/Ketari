import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { FaSave, FaTimes, FaPlus, FaTrash } from 'react-icons/fa';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';
import { useAuth } from '../../context/AuthContext';

const PostJob = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        department: '',
        description: '',
        location: '',
        employmentType: 'Full-Time',
        applicationDeadline: '',
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

    const handleSubmit = async (e, intent = 'submit') => {
        if (e && e.preventDefault) e.preventDefault();
        setLoading(true);
        setError('');

        // Validation
        if (!formData.title || !formData.department || !formData.description || !formData.location || !formData.applicationDeadline) {
            setError('Please fill in all required fields');
            setLoading(false);
            return;
        }

        try {
            // The HR Expert may only save a draft or submit for approval.
            // Publishing is the HR Manager's decision, enforced by the backend.
            const payload = { ...formData, action: intent };
            await api.post('/jobs', payload);
            const msg = intent === 'submit'
                ? 'Vacancy submitted for HR Manager approval'
                : 'Draft saved. You can submit it for approval later.';
            toast.success(msg);
            navigate('/hr-expert/vacancies');
        } catch (error) {
            const msg = error.response?.data?.message || 'Failed to save vacancy';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="post-job-section py-4">
            <Container>
                <BackButton to={user?.role === 'employer' ? '/employer/dashboard' : '/hr-expert/dashboard'} />
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 className="fw-bold mb-0">{t('hr_expert.post_new_job')}</h2>
                        <p className="text-muted">{t('jobs.fill_details')}</p>
                    </div>
                    <Button variant="outline-secondary" onClick={() => navigate(user?.role === 'employer' ? '/employer/dashboard' : '/hr-expert/dashboard')}>
                        <FaTimes className="me-2" /> Cancel
                    </Button>
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

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">Application Deadline <span className="text-danger">*</span></Form.Label>
                                        <Form.Control
                                            type="date"
                                            name="applicationDeadline"
                                            value={formData.applicationDeadline}
                                            onChange={handleChange}
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
                                            <Button onClick={handleAddSkill} variant="primary">
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
                                            <Button onClick={handleAddQualification} variant="primary">
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
                                             type="button"
                                             variant="outline-secondary"
                                             className="flex-grow-1 fw-semibold"
                                             disabled={loading}
                                             onClick={(e) => handleSubmit(e, 'draft')}
                                         >
                                             {loading ? (
                                                 <Spinner animation="border" size="sm" className="me-2" />
                                             ) : (
                                                 <FaSave className="me-2" />
                                             )}
                                             Save Draft
                                         </Button>

                                         <Button
                                             type="button"
                                             variant="primary"
                                             className="flex-grow-1 fw-semibold"
                                             disabled={loading}
                                             onClick={(e) => handleSubmit(e, 'submit')}
                                         >
                                             {loading ? (
                                                 <Spinner animation="border" size="sm" className="me-2" />
                                             ) : (
                                                 <FaSave className="me-2" />
                                             )}
                                             Submit for HR Manager Approval
                                         </Button>
                                         <Button
                                            variant="link"
                                            className="text-muted"
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

export default PostJob;