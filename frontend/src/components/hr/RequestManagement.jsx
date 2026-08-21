import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaClipboardList, FaPaperPlane, FaCheck, FaTimes } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const TYPE_LABELS = {
    break_year: 'Break-Year',
    resignation: 'Resignation',
    transfer: 'Transfer',
    termination: 'Termination',
    promotion: 'Promotion',
    other: 'Other'
};

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'submitted', label: 'New' },
    { key: 'processing', label: 'Awaiting approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' }
];

/**
 * Employee requests (spec §12): break-year, resignation, transfer and more.
 *
 * HR Expert processes and forwards; HR Manager approves or rejects.
 */
const RequestManagement = () => {
    const { can } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [reason, setReason] = useState('');

    const canProcess = can('request:process');
    const canApprove = can('request:approve');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/requests', {
                params: filter === 'all' ? {} : { status: filter }
            });
            setRequests(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load employee requests.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const process = async (request) => {
        setBusyId(request._id);
        try {
            await api.put(`/requests/${request._id}/process`, {});
            toast.success('Forwarded for HR Manager approval');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not forward the request');
        } finally {
            setBusyId(null);
        }
    };

    const decide = async (request, outcome, decisionReason) => {
        setBusyId(request._id);
        try {
            await api.put(`/requests/${request._id}/decision`, { outcome, reason: decisionReason });
            toast.success(`Request ${outcome}`);
            setRejectTarget(null);
            setReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the request');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading employee requests…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Employee Requests"
                    description="Break-year, resignation, transfer and other HR requests."
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

                {requests.length === 0 ? (
                    <EmptyState
                        icon={FaClipboardList}
                        title="No requests in this view"
                        description="Requests raised by members of your organization appear here."
                    />
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {requests.map(request => {
                            const isNew = request.status === 'submitted';
                            const awaiting = request.status === 'processing';
                            return (
                                <div key={request._id} className="p-3 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                                <span className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>
                                                    {request.title}
                                                </span>
                                                <span style={{
                                                    background: '#EEF2FF', color: '#3730A3', fontSize: '0.7rem',
                                                    padding: '2px 8px', borderRadius: 999
                                                }}>
                                                    {TYPE_LABELS[request.type] || request.type}
                                                </span>
                                                <StatusBadge status={request.status} />
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                Raised by {request.raisedBy?.name || 'employee'}
                                                {request.createdAt && ` on ${new Date(request.createdAt).toLocaleDateString()}`}
                                            </div>
                                            {request.reason && (
                                                <div className="text-dark mt-1" style={{ fontSize: '0.8rem' }}>
                                                    {request.reason}
                                                </div>
                                            )}
                                            {request.decisionReason && (
                                                <div className="text-muted mt-1" style={{ fontSize: '0.76rem' }}>
                                                    Decision note: {request.decisionReason}
                                                </div>
                                            )}
                                        </div>
                                        <div className="d-flex gap-2 flex-shrink-0 flex-wrap">
                                            {canProcess && isNew && (
                                                <Button size="sm" variant="outline-primary" disabled={busyId === request._id}
                                                        className="d-flex align-items-center gap-1"
                                                        onClick={() => process(request)}>
                                                    <FaPaperPlane size={10} /> Forward
                                                </Button>
                                            )}
                                            {canApprove && (isNew || awaiting) && (
                                                <>
                                                    <Button size="sm" variant="success" disabled={busyId === request._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => decide(request, 'approved')}>
                                                        <FaCheck size={10} /> Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline-danger" disabled={busyId === request._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => { setRejectTarget(request); setReason(''); }}>
                                                        <FaTimes size={10} /> Reject
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>

            <Modal show={!!rejectTarget} onHide={() => setRejectTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject request</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain the decision. The employee sees this note.
                    </p>
                    <Form.Control as="textarea" rows={3} value={reason}
                                  onChange={e => setReason(e.target.value)} />
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

export default RequestManagement;
