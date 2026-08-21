import React from 'react';
import { Container, Card, Row, Col, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaShieldAlt, FaUserSecret, FaDatabase, FaFileContract, FaCookie, FaEnvelope } from 'react-icons/fa';

const PrivacyPolicy = () => {
    return (
        <Container className="py-5">
            <Row className="justify-content-center">
                <Col lg={9}>
                    <Card className="shadow-sm border-0">
                        <Card.Body className="p-4 p-md-5">
                            {/* Header */}
                            <div className="text-center mb-4">
                                <div className="mb-3">
                                    <FaShieldAlt size={50} className="text-primary" />
                                </div>
                                <h1 className="fw-bold text-primary">Privacy Policy</h1>
                                <p className="text-muted">Last updated: August 2026</p>
                                <Badge bg="primary" className="px-3 py-2">
                                    <FaUserSecret className="me-2" />
                                    Your Privacy Matters
                                </Badge>
                            </div>

                            <hr />

                            {/* Introduction */}
                            <div className="mb-4">
                                <p className="lead">
                                    At <strong>KETARI</strong>, we are committed to protecting your privacy and 
                                    ensuring the security of your personal information. This Privacy Policy explains 
                                    how we collect, use, and safeguard your data.
                                </p>
                            </div>

                            {/* Section 1 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaDatabase className="me-2" />
                                    1. Information We Collect
                                </h5>
                                <p>We collect the following types of information to provide and improve our recruitment services:</p>
                                <ul className="list-unstyled">
                                    <li className="mb-2">
                                        <span className="fw-semibold">📝 Personal Information:</span>
                                        <span className="text-muted"> Name, email address, phone number, and location</span>
                                    </li>
                                    <li className="mb-2">
                                        <span className="fw-semibold">📄 Professional Information:</span>
                                        <span className="text-muted"> Resume, skills, education, work experience, and certifications</span>
                                    </li>
                                    <li className="mb-2">
                                        <span className="fw-semibold">📊 Usage Data:</span>
                                        <span className="text-muted"> How you interact with our platform, pages visited, and actions taken</span>
                                    </li>
                                    <li>
                                        <span className="fw-semibold">🍪 Cookies:</span>
                                        <span className="text-muted"> We use cookies to enhance your experience and analyze platform usage</span>
                                    </li>
                                </ul>
                            </div>

                            {/* Section 2 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaFileContract className="me-2" />
                                    2. How We Use Your Information
                                </h5>
                                <p>Your information is used for the following purposes:</p>
                                <ul>
                                    <li>🔍 <strong>Job Matching:</strong> Finding suitable job opportunities based on your profile</li>
                                    <li>📋 <strong>Application Processing:</strong> Submitting and tracking job applications</li>
                                    <li>📧 <strong>Communication:</strong> Notifying you about application status, interviews, and updates</li>
                                    <li>🤖 <strong>AI Improvements:</strong> Enhancing our AI matching algorithms for better recommendations</li>
                                    <li>📊 <strong>Analytics:</strong> Understanding platform usage and improving user experience</li>
                                </ul>
                            </div>

                            {/* Section 3 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaShieldAlt className="me-2" />
                                    3. Data Protection & Security
                                </h5>
                                <p>We implement robust security measures to protect your data:</p>
                                <div className="row g-2">
                                    <div className="col-md-4">
                                        <div className="p-2 border rounded text-center bg-white">
                                            <span className="fs-2 d-block">🔒</span>
                                            <small className="fw-semibold">Encryption</small>
                                            <p className="small text-muted mb-0">Data encrypted in transit and at rest</p>
                                        </div>
                                    </div>
                                    <div className="col-md-4">
                                        <div className="p-2 border rounded text-center bg-white">
                                            <span className="fs-2 d-block">🔐</span>
                                            <small className="fw-semibold">Password Hashing</small>
                                            <p className="small text-muted mb-0">Bcrypt password protection</p>
                                        </div>
                                    </div>
                                    <div className="col-md-4">
                                        <div className="p-2 border rounded text-center bg-white">
                                            <span className="fs-2 d-block">🛡️</span>
                                            <small className="fw-semibold">Regular Audits</small>
                                            <p className="small text-muted mb-0">Security audits and vulnerability scanning</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 4 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaCookie className="me-2" />
                                    4. Data Sharing & Third Parties
                                </h5>
                                <p>Your data is shared only when necessary:</p>
                                <ul>
                                    <li>
                                        <strong>🏢 Employers:</strong> 
                                        <span className="text-muted"> When you apply for a job, your profile is shared with the hr_expert</span>
                                    </li>
                                    <li>
                                        <strong>🔧 Service Providers:</strong> 
                                        <span className="text-muted"> Hosting, email, and analytics services that process data on our behalf</span>
                                    </li>
                                    <li className="text-success fw-semibold">
                                        ✅ <strong>We do not sell your data to third parties.</strong>
                                    </li>
                                </ul>
                            </div>

                            {/* Section 5 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaUserSecret className="me-2" />
                                    5. Your Rights
                                </h5>
                                <p>You have the following rights regarding your personal data:</p>
                                <div className="row g-2">
                                    <div className="col-md-6">
                                        <div className="p-2 border rounded bg-white">
                                            <span className="fw-semibold">✅ Access</span>
                                            <p className="small text-muted mb-0">Request a copy of your personal data</p>
                                        </div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="p-2 border rounded bg-white">
                                            <span className="fw-semibold">✏️ Correction</span>
                                            <p className="small text-muted mb-0">Update or correct inaccurate data</p>
                                        </div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="p-2 border rounded bg-white">
                                            <span className="fw-semibold">🗑️ Deletion</span>
                                            <p className="small text-muted mb-0">Delete your account and associated data</p>
                                        </div>
                                    </div>
                                    <div className="col-md-6">
                                        <div className="p-2 border rounded bg-white">
                                            <span className="fw-semibold">📤 Export</span>
                                            <p className="small text-muted mb-0">Download your data in a portable format</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 6 */}
                            <div className="mb-4 p-3 bg-light rounded">
                                <h5 className="fw-bold text-primary">
                                    <FaEnvelope className="me-2" />
                                    6. Contact Us
                                </h5>
                                <p>If you have any questions about this Privacy Policy, please contact us:</p>
                                <div className="p-3 bg-white border rounded">
                                    <p className="mb-1">
                                        <strong>Sidama Innovation and Technology Agency</strong>
                                    </p>
                                    <p className="mb-1 text-muted">
                                        📍 Hawassa, Sidama Region
                                    </p>
                                    <p className="mb-0 text-muted">
                                        📧 Email: <a href="mailto:privacy@ketari.et" className="text-primary">privacy@ketari.et</a>
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <hr />
                            <div className="text-center">
                                <p className="text-muted small">
                                    By using KETARI, you agree to this Privacy Policy.
                                </p>
                                <div className="d-flex justify-content-center gap-3 mt-2">
                                    <Link to="/" className="text-decoration-none text-muted small">Home</Link>
                                    <Link to="/terms" className="text-decoration-none text-muted small">Terms of Service</Link>
                                    <Link to="/contact" className="text-decoration-none text-muted small">Contact</Link>
                                </div>
                                <p className="text-muted small mt-3">
                                    © {new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency
                                </p>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default PrivacyPolicy;