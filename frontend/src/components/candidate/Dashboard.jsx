import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Button, Table, Badge, Spinner, Modal, Image, ProgressBar } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { 
    FaBriefcase, 
    FaClock, 
    FaCheckCircle, 
    FaTimesCircle, 
    FaUserPlus, 
    FaEnvelope, 
    FaCalendar, 
    FaMapMarkerAlt, 
    FaInfoCircle, 
    FaMagic, 
    FaBuilding, 
    FaChevronRight, 
    FaUserCheck, 
    FaArrowRight,
    FaFileAlt
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api, { getImageUrl } from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';
import './Dashboard.css';

const Dashboard = () => {
    const { user } = useAuth();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [applications, setApplications] = useState([]);
    const [recommendedJobs, setRecommendedJobs] = useState([]);
    const [attendance, setAttendance] = useState({ today: { checkedIn: false, checkedOut: false } });
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [selectedApplication, setSelectedApplication] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        shortlisted: 0,
        interviewed: 0,
        offered: 0,
        rejected: 0
    });

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch Applications & Attendance
            const [appsRes, attendanceRes, jobsRes] = await Promise.allSettled([
                api.get('/applications/me'),
                api.get('/attendance/me'),
                api.get('/jobs')
            ]);

            if (appsRes.status === 'fulfilled') {
                const apps = appsRes.value.data.applications || [];
                setApplications(apps);

                const statsData = {
                    total: apps.length,
                    pending: apps.filter(a => a.status === 'pending').length,
                    shortlisted: apps.filter(a => a.status === 'shortlisted').length,
                    interviewed: apps.filter(a => a.status === 'interviewed').length,
                    offered: apps.filter(a => a.status === 'offered').length,
                    rejected: apps.filter(a => a.status === 'rejected').length
                };
                setStats(statsData);
            }

            if (attendanceRes.status === 'fulfilled') {
                setAttendance(attendanceRes.value.data || { today: { checkedIn: false, checkedOut: false } });
            }

            if (jobsRes.status === 'fulfilled') {
                const allJobs = jobsRes.value.data.jobs || jobsRes.value.data || [];
                // Pick top 3 open jobs for recommendations
                const availableJobs = Array.isArray(allJobs) ? allJobs.slice(0, 3) : [];
                setRecommendedJobs(availableJobs);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error(t('common.error') || 'Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const calculateProfileCompletion = () => {
        if (!user) return 40;
        let score = 20; // Base score for registration
        if (user.profile?.profilePhoto) score += 20;
        if (user.profile?.location) score += 15;
        if (user.profile?.skills && user.profile.skills.length > 0) score += 25;
        if (user.profile?.resume) score += 20;
        return Math.min(score, 100);
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            pending: 'warning',
            reviewed: 'info',
            shortlisted: 'success',
            interviewed: 'primary',
            offered: 'success',
            rejected: 'danger'
        };
        return statusMap[status] || 'secondary';
    };

    const getStatusLabel = (status) => {
        const statusLabels = {
            pending: t('dashboard.pending') || 'Pending',
            reviewed: 'Reviewed',
            shortlisted: t('dashboard.shortlisted') || 'Shortlisted',
            interviewed: t('dashboard.interviewed') || 'Interviewed',
            offered: t('dashboard.offered') || 'Offered',
            rejected: t('dashboard.rejected') || 'Rejected'
        };
        return statusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1);
    };

    const handleViewInterview = (application) => {
        setSelectedApplication(application);
        setShowInterviewModal(true);
    };

    const formatDate = (date) => {
        if (!date) return 'Not scheduled yet';
        return new Date(date).toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Filter upcoming interviews / active steps
    const upcomingInterviews = applications.filter(
        app => app.status === 'interviewed' || app.status === 'shortlisted' || app.status === 'offered' || app.interviewDate
    );

    const profileCompletion = calculateProfileCompletion();

    if (loading) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
                <p className="mt-3 text-muted fw-semibold">{t('common.loading') || 'Loading Dashboard...'}</p>
            </Container>
        );
    }

    return (
        <section className="dashboard-container py-4">
            <Container>
                <BackButton to="/" />
                {/* 1. Header / Hero Card */}
                <div className="dashboard-hero-card p-3 p-md-4 mb-4">
                    <Row className="align-items-center g-3">
                        <Col xs={12} md={7} className="d-flex align-items-center">
                            <div className="avatar-wrapper me-3">
                                {user?.profile?.profilePhoto ? (
                                    <Image 
                                        src={getImageUrl(user.profile.profilePhoto)} 
                                        className="avatar-img"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                        }}
                                    />
                                ) : (
                                    <div className="avatar-placeholder">
                                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                    </div>
                                )}
                            </div>
                            <div>
                                <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                    <h3 className="fw-bold mb-0 text-dark">
                                        {t('dashboard.welcome', { name: user?.name || 'Candidate' })}
                                    </h3>
                                    <span className="role-pill">
                                        {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1) || 'Jobseeker'}
                                    </span>
                                </div>
                                <p className="text-muted small mb-0">
                                    {t('dashboard.welcome_desc') || "Here's an overview of your job applications and recruitment status"}
                                    {user?.profile?.location && (
                                        <span className="ms-2">📍 {user.profile.location}</span>
                                    )}
                                </p>
                            </div>
                        </Col>
                        <Col xs={12} md={5} className="text-md-end d-flex flex-wrap align-items-center justify-content-md-end gap-2">
                            <Button as={Link} to="/jobs" variant="primary" className="fw-semibold px-3 py-2 btn-sm rounded-3">
                                <FaMagic className="me-1" /> {t('dashboard.browse_jobs') || 'Find Jobs'}
                            </Button>
                            <Button as={Link} to="/candidate/profile" variant="outline-secondary" className="fw-semibold px-3 py-2 btn-sm rounded-3">
                                <FaFileAlt className="me-1" /> {t('dashboard.update_profile') || 'Edit Profile'}
                            </Button>
                        </Col>
                    </Row>
                </div>

                {/* 2. Stat Cards Grid */}
                <Row className="g-2 g-md-3 mb-4">
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper total">
                                <FaBriefcase />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.total}</div>
                                <div className="stat-label">{t('dashboard.total_applications') || 'Total'}</div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper pending">
                                <FaClock />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.pending}</div>
                                <div className="stat-label">{t('dashboard.pending') || 'Pending'}</div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper shortlisted">
                                <FaCheckCircle />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.shortlisted}</div>
                                <div className="stat-label">{t('dashboard.shortlisted') || 'Shortlisted'}</div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper interviewed">
                                <FaUserPlus />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.interviewed}</div>
                                <div className="stat-label">{t('dashboard.interviewed') || 'Interviewed'}</div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper offered">
                                <FaUserCheck />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.offered}</div>
                                <div className="stat-label">{t('dashboard.offered') || 'Offered'}</div>
                            </div>
                        </div>
                    </Col>
                    <Col xs={6} sm={4} md={2}>
                        <div className="stat-card-compact">
                            <div className="stat-icon-wrapper rejected">
                                <FaTimesCircle />
                            </div>
                            <div className="stat-info">
                                <div className="stat-value">{stats.rejected}</div>
                                <div className="stat-label">{t('dashboard.rejected') || 'Rejected'}</div>
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* 3. Main Content: 2-Column Responsive Grid */}
                <Row className="g-3 g-lg-4">
                    {/* Left Column: Recent Applications & Recommended Jobs */}
                    <Col lg={8}>
                        {/* Recent Applications Card */}
                        <div className="dashboard-card-modern mb-4">
                            <div className="dashboard-card-header">
                                <h6>
                                    <FaBriefcase className="text-primary" />
                                    {t('dashboard.recent_applications') || 'Recent Applications'}
                                </h6>
                                <span className="badge bg-light text-dark border font-mono">
                                    {applications.length} {t('dashboard.total') || 'Total'}
                                </span>
                            </div>
                            <div className="dashboard-card-body p-0">
                                {applications.length === 0 ? (
                                    <div className="text-center py-5 px-3">
                                        <div className="mb-3 text-muted" style={{ fontSize: '2.5rem' }}>📭</div>
                                        <h6 className="fw-bold">{t('dashboard.no_applications') || 'No Applications Yet'}</h6>
                                        <p className="text-muted small max-w-sm mx-auto mb-3">
                                            {t('dashboard.no_applications_desc') || "You haven't submitted any job applications yet. Start exploring open positions!"}
                                        </p>
                                        <Button as={Link} to="/jobs" variant="primary" size="sm" className="fw-semibold px-4 rounded-pill">
                                            {t('dashboard.browse_jobs') || 'Browse Available Jobs'}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="table-responsive">
                                        <Table hover className="modern-table align-middle mb-0">
                                            <thead>
                                                <tr>
                                                    <th>{t('jobs.title') || 'Job Position'}</th>
                                                    <th>{t('apply.department') || 'Company/Dept'}</th>
                                                    <th>{t('apply.deadline') || 'Applied Date'}</th>
                                                    <th>{t('common.status') || 'Status'}</th>
                                                    <th>{t('apply.ai_match') || 'AI Match'}</th>
                                                    <th className="text-end">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {applications.slice(0, 7).map((app) => (
                                                    <tr key={app._id}>
                                                        <td>
                                                            <div className="fw-bold text-dark">{app.job?.title || 'Job Position'}</div>
                                                            {app.job?.type && (
                                                                <span className="text-muted small me-2">{app.job.type}</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <span className="text-secondary small fw-medium">
                                                                <FaBuilding className="me-1 text-muted" size={12} />
                                                                {app.job?.department || 'SITA'}
                                                            </span>
                                                        </td>
                                                        <td className="text-muted small">
                                                            {new Date(app.createdAt).toLocaleDateString()}
                                                        </td>
                                                        <td>
                                                            <Badge bg={getStatusBadge(app.status)} className="px-2 py-1 font-sans">
                                                                {getStatusLabel(app.status)}
                                                            </Badge>
                                                        </td>
                                                        <td>
                                                            {app.matchScore ? (
                                                                <span className={`score-pill ${
                                                                    app.matchScore >= 70 ? 'score-high' : 
                                                                    app.matchScore >= 40 ? 'score-medium' : 'score-low'
                                                                }`}>
                                                                    <FaMagic size={10} />
                                                                    {app.matchScore}%
                                                                </span>
                                                            ) : (
                                                                <span className="text-muted small">—</span>
                                                            )}
                                                        </td>
                                                        <td className="text-end">
                                                            {(app.status === 'interviewed' || app.status === 'shortlisted' || app.status === 'offered' || app.interviewDate) ? (
                                                                <Button 
                                                                    variant="outline-primary" 
                                                                    size="sm"
                                                                    className="py-1 px-2 font-sans fs-7 rounded-2"
                                                                    onClick={() => handleViewInterview(app)}
                                                                >
                                                                    <FaEnvelope className="me-1" /> Interview
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    as={Link}
                                                                    to={app.job?._id ? `/jobs/${app.job._id}` : '/jobs'}
                                                                    variant="light"
                                                                    size="sm"
                                                                    className="py-1 px-2 text-muted border border-1 rounded-2"
                                                                >
                                                                    View
                                                                </Button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recommended Jobs Widget */}
                        <div className="dashboard-card-modern">
                            <div className="dashboard-card-header">
                                <h6>
                                    <FaMagic className="text-warning" />
                                    Recommended Opportunities
                                </h6>
                                <Link to="/jobs" className="small text-primary fw-semibold text-decoration-none">
                                    View All <FaChevronRight size={10} />
                                </Link>
                            </div>
                            <div className="dashboard-card-body">
                                {recommendedJobs.length === 0 ? (
                                    <p className="text-muted small mb-0">No job recommendations available at the moment.</p>
                                ) : (
                                    <Row className="g-3">
                                        {recommendedJobs.map((job) => (
                                            <Col md={12} key={job._id || job.id}>
                                                <div className="job-recommendation-item d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
                                                    <div>
                                                        <h6 className="fw-bold mb-1 text-dark">
                                                            {job.title}
                                                        </h6>
                                                        <div className="d-flex flex-wrap align-items-center gap-2 small text-muted">
                                                            <span><FaBuilding className="me-1 text-secondary" />{job.department || 'Ethiopia Telecom / SITA'}</span>
                                                            {job.location && <span>📍 {job.location}</span>}
                                                            {job.type && <Badge bg="light" text="dark" className="border">{job.type}</Badge>}
                                                        </div>
                                                    </div>
                                                    <Button 
                                                        as={Link} 
                                                        to={`/jobs/${job._id}`} 
                                                        variant="outline-primary" 
                                                        size="sm"
                                                        className="align-self-start align-self-sm-center rounded-3 fw-semibold flex-shrink-0"
                                                    >
                                                        Apply Now <FaArrowRight size={11} className="ms-1" />
                                                    </Button>
                                                </div>
                                            </Col>
                                        ))}
                                    </Row>
                                )}
                            </div>
                        </div>
                    </Col>

                    {/* Right Column: Upcoming Interviews, Activity & Attendance Widgets */}
                    <Col lg={4}>
                        {/* Upcoming Interviews Card */}
                        <div className="dashboard-card-modern mb-4">
                            <div className="dashboard-card-header">
                                <h6>
                                    <FaCalendar className="text-primary" />
                                    Upcoming Interviews
                                </h6>
                                {upcomingInterviews.length > 0 && (
                                    <Badge bg="primary" pill>
                                        {upcomingInterviews.length}
                                    </Badge>
                                )}
                            </div>
                            <div className="dashboard-card-body">
                                {upcomingInterviews.length === 0 ? (
                                    <div className="text-center py-3">
                                        <FaCalendar className="text-muted mb-2 opacity-50" size={28} />
                                        <p className="text-muted small mb-0">No interviews scheduled yet.</p>
                                        <small className="text-secondary" style={{ fontSize: '0.75rem' }}>
                                            Keep applying! Employers will notify you when shortlisted.
                                        </small>
                                    </div>
                                ) : (
                                    upcomingInterviews.slice(0, 3).map((app) => (
                                        <div key={app._id} className="interview-item-card">
                                            <div className="fw-bold text-dark mb-1">{app.job?.title || 'Scheduled Interview'}</div>
                                            <div className="small text-muted mb-2">
                                                <FaClock className="me-1 text-primary" />
                                                {formatDate(app.interviewDate)}
                                            </div>
                                            {app.interviewLocation && (
                                                <div className="small text-muted mb-2">
                                                    <FaMapMarkerAlt className="me-1 text-danger" />
                                                    {app.interviewLocation}
                                                </div>
                                            )}
                                            <Button 
                                                variant="primary" 
                                                size="sm"
                                                className="w-100 py-1 font-sans rounded-2"
                                                onClick={() => handleViewInterview(app)}
                                            >
                                                <FaEnvelope className="me-1" /> Invitation Details
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Application Activity Pipeline */}
                        <div className="dashboard-card-modern mb-4">
                            <div className="dashboard-card-header">
                                <h6>
                                    <FaMagic className="text-info" />
                                    Application Activity
                                </h6>
                            </div>
                            <div className="dashboard-card-body">
                                <div className="d-flex justify-content-between align-items-center text-muted small">
                                    <span>Pipeline Breakdown</span>
                                    <span className="fw-bold text-dark">{stats.total} Submitted</span>
                                </div>
                                <div className="activity-progress-bar">
                                    <div 
                                        className="activity-segment bg-warning" 
                                        style={{ width: `${stats.total ? (stats.pending / stats.total) * 100 : 0}%` }}
                                        title="Pending"
                                    />
                                    <div 
                                        className="activity-segment bg-success" 
                                        style={{ width: `${stats.total ? ((stats.shortlisted + stats.offered) / stats.total) * 100 : 0}%` }}
                                        title="Shortlisted & Offered"
                                    />
                                    <div 
                                        className="activity-segment bg-primary" 
                                        style={{ width: `${stats.total ? (stats.interviewed / stats.total) * 100 : 0}%` }}
                                        title="Interviewed"
                                    />
                                    <div 
                                        className="activity-segment bg-danger" 
                                        style={{ width: `${stats.total ? (stats.rejected / stats.total) * 100 : 0}%` }}
                                        title="Rejected"
                                    />
                                </div>
                                <div className="d-flex flex-wrap gap-2 text-muted" style={{ fontSize: '0.725rem' }}>
                                    <span className="d-flex align-items-center gap-1">
                                        <span className="rounded-circle bg-warning d-inline-block" style={{ width: 8, height: 8 }} />
                                        Pending ({stats.pending})
                                    </span>
                                    <span className="d-flex align-items-center gap-1">
                                        <span className="rounded-circle bg-success d-inline-block" style={{ width: 8, height: 8 }} />
                                        Active ({stats.shortlisted + stats.offered})
                                    </span>
                                    <span className="d-flex align-items-center gap-1">
                                        <span className="rounded-circle bg-primary d-inline-block" style={{ width: 8, height: 8 }} />
                                        Interviews ({stats.interviewed})
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Attendance Compact Widget */}
                        <div className="attendance-widget mb-4">
                            <div className="d-flex align-items-center justify-content-between mb-2">
                                <div className="d-flex align-items-center gap-2">
                                    <div className="p-2 rounded-circle bg-white text-info shadow-sm">
                                        <FaClock size={16} />
                                    </div>
                                    <div>
                                        <div className="fw-bold text-dark small">Attendance & Work</div>
                                        <div className="text-muted" style={{ fontSize: '0.725rem' }}>
                                            {attendance.today?.checkedIn ? 
                                                (attendance.today?.checkedOut ? 'Completed Today' : 'Checked In') : 
                                                'Not Checked In'}
                                        </div>
                                    </div>
                                </div>
                                <Badge bg={attendance.today?.checkedIn ? 'success' : 'secondary'}>
                                    {attendance.today?.checkedIn ? 'Active' : 'Offline'}
                                </Badge>
                            </div>
                            <Button 
                                as={Link} 
                                to="/candidate/attendance" 
                                variant="outline-info" 
                                size="sm" 
                                className="w-100 rounded-3 fw-semibold py-1 mt-1"
                            >
                                View Attendance Log
                            </Button>
                        </div>

                        {/* Profile Completion Card */}
                        <div className="dashboard-card-modern">
                            <div className="dashboard-card-body">
                                <div className="d-flex justify-content-between align-items-center mb-2">
                                    <h6 className="fw-bold mb-0 text-dark small">Profile Strength</h6>
                                    <span className="fw-bold text-primary small">{profileCompletion}%</span>
                                </div>
                                <ProgressBar 
                                    now={profileCompletion} 
                                    variant={profileCompletion >= 80 ? 'success' : profileCompletion >= 50 ? 'primary' : 'warning'} 
                                    style={{ height: 6 }} 
                                    className="mb-2"
                                />
                                <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    Complete your profile and upload an updated CV to boost your AI match scores!
                                </p>
                                <Button 
                                    as={Link} 
                                    to="/candidate/profile" 
                                    variant="outline-primary" 
                                    size="sm" 
                                    className="w-100 rounded-3 font-sans py-1"
                                >
                                    Complete Profile
                                </Button>
                            </div>
                        </div>
                    </Col>
                </Row>
            </Container>

            {/* Interview Details Modal */}
            <Modal show={showInterviewModal} onHide={() => setShowInterviewModal(false)} size="lg" centered>
                <Modal.Header closeButton className="bg-primary text-white">
                    <Modal.Title className="fs-6 fw-bold">
                        <FaEnvelope className="me-2" /> Interview Invitation
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="p-4">
                    {selectedApplication && (
                        <>
                            <div className="text-center mb-4">
                                <div style={{ fontSize: '2.5rem' }}>📧</div>
                                <h5 className="mt-2 fw-bold">You have been invited for an interview!</h5>
                                <p className="text-muted small">
                                    Position: <strong>{selectedApplication.job?.title || 'Selected Job Position'}</strong>
                                </p>
                            </div>

                            <hr />

                            <Row className="g-3">
                                <Col md={6}>
                                    <div className="p-3 border rounded-3 bg-light">
                                        <div className="d-flex align-items-center">
                                            <FaCalendar className="text-primary me-2" size={18} />
                                            <div>
                                                <div className="small text-muted">Interview Date & Time</div>
                                                <div className="fw-semibold small">{formatDate(selectedApplication.interviewDate)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                                <Col md={6}>
                                    <div className="p-3 border rounded-3 bg-light">
                                        <div className="d-flex align-items-center">
                                            <FaMapMarkerAlt className="text-danger me-2" size={18} />
                                            <div>
                                                <div className="small text-muted">Location</div>
                                                <div className="fw-semibold small">{selectedApplication.interviewLocation || 'To be confirmed'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                            </Row>

                            {/* Interview Notes */}
                            {selectedApplication.statusHistory?.length > 0 && (
                                <div className="mt-3">
                                    <h6 className="fw-bold small">
                                        <FaInfoCircle className="me-2 text-primary" />
                                        Additional Notes
                                    </h6>
                                    <div className="p-3 border rounded-3 bg-light">
                                        {selectedApplication.statusHistory
                                            .filter(h => h.status === 'interviewed' || h.status === 'shortlisted' || h.status === 'offered')
                                            .map((history, idx) => (
                                                <div key={idx} className="mb-2">
                                                    <p className="mb-0 small">{history.note || 'No additional notes provided'}</p>
                                                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                                        Sent on: {new Date(history.date).toLocaleDateString()}
                                                    </small>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Status Timeline */}
                            <div className="mt-4">
                                <h6 className="fw-bold small">Application Timeline</h6>
                                <div className="p-3 border rounded-3 bg-light">
                                    {selectedApplication.statusHistory?.map((history, idx) => (
                                        <div key={idx} className="d-flex align-items-start mb-2">
                                            <Badge 
                                                bg={getStatusBadge(history.status)}
                                                className="me-2 mt-1"
                                            >
                                                {history.status?.toUpperCase()}
                                            </Badge>
                                            <div>
                                                <div className="small">{history.note || 'Status updated'}</div>
                                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                                    {new Date(history.date).toLocaleDateString()} at {new Date(history.date).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="text-center mt-4">
                                <p className="text-muted small mb-2">
                                    Please confirm your availability by replying to this invitation.
                                </p>
                                <Button 
                                    variant="primary" 
                                    size="sm"
                                    className="px-4 py-2 fw-semibold rounded-pill"
                                    onClick={() => {
                                        const subject = `Interview Confirmation: ${selectedApplication.job?.title}`;
                                        const body = `Dear Hiring Team,\n\nI confirm my availability for the interview on ${formatDate(selectedApplication.interviewDate)}.\n\nThank you.`;
                                        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                                    }}
                                >
                                    <FaEnvelope className="me-2" />
                                    Confirm via Email
                                </Button>
                            </div>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" size="sm" onClick={() => setShowInterviewModal(false)}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>
        </section>
    );
};

export default Dashboard;