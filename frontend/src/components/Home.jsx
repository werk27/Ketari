import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Card, Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaRobot, FaBriefcase, FaUsers, FaCheckCircle, FaLaptopCode, FaChartBar, FaBullhorn, FaPenNib, FaHeadset, FaMicrophone, FaLanguage, FaDesktop } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import './Home.css';

const Home = () => {
    const { isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const [stats, setStats] = useState({ jobs: 24, candidates: 156, placements: 89, companies: 24 });
    const [recentJobs, setRecentJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const jobsResponse = await api.get('/jobs?limit=4');
            setRecentJobs(jobsResponse.data.jobs || []);
            
            try {
                const usersResponse = await api.get('/public/stats');
                setStats(prev => ({ ...prev, candidates: usersResponse.data.stats?.totalUsers || prev.candidates, jobs: usersResponse.data.stats?.totalJobs || prev.jobs }));
            } catch (e) { }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const popularServices = [
        { icon: <FaBullhorn />, title: t('home.digital_marketing') },
        { icon: <FaLanguage />, title: t('home.translation') },
        { icon: <FaDesktop />, title: t('home.web_development') },
        { icon: <FaLaptopCode />, title: t('home.mobile_apps') },
        { icon: <FaChartBar />, title: t('home.data_analysis') },
        { icon: <FaPenNib />, title: t('home.graphic_design') },
        { icon: <FaMicrophone />, title: t('home.voice_over') },
        { icon: <FaHeadset />, title: t('home.customer_support') }
    ];

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
                <div className="spinner-border text-primary" role="status"></div>
            </div>
        );
    }

    return (
        <>
            {/* Hero Section */}
            <section className="hero-section">
                <Container>
                    <Row className="align-items-center">
                        <Col lg={6} className="mb-5 mb-lg-0 animate-fade-in-up">
                            <div className="hero-content pe-lg-4">
                                <div className="hero-badge">
                                    <FaRobot className="me-2" /> {t('home.hero_badge')}
                                </div>
                                <h1 className="hero-title">
                                    {t('home.hero_title')} <span className="text-secondary">{t('home.hero_title_suffix')}</span>
                                </h1>
                                <p className="hero-subtitle">
                                    {t('home.hero_subtitle')}
                                </p>
                                {!isAuthenticated && (
                                    <div className="hero-buttons mb-4">
                                        <Button as={Link} to="/register" variant="primary" size="lg" className="hero-btn-solid">
                                            {t('home.sign_up_free')}
                                        </Button>
                                        <Button as={Link} to="/login" variant="outline-primary" size="lg" className="hero-btn-outline">
                                            {t('home.login')}
                                        </Button>
                                    </div>
                                )}
                                <div className="hero-buttons d-flex flex-wrap gap-2">
                                    <Button as={Link} to="/hr-expert/job-creator" variant={isAuthenticated ? "primary" : "secondary"} size="md" className="shadow-sm">
                                        {t('home.post_job')}
                                    </Button>
                                    <Button as={Link} to="/jobs" variant="light" size="md" className="shadow-sm border">
                                        {t('home.explore_jobs')}
                                    </Button>
                                </div>
                                <div className="hero-stats-row mt-5">
                                    <span><strong>{stats.candidates}+</strong> {t('home.candidates')}</span>
                                    <span><strong>{stats.jobs}+</strong> {t('home.completed_jobs')}</span>
                                    <span>{t('home.trusted_by')}</span>
                                </div>
                            </div>
                        </Col>
                        <Col lg={6} className="animate-scale-in" style={{ animationDelay: '0.2s' }}>
                            <div className="hero-visual">
                                <Card className="floating-job-card card-1 shadow-sm">
                                    <Card.Body>
                                        <div className="d-flex justify-content-between mb-2">
                                            <h6 className="fw-bold mb-0">{t('home.job_card_title_1')}</h6>
                                        </div>
                                        <p className="text-muted small mb-3">{t('home.job_card_desc_1')}</p>
                                        <div className="d-flex justify-content-between align-items-center mt-3">
                                            <div>
                                                <span className="fw-bold text-success">$2999.99 {t('home.fixed_price')}</span>
                                            </div>
                                            <Button variant="success" size="sm" className="rounded-pill px-3">{t('home.view_details')}</Button>
                                        </div>
                                    </Card.Body>
                                </Card>
                                <Card className="floating-job-card card-2 shadow-sm">
                                    <Card.Body>
                                        <div className="d-flex justify-content-between mb-2">
                                            <h6 className="fw-bold mb-0">{t('home.job_card_title_2')}</h6>
                                        </div>
                                        <p className="text-muted small mb-3">{t('home.job_card_desc_2')}</p>
                                        <div className="d-flex justify-content-between align-items-center mt-3">
                                            <div>
                                                <span className="fw-bold text-success">{t('home.negotiable')}</span>
                                            </div>
                                            <Button variant="success" size="sm" className="rounded-pill px-3">{t('home.view_details')}</Button>
                                        </div>
                                    </Card.Body>
                                </Card>
                            </div>
                        </Col>
                    </Row>
                </Container>
            </section>

            {/* How It Works - Dual Path */}
            <section className="how-it-works-section py-5">
                <Container className="py-4">
                    <div className="text-center mb-5 animate-fade-in-up">
                        <h2 className="fw-bold">{t('home.how_it_works')}</h2>
                        <p className="text-muted">{t('home.one_platform')}</p>
                    </div>
                    <Row className="g-4">
                        <Col md={6} className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                            <Card className="workflow-card hr_expert-card h-100 border-0 card-hover">
                                <Card.Body className="p-5">
                                    <h3 className="fw-bold mb-4 text-primary">{t('home.for_hr_experts')}</h3>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-primary fw-bold shadow-sm">1</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step1_hr_expert')}</h5>
                                            <p className="text-muted mb-0">{t('home.step1_hr_expert_desc')}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-primary fw-bold shadow-sm">2</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step2_hr_expert')}</h5>
                                            <p className="text-muted mb-0">{t('home.step2_hr_expert_desc')}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-primary fw-bold shadow-sm">3</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step3_hr_expert')}</h5>
                                            <p className="text-muted mb-0">{t('home.step3_hr_expert_desc')}</p>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                        <Col md={6} className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                            <Card className="workflow-card talent-card h-100 border-0 card-hover">
                                <Card.Body className="p-5">
                                    <h3 className="fw-bold mb-4 text-secondary">{t('home.for_candidates')}</h3>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-secondary fw-bold shadow-sm">1</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step1_candidate')}</h5>
                                            <p className="text-muted mb-0">{t('home.step1_candidate_desc')}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-secondary fw-bold shadow-sm">2</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step2_candidate')}</h5>
                                            <p className="text-muted mb-0">{t('home.step2_candidate_desc')}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="workflow-step">
                                        <div className="step-num bg-white text-secondary fw-bold shadow-sm">3</div>
                                        <div>
                                            <h5 className="fw-bold">{t('home.step3_candidate')}</h5>
                                            <p className="text-muted mb-0">{t('home.step3_candidate_desc')}</p>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                </Container>
            </section>

            {/* Popular Services Grid */}
            <section className="popular-services-section py-5">
                <Container className="py-4">
                    <div className="text-center mb-5 animate-fade-in-up">
                        <Badge bg="light" text="dark" className="px-3 py-2 border mb-3 rounded-pill">
                            <span className="text-warning me-1">🔥</span> {t('home.in_demand')}
                        </Badge>
                        <h2 className="fw-bold">{t('home.popular_services')}</h2>
                        <p className="text-muted">{t('home.popular_services_desc')}</p>
                    </div>
                    
                    <Row className="g-3 justify-content-center">
                        {popularServices.map((service, idx) => (
                            <Col xs={6} md={3} lg={3} key={idx} className="animate-fade-in-up" style={{ animationDelay: `${idx * 0.05}s` }}>
                                <Card className="service-card text-center h-100 border shadow-sm card-hover">
                                    <Card.Body className="d-flex flex-column align-items-center justify-content-center p-4">
                                        <div className="service-icon mb-3">
                                            {service.icon}
                                        </div>
                                        <h6 className="fw-bold mb-0 text-dark">{service.title}</h6>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Container>
            </section>

            {/* How the AI recruitment workflow runs.
                A "Featured Candidates" block used to sit here filled with invented
                profiles ("Developer 1", 5.0 stars, ETB 150/hr). Candidate profiles
                are private and must never be shown publicly, so it was replaced with
                a factual description of the platform workflow. */}
            <section className="recent-jobs-section bg-light py-5">
                <Container className="py-4">
                    <div className="text-center mb-5 animate-fade-in-up">
                        <h2 className="fw-bold mb-2">How AI supports every hire</h2>
                        <p className="text-muted mb-0">
                            The AI analyses, matches and ranks candidates. Authorised HR users make every decision.
                        </p>
                    </div>
                    <Row className="g-4">
                        {[
                            { step: 'CV Analysis', detail: 'Skills, education and experience are extracted from each CV.' },
                            { step: 'Job Matching', detail: 'Candidates are scored against the vacancy requirements.' },
                            { step: 'Explainable Ranking', detail: 'Every score shows matching skills and skill gaps.' },
                            { step: 'HR Decision', detail: 'HR Experts shortlist and HR Managers approve the hire.' }
                        ].map((item, index) => (
                            <Col md={3} key={item.step} className="animate-fade-in-up"
                                 style={{ animationDelay: `${index * 0.1}s` }}>
                                <Card className="h-100 border-0 shadow-sm card-hover">
                                    <Card.Body className="d-flex flex-column">
                                        <div className="d-flex align-items-center mb-3">
                                            <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold me-3"
                                                 style={{ width: 40, height: 40 }}>
                                                {index + 1}
                                            </div>
                                            <h6 className="fw-bold mb-0">{item.step}</h6>
                                        </div>
                                        <p className="text-muted small mb-0">{item.detail}</p>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </Container>
            </section>
        </>
    );
};

export default Home;