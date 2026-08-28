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
    startDate: '', endDate: '', notes: '', scopedCapabilities: []
};

/** Friendly label for a capability key; falls back to the raw key so nothing is ever hidden. */
const CAPABILITY_LABELS = {
    'vacancy:create': 'Create vacancies', 'vacancy:edit': 'Edit vacancies',
    'vacancy:submit': 'Submit vacancies for approval', 'vacancy:approve': 'Approve vacancies',
    'vacancy:reject': 'Reject vacancies', 'vacancy:delete': 'Delete vacancies',
    'vacancy:view': 'View vacancies',
    'application:view': 'View applications', 'application:process': 'Process applications',
    'application:shortlist': 'Shortlist applications', 'application:decide': 'Decide on applications',
    'candidate:view': 'View candidates',
    'interview:schedule': 'Schedule interviews', 'interview:evaluate': 'Evaluate interviews',
    'interview:review': 'Review interviews',
    'ai:match': 'Use AI matching',
    'employee:view': 'View employee records', 'employee:record': 'Create/edit employee records',
    'employee:delete': 'Terminate employees',
    'leave:request': 'Request own leave', 'leave:view': 'View leave requests',
    'leave:process': 'Record/forward leave requests', 'leave:approve': 'Approve or reject leave requests',
    'request:raise': 'Raise employee requests', 'request:view': 'View employee requests',
    'request:process': 'Record/forward employee requests', 'request:approve': 'Approve or reject employee requests',
    'training:view': 'View training records', 'training:record': 'Record training sessions',
    'training:approve': 'Approve training', 'training:participate': 'Participate in training',
    'delegation:view': 'View delegations', 'delegation:create': 'Create further delegations',
    'attendance:self': 'Record own attendance', 'attendance:view': 'View attendance',
    'attendance:record': 'Record employee attendance',
    'complaint:raise': 'Raise complaints', 'complaint:view': 'View complaints',
    'complaint:handle': 'Handle complaints',
    'document:self': 'Manage own documents', 'document:view': 'View employee documents',
    'document:manage': 'Manage employee documents',
    'report:recruitment': 'View recruitment reports', 'report:manager': 'View manager reports',
    'report:employer': 'View employer reports', 'report:hr': 'View HR reports',
    'report:system': 'View system reports',
    'requisition:create': 'Create job requisitions', 'requisition:view': 'View job requisitions',
    'requisition:process': 'Process job requisitions', 'requisition:approve': 'Approve job requisitions',
    'org:manage': 'Manage organization settings', 'org:team': 'Manage the HR team',
    'org:config': 'Manage organization configuration',
    'platform:employers': 'Manage platform employers', 'platform:users': 'Manage platform users',
    'platform:roles': 'Manage platform roles', 'platform:config': 'Manage platform configuration',
    'platform:audit': 'Audit platform activity',
    'jobseek:apply': 'Apply to jobs', 'jobseek:profile': 'Manage own job-seeker profile'
};
const describeCapability = (key) => CAPABILITY_LABELS[key] || key;

/**
 * Delegation of responsibility (spec §15).
 *
 * Temporarily transfers responsibility to a colleague - typically while the
 * delegator is on leave. Delegations expire automatically at their end date.
 */
const DelegationManagement = () => {
    const { can, user } = useAuth();
    const [delegations, setDelegations] = useState([]);
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const canCreate = can('delegation:create');
    // What this user could legitimately hand to someone else - never
    // includes anything they only hold via someone else's delegation (see
    // authController.buildAuthPayload), so every option shown here is one
    // the backend will actually accept.
    const delegableCapabilities = user?.ownCapabilities || [];

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [listResult, teamResult] = await Promise.allSettled([
                api.get('/delegations/organization').catch(() => api.get('/delegations')),
                canCreate ? api.get('/delegations/colleagues') : Promise.resolve({ data: { data: [] } })
            ]);

            if (listResult.status === 'rejected') {
                throw listResult.reason;
            }
            setDelegations(listResult.value.data.data || []);

            if (teamResult.status === 'fulfilled') {
                setTeam(teamResult.value.data.data || []);
            } else {
                // The delegation list itself still loaded fine, so don't block
                // the whole page - but a silently empty "Delegate to" dropdown
                // looks exactly like "there's nobody to delegate to", which is
                // misleading when the real cause is a failed request.
                setTeam([]);
                console.error('Failed to load delegation candidates:', teamResult.reason);
                toast.error(
                    teamResult.reason?.response?.data?.message
                    || 'Could not load colleagues to delegate to. Try reopening this page.'
                );
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load delegations.');
        } finally {
            setLoading(false);
        }
    }, [canCreate]);

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
                                    {/* The API already returns only active members of the
                                        organization (see getDelegationCandidates), so no
                                        client-side status filter is needed here. */}
                                    {team.map(member => (
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
                            {delegableCapabilities.length > 0 && (
                                <Col md={12}>
                                    <Form.Label style={{ fontSize: '0.8rem' }}>
                                        Limit to specific permissions (optional)
                                    </Form.Label>
                                    <div className="text-muted mb-1" style={{ fontSize: '0.72rem' }}>
                                        Leave all unchecked to hand over everything you can currently do.
                                        Otherwise the delegate only gains the permissions checked below.
                                    </div>
                                    <div className="d-flex flex-column gap-1" style={{ maxHeight: 140, overflowY: 'auto' }}>
                                        {delegableCapabilities.map(capability => (
                                            <Form.Check
                                                key={capability}
                                                type="checkbox"
                                                id={`scope-${capability}`}
                                                label={describeCapability(capability)}
                                                style={{ fontSize: '0.8rem' }}
                                                checked={form.scopedCapabilities.includes(capability)}
                                                onChange={e => setForm({
                                                    ...form,
                                                    scopedCapabilities: e.target.checked
                                                        ? [...form.scopedCapabilities, capability]
                                                        : form.scopedCapabilities.filter(c => c !== capability)
                                                })}
                                            />
                                        ))}
                                    </div>
                                </Col>
                            )}
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
