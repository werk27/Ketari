import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Button, Form, Row, Col, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaExchangeAlt, FaPlus } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = {
    delegate: '', type: 'authority', title: '', description: '',
    startDate: '', endDate: '', scopeType: 'specific', scopedCapabilities: []
};

/**
 * Timestamp policy: the user enters and reads times in their BROWSER's local
 * timezone; the API and database always carry unambiguous UTC instants.
 */

/** UTC instant -> 'YYYY-MM-DDTHH:mm' in the browser's local time, for a
 *  datetime-local input. Never slice the ISO string - that is UTC and would
 *  shift the wall-clock time by the timezone offset. */
const toLocalInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Display a stored UTC instant as local date + time. */
const fmtDateTime = (value) => value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    : '';

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
    'delegation:view': 'View delegations', 'delegation:create': 'Create direct delegations',
    'delegation:request': 'Request delegations', 'delegation:process': 'Validate delegation requests',
    'delegation:approve': 'Approve delegation requests',
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

/** Human label for a history entry's action. */
const ACTION_LABELS = {
    requested: 'Request submitted',
    created_direct: 'Delegation created (direct grant)',
    validated: 'Validated by HR Expert',
    returned: 'Returned for correction',
    resubmitted: 'Corrected and resubmitted',
    rejected: 'Rejected',
    approved: 'Approved by HR Manager',
    accepted: 'Accepted by delegate',
    declined: 'Declined by delegate',
    activated: 'Became active',
    revoked: 'Revoked',
    completed_early: 'Marked complete',
    expired: 'Expired at end date'
};

const IN_REVIEW_STATUSES = ['pending_hr_expert_review', 'returned_for_correction', 'pending_hr_manager_approval', 'approved_pending_acceptance'];
const IN_EFFECT_STATUSES = ['scheduled', 'active', 'pending'];
const TERMINAL_STATUSES = ['rejected_by_hr_expert', 'rejected_by_hr_manager', 'declined_by_delegate', 'revoked', 'completed'];
const REVOCABLE_STATUSES = [...IN_REVIEW_STATUSES, ...IN_EFFECT_STATUSES];

/** Configuration of the confirmation/comment dialog per action. */
const ACTION_CONFIG = {
    validate: {
        title: 'Validate delegation request', verb: 'Validate', variant: 'success', commentRequired: false,
        hint: 'Confirms the request is correct and forwards it to the HR Manager for final approval.'
    },
    return: {
        title: 'Return for correction', verb: 'Return', variant: 'warning', commentRequired: true,
        hint: 'Sends the request back to the requester so they can fix it and resubmit. '
            + 'This is the HR Expert\'s only corrective action - final rejection rests with the HR Manager.'
    },
    approve: {
        title: 'Approve delegation', verb: 'Approve', variant: 'success', commentRequired: false,
        hint: 'Approves the delegation. It only takes effect once the delegate accepts it.'
    },
    reject_manager: {
        title: 'Reject delegation request', verb: 'Reject', variant: 'danger', commentRequired: true,
        hint: 'Permanently rejects this request. A reason is required.'
    },
    accept: {
        title: 'Accept delegation', verb: 'Accept', variant: 'success', commentRequired: false,
        hint: 'You temporarily take over the listed responsibility for the stated period.'
    },
    decline: {
        title: 'Decline delegation', verb: 'Decline', variant: 'danger', commentRequired: false,
        hint: 'Declines this delegation. Nothing will be transferred to you.'
    },
    revoke: {
        title: 'Revoke delegation', verb: 'Revoke', variant: 'danger', commentRequired: false,
        hint: 'Withdraws this delegation immediately. Any delegated responsibility ends right away.'
    }
};

/**
 * Delegation of responsibility (spec §15).
 *
 * Workflow: an authorized user submits a REQUEST → HR Expert validates
 * (or returns it for correction - the Expert's only corrective action) →
 * HR Manager approves or rejects → the delegate accepts or declines → the
 * delegation becomes SCHEDULED (future start) or ACTIVE. HR Manager /
 * Employer direct grants skip the review stages but still need the
 * delegate's acceptance. Capabilities are only ever in effect while
 * status+dates say so - the backend enforces this on every request.
 */
