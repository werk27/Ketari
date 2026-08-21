import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaUserPlus, FaBuilding } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import PasswordInput from '../common/PasswordInput';

const Register = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'candidate'
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { register } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (formData.password !== formData.confirmPassword) {
            setError(t('auth.password_mismatch') || 'Passwords do not match');
            return;
        }

        setLoading(true);
        setError('');

        const { confirmPassword, ...userData } = formData;
        const result = await register(userData);
        setLoading(false);

        if (result.success) {
            const user = result.user;
            if (user.role === 'admin') {
                navigate('/admin/dashboard');
            } else if (user.role === 'hr_expert') {
                navigate('/hr-expert/dashboard');
            } else if (user.role === 'hr_manager') {
                navigate('/hr-manager/dashboard');
            } else if (user.role === 'employer') {
                navigate('/employer/dashboard');
            } else {
                navigate('/candidate/dashboard');
            }
        } else {
            setError(result.message);
        }
    };

    return (
        <section className="auth-section py-5">
            <Container>
                <Row className="justify-content-center">
                    <Col lg={6} md={8}>
                        <Card className="auth-card shadow-sm border-0">
                            <Card.Body className="p-4 p-md-5">
                                <div className="text-center mb-4">
                                    <div className="auth-icon mb-3">
                                        <span style={{ fontSize: '3rem' }}>🚀</span>
                                    </div>
                                    <h3 className="fw-bold">{t('auth.register_title')}</h3>
                                    <p className="text-muted">{t('auth.register_subtitle')}</p>
                                </div>

                                {error && (
                                    <Alert variant="danger" className="rounded-3">
                                        {error}
                                    </Alert>
                                )}

                                <Form onSubmit={handleSubmit}>
                                    <Row>
                                        <Col md={12} className="mb-3">
                                            <Form.Label className="fw-semibold">{t('auth.name')}</Form.Label>
                                            <div className="input-group-custom">
                                                <span className="input-icon">
                                                    <FaUser />
                                                </span>
                                                <Form.Control
                                                    type="text"
                                                    name="name"
                                                    placeholder={t('auth.name_placeholder')}
                                                    value={formData.name}
                                                    onChange={handleChange}
                                                    className="form-control-custom"
                                                    required
                                                />
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={12} className="mb-3">
                                            <Form.Label className="fw-semibold">{t('auth.email')}</Form.Label>
                                            <div className="input-group-custom">
                                                <span className="input-icon">
                                                    <FaEnvelope />
                                                </span>
                                                <Form.Control
                                                    type="email"
                                                    name="email"
                                                    placeholder={t('auth.email_placeholder')}
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    className="form-control-custom"
                                                    required
                                                />
                                            </div>
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">{t('auth.password')}</Form.Label>
                                            <PasswordInput
                                                name="password"
                                                placeholder={t('auth.password_placeholder')}
                                                value={formData.password}
                                                onChange={handleChange}
                                                autoComplete="new-password"
                                                required
                                                minLength={6}
                                            />
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">{t('auth.confirm_password')}</Form.Label>
                                            <PasswordInput
                                                name="confirmPassword"
                                                placeholder={t('auth.confirm_password')}
                                                value={formData.confirmPassword}
                                                onChange={handleChange}
                                                autoComplete="new-password"
                                                required
                                                minLength={6}
                                            />
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={12} className="mb-4">
                                            <Form.Label className="fw-semibold text-center d-block w-100 mb-3">Are you looking for a job or hiring?</Form.Label>
                                            <div className="d-flex gap-3 justify-content-center">
                                                <div 
                                                    className={`role-toggle-card ${formData.role === 'candidate' ? 'active' : ''}`}
                                                    onClick={() => setFormData({ ...formData, role: 'candidate' })}
                                                    style={{
                                                        padding: '1rem',
                                                        border: `2px solid ${formData.role === 'candidate' ? '#4F46E5' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        cursor: 'pointer',
                                                        flex: 1,
                                                        textAlign: 'center',
                                                        background: formData.role === 'candidate' ? '#EEF2FF' : '#fff',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <FaUser size={24} color={formData.role === 'candidate' ? '#4F46E5' : '#64748B'} className="mb-2" />
                                                    <h6 className={`mb-0 ${formData.role === 'candidate' ? 'text-primary fw-bold' : 'text-muted'}`}>I'm a Candidate</h6>
                                                    <small className="text-muted d-block mt-1">Looking for work</small>
                                                </div>
                                                <div 
                                                    className={`role-toggle-card ${formData.role === 'employer' ? 'active' : ''}`}
                                                    onClick={() => setFormData({ ...formData, role: 'employer' })}
                                                    style={{
                                                        padding: '1rem',
                                                        border: `2px solid ${formData.role === 'employer' ? '#4F46E5' : '#E2E8F0'}`,
                                                        borderRadius: '12px',
                                                        cursor: 'pointer',
                                                        flex: 1,
                                                        textAlign: 'center',
                                                        background: formData.role === 'employer' ? '#EEF2FF' : '#fff',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    <FaBuilding size={24} color={formData.role === 'employer' ? '#4F46E5' : '#64748B'} className="mb-2" />
                                                    <h6 className={`mb-0 ${formData.role === 'employer' ? 'text-primary fw-bold' : 'text-muted'}`}>I'm an Employer</h6>
                                                    <small className="text-muted d-block mt-1">Hiring talent</small>
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="w-100 py-2 fw-semibold mt-2"
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                {t('common.loading')}
                                            </>
                                        ) : (
                                            <>
                                                {t('auth.sign_up')} <FaUserPlus className="ms-2" />
                                            </>
                                        )}
                                    </Button>
                                </Form>

                                <div className="text-center mt-4">
                                    <p className="text-muted">
                                        {t('auth.has_account')}{' '}
                                        <Link to="/login" className="fw-semibold text-decoration-none">
                                            {t('auth.sign_in_link')}
                                        </Link>
                                    </p>
                                </div>

                                <hr className="my-4" />
                                <div className="text-center">
                                    <p className="text-muted small">
                                        {t('auth.terms')}
                                    </p>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default Register;