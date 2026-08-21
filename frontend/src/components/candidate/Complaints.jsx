import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Badge, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { FaExclamationTriangle, FaPlus } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';

const Complaints = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [complaints, setComplaints] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        description: '',
        priority: 'medium'
    });

    useEffect(() => {
        fetchComplaints();
    }, []);

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const response = await api.get('/complaints/me');
            setComplaints(response.data.data || []);
            setError('');
        } catch (error) {
            console.error('Error fetching complaints:', error);
            setError('Failed to load complaints');
            toast.error('Failed to load complaints');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/complaints', formData);
            toast.success('Complaint submitted successfully!');
            setFormData({ title: '', category: '', description: '', priority: 'medium' });
            setShowForm(false);
            fetchComplaints();
        } catch (error) {
            console.error('Submit error:', error);
            toast.error(error.response?.data?.message || 'Failed to submit complaint');
        } finally {
            setSubmitting(false);
        }
    };

    const getPriorityBadge = (priority) => {
        const config = {
            low: { bg: 'success', text: 'Low' },
            medium: { bg: 'warning', text: 'Medium' },
            high: { bg: 'danger', text: 'High' },
            urgent: { bg: 'dark', text: 'Urgent' }
        };
        const { bg, text } = config[priority] || config.medium;
        return <Badge bg={bg}>{text}</Badge>;
    };

    const getStatusBadge = (status) => {
        const config = {
            pending: { bg: 'warning', text: 'Pending' },
            in_progress: { bg: 'info', text: 'In Progress' },
            resolved: { bg: 'success', text: 'Resolved' },
            rejected: { bg: 'danger', text: 'Rejected' }
        };
        const { bg, text } = config[status] || config.pending;
        return <Badge bg={bg}>{text}</Badge>;
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    if (loading) {
        return (
            <Container className="py-5">
                <div className="text-center">
                    <Spinner animation="border" />
                    <p className="mt-3">Loading complaints...</p>
                </div>
            </Container>
        );
    }

    return (
        <Container className="py-5">
            <BackButton to="/candidate/dashboard" />
            <Row className="mb-4">
                <Col>
                    <h2 className="fw-bold mb-1">{t('complaints.title')}</h2>
                    <p className="text-muted">{t('complaints.subtitle')}</p>
                </Col>
                <Col xs="auto">
                    <Button 
                        variant="primary" 
                        onClick={() => setShowForm(!showForm)}
                        className="d-flex align-items-center gap-2"
                    >
                        {showForm ? <FaExclamationTriangle /> : <FaPlus />}
                        {showForm ? t('complaints.view_complaints') : t('complaints.new_complaint')}
                    </Button>
                </Col>
            </Row>

            {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {showForm ? (
                <Card className="mb-4 shadow-sm">
                    <Card.Header className="bg-white fw-bold">
                        <FaExclamationTriangle className="me-2" />
                        {t('complaints.submit_complaint')}
                    </Card.Header>
                    <Card.Body>
                        <Form onSubmit={handleSubmit}>
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>{t('complaints.form.title')} *</Form.Label>
                                        <Form.Control
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => setFormData({...formData, title: e.target.value})}
                                            required
                                            placeholder={t('complaints.form.title.placeholder')}
                                        />
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>{t('complaints.form.category')} *</Form.Label>
                                        <Form.Select
                                            value={formData.category}
                                            onChange={(e) => setFormData({...formData, category: e.target.value})}
                                            required
                                        >
                                            <option value="">{t('complaints.category_placeholder')}</option>
                                            <option value="workplace">{t('complaints.form.category.workplace')}</option>
                                            <option value="salary">{t('complaints.form.category.salary')}</option>
                                            <option value="harassment">{t('complaints.form.category.harassment')}</option>
                                            <option value="management">{t('complaints.form.category.management')}</option>
                                            <option value="equipment">{t('complaints.form.category.equipment')}</option>
                                            <option value="other">{t('complaints.form.category.other')}</option>
                                        </Form.Select>
                                    </Form.Group>
                                </Col>
                            </Row>
                            <Row>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>{t('complaints.form.priority')}</Form.Label>
                                        <Form.Select
                                            value={formData.priority}
                                            onChange={(e) => setFormData({...formData, priority: e.target.value})}
                                        >
                                            <option value="low">{t('complaints.form.priority.low')}</option>
                                            <option value="medium">{t('complaints.form.priority.medium')}</option>
                                            <option value="high">{t('complaints.form.priority.high')}</option>
                                            <option value="urgent">{t('complaints.form.priority.urgent')}</option>
                                        </Form.Select>
                                    </Form.Group>
                                </Col>
                            </Row>
                            <Form.Group className="mb-3">
                                <Form.Label>{t('complaints.form.description')} *</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={5}
                                    value={formData.description}
                                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                                    required
                                    placeholder={t('complaints.form.description.placeholder')}
                                />
                            </Form.Group>
                            <div className="d-flex gap-2">
                                <Button 
                                    type="submit" 
                                    variant="primary"
                                    disabled={submitting}
                                    className="d-flex align-items-center gap-2"
                                >
                                    {submitting ? <Spinner size="sm" /> : <FaExclamationTriangle />}
                                    {t('complaints.form.submit')}
                                </Button>
                                <Button 
                                    variant="outline-secondary" 
                                    onClick={() => setShowForm(false)}
                                >
                                    {t('complaints.form.cancel')}
                                </Button>
                            </div>
                        </Form>
                    </Card.Body>
                </Card>
            ) : (
                <Card className="shadow-sm">
                    <Card.Header className="bg-white fw-bold">
                        {t('complaints.my_complaints')}
                    </Card.Header>
                    <Card.Body className="p-0">
                        {complaints.length === 0 ? (
                            <div className="text-center p-4">
                                <h2 className="fw-bold mb-4">
                                    <FaExclamationTriangle className="me-2 text-primary" /> {t('complaints.title')}
                                </h2>
                                <p className="text-muted">{t('complaints.no_complaints')}</p>
                                <Button variant="primary" onClick={() => setShowForm(true)}>
                                    {t('complaints.submit_first')}
                                </Button>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-hover mb-0">
                                    <thead className="table-light">
                                        <tr>
                                            <th>Title</th>
                                            <th>Category</th>
                                            <th>Priority</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {complaints.map((complaint) => (
                                            <tr key={complaint._id}>
                                                <td className="fw-semibold">{complaint.title}</td>
                                                <td className="text-capitalize">{complaint.category}</td>
                                                <td>{getPriorityBadge(complaint.priority)}</td>
                                                <td>{getStatusBadge(complaint.status)}</td>
                                                <td>{formatDate(complaint.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card.Body>
                </Card>
            )}
        </Container>
    );
};

export default Complaints;
