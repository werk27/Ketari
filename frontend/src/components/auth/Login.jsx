import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { FaEnvelope, FaArrowRight } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { roleHomePath } from '../common/ProtectedRoute';
import PasswordInput from '../common/PasswordInput';

const Login = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const result = await login(formData.email, formData.password);
        setLoading(false);

        if (result.success) {
            // Every role lands on its own workspace. Using the shared helper keeps
            // this in step with the route guards, so adding a role never leaves a
            // user stranded on the public home page.
            navigate(roleHomePath(result.user?.role));
        } else {
            setError(result.message || t('auth.login_error'));
        }
    };

    return (
        <section className="auth-section py-5">
            <Container>
                <Row className="justify-content-center">
                    <Col lg={5} md={7}>
                        <Card className="auth-card shadow-sm border-0">
                            <Card.Body className="p-4 p-md-5">
                                <div className="text-center mb-4">
                                    <div className="auth-icon mb-3">
                                        <span style={{ fontSize: '3rem' }}>🔐</span>
                                    </div>
                                    <h3 className="fw-bold">{t('auth.login_title')}</h3>
                                    <p className="text-muted">{t('auth.login_subtitle')}</p>
                                </div>

                                {error && (
                                    <Alert variant="danger" className="rounded-3">
                                        {error}
                                    </Alert>
                                )}

                                <Form onSubmit={handleSubmit}>
                                    <Form.Group className="mb-3">
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
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">{t('auth.password')}</Form.Label>
                                        <PasswordInput
                                            name="password"
                                            placeholder={t('auth.password_placeholder')}
                                            value={formData.password}
                                            onChange={handleChange}
                                            autoComplete="current-password"
                                            required
                                        />
                                    </Form.Group>

                                    <div className="d-flex justify-content-between align-items-center mb-3">
                                        <Form.Check
                                            type="checkbox"
                                            label={t('auth.remember_me')}
                                            className="text-muted"
                                        />
                                        <Link to="/forgot-password" className="text-decoration-none">
                                            {t('auth.forgot_password')}
                                        </Link>
                                    </div>

                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="w-100 py-2 fw-semibold"
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                {t('common.loading')}
                                            </>
                                        ) : (
                                            <>
                                                {t('auth.sign_in')} <FaArrowRight className="ms-2" />
                                            </>
                                        )}
                                    </Button>
                                </Form>

                                <div className="text-center mt-4">
                                    <p className="text-muted">
                                        {t('auth.no_account')}{' '}
                                        <Link to="/register" className="fw-semibold text-decoration-none">
                                            {t('auth.sign_up_link')}
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

export default Login;