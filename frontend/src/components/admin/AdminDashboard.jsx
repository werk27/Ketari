import React, { useState, useEffect } from 'react';
import { 
    Row, Col, Card, Badge, Spinner, Button, 
    Form, Modal, ProgressBar, Offcanvas 
} from 'react-bootstrap';
import { 
    FaUsers, FaBriefcase, FaBuilding,
    FaClock, FaEye,
    FaUserPlus, FaCog, FaUserCheck, FaShieldAlt,
    FaUserTie
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { Link, useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);

    // Offcanvas drawers
    const [showApprovals, setShowApprovals] = useState(false);
    const [showActivity, setShowActivity] = useState(false);

    // Statistics start at zero and are replaced by real database values.
    // They were previously seeded with invented figures (1,245 users, 820
    // applications, 84% average match), which made the dashboard look populated
    // even when the API failed and misrepresented the real system state.
    const [stats, setStats] = useState({
        totalUsers: 0, activeUsers: 0, inactiveUsers: 0,
        candidatesCount: 0, candidatesActive: 0, candidatesInactive: 0,
        hrExpertsCount: 0, hrExpertsActive: 0, hrExpertsInactive: 0,
        hrManagersCount: 0, hrManagersActive: 0, hrManagersInactive: 0,
        adminsCount: 0, adminsActive: 0, adminsInactive: 0,
        activeVacancies: 0, totalApplications: 0, pendingApprovalsTotal: 0,
        pipeline: { applications: 0, underReview: 0, aiAnalyzed: 0, shortlisted: 0, interview: 0, selected: 0, hired: 0 },
        pendingApprovals: { vacancies: 0, candidateDecisions: 0, interviewFeedback: 0, offerApprovals: 0 },
        aiMetrics: { cvsAnalyzed: 0, candidatesMatched: 0, averageMatchScore: 0, aiRecommendations: 0 },
        recentActivity: []
    });

    // Modal State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [modalRole, setModalRole] = useState('hr_expert');
    const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '' });

    useEffect(() => { fetchDashboardData(); }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [adminRes] = await Promise.all([api.get('/admin/stats').catch(() => null)]);
            if (adminRes?.data?.stats) {
                const s = adminRes.data.stats;
                const split = (role) => s.roleStatusBreakdown?.[role] || { active: 0, inactive: 0 };
                // `??` rather than `||` so a genuine zero is shown as zero
                // instead of silently falling back to the previous value.
                setStats(prev => ({
                    ...prev,
                    totalUsers: s.totalUsers ?? prev.totalUsers,
                    activeUsers: s.activeUsers ?? prev.activeUsers,
                    inactiveUsers: s.inactiveUsers ?? prev.inactiveUsers,
                    candidatesCount: s.roleBreakdown?.candidate ?? prev.candidatesCount,
                    candidatesActive: split('candidate').active,
                    candidatesInactive: split('candidate').inactive,
                    hrExpertsCount: s.hrExpertsOverview?.total ?? prev.hrExpertsCount,
                    hrExpertsActive: s.hrExpertsOverview?.active ?? prev.hrExpertsActive,
                    hrExpertsInactive: s.hrExpertsOverview?.inactive ?? 0,
                    hrManagersCount: s.hrManagersOverview?.total ?? prev.hrManagersCount,
                    hrManagersActive: s.hrManagersOverview?.active ?? prev.hrManagersActive,
                    hrManagersInactive: s.hrManagersOverview?.inactive ?? 0,
                    adminsCount: s.roleBreakdown?.admin ?? prev.adminsCount,
                    adminsActive: split('admin').active,
                    adminsInactive: split('admin').inactive,
                    activeVacancies: s.recruitmentOverview?.activeVacancies ?? prev.activeVacancies,
                    totalApplications: s.recruitmentOverview?.totalApplications ?? prev.totalApplications,
                    pendingApprovalsTotal: s.recruitmentOverview?.pendingApprovalVacancies ?? prev.pendingApprovalsTotal,
                    pipeline: {
                        applications: s.pipeline?.applied ?? 0,
                        underReview: s.pipeline?.under_review ?? 0,
                        aiAnalyzed: s.pipeline?.ai_analyzed ?? 0,
                        shortlisted: s.pipeline?.shortlisted ?? 0,
                        interview: s.pipeline?.interview ?? 0,
                        selected: s.pipeline?.selected ?? 0,
                        hired: s.pipeline?.hired ?? 0
                    },
                    pendingApprovals: {
                        vacancies: s.recruitmentOverview?.pendingApprovalVacancies ?? 0,
                        candidateDecisions: s.pipeline?.shortlisted ?? 0,
                        interviewFeedback: s.pipeline?.interview ?? 0,
                        offerApprovals: s.pipeline?.selected ?? 0
                    },
                    aiMetrics: {
                        cvsAnalyzed: s.aiOverview?.cvsAnalyzed ?? 0,
                        candidatesMatched: s.aiOverview?.candidatesMatched ?? 0,
                        averageMatchScore: s.aiOverview?.averageMatchScore ?? 0,
                        aiRecommendations: s.aiOverview?.shortlistedWithAI ?? 0
                    },
                    recentActivity: s.recentActivity || []
                }));
            }
        } catch (err) {
            console.error('Error loading Admin Dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenCreateModal = (role) => { setModalRole(role); setShowCreateModal(true); };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        try {
            await api.post('/admin/users', { ...newUserForm, role: modalRole });
            toast.success(`Created new ${modalRole.replace('_', ' ').toUpperCase()} account!`);
            setShowCreateModal(false);
            setNewUserForm({ name: '', email: '', password: '' });
            fetchDashboardData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create user');
        }
    };

    /* ── Design Tokens ── */
    const T = {
        primary: '#4F46E5', secondary: '#3B82F6', success: '#10B981',
        warning: '#F59E0B', danger: '#EF4444',
        cardRadius: '16px',
        cardShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    };

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh' }}>
                <div className="text-center p-5 bg-white shadow-sm" style={{ borderRadius: T.cardRadius }}>
                    <Spinner animation="border" style={{ color: T.primary, width: '3rem', height: '3rem' }} />
                    <h6 className="fw-bold mt-3 text-dark">RECRUITMENT SYSTEM ET</h6>
                    <p className="text-muted small mb-0">Loading Admin Control Center...</p>
                </div>
            </div>
        );
    }

    /* Reusable stat card */
    const StatCard = ({ icon, iconBg, label, value, subText, onClick }) => (
        <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow, cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onClick={onClick}
              onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = T.cardShadow; }}>
            <Card.Body className="p-3">
                <div className="d-flex align-items-center gap-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0"
                         style={{ width: '46px', height: '46px', background: iconBg }}>
                        {icon}
                    </div>
                    <div className="flex-grow-1 min-w-0">
                        <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>{label}</small>
                        <h3 className="fw-bold text-dark mb-0 mt-1" style={{ fontSize: '1.45rem', lineHeight: 1 }}>{value}</h3>
                        <small className="text-muted d-block mt-1" style={{ fontSize: '0.72rem' }}>{subText}</small>
                    </div>
                </div>
            </Card.Body>
        </Card>
    );

    /* ── Recent activity comes from the audit log, never from invented events ── */
    const activityEvents = (stats.recentActivity || []).map(entry => ({
        icon: '🗒️',
        role: entry.role || 'System',
        name: entry.user ? `"${entry.user}"` : '',
        action: [entry.action, entry.entity].filter(Boolean).join(' · '),
        time: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''
    }));

    /* ── Approval items ── */
    const approvalItems = [
        { title: 'Vacancies Awaiting Approval', sub: 'Requires HR Manager approval', count: stats.pendingApprovals.vacancies },
        { title: 'Candidate Decisions', sub: 'Shortlist / Selection approvals', count: stats.pendingApprovals.candidateDecisions },
        { title: 'Interview Feedback', sub: 'Feedback awaiting review', count: stats.pendingApprovals.interviewFeedback },
        { title: 'Offer Approvals', sub: 'Job offer awaiting approval', count: stats.pendingApprovals.offerApprovals },
    ];

    return (
        <div className="p-4" style={{ paddingBottom: '36px' }}>

            {/* ── ROW 1: 5 STAT CARDS ── */}
            <Row className="g-3 mb-4">
                <Col style={{ flex: '1 1 0', minWidth: '190px' }}>
                    <StatCard icon={<FaUsers size={20} />} iconBg={T.primary} label="TOTAL USERS"
                        value={stats.totalUsers.toLocaleString()}
                        subText={`Active: ${stats.activeUsers.toLocaleString()} · Inactive: ${stats.inactiveUsers}`}
                        onClick={() => navigate('/admin/users/all')} />
                </Col>
                <Col style={{ flex: '1 1 0', minWidth: '190px' }}>
                    <StatCard icon={<FaUserTie size={20} />} iconBg={T.success} label="CANDIDATES"
                        value={stats.candidatesCount.toLocaleString()}
                        subText={`Active: ${stats.candidatesActive.toLocaleString()} · Inactive: ${stats.candidatesInactive}`}
                        onClick={() => navigate('/admin/users/candidates')} />
                </Col>
                <Col style={{ flex: '1 1 0', minWidth: '190px' }}>
                    <StatCard icon={<FaUserCheck size={20} />} iconBg={T.secondary} label="HR EXPERTS"
                        value={stats.hrExpertsCount}
                        subText={`Active: ${stats.hrExpertsActive} · Inactive: ${stats.hrExpertsInactive}`}
                        onClick={() => navigate('/admin/users/hr-experts')} />
                </Col>
                <Col style={{ flex: '1 1 0', minWidth: '190px' }}>
                    <StatCard icon={<FaShieldAlt size={20} />} iconBg={T.warning} label="HR MANAGERS"
                        value={stats.hrManagersCount}
                        subText={`Active: ${stats.hrManagersActive} · Inactive: ${stats.hrManagersInactive}`}
                        onClick={() => navigate('/admin/users/hr-managers')} />
                </Col>
                <Col style={{ flex: '1 1 0', minWidth: '190px' }}>
                    <StatCard icon={<FaShieldAlt size={20} />} iconBg={T.danger} label="ADMINISTRATORS"
                        value={stats.adminsCount}
                        subText={`Active: ${stats.adminsActive} · Inactive: ${stats.adminsInactive}`}
                        onClick={() => navigate('/admin/users/administrators')} />
                </Col>
            </Row>

            {/* ── ROW 2: HR TEAM | PIPELINE | PENDING APPROVALS ── */}
            <Row className="g-3 mb-4">
                {/* HR TEAM OVERVIEW */}
                <Col lg={4} md={12}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>HR TEAM OVERVIEW</h6>
                        </Card.Header>
                        <Card.Body className="p-3">
                            <Row className="g-3">
                                <Col sm={6}>
                                    <div className="p-3 rounded-3" style={{ border: '1px solid #E2E8F0' }}>
                                        <div className="d-flex justify-content-between align-items-start mb-2">
                                            <div>
                                                <small className="fw-bold text-uppercase d-block" style={{ fontSize: '0.68rem', color: T.primary }}>HR EXPERTS</small>
                                                <div className="d-flex align-items-baseline gap-1 mt-1">
                                                    <h3 className="fw-bold mb-0">{stats.hrExpertsCount}</h3>
                                                    <small className="text-muted">Total</small>
                                                </div>
                                                <small className="text-success fw-semibold d-block mt-1">{stats.hrExpertsActive} Active</small>
                                            </div>
                                            <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px', background: '#EEF2FF' }}>
                                                <FaUsers size={15} style={{ color: T.primary }} />
                                            </div>
                                        </div>
                                        <ProgressBar now={Math.round((stats.hrExpertsActive / Math.max(stats.hrExpertsCount, 1)) * 100)} style={{ height: '5px', background: '#EEF2FF' }} className="rounded-pill mb-2" />
                                        <p className="text-muted mb-3" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
                                            Responsible for recording and managing recruitment activities.
                                        </p>
                                        <Button as={Link} to="/admin/users/hr-experts" variant="link" className="p-0 fw-semibold small text-decoration-none" style={{ color: T.primary, fontSize: '0.78rem' }}>
                                            Manage HR Experts &rarr;
                                        </Button>
                                    </div>
                                </Col>
                                <Col sm={6}>
                                    <div className="p-3 rounded-3" style={{ border: '1px solid #E2E8F0' }}>
                                        <div className="d-flex justify-content-between align-items-start mb-2">
                                            <div>
                                                <small className="fw-bold text-uppercase d-block" style={{ fontSize: '0.68rem', color: T.warning }}>HR MANAGERS</small>
                                                <div className="d-flex align-items-baseline gap-1 mt-1">
                                                    <h3 className="fw-bold mb-0">{stats.hrManagersCount}</h3>
                                                    <small className="text-muted">Total</small>
                                                </div>
                                                <small className="text-success fw-semibold d-block mt-1">{stats.hrManagersActive} Active</small>
                                            </div>
                                            <div className="rounded-circle d-flex align-items-center justify-content-center" style={{ width: '36px', height: '36px', background: '#FEF3C7' }}>
                                                <FaShieldAlt size={15} style={{ color: T.warning }} />
                                            </div>
                                        </div>
                                        <ProgressBar now={Math.round((stats.hrManagersActive / Math.max(stats.hrManagersCount, 1)) * 100)} variant="warning" style={{ height: '5px', background: '#FEF3C7' }} className="rounded-pill mb-2" />
                                        <p className="text-muted mb-3" style={{ fontSize: '0.72rem', lineHeight: 1.4 }}>
                                            Responsible for reviewing and approving recruitment activities.
                                        </p>
                                        <Button as={Link} to="/admin/users/hr-managers" variant="link" className="p-0 fw-semibold small text-decoration-none" style={{ color: T.warning, fontSize: '0.78rem' }}>
                                            Manage HR Managers &rarr;
                                        </Button>
                                    </div>
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>
                </Col>

                {/* RECRUITMENT PIPELINE */}
                <Col lg={4} md={6}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>RECRUITMENT PIPELINE</h6>
                        </Card.Header>
                        <Card.Body className="p-3">
                            <div className="d-flex flex-column gap-2">
                                {[
                                    { emoji: '📄', label: 'Applications', val: stats.pipeline.applications, bg: '#EEF2FF', color: T.primary },
                                    { emoji: '📂', label: 'Under Review', val: stats.pipeline.underReview, bg: '#FEF3C7', color: T.warning },
                                    { emoji: '🤖', label: 'AI Analyzed', val: stats.pipeline.aiAnalyzed, bg: '#F3E8FF', color: '#8B5CF6' },
                                    { emoji: '⭐', label: 'Shortlisted', val: stats.pipeline.shortlisted, bg: '#D1FAE5', color: T.success },
                                    { emoji: '📞', label: 'Interview', val: stats.pipeline.interview, bg: '#FEE2E2', color: T.danger },
                                    { emoji: '🎯', label: 'Selected / Offered', val: stats.pipeline.selected, bg: '#E0F2FE', color: '#0EA5E9' },
                                    { emoji: '🟢', label: 'Hired', val: stats.pipeline.hired, bg: '#D1FAE5', color: T.success },
                                ].map((stage, i) => (
                                    <div key={i} className="d-flex align-items-center justify-content-between px-2 py-2 rounded-3" style={{ background: stage.bg }}>
                                        <div className="d-flex align-items-center gap-2">
                                            <span style={{ fontSize: '0.9rem' }}>{stage.emoji}</span>
                                            <span className="fw-semibold text-dark" style={{ fontSize: '0.82rem' }}>{stage.label}</span>
                                        </div>
                                        <strong style={{ color: stage.color, fontSize: '0.9rem' }}>{stage.val}</strong>
                                    </div>
                                ))}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                {/* PENDING APPROVALS — opens drawer */}
                <Col lg={4} md={6}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>PENDING APPROVALS</h6>
                        </Card.Header>
                        <Card.Body className="p-3 d-flex flex-column justify-content-between">
                            <div className="d-flex flex-column gap-3">
                                {approvalItems.map((item, i) => (
                                    <div key={i} className="d-flex align-items-center justify-content-between py-2" style={{ borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
                                        <div>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.84rem' }}>{item.title}</div>
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>{item.sub}</small>
                                        </div>
                                        <Badge className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold" style={{ width: '28px', height: '28px', background: T.danger, fontSize: '0.78rem' }}>
                                            {item.count}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center mt-3">
                                <Button variant="link" className="p-0 fw-semibold small text-decoration-none" style={{ color: T.primary, fontSize: '0.78rem' }}
                                    onClick={() => setShowApprovals(true)}>
                                    View All Pending Approvals &rarr;
                                </Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── ROW 3: AI RECRUITMENT | RECENT ACTIVITY | ROLE RESPONSIBILITIES ── */}
            <Row className="g-3 mb-4">
                {/* AI RECRUITMENT OVERVIEW */}
                <Col lg={4} md={12}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>AI RECRUITMENT OVERVIEW</h6>
                        </Card.Header>
                        <Card.Body className="p-3 d-flex flex-column justify-content-between">
                            <Row className="g-2 mb-3">
                                {[
                                    { label: 'CVs Analyzed', val: stats.aiMetrics.cvsAnalyzed, stroke: T.success },
                                    { label: 'Candidates Matched', val: stats.aiMetrics.candidatesMatched, stroke: T.secondary },
                                    { label: 'Average Match Score', val: `${stats.aiMetrics.averageMatchScore}%`, stroke: T.primary },
                                    { label: 'AI Recommendations', val: stats.aiMetrics.aiRecommendations, stroke: T.warning },
                                ].map((m, i) => (
                                    <Col xs={6} key={i}>
                                        <div className="p-3 rounded-3" style={{ border: '1px solid #E2E8F0', background: '#FAFBFC' }}>
                                            <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>{m.label}</small>
                                            <h4 className="fw-bold text-dark mb-1 mt-1" style={{ fontSize: '1.25rem' }}>{m.val}</h4>
                                            <svg width="100%" height="24" viewBox="0 0 100 24">
                                                <path d={`M0,${18-i*2} Q25,${8+i*3} 50,${14-i*2} T100,${4+i}`} fill="none" stroke={m.stroke} strokeWidth="2" />
                                            </svg>
                                        </div>
                                    </Col>
                                ))}
                            </Row>
                            <div className="text-center">
                                <Button variant="link" className="p-0 fw-semibold small text-decoration-none" style={{ color: T.primary, fontSize: '0.78rem' }}>
                                    View AI Analytics Report &rarr;
                                </Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                {/* RECENT SYSTEM ACTIVITY — opens drawer */}
                <Col lg={4} md={6}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>RECENT SYSTEM ACTIVITY</h6>
                        </Card.Header>
                        <Card.Body className="p-3 d-flex flex-column justify-content-between">
                            <div className="d-flex flex-column gap-3">
                                {activityEvents.length === 0 ? (
                                    <div className="text-center text-muted py-4" style={{ fontSize: '0.82rem' }}>
                                        No recorded system activity yet.
                                    </div>
                                ) : activityEvents.slice(0, 5).map((evt, i) => (
                                    <div key={i} className="d-flex align-items-start gap-2">
                                        <span style={{ fontSize: '0.85rem', lineHeight: 1.8 }}>{evt.icon}</span>
                                        <div className="flex-grow-1">
                                            <div className="text-dark" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                                                <strong className="fw-semibold">{evt.role}</strong> {evt.name} {evt.action}
                                            </div>
                                        </div>
                                        <small className="text-muted flex-shrink-0" style={{ fontSize: '0.68rem' }}>{evt.time}</small>
                                    </div>
                                ))}
                            </div>
                            <div className="text-center mt-3">
                                <Button variant="link" className="p-0 fw-semibold small text-decoration-none" style={{ color: T.primary, fontSize: '0.78rem' }}
                                    onClick={() => setShowActivity(true)}>
                                    View All Activity &rarr;
                                </Button>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                {/* ROLE RESPONSIBILITIES */}
                <Col lg={4} md={6}>
                    <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                        <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                            <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>ROLE RESPONSIBILITIES</h6>
                        </Card.Header>
                        <Card.Body className="p-3">
                            <div className="d-flex flex-column gap-2">
                                {[
                                    { emoji: '🛡️', title: 'System Administrator', desc: 'Controls users, roles, permissions, configuration and system settings.', bg: '#EEF2FF', color: '#3730A3', iconBg: T.primary },
                                    { emoji: '👨‍💼', title: 'HR Expert', desc: 'Records and manages recruitment data including vacancies, applications, and candidate information.', bg: '#EFF6FF', color: '#1E40AF', iconBg: T.secondary },
                                    { emoji: '👔', title: 'HR Manager', desc: 'Reviews and approves recruitment activities and monitors recruitment performance.', bg: '#FEF3C7', color: '#92400E', iconBg: T.warning },
                                    { emoji: '👤', title: 'Candidate', desc: 'Searches jobs, applies, and manages own applications and profile.', bg: '#D1FAE5', color: '#065F46', iconBg: T.success },
                                ].map((role, i) => (
                                    <div key={i} className="p-3 rounded-3 d-flex align-items-start gap-2" style={{ background: role.bg }}>
                                        <div className="rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0 mt-1" style={{ width: '28px', height: '28px', background: role.iconBg, fontSize: '0.7rem' }}>
                                            {role.emoji}
                                        </div>
                                        <div>
                                            <div className="fw-bold small" style={{ color: role.color, fontSize: '0.82rem' }}>{role.title}</div>
                                            <small className="d-block" style={{ fontSize: '0.72rem', color: role.color, opacity: 0.85, lineHeight: 1.4 }}>{role.desc}</small>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* ── ROW 4: QUICK ACTIONS ── */}
            <Card className="border-0" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                <Card.Header className="bg-white border-0 pt-3 px-3 pb-0" style={{ borderRadius: `${T.cardRadius} ${T.cardRadius} 0 0` }}>
                    <h6 className="fw-bold text-dark text-uppercase mb-0" style={{ fontSize: '0.8rem', letterSpacing: '0.5px' }}>QUICK ACTIONS</h6>
                </Card.Header>
                <Card.Body className="p-3">
                    <div className="d-flex flex-wrap gap-3">
                        {[
                            { icon: <FaUserPlus size={15} />, label: 'Add HR Expert', color: T.primary, onClick: () => handleOpenCreateModal('hr_expert') },
                            { icon: <FaUserPlus size={15} />, label: 'Add HR Manager', color: T.warning, onClick: () => handleOpenCreateModal('hr_manager') },
                            { icon: <FaUserPlus size={15} />, label: 'Add Candidate', color: T.success, onClick: () => handleOpenCreateModal('candidate') },
                            // Platform administration only - creating vacancies and reviewing
                            // applications belong to an employer's HR team, not to the System Administrator.
                            { icon: <FaBuilding size={15} />, label: 'Manage Employers', color: '#8B5CF6', link: '/admin/employers' },
                            { icon: <FaEye size={15} />, label: 'Complaints', color: T.secondary, link: '/admin/complaints' },
                            { icon: <FaCog size={15} />, label: 'System Settings', color: '#64748B', link: '/admin/config' },
                        ].map((action, i) => (
                            <Button
                                key={i}
                                {...(action.link ? { as: Link, to: action.link } : { onClick: action.onClick })}
                                variant="light"
                                className="d-flex align-items-center gap-2 fw-semibold text-dark text-decoration-none border-0"
                                style={{ background: '#F8FAFC', borderRadius: '10px', padding: '10px 18px', fontSize: '0.82rem', flex: '1 1 auto', justifyContent: 'center', minWidth: '140px' }}
                            >
                                <span style={{ color: action.color }}>{action.icon}</span>
                                {action.label}
                            </Button>
                        ))}
                    </div>
                </Card.Body>
            </Card>

            {/* ═══════════════════════════════════════════════════════
                OFFCANVAS: PENDING APPROVALS DRAWER
            ═══════════════════════════════════════════════════════ */}
            <Offcanvas show={showApprovals} onHide={() => setShowApprovals(false)} placement="end" style={{ width: '420px' }}>
                <Offcanvas.Header closeButton className="border-bottom" style={{ background: '#FAFBFC' }}>
                    <Offcanvas.Title className="fw-bold" style={{ fontSize: '1.05rem' }}>
                        <FaClock className="me-2" style={{ color: T.danger }} />
                        Pending Approvals
                        <Badge className="ms-2 text-white" style={{ background: T.danger, fontSize: '0.7rem' }}>
                            {stats.pendingApprovals.vacancies + stats.pendingApprovals.candidateDecisions + stats.pendingApprovals.interviewFeedback + stats.pendingApprovals.offerApprovals}
                        </Badge>
                    </Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body className="p-0">
                    {approvalItems.map((item, i) => (
                        <div key={i} className="d-flex align-items-center justify-content-between p-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <div>
                                <div className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>{item.title}</div>
                                <small className="text-muted" style={{ fontSize: '0.74rem' }}>{item.sub}</small>
                            </div>
                            <Badge className="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold" style={{ width: '32px', height: '32px', background: T.danger, fontSize: '0.85rem' }}>
                                {item.count}
                            </Badge>
                        </div>
                    ))}
                    <div className="p-3 text-center">
                        <small className="text-muted">Click an approval to review and take action.</small>
                    </div>
                </Offcanvas.Body>
            </Offcanvas>

            {/* ═══════════════════════════════════════════════════════
                OFFCANVAS: RECENT ACTIVITY DRAWER
            ═══════════════════════════════════════════════════════ */}
            <Offcanvas show={showActivity} onHide={() => setShowActivity(false)} placement="end" style={{ width: '480px' }}>
                <Offcanvas.Header closeButton className="border-bottom" style={{ background: '#FAFBFC' }}>
                    <Offcanvas.Title className="fw-bold" style={{ fontSize: '1.05rem' }}>
                        📋 Recent System Activity
                    </Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body className="p-0">
                    {activityEvents.length === 0 ? (
                        <div className="text-center text-muted p-4" style={{ fontSize: '0.85rem' }}>
                            No recorded system activity yet.
                        </div>
                    ) : activityEvents.map((evt, i) => (
                        <div key={i} className="d-flex align-items-start gap-3 p-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <span style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>{evt.icon}</span>
                            <div className="flex-grow-1">
                                <div className="text-dark" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
                                    <strong className="fw-semibold">{evt.role}</strong> {evt.name} {evt.action}
                                </div>
                                <small className="text-muted" style={{ fontSize: '0.72rem' }}>{evt.time}</small>
                            </div>
                        </div>
                    ))}
                </Offcanvas.Body>
            </Offcanvas>

            {/* ═══════════════════════════════════════════════════════
                MODAL: CREATE USER
            ═══════════════════════════════════════════════════════ */}
            <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered>
                <Modal.Header closeButton className="border-0">
                    <Modal.Title className="fw-bold" style={{ fontSize: '1.1rem' }}>
                        <FaUserPlus className="me-2" style={{ color: T.primary }} /> Add New {modalRole.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleCreateUser}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Full Name</Form.Label>
                            <Form.Control type="text" required value={newUserForm.name}
                                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                placeholder="Enter full name" style={{ borderRadius: '10px' }} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Email Address</Form.Label>
                            <Form.Control type="email" required value={newUserForm.email}
                                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                placeholder="name@company.com" style={{ borderRadius: '10px' }} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Password</Form.Label>
                            <Form.Control type="password" required minLength={6} value={newUserForm.password}
                                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                placeholder="Minimum 6 characters" style={{ borderRadius: '10px' }} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer className="border-0">
                        <Button variant="light" className="rounded-pill px-4" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                        <Button type="submit" className="rounded-pill px-4 fw-bold text-white" style={{ background: T.primary, borderColor: T.primary }}>Create Account</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminDashboard;