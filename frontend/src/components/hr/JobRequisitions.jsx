import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaClipboardList, FaPlusCircle, FaEdit, FaPaperPlane, FaEye } from 'react-icons/fa';
import api, { formatSalary } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'submitted', label: 'Pending Review' },
    { key: 'returned', label: 'Returned' },
    { key: 'pending_approval', label: 'Pending Approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'job_created', label: 'Jobs Created' }
];

const ROLE_HOME = { employer: 'employer', hr_expert: 'hr-expert', hr_manager: 'hr-manager', employee: 'employee' };

/**
 * Job Requisition / Manpower Request list.
 *
 * The Employer, or an employee assigned as a Department's Head, can raise
 * requisitions for that department; HR Expert reviews/forwards them; HR
 * Manager approves/rejects; an approved requisition can then be used to
 * create a vacancy (Job Creator).
 */
const JobRequisitions = () => {
    const { user, can } = useAuth();
    const navigate = useNavigate();
    const homePrefix = ROLE_HOME[user?.role] || 'hr-expert';

    const [requisitions, setRequisitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);

    // An "employee" account only sees the "New Requisition" entry point when it
    // is actually assigned as a Department Head somewhere - otherwise every
    // employee would see a button that always fails. The standing comes from
    // the session itself (auth payload `employment`), so this no longer costs a
    // separate configuration request.
    const isDepartmentHead = !!user?.employment?.isDepartmentHead;

    const canCreate = can('requisition:create') && (user?.role === 'employer' || isDepartmentHead);
    const canProcess = can('requisition:process');
    const canApprove = can('requisition:approve');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/requisitions');
            setRequisitions(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load job requisitions.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const visible = useMemo(() => {
        if (filter === 'all') return requisitions;
        return requisitions.filter(r => r.status === filter);
    }, [requisitions, filter]);

    const isMine = (r) => r.requestedBy?._id === user?.id;

    const submit = async (r) => {
        setBusyId(r._id);
        try {
            const res = await api.put(`/requisitions/${r._id}/submit`);
            toast.success('Requisition submitted for HR review');
            setRequisitions(prev => prev.map(item => (item._id === r._id ? { ...item, ...res.data.data } : item)));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit requisition');
        } finally {
            setBusyId(null);
        }
    };

    const createJobFromRequisition = (r) => {
        navigate(`/${homePrefix}/job-creator?requisitionId=${r._id}`);
    };

    if (loading) return <LoadingState label="Loading job requisitions…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <Card className="p-3">
            <SectionHeader
                title="Job Requisitions"
                description="Staffing requests raised by departments, reviewed by HR and approved before a vacancy can be created."
                action={canCreate && (
                    <Link to={`/${homePrefix}/requisitions/new`} className="btn btn-sm btn-primary d-flex align-items-center gap-2">
                        <FaPlusCircle size={12} /> New Requisition
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
                    icon={FaClipboardList}
                    title="No requisitions in this view"
                    description={filter === 'all'
                        ? (canCreate ? 'Raise a requisition to request new staffing.' : 'Nothing has been raised yet.')
                        : 'Try a different filter to see other requisitions.'}
                    action={canCreate && filter === 'all' && (
                        <Link to={`/${homePrefix}/requisitions/new`} className="btn btn-sm btn-primary">New Requisition</Link>
                    )}
                />
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                <th className="fw-semibold">Position</th>
                                <th className="fw-semibold">Requester</th>
                                <th className="fw-semibold">Status</th>
                                <th className="fw-semibold text-center">Positions</th>
                                <th className="fw-semibold">Salary</th>
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(r => {
                                const editable = canCreate && isMine(r) && ['draft', 'returned', 'rejected'].includes(r.status);
                                const submittable = editable;
                                const inHrQueue = canProcess && r.status === 'submitted';
                                const inApprovalQueue = canApprove && r.status === 'pending_approval';
                                const canMakeJob = canProcess && r.status === 'approved';
                                const amendable = canProcess && ['approved', 'job_created'].includes(r.status);

                                return (
                                    <tr key={r._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>{r.positionTitle}</div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.departmentName}</div>
                                            {r.status === 'returned' && r.returnReason && (
                                                <div className="text-danger mt-1" style={{ fontSize: '0.74rem' }}>
                                                    HR feedback: {r.returnReason}
                                                </div>
                                            )}
                                            {r.status === 'rejected' && r.rejectionReason && (
                                                <div className="text-danger mt-1" style={{ fontSize: '0.74rem' }}>
                                                    Manager feedback: {r.rejectionReason}
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>{r.requestedBy?.name || '—'}</td>
                                        <td><StatusBadge status={r.status} /></td>
                                        <td className="text-center fw-semibold" style={{ fontSize: '0.85rem' }}>{r.numberOfPositions}</td>
                                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>{formatSalary(r.salary)}</td>
                                        <td className="text-end">
                                            <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                <Link to={`/${homePrefix}/requisitions/${r._id}`}
                                                      className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
                                                    <FaEye size={10} /> View
                                                </Link>
                                                {submittable && (
                                                    <Button size="sm" variant="primary" disabled={busyId === r._id}
                                                            className="d-flex align-items-center gap-1" onClick={() => submit(r)}>
                                                        <FaPaperPlane size={10} /> Submit
                                                    </Button>
                                                )}
                                                {editable && (
                                                    <Link to={`/${homePrefix}/requisitions/${r._id}/edit`}
                                                          className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1">
                                                        <FaEdit size={10} /> Edit
                                                    </Link>
                                                )}
                                                {(inHrQueue || inApprovalQueue) && (
                                                    <Link to={`/${homePrefix}/requisitions/${r._id}`}
                                                          className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1">
                                                        Review
                                                    </Link>
                                                )}
                                                {canMakeJob && (
                                                    <Button size="sm" variant="success" className="d-flex align-items-center gap-1"
                                                            onClick={() => createJobFromRequisition(r)}>
                                                        <FaPlusCircle size={10} /> Create Job
                                                    </Button>
                                                )}
                                                {amendable && (
                                                    <Link to={`/${homePrefix}/requisitions/${r._id}/edit`}
                                                          className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
                                                          title="Request a change to this approved requisition; HR Manager must re-approve it">
                                                        <FaEdit size={10} /> Amend
                                                    </Link>
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

export default JobRequisitions;
