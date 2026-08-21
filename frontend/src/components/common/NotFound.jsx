import React from 'react';
import { Container, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaHome, FaSearch } from 'react-icons/fa';

const NotFound = () => {
    return (
        <div className="not-found-page min-vh-100 d-flex align-items-center bg-light">
            <Container className="text-center">
                <h1 className="display-1 fw-bold text-primary mb-0">404</h1>
                <h2 className="fw-bold mb-4">Page Not Found</h2>
                <p className="text-muted mb-5 lead mx-auto" style={{ maxWidth: '500px' }}>
                    Oops! The page you are looking for doesn't exist, has been moved, or is temporarily unavailable.
                </p>
                <div className="d-flex justify-content-center gap-3 flex-wrap">
                    <Button as={Link} to="/" variant="primary" size="lg" className="rounded-pill px-4 fw-bold">
                        <FaHome className="me-2" /> Back to Home
                    </Button>
                    <Button as={Link} to="/jobs" variant="outline-primary" size="lg" className="rounded-pill px-4 fw-bold">
                        <FaSearch className="me-2" /> Browse Jobs
                    </Button>
                </div>
            </Container>
        </div>
    );
};

export default NotFound;