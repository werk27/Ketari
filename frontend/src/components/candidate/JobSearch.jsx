import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Badge, Spinner, InputGroup, Pagination } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaSearch, FaMapMarkerAlt, FaBriefcase, FaClock, FaFilter, FaStar, FaRobot, FaRegBookmark, FaBookmark, FaMoneyBillWave, FaTags, FaUsers } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import './JobSearch.css';

const JobSearch = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Advanced Filters
    const [filters, setFilters] = useState({
        search: '',
        location: '',
        employmentType: '',
        experienceLevel: '',
        skills: ''
    });
    
    const [selectedSkills, setSelectedSkills] = useState([]);
    const [savedJobIds, setSavedJobIds] = useState([]);

    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalJobs: 0
    });

    const commonSkills = ['React', 'Node.js', 'Python', 'Java', 'UI/UX', 'Digital Marketing', 'Translation', 'Graphic Design'];

    useEffect(() => {
        if (user?.profile?.savedJobs) {
            setSavedJobIds(user.profile.savedJobs.map(j => typeof j === 'string' ? j : j._id));
        }
        fetchJobs();
    }, [filters, pagination.currentPage]);

    // When selected skills array changes, update the comma-separated string filter
    useEffect(() => {
        setFilters(prev => ({ ...prev, skills: selectedSkills.join(',') }));
    }, [selectedSkills]);

    const calculateMatchScore = (job) => {
        if (!user?.profile?.skills) return { score: 0 };
        let score = 0;
        const jobSkills = job?.requirements?.skills || [];
        const userSkills = user.profile.skills || [];
        
        if (jobSkills.length > 0 && userSkills.length > 0) {
            const matchedSkills = jobSkills.filter(skill => 
                userSkills.some(us => us.toLowerCase().includes(skill.toLowerCase()))
            );
            score = Math.round((matchedSkills.length / jobSkills.length) * 100);
        } else if (jobSkills.length === 0) {
            score = 100;
        }
        return { score: Math.min(score, 100) };
    };

    const fetchJobs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                page: pagination.currentPage,
                ...filters
            });
            Object.keys(params).forEach(key => {
                if (!params[key]) params.delete(key);
            });
            
            const response = await api.get(`/jobs?${params.toString()}`);
            let jobList = response.data.jobs || [];
            
            if (user) {
                jobList = jobList.map(job => ({
                    ...job,
                    matchScore: calculateMatchScore(job)
                }));
            }
            
            setJobs(jobList);
            setPagination({
                currentPage: response.data.currentPage || 1,
                totalPages: response.data.totalPages || 1,
                totalJobs: response.data.totalJobs || 0
            });
        } catch (error) {
            console.error('Error fetching jobs:', error);
            setJobs([]);
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

    const toggleSaveJob = async (jobId) => {
        if (!user) return alert(t('jobs.login_to_save') || "Please login to save jobs.");
        try {
            const res = await api.post(`/jobs/${jobId}/save`);
            if (res.data.success) {
                if (res.data.isSaved) {
                    setSavedJobIds([...savedJobIds, jobId]);
                } else {
                    setSavedJobIds(savedJobIds.filter(id => id !== jobId));
                }
            }
        } catch (err) {
            console.error("Error saving job", err);
        }
    };

    const handlePageChange = (page) => {
        setPagination({ ...pagination, currentPage: page });
        window.scrollTo(0, 0);
    };

    const clearFilters = () => {
        setFilters({ search: '', location: '', employmentType: '', experienceLevel: '', skills: '' });
        setSelectedSkills([]);
        setPagination({ ...pagination, currentPage: 1 });
    };

    return (
        <section className="job-search-page py-5 bg-light min-vh-100">
            <Container>
                {/* Header Section */}
                <div className="mb-5 text-center text-md-start">
                    <h1 className="fw-bold text-dark">{t('jobs.hero_title')}</h1>
                    <p className="text-muted fs-5">{t('jobs.hero_subtitle').replace('{{count}}', pagination.totalJobs)}</p>
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
                                        placeholder={t('jobs.search_placeholder')}
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
                                        placeholder={t('jobs.location_placeholder')}
                                        value={filters.location}
                                        onChange={handleFilterChange}
                                        className="border-0 shadow-none py-3"
                                    />
                                </InputGroup>
                            </Col>
                            <Col md={2}>
                                <Button variant="primary" className="w-100 h-100 py-3 fw-bold rounded-3" style={{fontSize:'1.1rem'}} onClick={fetchJobs}>
                                    {t('jobs.search_button')}
                                </Button>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>

                <Row className="mt-5">
                    {/* LEFT SIDEBAR: FILTERS */}
                    <Col lg={3} className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <h5 className="fw-bold mb-0">{t('jobs.filters')}</h5>
                            <span className="text-primary text-decoration-underline" style={{cursor: 'pointer', fontSize:'0.9rem'}} onClick={clearFilters}>{t('jobs.clear_all')}</span>
                        </div>
                        <Card className="border-0 shadow-sm rounded-4 sticky-top" style={{top: '80px', zIndex: 1}}>
                            <Card.Body className="p-4">
                                
                                {/* Experience Level */}
                                <div className="filter-group mb-4">
                                    <h6 className="fw-bold mb-3">{t('jobs.experience_level')}</h6>
                                    <div className="d-flex flex-wrap gap-2">
                                        {['Entry', 'Intermediate', 'Expert'].map(level => (
                                            <Badge 
                                                key={level}
                                                bg={filters.experienceLevel === level ? 'primary' : 'light'}
                                                text={filters.experienceLevel === level ? 'white' : 'dark'}
                                                className="border fw-normal px-3 py-2"
                                                style={{cursor:'pointer'}}
                                                onClick={() => setFilters(prev => ({...prev, experienceLevel: prev.experienceLevel === level ? '' : level}))}
                                            >
                                                {level}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Job Type */}
                                <div className="filter-group mb-4">
                                    <h6 className="fw-bold mb-3">{t('jobs.job_type')}</h6>
                                    <Form>
                                        {['Full-Time', 'Part-Time', 'Contract', 'Remote', 'Hybrid', 'On-Site'].map(type => (
                                            <Form.Check 
                                                key={type}
                                                type="checkbox"
                                                id={`type-${type}`}
                                                label={type}
                                                checked={filters.employmentType === type}
                                                onChange={() => setFilters(prev => ({...prev, employmentType: prev.employmentType === type ? '' : type}))}
                                                className="mb-2 text-muted custom-checkbox"
                                            />
                                        ))}
                                    </Form>
                                </div>

                                {/* Skills */}
                                <div className="filter-group mb-4">
                                    <h6 className="fw-bold mb-3">{t('jobs.top_skills')}</h6>
                                    <Form>
                                        {commonSkills.map(skill => (
                                            <Form.Check 
                                                key={skill}
                                                type="checkbox"
                                                id={`skill-${skill}`}
                                                label={skill}
                                                checked={selectedSkills.includes(skill)}
                                                onChange={() => handleSkillToggle(skill)}
                                                className="mb-2 text-muted custom-checkbox"
                                            />
                                        ))}
                                    </Form>
                                </div>

                            </Card.Body>
                        </Card>
                    </Col>

                    {/* RIGHT CONTENT: JOB LIST */}
                    <Col lg={9}>
                        <div className="d-flex justify-content-between align-items-center mb-4">
                            <h5 className="fw-bold mb-0">{pagination.totalJobs} {t('jobs.jobs_found')}</h5>
                            <Form.Select style={{width: 'auto', backgroundColor: '#f8faf9', border: 'none', fontWeight: '500'}}>
                                <option>{t('jobs.sort_newest')}</option>
                                <option>{t('jobs.sort_relevant')}</option>
                            </Form.Select>
                        </div>

                        {loading ? (
                            <div className="text-center py-5">
                                <Spinner animation="border" variant="primary" />
                            </div>
                        ) : jobs.length > 0 ? (
                            jobs.map((job) => {
                                const isSaved = savedJobIds.includes(job._id);
                                return (
                                <Card key={job._id} className="job-card border-0 shadow-sm rounded-4 mb-4 position-relative">
                                    <Card.Body className="p-4">
                                        
                                        {/* Save Bookmark */}
                                        <button 
                                            className="btn btn-link p-0 position-absolute text-muted" 
                                            style={{top: '24px', right: '24px', fontSize: '1.4rem'}}
                                            onClick={() => toggleSaveJob(job._id)}
                                        >
                                            {isSaved ? <FaBookmark className="text-primary"/> : <FaRegBookmark className="job-bookmark-icon"/>}
                                        </button>

                                        <Row>
                                            <Col md={9}>
                                                <div className="mb-2">
                                                    <span className="text-muted small fw-bold text-uppercase tracking-wider">
                                                        Posted {new Date(job.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h4 className="fw-bold mb-1">
                                                    <Link to={`/candidate/apply/${job._id}`} className="text-dark text-decoration-none job-title-link">
                                                        {job.title}
                                                    </Link>
                                                </h4>
                                                <p className="text-muted mb-3 fs-6">
                                                    <span className="fw-bold text-dark">{job.hr_expert?.name || 'Company'}</span> • {job.location}
                                                </p>

                                                <div className="job-meta-grid mb-3">
                                                    <div className="meta-item">
                                                        <FaMoneyBillWave className="meta-icon" /> 
                                                        <span className="fw-bold">{job.budgetType || 'Negotiable'}</span>
                                                    </div>
                                                    <div className="meta-item">
                                                        <FaBriefcase className="meta-icon" />
                                                        <span>{job.experienceLevel || 'Intermediate'}</span>
                                                    </div>
                                                    <div className="meta-item">
                                                        <FaClock className="meta-icon" />
                                                        <span>{job.employmentType}</span>
                                                    </div>
                                                    <div className="meta-item text-primary bg-primary bg-opacity-10 rounded-pill px-2 py-1 small fw-bold">
                                                        <FaUsers className="me-1" /> {job.proposalsCount || 0} Proposals
                                                    </div>
                                                </div>

                                                <p className="text-muted small mb-4 text-truncate-2">
                                                    {job.description}
                                                </p>

                                                <div className="d-flex flex-wrap gap-2 mb-3 mb-md-0">
                                                    {job.requirements?.skills?.slice(0,5).map((skill, index) => (
                                                        <span key={index} className="skill-pill">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {(job.requirements?.skills?.length || 0) > 5 && (
                                                        <span className="skill-pill bg-light text-muted">+{job.requirements.skills.length - 5} more</span>
                                                    )}
                                                </div>
                                            </Col>

                                            <Col md={3} className="d-flex flex-column justify-content-between align-items-end border-start ps-4">
                                                {user && job.matchScore && (
                                                    <div className="text-end w-100 mb-3">
                                                        <div className="d-flex align-items-center justify-content-end mb-1">
                                                            <FaRobot className="text-primary me-2" />
                                                            <span className="fw-bold fs-5 text-primary">{job.matchScore.score}%</span>
                                                        </div>
                                                        <small className="text-muted">AI Match Score</small>
                                                    </div>
                                                )}
                                                <div className="w-100 mt-auto">
                                                    <Button as={Link} to={`/candidate/apply/${job._id}`} variant="outline-primary" className="w-100 fw-bold rounded-pill">
                                                        View Details
                                                    </Button>
                                                </div>
                                            </Col>
                                        </Row>
                                    </Card.Body>
                                </Card>
                            )})
                        ) : (
                            <Card className="border-0 shadow-sm rounded-4 py-5 text-center">
                                <Card.Body>
                                    <div className="text-muted mb-3" style={{fontSize: '3rem'}}><FaSearch /></div>
                                    <h4 className="fw-bold">No jobs found</h4>
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

export default JobSearch;