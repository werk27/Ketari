import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FaBriefcase, FaFileAlt, FaListAlt, FaPlusCircle, FaClock, FaExclamationTriangle
} from 'react-icons/fa';
import api, { getImageUrl } from '../../services/api';
import '../../styles/dashboardHero.css';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * HR Expert dashboard.
 *
 * Focused on operational recruitment work: vacancies the expert owns,
 * items needing action, and shortcuts into the processing screens.
 * Contains no approval actions - approving is the HR Manager's responsibility.
 */
const HRExpertDashboard = () => {
    const [jobs, setJobs] = useState([]);
    const [overview, setOverview] = useState(null);
    const [organization, setOrganization] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [jobsRes, overviewRes] = await Promise.all([
                api.get('/jobs/hr-expert/me'),
                api.get('/employers/me/overview').catch(() => null)
            ]);
            setJobs(jobsRes.data.jobs || []);
            setOverview(overviewRes ? overviewRes.data.statistics : null);
            setOrganization(overviewRes ? overviewRes.data.organization : null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your recruitment workspace.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        const byStatus = jobs.reduce((acc, job) => {
            acc[job.status] = (acc[job.status] || 0) + 1;
            return acc;
        }, {});
        const applications = jobs.reduce((total, job) => total + (job.applications?.length || 0), 0);
        return {
            drafts: byStatus.draft || 0,
            pending: byStatus.pending_approval || 0,
            rejected: byStatus.rejected || 0,
            live: (byStatus.published || 0) + (byStatus.approved || 0) + (byStatus.open || 0),
            applications
        };
    }, [jobs]);

    const needsAttention = useMemo(
        () => jobs.filter(job => job.status === 'rejected' || job.status === 'draft').slice(0, 5),
        [jobs]
    );

    const recent = useMemo(() => jobs.slice(0, 6), [jobs]);

    if (loading) return <LoadingState label="Loading your workspace…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <section className="dash-hero">
                <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                    <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                        <div className="d-flex align-items-center gap-3 mb-2">
                            <div className="hero-badge">
                                {organization?.logo
                                    ? <img src={getImageUrl(organization.logo)} alt="" />
                                    : <FaBriefcase size={21} />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <h1>Recruitment Operations</h1>
                                <span className="hero-sub">
                                    {organization?.name || 'Your organization'}
                                    {' · '}HR Expert
                                </span>
                            </div>
                        </div>
                        <div className="hero-sub">
                            Create vacancies, process applications and prepare shortlists for manager review.
                        </div>
                    </div>

                    <div className="d-flex gap-2 flex-wrap">
                        <Link to="/hr-expert/job-creator" className="btn btn-sm btn-primary fw-semibold d-flex align-items-center gap-2">
                            <FaPlusCircle size={13} /> New Vacancy
                        </Link>
                        <Link to="/hr-expert/vacancies" className="btn btn-sm btn-light fw-semibold">
                            My vacancies
                        </Link>
                    </div>
                </div>
            </section>

            <div className="hero-overlap">
                <div className="row g-3 mb-4">
                    <div className="col-6 col-lg-3">
                        <StatCard label="Live Vacancies" value={stats.live} icon={FaBriefcase}
                                  hint="Published and accepting applications" to="/hr-expert/vacancies" />
                    </div>
                    <div className="col-6 col-lg-3">
                        <StatCard label="Awaiting Approval" value={stats.pending} icon={FaClock} tone="#D97706"
                                  hint="With the HR Manager" to="/hr-expert/vacancies" />
                    </div>
                    <div className="col-6 col-lg-3">
                        <StatCard label="Drafts" value={stats.drafts} icon={FaListAlt} tone="#64748B"
                                  hint="Not yet submitted" to="/hr-expert/vacancies" />
                    </div>
                    <div className="col-6 col-lg-3">
                        <StatCard label="Applications" value={overview?.applications?.total ?? stats.applications}
                                  icon={FaFileAlt} tone="#0EA5E9"
                                  hint="Across your organization" to="/hr-expert/applications" />
                    </div>
                </div>
            </div>

            {stats.rejected > 0 && (
                <Card className="p-3 mb-4" style={{ borderColor: 'rgba(252,211,77,0.45)', background: 'rgba(180,131,10,0.16)' }}>
                    <div className="d-flex align-items-start gap-3">
                        <FaExclamationTriangle className="text-warning flex-shrink-0 mt-1" />
                        <div>
                            <div className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>
                                {stats.rejected} vacancy{stats.rejected > 1 ? ' entries' : ''} returned for correction
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                Your HR Manager sent feedback. Edit the vacancy and resubmit it for approval.
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            <div className="row g-3">
                <div className="col-12 col-xl-7">
                    <Card className="p-3 h-100">
                        <SectionHeader
                            title="My Vacancies"
                            description="Vacancies you created, newest first"
                            action={<Link to="/hr-expert/vacancies" className="btn btn-sm btn-outline-secondary">View all</Link>}
                        />
                        {recent.length === 0 ? (
                            <EmptyState
                                icon={FaBriefcase}
                                title="No vacancies yet"
                                description="Use the Job Creator to draft your first vacancy and submit it for HR Manager approval."
                                action={<Link to="/hr-expert/job-creator" className="btn btn-sm btn-primary">Open Job Creator</Link>}
                            />
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle mb-0">
                                    <thead>
                                        <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                            <th className="fw-semibold">Vacancy</th>
                                            <th className="fw-semibold">Department</th>
                                            <th className="fw-semibold">Status</th>
                                            <th className="fw-semibold text-end">Applications</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recent.map(job => {
                                            const editable = ['draft', 'rejected', 'pending_approval'].includes(job.status);
                                            const target = editable
                                                ? `/hr-expert/vacancies/${job._id}/edit`
                                                : `/hr-expert/applications/${job._id}`;
                                            return (
                                                <tr key={job._id}>
                                                    <td>
                                                        <Link to={target}
                                                              className="fw-semibold text-decoration-none text-dark"
                                                              style={{ fontSize: '0.85rem' }}>
                                                            {job.title}
                                                        </Link>
                                                    </td>
                                                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{job.department}</td>
                                                    <td><StatusBadge status={job.status} /></td>
                                                    <td className="text-end fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                        {job.applications?.length || 0}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="col-12 col-xl-5">
                    <Card className="p-3 h-100">
                        <SectionHeader title="Needs your action" description="Drafts and returned vacancies" />
                        {needsAttention.length === 0 ? (
                            <EmptyState icon={FaListAlt} title="Nothing pending"
                                        description="You have no drafts or returned vacancies waiting." />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {needsAttention.map(job => (
                                    <Link key={job._id} to={`/hr-expert/vacancies/${job._id}/edit`}
                                          className="text-decoration-none">
                                        <div className="d-flex justify-content-between align-items-center p-2 rounded row-line">
                                            <div style={{ minWidth: 0 }}>
                                                <div className="fw-semibold text-dark text-truncate" style={{ fontSize: '0.84rem' }}>
                                                    {job.title}
                                                </div>
                                                {job.status === 'rejected' && job.rejectionReason && (
                                                    <div className="text-danger text-truncate" style={{ fontSize: '0.74rem' }}>
                                                        {job.rejectionReason}
                                                    </div>
                                                )}
                                            </div>
                                            <StatusBadge status={job.status} />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default HRExpertDashboard;
