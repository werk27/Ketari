import React from 'react';
import { Container, Card, Row, Col } from 'react-bootstrap';

const TermsOfService = () => {
    return (
        <Container className="py-5">
            <Row className="justify-content-center">
                <Col lg={8}>
                    <Card className="shadow-sm">
                        <Card.Body className="p-4 p-md-5">
                            <h2 className="fw-bold text-primary mb-4">Terms of Service</h2>
                            <p className="text-muted">Last updated: August 2026</p>
                            
                            <hr />
                            
                            <h5 className="fw-bold mt-4">1. Acceptance of Terms</h5>
                            <p>By using KETARI, you agree to these Terms of Service. If you do not agree, please do not use our platform.</p>

                            <h5 className="fw-bold mt-4">2. User Accounts</h5>
                            <p>You are responsible for:</p>
                            <ul>
                                <li>Maintaining the security of your account</li>
                                <li>All activities that occur under your account</li>
                                <li>Providing accurate and truthful information</li>
                            </ul>

                            <h5 className="fw-bold mt-4">3. User Types</h5>
                            <h6 className="mt-3">Job Seekers</h6>
                            <ul>
                                <li>Can create profiles and upload resumes</li>
                                <li>Can apply for job vacancies</li>
                                <li>Can receive job recommendations</li>
                            </ul>
                            <h6 className="mt-3">Employers</h6>
                            <ul>
                                <li>Can post job vacancies</li>
                                <li>Can review applications</li>
                                <li>Can schedule interviews</li>
                            </ul>

                            <h5 className="fw-bold mt-4">4. Acceptable Use</h5>
                            <p>You agree not to:</p>
                            <ul>
                                <li>❌ Post false or misleading information</li>
                                <li>❌ Harass or discriminate against others</li>
                                <li>❌ Attempt to hack or compromise the platform</li>
                                <li>❌ Use the platform for illegal activities</li>
                            </ul>

                            <h5 className="fw-bold mt-4">5. Intellectual Property</h5>
                            <p>All content on KETARI is owned by the Sidama Innovation and Technology Agency.</p>

                            <h5 className="fw-bold mt-4">6. Limitation of Liability</h5>
                            <p>KETARI is provided "as is" without warranties of any kind. We are not liable for:</p>
                            <ul>
                                <li>Employment decisions made using our platform</li>
                                <li>Data loss or service interruptions</li>
                                <li>Actions of third-party hr_experts or job seekers</li>
                            </ul>

                            <h5 className="fw-bold mt-4">7. Termination</h5>
                            <p>We reserve the right to terminate accounts that violate these terms.</p>

                            <h5 className="fw-bold mt-4">8. Governing Law</h5>
                            <p>These terms are governed by the laws of Ethiopia.</p>

                            <hr className="mt-4" />
                            <p className="text-muted small">
                                By using KETARI, you agree to these Terms of Service.
                            </p>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </Container>
    );
};

export default TermsOfService;