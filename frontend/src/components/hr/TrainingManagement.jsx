import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaGraduationCap, FaPlus, FaCheck, FaTimes, FaDoorOpen } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = {
    title: '', type: 'technical', description: '', duration: 1, durationUnit: 'days',
    startDate: '', endDate: '', provider: '', location: '', maxParticipants: 20
};

/**
 * Training management (spec §14).
 *
 * Lifecycle: proposed -> approved -> open -> in progress -> completed.
 * HR Expert proposes and schedules; HR Manager approves.
 */
const TrainingManagement = () => {
    const { can } = useAuth();
    const [trainings, setTrainings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const canRecord = can('training:record');
    const canApprove = can('training:approve');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/training');
            setTrainings(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load training programmes.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/training', { ...form, duration: Number(form.duration) });
            toast.success('Training proposed for HR Manager approval');
            setShowForm(false);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not propose the training');
        } finally {
            setSaving(false);
        }
    };

    const decide = async (training, outcome) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/decision`, { outcome });
            toast.success(`Training ${outcome}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the training');
        } finally {
            setBusyId(null);
        }
    };

    const setStatus = async (training, status) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/status`, { status });
            toast.success(`Training is now ${status.replace('_', ' ')}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the training');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading training programmes…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Training Management"
                    description="Propose, approve, schedule and evaluate training for your organization."
                    action={canRecord && (
                        <Button size="sm" onClick={() => setShowForm(true)} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Propose training
                        </Button>
                    )}
                />

                {trainings.length === 0 ? (
                    <EmptyState
                        icon={FaGraduationCap}
                        title="No training programmes yet"
                        description="Propose a programme; it becomes available to staff once an HR Manager approves it."
                        action={canRecord && <Button size="sm" onClick={() => setShowForm(true)}>Propose training</Button>}
                    />
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {trainings.map(training => (
                            <div key={training._id} className="p-3 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                            <span className="fw-semibold text-dark" style={{ fontSize: '0.92rem' }}>
                                                {training.title}
                                            </span>
                                            <StatusBadge status={training.status} />
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            {training.type} · {training.duration} {training.durationUnit}
                                            {training.location ? ` · ${training.location}` : ''}
                                            {training.startDate && ` · from ${new Date(training.startDate).toLocaleDateString()}`}
                                        </div>
                                        <div className="text-muted mt-1" style={{ fontSize: '0.76rem' }}>
                                            {training.participants?.length || 0} participant(s)
                                            {training.proposedBy?.name && ` · proposed by ${training.proposedBy.name}`}
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2 flex-shrink-0 flex-wrap">
                                        {canApprove && training.status === 'proposed' && (
                                            <>
                                                <Button size="sm" variant="success" disabled={busyId === training._id}
                                                        className="d-flex align-items-center gap-1"
                                                        onClick={() => decide(training, 'approved')}>
                                                    <FaCheck size={10} /> Approve
                                                </Button>
                                                <Button size="sm" variant="outline-danger" disabled={busyId === training._id}
                                                        className="d-flex align-items-center gap-1"
                                                        onClick={() => decide(training, 'rejected')}>
                                                    <FaTimes size={10} /> Reject
                                                </Button>
                                            </>
                                        )}
                                        {canRecord && training.status === 'approved' && (
                                            <Button size="sm" variant="primary" disabled={busyId === training._id}
                                                    className="d-flex align-items-center gap-1"
                                                    onClick={() => setStatus(training, 'open')}>
                                                <FaDoorOpen size={10} /> Open registration
                                            </Button>
                                        )}
                                        {canRecord && training.status === 'open' && (
                                            <Button size="sm" variant="outline-primary" disabled={busyId === training._id}
                                                    onClick={() => setStatus(training, 'in_progress')}>
                                                Start
                                            </Button>
                                        )}
                                        {canRecord && training.status === 'in_progress' && (
                                            <Button size="sm" variant="outline-success" disabled={busyId === training._id}
                                                    onClick={() => setStatus(training, 'completed')}>
                                                Complete
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Propose a training programme</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Row className="g-2">
                            <Col md={8}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Title</Form.Label>
                                <Form.Control required value={form.title}
                                              onChange={e => setForm({ ...form, title: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Type</Form.Label>
                                <Form.Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    <option value="technical">Technical</option>
                                    <option value="soft_skills">Soft skills</option>
                                    <option value="leadership">Leadership</option>
                                    <option value="compliance">Compliance</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Description</Form.Label>
                                <Form.Control as="textarea" rows={2} required value={form.description}
                                              onChange={e => setForm({ ...form, description: e.target.value })} />
                            </Col>
                            <Col md={3}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Duration</Form.Label>
                                <Form.Control type="number" min={1} required value={form.duration}
                                              onChange={e => setForm({ ...form, duration: e.target.value })} />
                            </Col>
                            <Col md={3}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Unit</Form.Label>
                                <Form.Select value={form.durationUnit}
                                             onChange={e => setForm({ ...form, durationUnit: e.target.value })}>
                                    <option value="hours">Hours</option>
                                    <option value="days">Days</option>
                                    <option value="weeks">Weeks</option>
                                </Form.Select>
                            </Col>
                            <Col md={3}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Start date</Form.Label>
                                <Form.Control type="date" required value={form.startDate}
                                              onChange={e => setForm({ ...form, startDate: e.target.value })} />
                            </Col>
                            <Col md={3}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>End date</Form.Label>
                                <Form.Control type="date" required value={form.endDate}
                                              onChange={e => setForm({ ...form, endDate: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Provider</Form.Label>
                                <Form.Control value={form.provider}
                                              onChange={e => setForm({ ...form, provider: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Location</Form.Label>
                                <Form.Control value={form.location}
                                              onChange={e => setForm({ ...form, location: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Capacity</Form.Label>
                                <Form.Control type="number" min={1} value={form.maxParticipants}
                                              onChange={e => setForm({ ...form, maxParticipants: e.target.value })} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Propose training'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default TrainingManagement;
