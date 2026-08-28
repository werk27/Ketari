import React, { useCallback, useEffect, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaKey } from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { roleHomePath } from '../common/ProtectedRoute';
import PasswordInput from '../common/PasswordInput';

/**
 * Set/reset a password from a mailed link.
 *
 * Serves two callers that already share the exact same backend token
 * mechanism (User.getResetPasswordToken / resetPasswordToken /
 * resetPasswordExpire, consumed by PUT /api/auth/resetpassword/:token,
 * neither of which is touched here):
 *   - the pre-existing "forgot password" flow (never had a frontend page
 *     before this one - the backend endpoints existed but nothing rendered
 *     them), and
 *   - the newer "set up your account" email sent when an Employer creates
 *     an account or assigns an organizational role (see
 *     employeeController.deliverAccountCredentials), which reuses this same
 *     token/page rather than inventing a second one.
 *
 * The role that determines which workspace this person lands in was already
 * decided before this email was ever sent (by the Employer, via account
 * creation or role assignment) - this page only ever sets a password, it
 * never changes a role.
 */
const ResetPassword = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { applySession } = useAuth();

    const [checking, setChecking] = useState(true);
    const [validToken, setValidToken] = useState(false);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const verify = useCallback(async () => {
        setChecking(true);
        setError('');
        try {
            await api.get(`/auth/verifyresettoken/${token}`);
            setValidToken(true);
        } catch (err) {
            setValidToken(false);
            setError(describeApiError(err, 'This link is invalid or has expired.'));
        } finally {
            setChecking(false);
        }
    }, [token]);

    useEffect(() => { verify(); }, [verify]);

    const submit = async (e) => {
        e.preventDefault();

        if (password.length < 6) {
            setError('Your password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            setError('The two passwords do not match.');
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const res = await api.put(`/auth/resetpassword/${token}`, { password });
            // The response already carries a fresh session, so the person
            // lands directly in their workspace instead of being asked to
            // sign in again with the password they just chose.
            applySession(res.data.token, res.data.user);
            navigate(roleHomePath(res.data.user?.role));
        } catch (err) {
            setError(describeApiError(err, 'Your password could not be set.'));
            setSubmitting(false);
        }
    };

    if (checking) {
        return (
            <section className="auth-section py-5">
                <Container className="text-center py-5">
                    <Spinner animation="border" variant="primary" />
                    <div className="text-muted mt-3">Checking your link…</div>
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
                                    <div style={{ fontSize: '2rem' }}>🔐</div>
                                    <h3 className="fw-bold mb-1">Set your password</h3>
                                    <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
                                        Choose a password to sign in with.
                                    </p>
                                </div>

                                {error && <Alert variant="danger" className="py-2" style={{ fontSize: '0.85rem' }}>{error}</Alert>}

                                {!validToken ? (
                                    <div className="text-center">
                                        <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                                            Ask your organization administrator to resend your login credentials,
                                            or request a new password reset from the login page.
                                        </p>
                                        <Link to="/login" className="btn btn-outline-primary btn-sm">
                                            Back to sign in
                                        </Link>
                                    </div>
                                ) : (
                                    <Form onSubmit={submit}>
                                        <Form.Group className="mb-3">
                                            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                New password
                                            </Form.Label>
                                            <PasswordInput
                                                value={password}
                                                onChange={e => setPassword(e.target.value)}
                                                placeholder="At least 6 characters"
                                                autoComplete="new-password"
                                            />
                                        </Form.Group>
                                        <Form.Group className="mb-3">
                                            <Form.Label className="fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                Confirm password
                                            </Form.Label>
                                            <PasswordInput
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                                placeholder="Repeat the password"
                                                autoComplete="new-password"
                                            />
                                        </Form.Group>

                                        <Button type="submit" variant="primary" className="w-100 py-2 fw-semibold"
                                                disabled={submitting}>
                                            {submitting ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                                    Setting password…
                                                </>
                                            ) : (
                                                <><FaKey className="me-2" />Set password and sign in</>
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

export default ResetPassword;
