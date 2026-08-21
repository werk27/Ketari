import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Badge, Spinner, InputGroup, Pagination } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaSearch, FaMapMarkerAlt, FaStar, FaBriefcase, FaCheckCircle, FaMoneyBillWave, FaFilter } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import BackButton from '../common/BackButton';
import './CandidateList.css';

const CandidateList = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    
    const [filters, setFilters] = useState({
        search: '',
        location: '',
        skills: '',
        minRating: ''
    });
    
    const [selectedSkills, setSelectedSkills] = useState([]);
    
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalCandidates: 0
    });

    const commonSkills = ['React', 'Node.js', 'Python', 'Java', 'UI/UX', 'Digital Marketing', 'Translation', 'Graphic Design', 'Project Management'];

    useEffect(() => {
        fetchCandidates();
    }, [filters, pagination.currentPage]);

    useEffect(() => {
        setFilters(prev => ({ ...prev, skills: selectedSkills.join(',') }));
    }, [selectedSkills]);

    const fetchCandidates = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: pagination.currentPage,
                ...filters
            });
            Object.keys(params).forEach(key => {
                if (!params[key]) params.delete(key);
            });
            
            const response = await api.get(`/candidates?${params.toString()}`);
            setCandidates(response.data.candidates || []);
            setPagination({
                currentPage: response.data.currentPage || 1,
                totalPages: response.data.totalPages || 1,
                totalCandidates: response.data.totalCandidates || 0
            });
        } catch (error) {
            console.error('Error fetching candidates:', error);
            setCandidates([]);
        } finally {
            setLoading(false);
        }
    };

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setPagination({ ...pagination, currentPage: 1 });
    };

    const handleSkillToggle = (skill) => {
        setSelectedSkills(prev => 
            prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
        );
        setPagination({ ...pagination, currentPage: 1 });
    };

    const handlePageChange = (page) => {
        setPagination({ ...pagination, currentPage: page });
        window.scrollTo(0, 0);
    };

    const clearFilters = () => {
        setFilters({ search: '', location: '', skills: '', minRating: '' });
        setSelectedSkills([]);
        setPagination({ ...pagination, currentPage: 1 });
    };

    return (
        <section className="candidate-list-page py-5 bg-light min-vh-100">
            <Container>
                <BackButton to="/hr-expert/vacancies" />
                {/* Header Section */}
                <div className="mb-5 text-center text-md-start">
                    <h1 className="fw-bold text-dark">{t('hr_expert.find_talent')}</h1>
                    <p className="text-muted fs-5">{t('hr_expert.find_talent_desc', { count: pagination.totalCandidates })}</p>
                </div>

                {/* Main Search Bar */}
                <Card className="shadow-sm border-0 mb-4 rounded-4 overflow-hidden">
                    <Card.Body className="p-2">
                        <Row className="g-2">
                            <Col md={7}>
                                <InputGroup className="h-100 search-input-group">
                                    <InputGroup.Text className="bg-white border-0 ps-4 text-primary">
                                        <FaSearch />
                                    </InputGroup.Text>
                                    <Form.Control
                                        type="text"
                                        name="search"
                                        placeholder="Search by name, title, or keyword..."
                                        value={filters.search}
                                        onChange={handleFilterChange}
                                        className="border-0 shadow-none py-3 fs-5"
                                    />
                                </InputGroup>
                            </Col>
                            <Col md={3}>
                                <InputGroup className="h-100 search-input-group border-start d-none d-md-flex">
                                    <InputGroup.Text className="bg-white border-0 ps-3 text-primary">
                                        <FaMapMarkerAlt />
                                    </InputGroup.Text>
                                    <Form.Control
                                        type="text"
                                        name="location"
                                        placeholder="Location (e.g. Addis Ababa)"
                                        value={filters.location}
                                        onChange={handleFilterChange}
                                        className="border-0 shadow-none py-3"
                                    />
                                </InputGroup>
                            </Col>
                            <Col md={2}>
                                <Button 
                                    variant="outline-secondary" 
                                    className="w-100 h-100 py-3 fw-bold rounded-3" 
                                    style={{fontSize:'1.1rem'}} 
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <FaFilter className="me-2" />
                                    Filters
                                </Button>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>

                {/* Expandable Filter Panel */}
                {showFilters && (
                    <Card className="border-0 shadow-sm rounded-4 mb-4 filter-panel-expand fade-in">
                        <Card.Body className="p-4">
                            <Row>
                                <Col md={3}>
                                    <h6 className="fw-bold mb-3">Minimum Rating</h6>
                                    <Form.Select name="minRating" value={filters.minRating} onChange={handleFilterChange} className="border-0 bg-light">
                                        <option value="">Any Rating</option>
                                        <option value="4.5">4.5 & up</option>
                                        <option value="4.0">4.0 & up</option>
                                    </Form.Select>
                                </Col>
                                <Col md={9}>
                                    <h6 className="fw-bold mb-3">Top Skills</h6>
                                    <div className="d-flex flex-wrap gap-2">
                                        {commonSkills.map(skill => (
                                            <Badge 
                                                key={skill}
                                                bg={selectedSkills.includes(skill) ? 'primary' : 'light'}
                                                text={selectedSkills.includes(skill) ? 'white' : 'dark'}
                                                className="border fw-normal px-3 py-2 custom-badge-toggle"
                                                onClick={() => handleSkillToggle(skill)}
                                            >
                                                {skill}
                                            </Badge>
                                        ))}
                                    </div>
                                </Col>
                            </Row>
                            <div className="text-end mt-3 border-top pt-3">
                                <Button variant="link" className="text-decoration-none text-muted" onClick={clearFilters}>Clear filters</Button>
                                <Button variant="primary" className="rounded-pill px-4 ms-2" onClick={() => setShowFilters(false)}>Apply</Button>
                            </div>
                        </Card.Body>
                    </Card>
                )}

                <Row className="mt-5">
                    {/* FULL WIDTH GRID FOR CANDIDATES */}
                    <Col lg={12}>
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h5 className="fw-bold mb-0">{pagination.totalCandidates} Talent Found</h5>
                        </div>

                        {loading ? (
                            <div className="text-center py-5">
                                <Spinner animation="border" variant="primary" />
                            </div>
                        ) : candidates.length > 0 ? (
                            <Row className="g-4">
                                {candidates.map((candidate) => (
                                    <Col lg={4} md={6} key={candidate._id}>
                                        <Card className="candidate-card h-100 border-0 shadow-sm rounded-4 position-relative">
                                            <Card.Body className="p-4 d-flex flex-column">
                                                
                                                <div className="d-flex align-items-center mb-3">
                                                    <div className="avatar-placeholder bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold me-3 shadow-sm" style={{width: 60, height: 60, fontSize: '1.2rem'}}>
                                                        {candidate.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <h5 className="fw-bold mb-0 text-dark">{candidate.name}</h5>
                                                        <div className="text-muted small d-flex align-items-center mt-1">
                                                            <FaMapMarkerAlt className="me-1"/> {candidate.profile?.location || 'Ethiopia'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <h6 className="fw-bold text-primary mb-2">{candidate.profile?.title || 'Professional'}</h6>
                                                
                                                <div className="d-flex align-items-center mb-3">
                                                    <FaStar className="text-warning me-1" />
                                                    <span className="fw-bold me-1">{candidate.profile?.rating?.score || '5.0'}</span>
                                                    <span className="text-muted small">({candidate.profile?.rating?.reviews || 0} reviews)</span>
                                                </div>

                                                <p className="text-muted small mb-4 text-truncate-3 flex-grow-1">
                                                    {candidate.profile?.bio || 'Experienced professional looking for new opportunities in the tech and service sector.'}
                                                </p>

                                                <div className="d-flex flex-wrap gap-2 mb-4">
                                                    {candidate.profile?.skills?.slice(0,3).map((skill, index) => (
                                                        <span key={index} className="skill-pill-sm">{skill}</span>
                                                    ))}
                                                    {(candidate.profile?.skills?.length || 0) > 3 && (
                                                        <span className="skill-pill-sm bg-light text-muted">+{candidate.profile.skills.length - 3}</span>
                                                    )}
                                                </div>

                                                <div className="candidate-stats-grid pt-3 border-top mt-auto">
                                                    <div className="text-center">
                                                        <div className="fw-bold text-dark">{candidate.profile?.successRate || 100}%</div>
                                                        <div className="text-muted" style={{fontSize: '0.75rem'}}>Success Rate</div>
                                                    </div>
                                                    <div className="text-center border-start border-end">
                                                        <div className="fw-bold text-dark">{candidate.profile?.availabilityStatus === 'Available now' ? <span className="text-success"><FaCheckCircle/></span> : '-'}</div>
                                                        <div className="text-muted" style={{fontSize: '0.75rem'}}>Available</div>
                                                    </div>
                                                    <div className="text-center">
                                                        <div className="fw-bold text-dark">{candidate.profile?.expectedSalary?.amount ? `ETB ${candidate.profile.expectedSalary.amount}` : 'Neg.'}</div>
                                                        <div className="text-muted" style={{fontSize: '0.75rem'}}>{candidate.profile?.expectedSalary?.rateType || 'Hourly'}</div>
                                                    </div>
                                                </div>

                                                <Button variant="outline-primary" className="w-100 mt-4 rounded-pill fw-bold">
                                                    View Profile
                                                </Button>

                                            </Card.Body>
                                        </Card>
                                    </Col>
                                ))}
                            </Row>
                        ) : (
                            <Card className="border-0 shadow-sm rounded-4 py-5 text-center">
                                <Card.Body>
                                    <div className="text-muted mb-3" style={{fontSize: '3rem'}}><FaSearch /></div>
                                    <h4 className="fw-bold">No talent found</h4>
                                    <p className="text-muted">Try adjusting your filters or search terms to find more results.</p>
                                    <Button variant="primary" onClick={clearFilters} className="rounded-pill mt-2 px-4">
                                        Clear All Filters
                                    </Button>
                                </Card.Body>
                            </Card>
                        )}

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <Pagination className="justify-content-center mt-5 custom-pagination">
                                {[...Array(pagination.totalPages)].map((_, idx) => (
                                    <Pagination.Item 
                                        key={idx + 1} 
                                        active={idx + 1 === pagination.currentPage}
                                        onClick={() => handlePageChange(idx + 1)}
                                    >
                                        {idx + 1}
                                    </Pagination.Item>
                                ))}
                            </Pagination>
                        )}
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default CandidateList;