const DelegationManagement = () => {
    const { can, user, reloadUser } = useAuth();
    const [delegations, setDelegations] = useState([]);
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);      // delegation being corrected/resubmitted
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [details, setDetails] = useState(null);      // delegation shown in details modal
    const [pendingAction, setPendingAction] = useState(null); // { delegation, action }
    const [actionComment, setActionComment] = useState('');
    const [acting, setActing] = useState(false);
    const [filter, setFilter] = useState('all');

    const myId = String(user?.id || user?._id || '');
    const canCreateDirect = can('delegation:create');
    const canRequest = can('delegation:request');
    const canProcess = can('delegation:process');
    const canApprove = can('delegation:approve');
    const canOpenForm = canCreateDirect || canRequest;
    // What this user could legitimately hand to someone else - intrinsic
    // capabilities minus the personal/ownership ones that can never be
    // delegated (see backend NON_DELEGABLE_CAPABILITIES), and never anything
    // they only hold via someone else's delegation. Matches exactly what the
    // backend validates, so every option shown here is one it will accept.
    const delegableCapabilities = user?.delegableCapabilities || user?.ownCapabilities || [];

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [listResult, teamResult] = await Promise.allSettled([
                api.get('/delegations/organization').catch(() => api.get('/delegations')),
                canOpenForm ? api.get('/delegations/colleagues') : Promise.resolve({ data: { data: [] } })
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
    }, [canOpenForm]);

    useEffect(() => { load(); }, [load]);

    const isDelegator = (d) => String(d.delegator?._id || d.delegator) === myId;
    const isDelegate = (d) => String(d.delegate?._id || d.delegate) === myId;
    const isInvolved = (d) => isDelegator(d) || isDelegate(d);

    /** The workflow action(s) THIS user can take on a delegation right now. */
    const actionsFor = (d) => {
        const actions = [];
        if (canProcess && d.status === 'pending_hr_expert_review' && !isInvolved(d)) {
            actions.push('validate', 'return');
        }
        if (canApprove && d.status === 'pending_hr_manager_approval' && !isInvolved(d)) {
            actions.push('approve', 'reject_manager');
        }
        if (isDelegate(d) && d.status === 'approved_pending_acceptance') {
            actions.push('accept', 'decline');
        }
        if (isDelegator(d) && d.status === 'returned_for_correction') {
            actions.push('edit');
        }
        if (isDelegator(d) && REVOCABLE_STATUSES.includes(d.status)) {
            actions.push('revoke');
        }
        return actions;
    };

    const attentionCount = useMemo(
        () => delegations.filter(d => actionsFor(d).some(a => a !== 'revoke')).length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [delegations]
    );

    const FILTERS = [
        { key: 'all', label: 'All' },
        { key: 'attention', label: `Needs my action${attentionCount ? ` (${attentionCount})` : ''}` },
        { key: 'in_review', label: 'In review' },
        { key: 'current', label: 'Scheduled / Active' },
        { key: 'history', label: 'History' }
    ];

    const visible = delegations.filter(d => {
        if (filter === 'attention') return actionsFor(d).some(a => a !== 'revoke');
        if (filter === 'in_review') return IN_REVIEW_STATUSES.includes(d.status);
        if (filter === 'current') return IN_EFFECT_STATUSES.includes(d.status);
        if (filter === 'history') return TERMINAL_STATUSES.includes(d.status);
        return true;
    });

    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (d) => {
        setEditing(d);
        setForm({
            delegate: String(d.delegate?._id || d.delegate || ''),
            type: d.type || 'authority',
            title: d.title || '',
            description: d.description || '',
            startDate: toLocalInput(d.startDate),
            endDate: toLocalInput(d.endDate),
            scopeType: d.scopeType || ((d.scopedCapabilities || []).length > 0 ? 'specific' : 'full_role'),
            scopedCapabilities: d.scopedCapabilities || []
        });
        setShowForm(true);
    };

    const submit = async (e) => {
        e.preventDefault();
        if (form.scopeType === 'specific' && form.scopedCapabilities.length === 0) {
            toast.error('Select at least one responsibility, or choose full-role delegation.');
            return;
        }
        if (new Date(form.endDate) <= new Date(form.startDate)) {
            toast.error('The end date/time must be after the start date/time.');
            return;
        }
        setSaving(true);
        try {
            // The datetime-local values are the user's LOCAL wall-clock time;
            // convert to unambiguous UTC instants for the API.
            const body = {
                ...form,
                startDate: new Date(form.startDate).toISOString(),
                endDate: new Date(form.endDate).toISOString(),
                scopedCapabilities: form.scopeType === 'specific' ? form.scopedCapabilities : []
            };
            if (editing) {
                await api.put(`/delegations/${editing._id}`, body);
                toast.success('Request corrected and resubmitted for HR validation');
            } else {
                await api.post('/delegations', body);
                toast.success(canCreateDirect
                    ? 'Delegation created — awaiting the delegate\'s acceptance'
                    : 'Delegation request submitted for HR validation');
            }
            setShowForm(false);
            setEditing(null);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the delegation');
        } finally {
            setSaving(false);
        }
    };

    const openAction = (delegation, action) => {
        setPendingAction({ delegation, action });
        setActionComment('');
    };

    const performAction = async () => {
        const { delegation, action } = pendingAction;
        const config = ACTION_CONFIG[action];
        if (config.commentRequired && !actionComment.trim()) {
            toast.error('Please provide a reason.');
            return;
        }
        setActing(true);
        try {
            if (action === 'validate' || action === 'return') {
                await api.put(`/delegations/${delegation._id}/review`, {
                    action,
                    comment: actionComment
                });
            } else if (action === 'approve' || action === 'reject_manager') {
                await api.put(`/delegations/${delegation._id}/decision`, {
                    action: action === 'reject_manager' ? 'reject' : 'approve',
                    comment: actionComment
                });
            } else if (action === 'accept' || action === 'decline') {
                await api.put(`/delegations/${delegation._id}/respond`, { action, comment: actionComment });
                if (action === 'accept') {
                    // Refresh the session so any newly effective capabilities
                    // (and the delegated-duties navigation) appear immediately.
                    reloadUser();
                }
            } else if (action === 'revoke') {
                await api.put(`/delegations/${delegation._id}/status`, { status: 'revoked', notes: actionComment });
            }
            toast.success(`${config.verb} — done`);
            setPendingAction(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'The action could not be completed');
        } finally {
            setActing(false);
        }
    };

    if (loading) return <LoadingState label="Loading delegations…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const scopeSummary = (d) => {
        const specific = d.scopeType ? d.scopeType === 'specific' : (d.scopedCapabilities || []).length > 0;
        return specific ? `${(d.scopedCapabilities || []).length} specific responsibility(ies)` : 'Entire role';
    };

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Delegation"
                    description={canCreateDirect
                        ? 'Temporarily transfer responsibility to a colleague. Delegations require the delegate\'s acceptance and expire automatically.'
                        : 'Request to temporarily transfer a responsibility you hold. Requests pass HR validation, HR Manager approval and the delegate\'s acceptance before taking effect.'}
                    action={canOpenForm && (
                        <Button size="sm" onClick={openCreate} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> {canCreateDirect ? 'Delegate' : 'Request delegation'}
                        </Button>
                    )}
                />

                <div className="d-flex flex-wrap gap-2 mb-3">
                    {FILTERS.map(f => (
                        <Button key={f.key} size="sm"
                                variant={filter === f.key ? 'dark' : 'outline-secondary'}
                                style={{ fontSize: '0.75rem', borderRadius: 999 }}
                                onClick={() => setFilter(f.key)}>
                            {f.label}
                        </Button>
                    ))}
                </div>

                {visible.length === 0 ? (
                    <EmptyState
                        icon={FaExchangeAlt}
                        title="No delegations here"
                        description="Delegate a responsibility when someone is away so work continues uninterrupted."
                        action={canOpenForm && filter === 'all' && (
                            <Button size="sm" onClick={openCreate}>
                                {canCreateDirect ? 'Create delegation' : 'Request delegation'}
                            </Button>
                        )}
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Responsibility</th>
                                    <th className="fw-semibold">From → To</th>
                                    <th className="fw-semibold">Scope</th>
                                    <th className="fw-semibold">Period</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(delegation => {
                                    const actions = actionsFor(delegation);
                                    return (
                                        <tr key={delegation._id}>
                                            <td>
                                                <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                    {delegation.title}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.74rem' }}>{delegation.type}</div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {delegation.delegator?.name || '—'} → {delegation.delegate?.name || '—'}
                                                {isDelegate(delegation) && <Badge bg="light" text="dark" className="ms-1 border">you</Badge>}
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.78rem' }}>{scopeSummary(delegation)}</td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {fmtDateTime(delegation.startDate)} –{' '}
                                                {fmtDateTime(delegation.endDate)}
                                            </td>
                                            <td><StatusBadge status={delegation.status} /></td>
                                            <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                                                <Button size="sm" variant="outline-secondary" className="me-1"
                                                        onClick={() => setDetails(delegation)}>
                                                    Details
                                                </Button>
                                                {actions.includes('validate') && (
                                                    <>
                                                        <Button size="sm" variant="success" className="me-1"
                                                                onClick={() => openAction(delegation, 'validate')}>Validate</Button>
                                                        <Button size="sm" variant="outline-warning" className="me-1"
                                                                onClick={() => openAction(delegation, 'return')}>Send Back</Button>
                                                    </>
                                                )}
                                                {actions.includes('approve') && (
                                                    <>
                                                        <Button size="sm" variant="success" className="me-1"
                                                                onClick={() => openAction(delegation, 'approve')}>Approve</Button>
                                                        <Button size="sm" variant="outline-danger" className="me-1"
                                                                onClick={() => openAction(delegation, 'reject_manager')}>Reject</Button>
                                                    </>
                                                )}
                                                {actions.includes('accept') && (
                                                    <>
                                                        <Button size="sm" variant="success" className="me-1"
                                                                onClick={() => openAction(delegation, 'accept')}>Accept</Button>
                                                        <Button size="sm" variant="outline-danger" className="me-1"
                                                                onClick={() => openAction(delegation, 'decline')}>Decline</Button>
                                                    </>
                                                )}
                                                {actions.includes('edit') && (
                                                    <Button size="sm" variant="primary" className="me-1"
                                                            onClick={() => openEdit(delegation)}>Edit &amp; resubmit</Button>
                                                )}
                                                {actions.includes('revoke') && (
                                                    <Button size="sm" variant="outline-danger"
                                                            onClick={() => openAction(delegation, 'revoke')}>
                                                        {IN_EFFECT_STATUSES.includes(delegation.status) ? 'Revoke' : 'Withdraw'}
                                                    </Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Create / edit+resubmit form */}
            <Modal show={showForm} onHide={() => { setShowForm(false); setEditing(null); }} centered>
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>
                            {editing ? 'Correct and resubmit request' : (canCreateDirect ? 'Delegate responsibility' : 'Request a delegation')}
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {!canCreateDirect && !editing && (
                            <div className="text-muted mb-2" style={{ fontSize: '0.78rem' }}>
                                Your request will be validated by an HR Expert, approved by the HR Manager
                                and finally accepted by your colleague before it takes effect.
                            </div>
                        )}
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
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Delegation scope</Form.Label>
                                <Form.Check type="radio" id="scope-specific" name="scopeType"
                                            label="Specific responsibilities — only the permissions selected below transfer"
                                            style={{ fontSize: '0.8rem' }}
                                            checked={form.scopeType === 'specific'}
                                            onChange={() => setForm({ ...form, scopeType: 'specific' })} />
                                <Form.Check type="radio" id="scope-full" name="scopeType"
                                            label="Entire role — everything you can currently do transfers for the period"
                                            style={{ fontSize: '0.8rem' }}
                                            checked={form.scopeType === 'full_role'}
                                            onChange={() => setForm({ ...form, scopeType: 'full_role' })} />
                            </Col>
                            {form.scopeType === 'full_role' && (
                                <Col md={12}>
                                    <div className="p-2 rounded" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412', fontSize: '0.75rem' }}>
                                        Full-role delegation temporarily gives your colleague every permission you
                                        hold ({delegableCapabilities.length} in total) for the whole period. Your own
                                        role and access are not changed, and everything returns to normal when the
                                        delegation ends.
                                    </div>
                                </Col>
                            )}
                            {form.scopeType === 'specific' && delegableCapabilities.length > 0 && (
                                <Col md={12}>
                                    <Form.Label style={{ fontSize: '0.8rem' }}>Responsibilities to delegate</Form.Label>
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
                                <Form.Label style={{ fontSize: '0.8rem' }}>Start date &amp; time</Form.Label>
                                <Form.Control type="datetime-local" required value={form.startDate}
                                              onChange={e => setForm({ ...form, startDate: e.target.value })} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>End date &amp; time</Form.Label>
                                <Form.Control type="datetime-local" required value={form.endDate}
                                              onChange={e => setForm({ ...form, endDate: e.target.value })} />
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Reason</Form.Label>
                                <Form.Control as="textarea" rows={2} required value={form.description}
                                              placeholder="Why is this delegation needed? e.g. annual leave 5–12 Sept"
                                              onChange={e => setForm({ ...form, description: e.target.value })} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : (editing ? 'Resubmit' : (canCreateDirect ? 'Delegate' : 'Submit request'))}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* Details + history */}
            <Modal show={!!details} onHide={() => setDetails(null)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Delegation details</Modal.Title>
                </Modal.Header>
                {details && (
                    <Modal.Body>
                        <Row className="g-3" style={{ fontSize: '0.85rem' }}>
                            <Col md={6}>
                                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Responsibility</div>
                                <div className="fw-semibold">{details.title}</div>
                                <div className="text-muted">{details.type}</div>
                            </Col>
                            <Col md={6}>
                                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Status</div>
                                <StatusBadge status={details.status} />
                            </Col>
                            <Col md={6}>
                                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>From → To</div>
                                <div>{details.delegator?.name || '—'} ({details.delegator?.role || '—'}) → {details.delegate?.name || '—'} ({details.delegate?.role || '—'})</div>
                            </Col>
                            <Col md={6}>
                                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Period</div>
                                <div>{fmtDateTime(details.startDate)} – {fmtDateTime(details.endDate)}</div>
                            </Col>
                            <Col md={12}>
                                <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Scope</div>
                                {(details.scopeType ? details.scopeType === 'specific' : (details.scopedCapabilities || []).length > 0) ? (
                                    <ul className="mb-0" style={{ paddingLeft: 18 }}>
                                        {(details.scopedCapabilities || []).map(c => <li key={c}>{describeCapability(c)}</li>)}
                                    </ul>
                                ) : (
                                    <div>Entire role — every permission the delegator holds during the period.</div>
                                )}
                            </Col>
                            {details.description && (
                                <Col md={12}>
                                    <div className="text-muted" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>Reason</div>
                                    <div>{details.description}</div>
                                </Col>
                            )}
                            <Col md={12}>
                                <div className="text-muted mb-1" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>History</div>
                                {(details.history || []).length === 0 ? (
                                    <div className="text-muted">No history recorded.</div>
                                ) : (
                                    <div className="d-flex flex-column gap-2">
                                        {details.history.map((h, i) => (
                                            <div key={i} className="p-2 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                                <div className="d-flex justify-content-between flex-wrap gap-1">
                                                    <span className="fw-semibold" style={{ fontSize: '0.8rem' }}>
                                                        {ACTION_LABELS[h.action] || h.action}
                                                    </span>
                                                    <span className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                        {h.at ? new Date(h.at).toLocaleString() : ''}
                                                    </span>
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                                                    by {h.actorName || 'System'}{h.actorRole ? ` (${h.actorRole.replace('_', ' ')})` : ''}
                                                </div>
                                                {h.comment && (
                                                    <div style={{ fontSize: '0.78rem' }} className="mt-1">“{h.comment}”</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Col>
                        </Row>
                    </Modal.Body>
                )}
                <Modal.Footer>
                    <Button variant="light" onClick={() => setDetails(null)}>Close</Button>
                </Modal.Footer>
            </Modal>

            {/* Workflow action confirmation (application modal - never a browser confirm) */}
            <Modal show={!!pendingAction} onHide={() => setPendingAction(null)} centered>
                {pendingAction && (() => {
                    const config = ACTION_CONFIG[pendingAction.action];
                    const d = pendingAction.delegation;
                    return (
                        <>
                            <Modal.Header closeButton>
                                <Modal.Title style={{ fontSize: '1.05rem' }}>{config.title}</Modal.Title>
                            </Modal.Header>
                            <Modal.Body>
                                <div style={{ fontSize: '0.85rem' }} className="mb-2">
                                    <strong>{d.title}</strong> — {d.delegator?.name || '—'} → {d.delegate?.name || '—'},{' '}
                                    {fmtDateTime(d.startDate)} – {fmtDateTime(d.endDate)}
                                </div>
                                <div className="text-muted mb-3" style={{ fontSize: '0.78rem' }}>{config.hint}</div>
                                <Form.Label style={{ fontSize: '0.8rem' }}>
                                    {config.commentRequired ? 'Reason (required)' : 'Comment (optional)'}
                                </Form.Label>
                                <Form.Control as="textarea" rows={2} value={actionComment}
                                              onChange={e => setActionComment(e.target.value)} />
                            </Modal.Body>
                            <Modal.Footer>
                                <Button variant="light" onClick={() => setPendingAction(null)}>Cancel</Button>
                                <Button variant={config.variant} disabled={acting} onClick={performAction}>
                                    {acting ? 'Working…' : config.verb}
                                </Button>
                            </Modal.Footer>
                        </>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default DelegationManagement;
