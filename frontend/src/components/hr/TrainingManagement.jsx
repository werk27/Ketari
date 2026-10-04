import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
    FaGraduationCap, FaPlus, FaCheck, FaTimes, FaDoorOpen, FaPaperPlane, FaUndo, FaEdit,
    FaClipboardList, FaUsers
} from 'react-icons/fa';
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
 * Training management.
 *
 * Lifecycle: Training Need (Department Head/Employee, see TrainingNeeds.jsx)
 *   -> HR Expert validates/returns -> HR Expert prepares the Training
 *   Program from the validated need (or proposes one directly with no
 *   originating need) -> HR Expert reviews (returns for correction OR
 *   forwards: pending_approval) -> HR Manager decides (approved/rejected) ->
 *   [pending_employer_approval -> Employer decides, only if the programme's
 *   cost/strategic flag requires it] -> open -> in progress -> completed.
 * Mirrors the Leave/Employee Request/Job Requisition workflows: a terminal
 * reject is reserved for the HR Manager, and separation of duties applies
 * throughout.
 */
const TrainingManagement = () => {
    const { can, user } = useAuth();
    const [trainings, setTrainings] = useState([]);
    const [needs, setNeeds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [resubmitTarget, setResubmitTarget] = useState(null);
    const [sourceNeed, setSourceNeed] = useState(null);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [returnTarget, setReturnTarget] = useState(null);
    const [returnNote, setReturnNote] = useState('');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [needReturnTarget, setNeedReturnTarget] = useState(null);
    const [needReturnNote, setNeedReturnNote] = useState('');
    const [employerRejectTarget, setEmployerRejectTarget] = useState(null);
    const [employerRejectReason, setEmployerRejectReason] = useState('');
    const [participantsTarget, setParticipantsTarget] = useState(null);
    const [orgEmployees, setOrgEmployees] = useState([]);

    const canRecord = can('training:record');
    const canApprove = can('training:approve');
    const canEmployerApprove = can('training:employer_approve');
    const canViewNeeds = can('training_need:view') || can('training:view');

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

    const loadNeeds = useCallback(async () => {
        if (!canViewNeeds) return;
        try {
            const res = await api.get('/training-needs');
            // Only needs still awaiting HR action belong on this screen -
            // once a programme exists it is tracked as a Training below.
            setNeeds((res.data.data || []).filter(n => n.status !== 'program_created'));
        } catch {
            // Non-fatal: the needs section simply stays empty if this fails.
        }
    }, [canViewNeeds]);

    useEffect(() => { load(); loadNeeds(); }, [load, loadNeeds]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = { ...form, duration: Number(form.duration) };
            if (resubmitTarget) {
                await api.put(`/training/${resubmitTarget}/resubmit`, body);
                toast.success('Training corrected and resubmitted for review');
            } else {
                if (sourceNeed) body.sourceNeed = sourceNeed;
                await api.post('/training', body);
                toast.success(sourceNeed ? 'Training Program prepared from the validated need' : 'Training proposed - awaiting HR Expert review');
            }
            setShowForm(false);
            setResubmitTarget(null);
            setSourceNeed(null);
            setForm(EMPTY_FORM);
            load();
            loadNeeds();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the training');
        } finally {
            setSaving(false);
        }
    };

    /** Open the form pre-filled to correct and resubmit a returned proposal. */
    const openResubmit = (training) => {
        setSourceNeed(null);
        setResubmitTarget(training._id);
        setForm({
            title: training.title || '',
            type: training.type || 'technical',
            description: training.description || '',
            duration: training.duration || 1,
            durationUnit: training.durationUnit || 'days',
            startDate: training.startDate ? training.startDate.slice(0, 10) : '',
            endDate: training.endDate ? training.endDate.slice(0, 10) : '',
            provider: training.provider || '',
            location: training.location || '',
            maxParticipants: training.maxParticipants || 20
        });
        setShowForm(true);
    };

    /** Open the form pre-filled from a validated Training Need, to prepare the actual programme. */
    const openPrepareFromNeed = (need) => {
        setResubmitTarget(null);
        setSourceNeed(need._id);
        setForm({
            ...EMPTY_FORM,
            title: need.title,
            type: need.trainingType,
            description: need.description
        });
        setShowForm(true);
    };

    const validateNeed = async (need) => {
        setBusyId(need._id);
        try {
            await api.put(`/training-needs/${need._id}/process`, {});
            toast.success('Training need validated');
            loadNeeds();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not validate the training need');
        } finally {
            setBusyId(null);
        }
    };

    const returnNeed = async (need, note) => {
        setBusyId(need._id);
        try {
            await api.put(`/training-needs/${need._id}/return`, { note });
            toast.success('Training need sent back for correction');
            setNeedReturnTarget(null);
            setNeedReturnNote('');
            loadNeeds();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not return the training need');
        } finally {
            setBusyId(null);
        }
    };

    const process = async (training) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/process`, {});
            toast.success('Forwarded for HR Manager approval');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not forward the training');
        } finally {
            setBusyId(null);
        }
    };

    const sendBack = async (training, note) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/return`, { note });
            toast.success('Training sent back to the proposer for correction');
            setReturnTarget(null);
            setReturnNote('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send the training back');
        } finally {
            setBusyId(null);
        }
    };

    const decide = async (training, outcome, decisionReason) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/decision`, { outcome, reason: decisionReason });
            toast.success(`Training ${outcome}`);
            setRejectTarget(null);
            setRejectReason('');
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

    const decideEmployer = async (training, outcome, reason) => {
        setBusyId(training._id);
        try {
            await api.put(`/training/${training._id}/employer-decision`, { outcome, reason });
            toast.success(`Training ${outcome}`);
            setEmployerRejectTarget(null);
            setEmployerRejectReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record your decision');
        } finally {
            setBusyId(null);
        }
    };

    const openParticipants = async (training) => {
        setParticipantsTarget(training);
        if (orgEmployees.length === 0) {
            try {
                const res = await api.get('/employees');
                setOrgEmployees(res.data.data || []);
            } catch {
                // Non-fatal: the add-participant picker simply stays empty.
            }
        }
    };

    const addParticipant = async (employeeId) => {
        if (!employeeId || !participantsTarget) return;
        setBusyId(participantsTarget._id);
        try {
            const res = await api.post(`/training/${participantsTarget._id}/participants`, { employeeId });
            toast.success('Participant added');
            setParticipantsTarget(res.data.data);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not add this participant');
        } finally {
            setBusyId(null);
        }
    };

    const removeParticipant = async (employeeId) => {
        if (!participantsTarget) return;
        setBusyId(participantsTarget._id);
        try {
            const res = await api.delete(`/training/${participantsTarget._id}/participants/${employeeId}`);
            toast.success('Participant removed');
            setParticipantsTarget(res.data.data);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove this participant');
        } finally {
            setBusyId(null);
        }
    };

    const markCompleted = async (employeeId, completed) => {
        if (!participantsTarget) return;
        setBusyId(participantsTarget._id);
        try {
            const res = await api.put(`/training/${participantsTarget._id}/participants/${employeeId}`, { completed });
            toast.success(completed ? 'Marked completed' : 'Marked not completed');
            setParticipantsTarget(res.data.data);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update this participant');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <LoadingState label="Loading training programmes…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            {canViewNeeds && needs.length > 0 && (
                <Card className="p-3 mb-3">
                    <SectionHeader
                        title="Training Needs"
                        description="Department Head / personal interest requests awaiting HR review or ready to be prepared into a programme."
                    />
                    <div className="d-flex flex-column gap-2">
                        {needs.map(need => (
                            <div key={need._id} className="p-2 rounded d-flex justify-content-between align-items-start flex-wrap gap-2"
                                 style={{ border: '1px solid #E2E8F0' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                        <span className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>{need.title}</span>
                                        <StatusBadge status={need.status} />
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                                        {need.origin === 'department' ? need.departmentName : 'Personal interest'}
                                        {' · '}{need.trainingType.replace('_', ' ')}
                                        {need.requestedBy?.name && ` · by ${need.requestedBy.name}`}
                                    </div>
                                    <div className="text-muted mt-1" style={{ fontSize: '0.76rem' }}>{need.description}</div>
                                </div>
                                {canRecord && need.status === 'submitted' && (
                                    <div className="d-flex gap-2 flex-shrink-0">
                                        <Button size="sm" variant="outline-primary" disabled={busyId === need._id}
                                                onClick={() => validateNeed(need)}>
                                            <FaCheck size={10} className="me-1" /> Validate
                                        </Button>
                                        <Button size="sm" variant="outline-warning" disabled={busyId === need._id}
                                                onClick={() => { setNeedReturnTarget(need); setNeedReturnNote(''); }}>
                                            <FaUndo size={10} className="me-1" /> Send Back
                                        </Button>
                                    </div>
                                )}
                                {canRecord && need.status === 'validated' && (
                                    <Button size="sm" variant="primary" onClick={() => openPrepareFromNeed(need)}>
                                        <FaClipboardList size={10} className="me-1" /> Prepare Programme
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <Card className="p-3">
                <SectionHeader
                    title="Training Management"
                    description="Propose, review, approve, schedule and evaluate training for your organization."
                    action={canRecord && (
                        <Button size="sm" onClick={() => { setResubmitTarget(null); setSourceNeed(null); setForm(EMPTY_FORM); setShowForm(true); }}
                                className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Propose training
                        </Button>
                    )}
                />

                {trainings.length === 0 ? (
                    <EmptyState
                        icon={FaGraduationCap}
                        title="No training programmes yet"
                        description="Propose a programme; it becomes available to staff once reviewed and approved."
                        action={canRecord && <Button size="sm" onClick={() => setShowForm(true)}>Propose training</Button>}
                    />
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {trainings.map(training => {
                            const isProposer = training.proposedBy?._id === user?.id || training.proposedBy === user?.id;
                            return (
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
                                            {training.returnReason && training.status === 'returned_for_correction' && (
                                                <div className="mt-1" style={{ fontSize: '0.76rem', color: '#B45309' }}>
                                                    Sent back: {training.returnReason}
                                                </div>
                                            )}
                                            {training.decisionReason && (
                                                <div className="text-muted mt-1" style={{ fontSize: '0.76rem' }}>
                                                    Decision note: {training.decisionReason}
                                                </div>
                                            )}
                                        </div>
                                        <div className="d-flex gap-2 flex-shrink-0 flex-wrap">
                                            {canRecord && training.status === 'proposed' && (
                                                <>
                                                    <Button size="sm" variant="outline-primary" disabled={busyId === training._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => process(training)}>
                                                        <FaPaperPlane size={10} /> Forward
                                                    </Button>
                                                    <Button size="sm" variant="outline-warning" disabled={busyId === training._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => { setReturnTarget(training); setReturnNote(''); }}>
                                                        <FaUndo size={10} /> Send Back
                                                    </Button>
                                                </>
                                            )}
                                            {canRecord && isProposer && training.status === 'returned_for_correction' && (
                                                <Button size="sm" variant="outline-primary" disabled={busyId === training._id}
                                                        className="d-flex align-items-center gap-1"
                                                        onClick={() => openResubmit(training)}>
                                                    <FaEdit size={10} /> Correct &amp; Resubmit
                                                </Button>
                                            )}
                                            {canApprove && training.status === 'pending_approval' && (
                                                <>
                                                    <Button size="sm" variant="success" disabled={busyId === training._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => decide(training, 'approved')}>
                                                        <FaCheck size={10} /> Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline-danger" disabled={busyId === training._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => { setRejectTarget(training); setRejectReason(''); }}>
                                                        <FaTimes size={10} /> Reject
                                                    </Button>
                                                </>
                                            )}
                                            {training.status === 'pending_employer_approval' && (
                                                canEmployerApprove ? (
                                                    <>
                                                        <Button size="sm" variant="success" disabled={busyId === training._id}
                                                                className="d-flex align-items-center gap-1"
                                                                onClick={() => decideEmployer(training, 'approved')}>
                                                            <FaCheck size={10} /> Approve (Employer)
                                                        </Button>
                                                        <Button size="sm" variant="outline-danger" disabled={busyId === training._id}
                                                                className="d-flex align-items-center gap-1"
                                                                onClick={() => { setEmployerRejectTarget(training); setEmployerRejectReason(''); }}>
                                                            <FaTimes size={10} /> Reject (Employer)
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <span className="text-muted" style={{ fontSize: '0.76rem' }}>
                                                        Awaiting Employer sign-off (cost/strategic threshold)
                                                    </span>
                                                )
                                            )}
                                            {canRecord && ['approved', 'open'].includes(training.status) && (
                                                <Button size="sm" variant="outline-secondary" disabled={busyId === training._id}
                                                        className="d-flex align-items-center gap-1"
                                                        onClick={() => openParticipants(training)}>
                                                    <FaUsers size={10} /> Participants
                                                </Button>
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
                            );
                        })}
                    </div>
                )}
            </Card>

            <Modal show={showForm} onHide={() => { setShowForm(false); setResubmitTarget(null); setSourceNeed(null); }} centered size="lg">
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>
                            {resubmitTarget ? 'Correct and resubmit training proposal'
                                : sourceNeed ? 'Prepare Training Programme from validated need' : 'Propose a training programme'}
                        </Modal.Title>
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
                        <Button variant="light" onClick={() => { setShowForm(false); setResubmitTarget(null); setSourceNeed(null); }}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : (resubmitTarget ? 'Resubmit training' : sourceNeed ? 'Prepare & submit for review' : 'Propose training')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <Modal show={!!returnTarget} onHide={() => setReturnTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Send back for correction</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain what the proposer should correct. They can fix the
                        proposal and resubmit it - nothing is rejected.
                    </p>
                    <Form.Control as="textarea" rows={3} value={returnNote}
                                  onChange={e => setReturnNote(e.target.value)} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setReturnTarget(null)}>Cancel</Button>
                    <Button variant="warning" disabled={busyId === returnTarget?._id || !returnNote.trim()}
                            onClick={() => sendBack(returnTarget, returnNote.trim())}>
                        Send back
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={!!rejectTarget} onHide={() => setRejectTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject training proposal</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        A reason is required so the proposer understands why this was rejected.
                    </p>
                    <Form.Control as="textarea" rows={3} value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setRejectTarget(null)}>Cancel</Button>
                    <Button variant="danger" disabled={busyId === rejectTarget?._id || !rejectReason.trim()}
                            onClick={() => decide(rejectTarget, 'rejected', rejectReason.trim())}>
                        Reject
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={!!needReturnTarget} onHide={() => setNeedReturnTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Return training need for correction</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain what the requester should correct. They can fix it and resubmit - nothing is rejected.
                    </p>
                    <Form.Control as="textarea" rows={3} value={needReturnNote}
                                  onChange={e => setNeedReturnNote(e.target.value)} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setNeedReturnTarget(null)}>Cancel</Button>
                    <Button variant="warning" disabled={busyId === needReturnTarget?._id || !needReturnNote.trim()}
                            onClick={() => returnNeed(needReturnTarget, needReturnNote.trim())}>
                        Send back
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={!!employerRejectTarget} onHide={() => setEmployerRejectTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject training (Employer)</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        A reason is required so the team understands why this was rejected.
                    </p>
                    <Form.Control as="textarea" rows={3} value={employerRejectReason}
                                  onChange={e => setEmployerRejectReason(e.target.value)} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setEmployerRejectTarget(null)}>Cancel</Button>
                    <Button variant="danger" disabled={busyId === employerRejectTarget?._id || !employerRejectReason.trim()}
                            onClick={() => decideEmployer(employerRejectTarget, 'rejected', employerRejectReason.trim())}>
                        Reject
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={!!participantsTarget} onHide={() => setParticipantsTarget(null)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        Participants - {participantsTarget?.title}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group className="mb-3">
                        <Form.Label style={{ fontSize: '0.8rem' }}>Add a participant</Form.Label>
                        <Form.Select value="" onChange={e => addParticipant(e.target.value)}
                                     disabled={busyId === participantsTarget?._id}>
                            <option value="" disabled>Select an employee…</option>
                            {orgEmployees
                                .filter(e => !(participantsTarget?.participants || []).some(p => (p.employee?._id || p.employee) === e._id))
                                .map(e => (
                                    <option key={e._id} value={e._id}>
                                        {e.personalInfo?.firstName} {e.personalInfo?.lastName}
                                    </option>
                                ))}
                        </Form.Select>
                    </Form.Group>

                    {(participantsTarget?.participants || []).length === 0 ? (
                        <p className="text-muted">No participants yet.</p>
                    ) : (
                        <div className="d-flex flex-column gap-2">
                            {(participantsTarget?.participants || []).map(p => {
                                const employeeId = p.employee?._id || p.employee;
                                const name = p.employee?.personalInfo
                                    ? `${p.employee.personalInfo.firstName} ${p.employee.personalInfo.lastName}`
                                    : (p.employee?.employeeId || employeeId);
                                return (
                                    <div key={employeeId} className="d-flex justify-content-between align-items-center p-2 rounded"
                                         style={{ border: '1px solid #E2E8F0' }}>
                                        <div>
                                            <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>{name}</div>
                                            {p.completed && <span className="text-success" style={{ fontSize: '0.75rem' }}>Completed</span>}
                                        </div>
                                        <div className="d-flex gap-2">
                                            <Form.Check type="checkbox" label="Completed" checked={!!p.completed}
                                                        disabled={busyId === participantsTarget?._id}
                                                        onChange={e => markCompleted(employeeId, e.target.checked)} />
                                            <Button size="sm" variant="outline-danger" disabled={busyId === participantsTarget?._id}
                                                    onClick={() => removeParticipant(employeeId)}>
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setParticipantsTarget(null)}>Close</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default TrainingManagement;
