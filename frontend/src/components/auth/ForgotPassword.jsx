import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaArrowRight } from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';

/**
 * Request a password reset link by email.
 *
 * The link a submission emails out is consumed by ResetPassword.jsx at
 * /reset-password/:token, which already exists and is unchanged by this
 * page - both share the exact same backend token mechanism
 * (authController.forgotPassword / resetPassword / verifyResetToken).
 *
 * The confirmation shown here is deliberately the same whether or not the
 * email address is registered (see authController.forgotPassword) - the
 * backend never reveals which addresses have an account, so this page must
 * not either.
 */
const ForgotPassword = () => {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/auth/forgotpassword', { email });
            setSubmitted(true);
        } catch (err) {
            setError(describeApiError(err, 'Could not process this request. Please try again.'));
        } finally {
            setLoading(false);
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
                                        <span style={{ fontSize: '3rem' }}>🔑</span>
                                    </div>
                                    <h3 className="fw-bold">Forgot your password?</h3>
                                    <p className="text-muted">
                                        Enter your email address and we will send you a link to reset it.
                                    </p>
                                </div>

                                {error && (
                                    <Alert variant="danger" className="rounded-3">
                                        {error}
                                    </Alert>
                                )}

                                {submitted ? (
                                    <Alert variant="success" className="rounded-3" style={{ fontSize: '0.9rem' }}>
                                        If an account exists for <strong>{email}</strong>, a password reset link has
                                        been sent. Check your inbox (and spam folder) for an email from KETARI.
                                    </Alert>
                                ) : (
                                    <Form onSubmit={handleSubmit}>
                                        <Form.Group className="mb-3">
                                            <Form.Label className="fw-semibold">Email address</Form.Label>
                                            <div className="input-group-custom">
                                                <span className="input-icon">
                                                    <FaEnvelope />
                                                </span>
                                                <Form.Control
                                                    type="email"
                                                    placeholder="you@example.com"
                                                    value={email}
                                                    onChange={e => setEmail(e.target.value)}
                                                    className="form-control-custom"
                                                    required
                                                />
                                            </div>
                                        </Form.Group>

                                        <Button
                                            type="submit"
                                            variant="primary"
                                            className="w-100 py-2 fw-semibold"
                                            disabled={loading}
                                        >
                                            {loading ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                    Sending…
                                                </>
                                            ) : (
                                                <>
                                                    Send reset link <FaArrowRight className="ms-2" />
                                                </>
                                            )}
                                        </Button>
                                    </Form>
                                )}

                                <div className="text-center mt-4">
                                    <Link to="/login" className="fw-semibold text-decoration-none">
                                        Back to sign in
                                    </Link>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default ForgotPassword;
