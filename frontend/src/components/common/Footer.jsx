import React, { useState } from 'react';
import { Container, Row, Col, Form, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { 
    FaLinkedin, 
    FaTwitter, 
    FaFacebook, 
    FaYoutube, 
    FaPaperPlane, 
    FaMapMarkerAlt, 
    FaEnvelope, 
    FaPhoneAlt, 
    FaShieldAlt, 
    FaFileContract, 
    FaQuestionCircle, 
    FaComments,
    FaCheckCircle
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { useLanguage } from '../../context/LanguageContext';
import './Footer.css';

const Footer = () => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);

    const handleNewsletterSubmit = (e) => {
        e.preventDefault();
        if (!email.trim()) {
            toast.warning('Please enter a valid email address.');
            return;
        }
        setSubscribed(true);
        toast.success(t('footer.subscribed_success') || 'Thank you for subscribing to job alerts!');
        setEmail('');
    };

    return (
        <footer className="footer">
            <Container>
                {/* Newsletter Subscription Banner */}
                <div className="footer-newsletter-card">
                    <Row className="align-items-center">
                        <Col lg={6} className="mb-3 mb-lg-0">
                            <div className="d-flex align-items-center gap-3">
                                <div className="newsletter-icon-wrapper">
                                    <FaPaperPlane className="newsletter-icon" />
                                </div>
                                <div>
                                    <h5 className="newsletter-title mb-1">
                                        {t('footer.newsletter_title')}
                                    </h5>
                                    <p className="newsletter-subtitle mb-0">
                                        {t('footer.newsletter_desc')}
                                    </p>
                                </div>
                            </div>
                        </Col>
                        <Col lg={6}>
                            {subscribed ? (
                                <div className="newsletter-success-badge">
                                    <FaCheckCircle className="me-2 text-success" />
                                    <span>{t('footer.subscribed_success')}</span>
                                </div>
                            ) : (
                                <Form onSubmit={handleNewsletterSubmit} className="newsletter-form">
                                    <Form.Control
                                        type="email"
                                        placeholder={t('footer.email_placeholder')}
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="newsletter-input"
                                        required
                                    />
                                    <Button type="submit" className="newsletter-btn">
                                        <span>{t('footer.subscribe')}</span>
                                        <FaPaperPlane className="ms-2" />
                                    </Button>
                                </Form>
                            )}
                        </Col>
                    </Row>
                </div>

                {/* Main Footer Navigation Columns */}
                <Row className="py-5 footer-content-grid">
                    {/* Brand & Mission Column */}
                    <Col lg={4} md={6} className="mb-4 mb-lg-0">
                        <h5 className="footer-brand">
                            <span className="brand-icon">🤖</span> KETARI
                        </h5>
                        <p className="footer-text">
                            {t('footer.description')}
                        </p>
                        <div className="social-icons mt-4">
                            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="social-link" title="LinkedIn"><FaLinkedin /></a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="social-link" title="Twitter"><FaTwitter /></a>
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-link" title="Facebook"><FaFacebook /></a>
                            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="social-link" title="YouTube"><FaYoutube /></a>
                        </div>
                    </Col>

                    {/* Quick Links Column */}
                    <Col lg={2} md={6} className="mb-4 mb-lg-0">
                        <h6 className="footer-heading">{t('footer.quick_links')}</h6>
                        <ul className="footer-links">
                            <li><Link to="/">{t('nav.home')}</Link></li>
                            <li><Link to="/jobs">{t('nav.jobs')}</Link></li>
                            <li><Link to="/about">{t('footer.about')}</Link></li>
                            <li><Link to="/candidate/complaints"><FaComments className="me-2 text-primary-light" />{t('footer.complaints')}</Link></li>
                        </ul>
                    </Col>

                    {/* Legal & Security Column */}
                    <Col lg={3} md={6} className="mb-4 mb-lg-0">
                        <h6 className="footer-heading">{t('footer.legal')}</h6>
                        <ul className="footer-links">
                            <li>
                                <Link to="/privacy" className="d-inline-flex align-items-center">
                                    <FaShieldAlt className="me-2 text-accent" /> {t('footer.privacy')}
                                </Link>
                            </li>
                            <li>
                                <Link to="/terms" className="d-inline-flex align-items-center">
                                    <FaFileContract className="me-2 text-accent" /> {t('footer.terms')}
                                </Link>
                            </li>
                            <li><Link to="/contact"><FaQuestionCircle className="me-2 text-accent" /> {t('footer.contact')}</Link></li>
                            <li><Link to="/candidate/dashboard">{t('footer.for_job_seekers')}</Link></li>
                            <li><Link to="/hr-expert/vacancies">{t('footer.for_hr_experts')}</Link></li>
                        </ul>
                    </Col>

                    {/* Contact Info Column */}
                    <Col lg={3} md={6}>
                        <h6 className="footer-heading">{t('footer.contact_info')}</h6>
                        <ul className="footer-contact-list">
                            <li>
                                <FaMapMarkerAlt className="contact-icon text-danger" />
                                <span>{t('footer.address')}</span>
                            </li>
                            <li>
                                <FaEnvelope className="contact-icon text-primary" />
                                <a href="mailto:info@sit-agency.gov.et">{t('footer.email_label')}</a>
                            </li>
                            <li>
                                <FaPhoneAlt className="contact-icon text-success" />
                                <a href="tel:+251462201234">{t('footer.phone_label')}</a>
                            </li>
                        </ul>
                    </Col>
                </Row>

                <hr className="footer-divider" />

                {/* Footer Copyright & Legal Footer Links */}
                <Row className="align-items-center py-3">
                    <Col md={7} className="text-center text-md-start mb-2 mb-md-0">
                        <p className="footer-copyright mb-0">
                            &copy; {new Date().getFullYear()} <strong>KETARI</strong>. {t('footer.rights')} | Sidama Innovation and Technology Agency
                        </p>
                    </Col>
                    <Col md={5} className="text-center text-md-end">
                        <div className="footer-bottom-links">
                            <Link to="/privacy">{t('footer.privacy')}</Link>
                            <span className="dot-separator">•</span>
                            <Link to="/terms">{t('footer.terms')}</Link>
                            <span className="dot-separator">•</span>
                            <Link to="/contact">{t('footer.contact')}</Link>
                        </div>
                    </Col>
                </Row>
            </Container>
        </footer>
    );
};

export default Footer;