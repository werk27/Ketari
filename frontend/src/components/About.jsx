import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { FaBuilding, FaUsers, FaGlobeAfrica } from 'react-icons/fa';

const About = () => {
    return (
        <div className="about-page py-5 bg-light min-vh-100">
            <Container>
                <div className="text-center mb-5 fade-in">
                    <h1 className="fw-bold display-4 text-dark mb-3">About KETARI</h1>
                    <p className="lead text-muted mx-auto" style={{ maxWidth: '700px' }}>
                        Connecting top talent with leading hr_experts across Ethiopia. 
                        We are building the future of recruitment with smart, accessible, and seamless hiring solutions.
                    </p>
                </div>
                
                <Row className="g-4 mb-5">
                    <Col md={4}>
                        <Card className="h-100 border-0 shadow-sm rounded-4 text-center p-4">
                            <Card.Body>
                                <div className="text-primary mb-3" style={{ fontSize: '3rem' }}>
                                    <FaBuilding />
                                </div>
                                <h4 className="fw-bold">For Employers</h4>
                                <p className="text-muted">
                                    Streamline your hiring process. Post jobs, manage applications, and find the perfect fit for your team with our intelligent matching system.
                                </p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="h-100 border-0 shadow-sm rounded-4 text-center p-4">
                            <Card.Body>
                                <div className="text-success mb-3" style={{ fontSize: '3rem' }}>
                                    <FaUsers />
                                </div>
                                <h4 className="fw-bold">For Candidates</h4>
                                <p className="text-muted">
                                    Discover opportunities that match your skills. Build your profile, track your applications, and land your dream job with ease.
                                </p>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={4}>
                        <Card className="h-100 border-0 shadow-sm rounded-4 text-center p-4">
                            <Card.Body>
                                <div className="text-warning mb-3" style={{ fontSize: '3rem' }}>
                                    <FaGlobeAfrica />
                                </div>
                                <h4 className="fw-bold">Our Mission</h4>
                                <p className="text-muted">
                                    To empower the Ethiopian workforce by creating a transparent, efficient, and inclusive recruitment ecosystem for everyone.
                                </p>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default About;
