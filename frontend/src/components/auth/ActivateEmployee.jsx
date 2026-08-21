import React, { useCallback, useEffect, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaUserCheck, FaBuilding } from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PasswordInput from '../common/PasswordInput';

/**
 * Employee account activation.
 *
 * A hiring decision records the employment; it does not hand over the employee
 * workspace. This page is where the person takes that step themselves, which
 * is why the role only changes here and not when the HR Manager approves.
 *
 * The account already exists from when they applied, so choosing a new password
 * is offered rather than required - forcing a reset on someone who remembers
 * their password only adds a way to get locked out.
 */
const ActivateEmployee = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { applySession } = useAuth();

    const [checking, setChecking] = useState(true);
    const [invite, setInvite] = useState(null);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const verify = useCallback(async () => {
        setChecking(true);
        setError('');
        try {
            const res = await api.get(`/auth/activate-employee/${token}`);
            setInvite(res.data);
        } catch (err) {
            setError(describeApiError(err, 'This activation link could not be checked.'));
        } finally {
            setChecking(false);
        }
    }, [token]);

    useEffect(() => { verify(); }, [verify]);

    const activate = async (e) => {
        e.preventDefault();

        if (password && password !== confirmPassword) {
            setError('The two passwords do not match.');
            return;
        }
        if (password && password.length < 6) {
            setError('A new password must be at least 6 characters.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const res = await api.post(`/auth/activate-employee/${token}`,
                password ? { password } : {});
            // Activation returns a session, so the person lands in the portal
            // already signed in rather than being asked to log in again.
            applySession(res.data.token, res.data.user);
            navigate('/employee/onboarding');
        } catch (err) {
            setError(describeApiError(err, 'Your account could not be activated.'));
            setSubmitting(false);
        }
    };

    if (checking) {
        return (
            <section className="auth-section py-5">
                <Container className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <div className="text-muted mt-3">Checking your activation link…</div>
                </Container>
            </section>
        );
    }

    return (
        <section className="auth-section py-5">
            <Container>
                <Row className="justify-content-center">
                    <Col md={7} lg={6}>
                        <Card className="border-0 shadow-sm" style={{ borderRadius: 16 }}>
                            <Card.Body className="p-4">
                                <div className="text-center mb-4">
                                    <div style={{ fontSize: '2rem' }}>🎉</div>
                                    <h3 className="fw-bold mb-1">Activate your employee account</h3>
                                    {invite && (
                                        <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                                            Welcome, {invite.name}
                                            {invite.organization && (
                                                <> — you have been hired by <strong>{invite.organization}</strong></>
                                            )}
                                        </p>
                                    )}
                                </div>

                                {error && <Alert variant="danger" className="py-2" style={{ fontSize: '0.85rem' }}>{error}</Alert>}

                                {!invite ? (
                                    <div className="text-center">
                                        <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                                            Ask your HR team to send a new activation link.
                                        </p>
                                        <Link to="/login" className="btn btn-outline-primary btn-sm">
                                            Back to sign in
                                        </Link>
                                    </div>
                                ) : (
                                    <Form onSubmit={activate}>
                                        <div className="mb-3 p-3 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                            <div className="d-flex align-items-center gap-2 mb-1" style={{ fontSize: '0.84rem' }}>
                                                <FaBuilding className="text-primary" />
                                                <strong>{invite.organization || 'Your organization'}</strong>
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                Activating gives you the employee portal for this organization:
                                                your profile, documents, leave, requests, training and attendance.
                                            </div>
                                        </div>

                                        <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                                            Choose a new password <span className="text-muted fw-normal">(optional)</span>
                                        </Form.Label>
                                        <PasswordInput
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="Leave blank to keep your current password"
                                        />
                                        {password && (
                                            <div className="mt-2">
                                                <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                    Confirm new password
                                                </Form.Label>
                                                <PasswordInput
                                                    value={confirmPassword}
                                                    onChange={e => setConfirmPassword(e.target.value)}
                                                    placeholder="Repeat the new password"
                                                />
                                            </div>
                                        )}
                                        <div className="text-muted mt-2 mb-3" style={{ fontSize: '0.76rem' }}>
                                            You already have an account from when you applied, so you can keep the
                                            password you used then.
                                        </div>

                                        <Button type="submit" variant="primary" className="w-100 py-2 fw-semibold"
                                                disabled={submitting}>
                                            {submitting ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                                    Activating…
                                                </>
                                            ) : (
                                                <><FaUserCheck className="me-2" />Activate and continue</>
                                            )}
                                        </Button>
                                    </Form>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default ActivateEmployee;
