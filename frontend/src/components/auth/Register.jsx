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
    // Employer sign-ups are reviewed by an administrator before the organization
    // may publish vacancies, so the identifying details are collected up front
    // rather than leaving the reviewer with only a typed-in name to judge.
    const [company, setCompany] = useState({
        name: '',
        organizationType: 'private_company',
        tin: '',
        businessLicenceNumber: '',
        licenceExpiryDate: '',
        industry: '',
        phone: '',
        city: '',
        website: ''
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

    const handleCompanyChange = (e) => {
        setCompany({ ...company, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (formData.password !== formData.confirmPassword) {
            setError(t('auth.password_mismatch') || 'Passwords do not match');
            return;
        }

        const licenceExempt = ['government', 'ngo'].includes(company.organizationType);
        if (formData.role === 'employer') {
            if (!company.name.trim()) {
                setError('Enter your organization name.');
                return;
            }
            if (!company.tin.trim()) {
                setError('Enter your Tax Identification Number (TIN).');
                return;
            }
            if (!licenceExempt && !company.businessLicenceNumber.trim()) {
                setError('Enter your business or trade licence number.');
                return;
            }
        }

        setLoading(true);
        setError('');

        const { confirmPassword, ...userData } = formData;
        if (formData.role === 'employer') {
            userData.company = { ...company, legalName: company.name };
        }
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

                                    {formData.role === 'employer' && (
                                        <div className="mb-3 p-3 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <h6 className="fw-bold text-dark mb-1" style={{ fontSize: '0.9rem' }}>
                                                <FaBuilding className="me-2 text-primary" />Organization details
                                            </h6>
                                            <p className="text-muted mb-3" style={{ fontSize: '0.76rem' }}>
                                                A System Administrator verifies your organization before you can
                                                publish vacancies. Provide details that match your official records.
                                            </p>

                                            <Row className="g-2">
                                                <Col md={12}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Registered organization name *
                                                    </Form.Label>
                                                    <Form.Control name="name" value={company.name}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="Exactly as written on your licence" />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Organization type *
                                                    </Form.Label>
                                                    <Form.Select name="organizationType" value={company.organizationType}
                                                                 onChange={handleCompanyChange}>
                                                        <option value="private_company">Private company</option>
                                                        <option value="sole_proprietor">Sole proprietor</option>
                                                        <option value="government">Government body</option>
                                                        <option value="ngo">NGO / non-profit</option>
                                                        <option value="other">Other</option>
                                                    </Form.Select>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        TIN *
                                                    </Form.Label>
                                                    <Form.Control name="tin" value={company.tin}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="Tax Identification Number" />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Business / trade licence number
                                                        {!['government', 'ngo'].includes(company.organizationType) && ' *'}
                                                    </Form.Label>
                                                    <Form.Control name="businessLicenceNumber"
                                                                  value={company.businessLicenceNumber}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder={['government', 'ngo'].includes(company.organizationType)
                                                                      ? 'Authorising letter reference'
                                                                      : 'Licence number'} />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Licence expiry date
                                                    </Form.Label>
                                                    <Form.Control type="date" name="licenceExpiryDate"
                                                                  value={company.licenceExpiryDate}
                                                                  onChange={handleCompanyChange} />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Industry
                                                    </Form.Label>
                                                    <Form.Control name="industry" value={company.industry}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="e.g. Technology" />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Official phone
                                                    </Form.Label>
                                                    <Form.Control name="phone" value={company.phone}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="+251 …" />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        City / town
                                                    </Form.Label>
                                                    <Form.Control name="city" value={company.city}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="e.g. Hawassa" />
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Label className="fw-semibold" style={{ fontSize: '0.78rem' }}>
                                                        Website
                                                    </Form.Label>
                                                    <Form.Control name="website" value={company.website}
                                                                  onChange={handleCompanyChange}
                                                                  placeholder="https://…" />
                                                </Col>
                                            </Row>
                                            <div className="text-muted mt-2" style={{ fontSize: '0.74rem' }}>
                                                After signing up, upload your licence or TIN certificate from your
                                                organization profile to complete the application.
                                            </div>
                                        </div>
                                    )}

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