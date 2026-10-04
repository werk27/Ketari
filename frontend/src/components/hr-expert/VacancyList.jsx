import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaBriefcase, FaPlusCircle, FaPaperPlane, FaEdit, FaUsers, FaRobot, FaTrash, FaLock, FaUndo } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
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
 * Statuses in which a vacancy is still the HR Expert's own work and can be
 * edited, submitted or deleted. Mirrors EDITABLE_STATUSES in the backend's
 * jobController so the workspace never offers an action the API would refuse:
 * once submitted, the vacancy belongs to the HR Manager's review.
 */
const OWN_WORK_STATUSES = ['draft', 'rejected'];

/**
 * Vacancy list for the recruitment workspace.
 *
 * HR Experts see and act on the vacancies they own (edit, submit for approval,
 * delete while still unsubmitted).
 * HR Managers and Employers see the whole organization in read-only form.
 */
const VacancyList = () => {
    const { user, can } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const isExpert = user?.role === 'hr_expert';
    // Mirrors the backend's CAPABILITIES.VACANCY_APPROVE gate on PUT /jobs/:id/close -
    // only whoever can approve a vacancy may also close it early.
    const canClose = can('vacancy:approve');

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

    const withdraw = async (job) => {
        setBusyId(job._id);
        try {
            const res = await api.put(`/jobs/${job._id}/withdraw`);
            toast.success('Vacancy withdrawn - it is back in your drafts');
            setJobs(prev => prev.map(item => (item._id === job._id ? { ...item, ...res.data.job } : item)));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not withdraw vacancy');
        } finally {
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        const job = deleteTarget;
        if (!job) return;
        setBusyId(job._id);
        try {
            await api.delete(`/jobs/${job._id}`);
            toast.success(`"${job.title}" was deleted`);
            setJobs(prev => prev.filter(item => item._id !== job._id));
            setDeleteTarget(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not delete vacancy');
        } finally {
            setBusyId(null);
        }
    };

    // Closing is an early-stop of a still-open vacancy (e.g. hiring need
    // withdrawn) rather than a Delete/Remove action, so it follows the same
    // native-confirm pattern already used for other Update-type actions
    // (e.g. delegation revoke) rather than the polished delete modal, which
    // is scoped to destructive Delete/Remove actions only.
    const closeVacancy = async (job) => {
        if (!window.confirm(`Close "${job.title}"? It will stop accepting applications and be removed from the public job board. This cannot be undone from here.`)) {
            return;
        }
        setBusyId(job._id);
        try {
            const res = await api.put(`/jobs/${job._id}/close`);
            toast.success('Vacancy closed');
            setJobs(prev => prev.map(item => (item._id === job._id ? { ...item, ...res.data.job } : item)));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not close vacancy');
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
        <>
        <Card className="p-3">
            <SectionHeader
                title={isExpert ? 'My Vacancies' : 'Organization Vacancies'}
                description={isExpert
                    ? 'Vacancies you created. Drafts and returned vacancies can be edited, submitted or deleted.'
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
                                <th className="fw-semibold text-center">Positions</th>
                                <th className="fw-semibold">Deadline</th>
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(job => {
                                const isOwnWork = isExpert && OWN_WORK_STATUSES.includes(job.status);
                                const canEdit = isOwnWork;
                                const canSubmit = isOwnWork;
                                const canWithdraw = isExpert && job.status === 'pending_approval';
                                const canDelete = isOwnWork && (job.applications?.length || 0) === 0;
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
                                        <td className="text-center" style={{ fontSize: '0.82rem' }}>
                                            {job.vacancy ? (
                                                <>
                                                    <span className="fw-semibold">{job.vacancy.hired}</span>
                                                    <span className="text-muted"> / {job.vacancy.required} filled</span>
                                                    {job.vacancy.isFull && isLive && (
                                                        <div className="text-success" style={{ fontSize: '0.7rem' }}>All positions filled</div>
                                                    )}
                                                </>
                                            ) : (job.numberOfPositions || 1)}
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
                                                {canWithdraw && (
                                                    <Button size="sm" variant="outline-warning" disabled={busyId === job._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => withdraw(job)}>
                                                        <FaUndo size={10} /> Withdraw
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
                                                        {canClose && (
                                                            <Button size="sm" variant="outline-secondary" disabled={busyId === job._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => closeVacancy(job)}>
                                                                <FaLock size={10} /> Close
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                                {canDelete && (
                                                    <Button size="sm" variant="outline-danger" disabled={busyId === job._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => setDeleteTarget(job)}>
                                                        <FaTrash size={10} /> Delete
                                                    </Button>
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

        <ConfirmDeleteModal
            show={!!deleteTarget}
            title="Delete this vacancy?"
            itemName={deleteTarget?.title}
            description="This cannot be undone. Only vacancies you have not submitted yet can be deleted - once a vacancy is with the HR Manager or published, close it instead."
            confirmLabel="Delete vacancy"
            busy={busyId === deleteTarget?._id}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmDelete}
        />
        </>
    );
};

export default VacancyList;
