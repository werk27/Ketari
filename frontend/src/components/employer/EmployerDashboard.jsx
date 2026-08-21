import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FaBriefcase, FaFileAlt, FaUserFriends, FaCheckCircle, FaBuilding, FaClock,
    FaUsers, FaCalendarAlt, FaClipboardList, FaGraduationCap, FaComments, FaPlus
} from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const QUICK_ACTIONS = [
    { to: '/employer/employees', label: 'Employee Directory', icon: FaUsers },
    { to: '/employer/leave', label: 'Leave', icon: FaCalendarAlt },
    { to: '/employer/requests', label: 'Requests', icon: FaClipboardList },
    { to: '/employer/training', label: 'Training', icon: FaGraduationCap },
    { to: '/employer/team', label: 'HR Team', icon: FaUserFriends },
    { to: '/employer/configuration', label: 'Configuration', icon: FaBuilding }
];

/**
 * Employer HR Management dashboard (spec §3 / §25).
 *
 * The Employer represents the ORGANIZATION, not an individual HR user. This is
 * the organization's HR overview: workforce, recruitment, HR operations and the
 * HR team. Every figure comes from the database - nothing is fabricated.
 */
const EmployerDashboard = () => {
    const [data, setData] = useState(null);
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [overviewRes, teamRes] = await Promise.all([
                api.get('/employers/me/overview'),
                api.get('/employers/me/team').catch(() => null)
            ]);
            setData(overviewRes.data);
            setTeam(teamRes ? teamRes.data.team || [] : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your organization overview.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <LoadingState label="Loading HR overview…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const org = data?.organization;
    const stats = data?.statistics || {};
    const { vacancies, applications, employees, leave, requests, training, complaints, structure } = stats;
    const hrTeam = team.filter(member => member.role !== 'employer');

    const pendingTotal = (leave?.pending || 0) + (requests?.pending || 0)
        + (training?.pendingApproval || 0) + (vacancies?.pendingApproval || 0);

    return (
        <div>
            {/* Organization header */}
            <Card className="p-3 mb-4">
                <div className="d-flex align-items-center gap-3 flex-wrap">
                    <div className="d-flex align-items-center justify-content-center flex-shrink-0"
                         style={{ width: 56, height: 56, borderRadius: 14, background: '#EEF2FF', color: '#4F46E5' }}>
                        {org?.logo
                            ? <img src={org.logo} alt="" style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover' }} />
                            : <FaBuilding size={22} />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                            <h5 className="fw-bold text-dark mb-0">{org?.name || 'Your Organization'}</h5>
                            <StatusBadge status={org?.status} />
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                            {org?.industry || 'Industry not set'}
                            {' · '}{structure?.departments || 0} department(s)
                            {' · '}{structure?.positions || 0} position(s)
                        </div>
                    </div>
                    <Link to="/employer/profile" className="btn btn-sm btn-outline-primary">Edit organization</Link>
                </div>
                {org?.status === 'pending' && (
                    <div className="mt-3 p-2 rounded" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                        <div className="text-dark" style={{ fontSize: '0.8rem' }}>
                            Your organization is awaiting verification by the System Administrator.
                            Vacancies stay private until it is activated.
                        </div>
                    </div>
                )}
            </Card>

            {/* Workforce */}
            <SectionHeader title="Workforce" description="Employee statistics across your organization" />
            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Total Employees" value={employees?.total ?? 0} icon={FaUsers}
                              hint="On the directory" to="/employer/employees" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Active" value={employees?.active ?? 0} icon={FaCheckCircle} tone="#16A34A"
                              hint="Currently employed" to="/employer/employees" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="On Leave" value={employees?.onLeave ?? 0} icon={FaCalendarAlt} tone="#D97706"
                              hint="Away right now" to="/employer/leave" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="New This Month" value={employees?.newThisMonth ?? 0} icon={FaUserFriends}
                              tone="#0EA5E9" hint="Hired in the last 30 days" to="/employer/employees" />
                </div>
            </div>

            {/* Recruitment */}
            <SectionHeader title="Recruitment" description="Vacancy and application pipeline" />
            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Active Vacancies" value={vacancies?.active ?? 0} icon={FaBriefcase}
                              hint="Published and open" to="/employer/vacancies" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Applications" value={applications?.total ?? 0} icon={FaFileAlt} tone="#0EA5E9"
                              hint="Received in total" to="/employer/applications" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Shortlisted" value={applications?.shortlisted ?? 0} icon={FaUserFriends}
                              tone="#0891B2" hint="Awaiting decision" to="/employer/applications" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Hired" value={applications?.hired ?? 0} icon={FaCheckCircle} tone="#16A34A"
                              hint="Completed hires" to="/employer/applications" />
                </div>
            </div>

            {/* HR operations */}
            <SectionHeader title="HR Operations" description="Items moving through the approval workflow" />
            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Pending Leave" value={leave?.pending ?? 0} icon={FaCalendarAlt} tone="#D97706"
                              hint="Awaiting approval" to="/employer/leave" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Open Requests" value={requests?.pending ?? 0} icon={FaClipboardList} tone="#7C3AED"
                              hint="Break-year, resignation…" to="/employer/requests" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Training" value={training?.upcoming ?? 0} icon={FaGraduationCap} tone="#0EA5E9"
                              hint={`${training?.pendingApproval ?? 0} awaiting approval`} to="/employer/training" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Open Complaints" value={complaints?.open ?? 0} icon={FaComments} tone="#DC2626"
                              hint="Being handled" to="/employer/complaints" />
                </div>
            </div>

            <div className="row g-3">
                {/* Pending approvals */}
                <div className="col-12 col-xl-4">
                    <Card className="p-3 h-100">
                        <SectionHeader title="Awaiting Approval" description="Across the whole organization" />
                        {pendingTotal === 0 ? (
                            <EmptyState icon={FaCheckCircle} title="Nothing pending"
                                        description="Every submitted item has been decided." />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {[
                                    ['Vacancies', vacancies?.pendingApproval || 0, '/employer/vacancies'],
                                    ['Leave requests', leave?.pending || 0, '/employer/leave'],
                                    ['Employee requests', requests?.pending || 0, '/employer/requests'],
                                    ['Training programmes', training?.pendingApproval || 0, '/employer/training']
                                ].filter(([, count]) => count > 0).map(([label, count, to]) => (
                                    <Link key={label} to={to} className="text-decoration-none">
                                        <div className="d-flex justify-content-between align-items-center p-2 rounded"
                                             style={{ border: '1px solid #E2E8F0' }}>
                                            <span className="text-dark" style={{ fontSize: '0.85rem' }}>{label}</span>
                                            <span className="fw-bold" style={{ fontSize: '1rem', color: '#D97706' }}>{count}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Hiring pipeline */}
                <div className="col-12 col-xl-4">
                    <Card className="p-3 h-100">
                        <SectionHeader title="Hiring Pipeline" description="Where candidates currently sit" />
                        {(!applications || applications.total === 0) ? (
                            <EmptyState icon={FaFileAlt} title="No applications yet"
                                        description="Published vacancies will start collecting applications." />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {[
                                    ['Applied', applications.byStatus?.applied || 0],
                                    ['Under Review', applications.byStatus?.under_review || 0],
                                    ['Shortlisted', applications.shortlisted || 0],
                                    ['Interviewing', applications.interviewing || 0],
                                    ['Hired', applications.hired || 0]
                                ].map(([label, value]) => {
                                    const pct = applications.total ? Math.round((value / applications.total) * 100) : 0;
                                    return (
                                        <div key={label}>
                                            <div className="d-flex justify-content-between" style={{ fontSize: '0.78rem' }}>
                                                <span className="text-muted">{label}</span>
                                                <span className="fw-semibold text-dark">{value}</span>
                                            </div>
                                            <div style={{ height: 6, background: '#F1F5F9', borderRadius: 999 }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: '#4F46E5', borderRadius: 999 }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>

                {/* HR team */}
                <div className="col-12 col-xl-4">
                    <Card className="p-3 h-100">
                        <SectionHeader
                            title="HR Team"
                            description="Staff running your HR operations"
                            action={<Link to="/employer/team" className="btn btn-sm btn-outline-secondary">Manage</Link>}
                        />
                        {hrTeam.length === 0 ? (
                            <EmptyState
                                icon={FaUserFriends}
                                title="No HR team members yet"
                                description="Add HR Experts to run operations and HR Managers to approve their work."
                                action={<Link to="/employer/team" className="btn btn-sm btn-primary">Add team member</Link>}
                            />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {hrTeam.slice(0, 5).map(member => (
                                    <div key={member._id}
                                         className="d-flex justify-content-between align-items-center p-2 rounded"
                                         style={{ border: '1px solid #E2E8F0' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="fw-semibold text-dark text-truncate" style={{ fontSize: '0.84rem' }}>
                                                {member.name}
                                            </div>
                                            <div className="text-muted text-truncate" style={{ fontSize: '0.74rem' }}>
                                                {member.email}
                                            </div>
                                        </div>
                                        <div className="text-end flex-shrink-0">
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.74rem' }}>
                                                {member.role === 'hr_manager' ? 'HR Manager'
                                                    : member.role === 'hr_expert' ? 'HR Expert' : 'Employee'}
                                            </div>
                                            <StatusBadge status={member.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Quick actions */}
            <Card className="p-3 mt-3">
                <SectionHeader title="Quick Actions" />
                <div className="d-flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map(action => {
                        const Icon = action.icon;
                        return (
                            <Link key={action.to} to={action.to}
                                  className="btn btn-light d-flex align-items-center gap-2 border-0 text-dark fw-semibold"
                                  style={{ background: '#F8FAFC', borderRadius: 10, fontSize: '0.82rem', padding: '10px 16px' }}>
                                <Icon size={14} className="text-primary" />
                                {action.label}
                            </Link>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
};

export default EmployerDashboard;
