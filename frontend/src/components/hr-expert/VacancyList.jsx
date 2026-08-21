import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaBriefcase, FaPlusCircle, FaPaperPlane, FaEdit, FaUsers, FaRobot } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'pending_approval', label: 'Pending Approval' },
    { key: 'published', label: 'Published' },
    { key: 'rejected', label: 'Returned' }
];

/**
 * Vacancy list for the recruitment workspace.
 *
 * HR Experts see and act on the vacancies they own (edit, submit for approval).
 * HR Managers and Employers see the whole organization in read-only form.
 */
const VacancyList = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);

    const isExpert = user?.role === 'hr_expert';

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = isExpert ? {} : { scope: 'organization' };
            const res = await api.get('/jobs/hr-expert/me', { params });
            setJobs(res.data.jobs || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load vacancies.');
        } finally {
            setLoading(false);
        }
    }, [isExpert]);

    useEffect(() => { load(); }, [load]);

    const submitForApproval = async (job) => {
        setBusyId(job._id);
        try {
            const res = await api.put(`/jobs/${job._id}/submit`);
            toast.success('Vacancy submitted for HR Manager approval');
            setJobs(prev => prev.map(item => (item._id === job._id ? { ...item, ...res.data.job } : item)));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit vacancy');
        } finally {
            setBusyId(null);
        }
    };

    const visible = useMemo(() => {
        if (filter === 'all') return jobs;
        if (filter === 'published') {
            return jobs.filter(job => ['published', 'approved', 'open'].includes(job.status));
        }
        return jobs.filter(job => job.status === filter);
    }, [jobs, filter]);

    if (loading) return <LoadingState label="Loading vacancies…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <Card className="p-3">
            <SectionHeader
                title={isExpert ? 'My Vacancies' : 'Organization Vacancies'}
                description={isExpert
                    ? 'Vacancies you created. Drafts and returned vacancies can be edited and submitted.'
                    : 'All vacancies belonging to your organization.'}
                action={isExpert && (
                    <Link to="/hr-expert/job-creator" className="btn btn-sm btn-primary d-flex align-items-center gap-2">
                        <FaPlusCircle size={12} /> New Vacancy
                    </Link>
                )}
            />

            <div className="d-flex gap-2 flex-wrap mb-3">
                {FILTERS.map(item => (
                    <button
                        key={item.key}
                        onClick={() => setFilter(item.key)}
                        className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.78rem' }}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <EmptyState
                    icon={FaBriefcase}
                    title="No vacancies in this view"
                    description={filter === 'all'
                        ? 'Create a vacancy in the Job Creator to get started.'
                        : 'Try a different filter to see other vacancies.'}
                    action={isExpert && filter === 'all' && (
                        <Link to="/hr-expert/job-creator" className="btn btn-sm btn-primary">Open Job Creator</Link>
                    )}
                />
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                <th className="fw-semibold">Vacancy</th>
                                <th className="fw-semibold">Status</th>
                                <th className="fw-semibold text-center">Applications</th>
                                <th className="fw-semibold">Deadline</th>
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(job => {
                                const canEdit = isExpert && ['draft', 'rejected', 'pending_approval'].includes(job.status);
                                const canSubmit = isExpert && ['draft', 'rejected'].includes(job.status);
                                const isLive = ['published', 'approved', 'open'].includes(job.status);

                                return (
                                    <tr key={job._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>{job.title}</div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {job.department} · {job.location}
                                            </div>
                                            {job.status === 'rejected' && job.rejectionReason && (
                                                <div className="text-danger mt-1" style={{ fontSize: '0.74rem' }}>
                                                    Manager feedback: {job.rejectionReason}
                                                </div>
                                            )}
                                        </td>
                                        <td><StatusBadge status={job.status} /></td>
                                        <td className="text-center fw-semibold" style={{ fontSize: '0.85rem' }}>
                                            {job.applications?.length || 0}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                            {job.applicationDeadline
                                                ? new Date(job.applicationDeadline).toLocaleDateString()
                                                : '—'}
                                        </td>
                                        <td className="text-end">
                                            <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                {canSubmit && (
                                                    <Button size="sm" variant="primary" disabled={busyId === job._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => submitForApproval(job)}>
                                                        <FaPaperPlane size={10} /> Submit
                                                    </Button>
                                                )}
                                                {canEdit && (
                                                    <Link to={`/hr-expert/vacancies/${job._id}/edit`}
                                                          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
                                                        <FaEdit size={10} /> Edit
                                                    </Link>
                                                )}
                                                {isLive && (
                                                    <>
                                                        <Link to={`/${isExpert ? 'hr-expert' : 'hr-manager'}/applications/${job._id}`}
                                                              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
                                                            <FaUsers size={10} /> Applicants
                                                        </Link>
                                                        <Link to={`/${isExpert ? 'hr-expert' : 'hr-manager'}/ai-matching/${job._id}`}
                                                              className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1">
                                                            <FaRobot size={10} /> Match
                                                        </Link>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default VacancyList;
