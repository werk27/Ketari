import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button } from 'react-bootstrap';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaPaperPlane } from 'react-icons/fa';
import { toast } from 'react-toastify';

// Hawassa, Sidama Region, Ethiopia (7.0621 N, 38.4764 E). OpenStreetMap's embed
// needs no API key, so the map keeps working without any billing setup.
const HAWASSA_LAT = 7.0621;
const HAWASSA_LON = 38.4764;
const HAWASSA_MAP_EMBED = `https://www.openstreetmap.org/export/embed.html?bbox=${HAWASSA_LON - 0.035}%2C${HAWASSA_LAT - 0.03}%2C${HAWASSA_LON + 0.035}%2C${HAWASSA_LAT + 0.03}&layer=mapnik&marker=${HAWASSA_LAT}%2C${HAWASSA_LON}`;
const HAWASSA_MAP_LINK = `https://www.openstreetmap.org/?mlat=${HAWASSA_LAT}&mlon=${HAWASSA_LON}#map=13/${HAWASSA_LAT}/${HAWASSA_LON}`;

const Contact = () => {
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        // Mock submission
        toast.success("Thank you for reaching out! We'll get back to you soon.");
        setFormData({ name: '', email: '', message: '' });
    };

    return (
        <div className="contact-page py-5 bg-light min-vh-100">
            <Container>
                <div className="text-center mb-5 fade-in">
                    <h1 className="fw-bold display-4 text-dark mb-3">Contact Us</h1>
                    <p className="lead text-muted mx-auto" style={{ maxWidth: '600px' }}>
                        Have a question or need assistance? We're here to help. Reach out to the KETARI team.
                    </p>
                </div>
                
                <Row className="g-4">
                    <Col md={5}>
                        <Card className="h-100 border-0 shadow-sm rounded-4 p-4 text-white" style={{ background: 'var(--gradient-primary)' }}>
                            <Card.Body>
                                <h3 className="fw-bold mb-4 text-white">Get in Touch</h3>
                                <p className="mb-4">Fill out the form and our team will get back to you within 24 hours.</p>
                                
                                <div className="d-flex align-items-center mb-4">
                                    <div className="bg-white text-primary rounded-circle p-3 me-3">
                                        <FaPhone />
                                    </div>
                                    <div>
                                        <h6 className="mb-0 fw-bold text-white">Call Us</h6>
                                        <a href="tel:+251926229195" className="text-white text-decoration-none">0926 229 195</a>
                                    </div>
                                </div>
                                
                                <div className="d-flex align-items-center mb-4">
                                    <div className="bg-white text-primary rounded-circle p-3 me-3">
                                        <FaEnvelope />
                                    </div>
                                    <div>
                                        <h6 className="mb-0 fw-bold text-white">Email Us</h6>
                                        <a href="mailto:gudinaware2622@gmail.com" className="text-white text-decoration-none text-break">gudinaware2622@gmail.com</a>
                                    </div>
                                </div>
                                
                                <div className="d-flex align-items-center">
                                    <div className="bg-white text-primary rounded-circle p-3 me-3">
                                        <FaMapMarkerAlt />
                                    </div>
                                    <div>
                                        <h6 className="mb-0 fw-bold text-white">Location</h6>
                                        <span>Hawassa, Sidama Region, Ethiopia</span>
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                    
                    <Col md={7}>
                        <Card className="h-100 border-0 shadow-sm rounded-4 p-4">
                            <Card.Body>
                                <h3 className="fw-bold mb-4">Send a Message</h3>
                                <Form onSubmit={handleSubmit}>
                                    <Form.Group className="mb-4">
                                        <Form.Label className="fw-semibold">Your Name</Form.Label>
                                        <Form.Control 
                                            type="text" 
                                            placeholder="Enter your name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                            required
                                            className="p-3 bg-light border-0 rounded-3"
                                        />
                                    </Form.Group>
                                    
                                    <Form.Group className="mb-4">
                                        <Form.Label className="fw-semibold">Email Address</Form.Label>
                                        <Form.Control 
                                            type="email" 
                                            placeholder="Enter your email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                                            required
                                            className="p-3 bg-light border-0 rounded-3"
                                        />
                                    </Form.Group>
                                    
                                    <Form.Group className="mb-4">
                                        <Form.Label className="fw-semibold">Your Message</Form.Label>
                                        <Form.Control 
                                            as="textarea" 
                                            rows={5}
                                            placeholder="How can we help you?"
                                            value={formData.message}
                                            onChange={(e) => setFormData({...formData, message: e.target.value})}
                                            required
                                            className="p-3 bg-light border-0 rounded-3"
                                        />
                                    </Form.Group>
                                    
                                    <Button type="submit" variant="primary" size="lg" className="w-100 rounded-pill fw-bold">
                                        <FaPaperPlane className="me-2" /> Send Message
                                    </Button>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row className="mt-4">
                    <Col>
                        <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                            <Card.Body className="p-4 pb-3">
                                <h3 className="fw-bold mb-1">Find Us in Hawassa</h3>
                                <p className="text-muted mb-0">
                                    <FaMapMarkerAlt className="me-2 text-danger" />
                                    Hawassa, Sidama Region, Ethiopia
                                </p>
                            </Card.Body>
                            <iframe
                                title="Map of Hawassa, Sidama Region, Ethiopia"
                                src={HAWASSA_MAP_EMBED}
                                width="100%"
                                height="420"
                                style={{ border: 0, display: 'block' }}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                            />
                            <Card.Body className="py-3 text-center">
                                <a
                                    href={HAWASSA_MAP_LINK}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="fw-semibold text-decoration-none"
                                >
                                    View a larger map of Hawassa
                                </a>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default Contact;
