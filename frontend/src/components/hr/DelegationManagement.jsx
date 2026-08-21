import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaExchangeAlt, FaPlus } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = {
    delegate: '', type: 'authority', title: '', description: '',
    startDate: '', endDate: '', notes: ''
};

/**
 * Delegation of responsibility (spec §15).
 *
 * Temporarily transfers responsibility to a colleague - typically while the
 * delegator is on leave. Delegations expire automatically at their end date.
 */
const DelegationManagement = () => {
    const { can } = useAuth();
    const [delegations, setDelegations] = useState([]);
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const canCreate = can('delegation:create');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [list, teamRes] = await Promise.all([
                api.get('/delegations/organization').catch(() => api.get('/delegations')),
                api.get('/employers/me/team').catch(() => ({ data: { team: [] } }))
            ]);
            setDelegations(list.data.data || []);
            setTeam(teamRes.data.team || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load delegations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/delegations', form);
            toast.success('Responsibility delegated');
            setShowForm(false);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not create the delegation');
        } finally {
            setSaving(false);
        }
    };

    const revoke = async (delegation) => {
        try {
            await api.put(`/delegations/${delegation._id}/status`, { status: 'revoked' });
            toast.success('Delegation revoked');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not revoke the delegation');
        }
    };

    if (loading) return <LoadingState label="Loading delegations…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Delegation"
                    description="Temporarily transfer responsibility to a colleague. Delegations expire automatically."
                    action={canCreate && (
                        <Button size="sm" onClick={() => setShowForm(true)} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Delegate
                        </Button>
                    )}
                />

                {delegations.length === 0 ? (
                    <EmptyState
                        icon={FaExchangeAlt}
                        title="No delegations recorded"
                        description="Delegate a responsibility when someone is away so work continues uninterrupted."
                        action={canCreate && <Button size="sm" onClick={() => setShowForm(true)}>Create delegation</Button>}
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Responsibility</th>
                                    <th className="fw-semibold">From → To</th>
                                    <th className="fw-semibold">Period</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {delegations.map(delegation => (
                                    <tr key={delegation._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                {delegation.title}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.74rem' }}>{delegation.type}</div>
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                            {delegation.delegator?.name || '—'} → {delegation.delegate?.name || '—'}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                            {new Date(delegation.startDate).toLocaleDateString()} –{' '}
                                            {new Date(delegation.endDate).toLocaleDateString()}
                                        </td>
                                        <td><StatusBadge status={delegation.status} /></td>
                                        <td className="text-end">
                                            {['pending', 'active'].includes(delegation.status) && (
                                                <Button size="sm" variant="outline-danger"
                                                        onClick={() => revoke(delegation)}>
                                                    Revoke
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal show={showForm} onHide={() => setShowForm(false)} centered>
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Delegate responsibility</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Row className="g-2">
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Delegate to</Form.Label>
                                <Form.Select required value={form.delegate}
                                             onChange={e => setForm({ ...form, delegate: e.target.value })}>
                                    <option value="">Select a colleague…</option>
                                    {team.filter(m => m.status === 'active').map(member => (
                                        <option key={member._id} value={member._id}>
                                            {member.name} — {member.role}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Responsibility</Form.Label>
                                <Form.Control required value={form.title}
                                              placeholder="e.g. Approve leave requests"
                                              onChange={e => setForm({ ...form, title: e.target.value })} />
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Type</Form.Label>
                                <Form.Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                    <option value="authority">Authority</option>
                                    <option value="approval">Approval</option>
                                    <option value="task">Task</option>
                                    <option value="project">Project</option>
                                </Form.Select>
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Start date</Form.Label>
                                <Form.Control type="date" required value={form.startDate}
                                              onChange={e => setForm({ ...form, startDate: e.target.value })} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>End date</Form.Label>
                                <Form.Control type="date" required value={form.endDate}
                                              onChange={e => setForm({ ...form, endDate: e.target.value })} />
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Reason / notes</Form.Label>
                                <Form.Control as="textarea" rows={2} value={form.description}
                                              onChange={e => setForm({ ...form, description: e.target.value })} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Delegate'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default DelegationManagement;
