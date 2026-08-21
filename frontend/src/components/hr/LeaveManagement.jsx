import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCalendarAlt, FaPaperPlane, FaCheck, FaTimes } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'New' },
    { key: 'under_review', label: 'Awaiting approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' }
];

/**
 * Leave management (spec §11 / §32).
 *
 * HR Expert records and forwards a request; HR Manager approves or rejects it.
 * The two actions are deliberately separate so nobody approves their own work.
 */
const LeaveManagement = () => {
    const { can } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [reason, setReason] = useState('');

    const canProcess = can('leave:process');
    const canApprove = can('leave:approve');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/leaves', {
                params: filter === 'all' ? {} : { status: filter }
            });
            setLeaves(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load leave requests.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const process = async (leave) => {
        setBusyId(leave._id);
        try {
            await api.put(`/leaves/${leave._id}/process`, {});
            toast.success('Forwarded for HR Manager approval');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not forward the request');
        } finally {
            setBusyId(null);
        }
    };

    const decide = async (leave, status, rejectionReason) => {
        setBusyId(leave._id);
        try {
            await api.put(`/leaves/${leave._id}/status`, { status, rejectionReason });
            toast.success(`Leave request ${status}`);
            setRejectTarget(null);
            setReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the request');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading leave requests…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Leave Management"
                    description="HR Experts record and forward requests; HR Managers approve them."
                />

                <div className="d-flex gap-2 flex-wrap mb-3">
                    {FILTERS.map(item => (
                        <button key={item.key} onClick={() => setFilter(item.key)}
                                className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ fontSize: '0.78rem' }}>
                            {item.label}
                        </button>
                    ))}
                </div>

                {leaves.length === 0 ? (
                    <EmptyState
                        icon={FaCalendarAlt}
                        title="No leave requests in this view"
                        description="Requests submitted by members of your organization appear here."
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Employee</th>
                                    <th className="fw-semibold">Type</th>
                                    <th className="fw-semibold">Period</th>
                                    <th className="fw-semibold text-center">Days</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map(leave => {
                                    const isNew = leave.status === 'pending';
                                    const awaiting = leave.status === 'under_review';
                                    return (
                                        <tr key={leave._id}>
                                            <td>
                                                <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                    {leave.employee?.personalInfo
                                                        ? `${leave.employee.personalInfo.firstName} ${leave.employee.personalInfo.lastName}`
                                                        : 'Employee'}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                    {leave.employee?.employeeId || '—'}
                                                </div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.82rem' }}>{leave.leaveTypeName}</td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {new Date(leave.startDate).toLocaleDateString()} –{' '}
                                                {new Date(leave.endDate).toLocaleDateString()}
                                            </td>
                                            <td className="text-center fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                {leave.totalDays}
                                            </td>
                                            <td>
                                                <StatusBadge status={leave.status} />
                                                {leave.rejectionReason && (
                                                    <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                        {leave.rejectionReason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-end">
                                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                    {canProcess && isNew && (
                                                        <Button size="sm" variant="outline-primary" disabled={busyId === leave._id}
                                                                className="d-flex align-items-center gap-1"
                                                                onClick={() => process(leave)}>
                                                            <FaPaperPlane size={10} /> Forward
                                                        </Button>
                                                    )}
                                                    {canApprove && (isNew || awaiting) && (
                                                        <>
                                                            <Button size="sm" variant="success" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => decide(leave, 'approved')}>
                                                                <FaCheck size={10} /> Approve
                                                            </Button>
                                                            <Button size="sm" variant="outline-danger" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => { setRejectTarget(leave); setReason(''); }}>
                                                                <FaTimes size={10} /> Reject
                                                            </Button>
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

            <Modal show={!!rejectTarget} onHide={() => setRejectTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject leave request</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain why this request cannot be approved. The employee sees this note.
                    </p>
                    <Form.Control as="textarea" rows={3} value={reason}
                                  onChange={e => setReason(e.target.value)}
                                  placeholder="e.g. Insufficient cover during the requested period." />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setRejectTarget(null)}>Cancel</Button>
                    <Button variant="danger" disabled={!reason.trim()}
                            onClick={() => decide(rejectTarget, 'rejected', reason.trim())}>
                        Reject request
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default LeaveManagement;
