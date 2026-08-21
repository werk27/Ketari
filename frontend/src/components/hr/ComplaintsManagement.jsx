import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaComments } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const NEXT_STATUS = [
    { key: 'under_review', label: 'Start review' },
    { key: 'investigating', label: 'Investigate' },
    { key: 'responded', label: 'Mark responded' },
    { key: 'resolved', label: 'Resolve' }
];

/**
 * Complaint handling (spec §18).
 *
 * Covers workplace grievances from staff and recruitment feedback from candidates.
 * Workflow: submitted -> under review -> investigating -> responded -> resolved.
 */
const ComplaintsManagement = () => {
    const { can } = useAuth();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [resolution, setResolution] = useState('');
    const [busyId, setBusyId] = useState(null);

    const canHandle = can('complaint:handle');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/complaints');
            setComplaints(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load complaints.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setStatus = async (complaint, status, resolutionNote) => {
        setBusyId(complaint._id);
        try {
            await api.put(`/complaints/${complaint._id}/status`, { status, resolution: resolutionNote });
            toast.success(`Complaint marked ${status.replace('_', ' ')}`);
            setResolveTarget(null);
            setResolution('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the complaint');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading complaints…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Complaints & Feedback"
                    description="Workplace grievances and recruitment-process feedback for your organization."
                />

                {complaints.length === 0 ? (
                    <EmptyState icon={FaComments} title="No complaints recorded"
                                description="Complaints raised by staff or candidates appear here." />
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {complaints.map(complaint => (
                            <div key={complaint._id} className="p-3 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                            <span className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>
                                                {complaint.title}
                                            </span>
                                            <span style={{
                                                background: '#F1F5F9', color: '#475569', fontSize: '0.7rem',
                                                padding: '2px 8px', borderRadius: 999
                                            }}>
                                                {complaint.category || 'other'}
                                            </span>
                                            <StatusBadge status={complaint.status} />
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            {complaint.raisedBy?.name || 'Anonymous'}
                                            {complaint.raisedBy?.role ? ` (${complaint.raisedBy.role})` : ''}
                                            {complaint.createdAt && ` · ${new Date(complaint.createdAt).toLocaleDateString()}`}
                                        </div>
                                        <div className="text-dark mt-1" style={{ fontSize: '0.82rem' }}>
                                            {complaint.description}
                                        </div>
                                        {complaint.resolution && (
                                            <div className="text-success mt-1" style={{ fontSize: '0.78rem' }}>
                                                Resolution: {complaint.resolution}
                                            </div>
                                        )}
                                    </div>
                                    {canHandle && !['resolved', 'rejected'].includes(complaint.status) && (
                                        <div className="d-flex gap-2 flex-shrink-0 flex-wrap">
                                            {NEXT_STATUS
                                                .filter(s => s.key !== complaint.status)
                                                .slice(0, 2)
                                                .map(s => (
                                                    <Button key={s.key} size="sm"
                                                            variant={s.key === 'resolved' ? 'success' : 'outline-secondary'}
                                                            disabled={busyId === complaint._id}
                                                            onClick={() => s.key === 'resolved'
                                                                ? (setResolveTarget(complaint), setResolution(''))
                                                                : setStatus(complaint, s.key)}>
                                                        {s.label}
                                                    </Button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Modal show={!!resolveTarget} onHide={() => setResolveTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Resolve complaint</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Record how this complaint was resolved. The complainant sees this note.
                    </p>
                    <Form.Control as="textarea" rows={3} value={resolution}
                                  onChange={e => setResolution(e.target.value)} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setResolveTarget(null)}>Cancel</Button>
                    <Button variant="success" disabled={!resolution.trim()}
                            onClick={() => setStatus(resolveTarget, 'resolved', resolution.trim())}>
                        Resolve
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default ComplaintsManagement;
