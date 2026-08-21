import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Form, Button, Modal, Table } from 'react-bootstrap';
import { FaUserCheck, FaCheck, FaUndo, FaClipboardCheck, FaSearch } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Card, SectionHeader, StatusBadge, LoadingState, ErrorState,
    EmptyState, CompletionMeter, StatCard, TOKENS
} from '../workspace/ui';

/**
 * Employee onboarding queue.
 *
 * HR Expert verifies submitted profiles and forwards them; HR Manager approves.
 * Both roles share this screen - the available actions come from the caller's
 * role, and the backend independently enforces the same rules.
 */

const FILTERS = [
    { key: '', label: 'All' },
    { key: 'pending_onboarding', label: 'Pending Onboarding' },
    { key: 'employee_completing', label: 'In Progress' },
    { key: 'under_hr_verification', label: 'To Verify' },
    { key: 'pending_manager_approval', label: 'To Approve' },
    { key: 'needs_correction', label: 'Needs Correction' },
    { key: 'complete', label: 'Complete' }
];

const OnboardingQueue = () => {
    const { isHRManager } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rows, setRows] = useState([]);
    const [filter, setFilter] = useState('');
    const [search, setSearch] = useState('');

    const [action, setAction] = useState(null); // { type, row }
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employees/onboarding');
            setRows(res.data.employees || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load the onboarding queue.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const runAction = async () => {
        if (!action) return;
        const { type, row } = action;

        if (type === 'return' && !note.trim()) {
            toast.error('Explain what the employee needs to correct');
            return;
        }

        setBusy(true);
        try {
            await api.put(`/employees/${row._id}/onboarding/${type}`, { note });
            toast.success(
                type === 'verify' ? 'Verified and sent for approval'
                    : type === 'approve' ? 'Onboarding approved'
                        : 'Returned to the employee'
            );
            setAction(null);
            setNote('');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        } finally {
            setBusy(false);
        }
    };

    const visible = rows.filter(r => {
        const matchesStatus = !filter || r.onboarding?.status === filter;
        const term = search.trim().toLowerCase();
        const matchesSearch = !term
            || r.name?.toLowerCase().includes(term)
            || r.employeeId?.toLowerCase().includes(term)
            || r.jobTitle?.toLowerCase().includes(term);
        return matchesStatus && matchesSearch;
    });

    const countOf = (status) => rows.filter(r => r.onboarding?.status === status).length;

    if (loading) return <LoadingState label="Loading onboarding queue…" />;
    if (error) return <div className="p-3 p-lg-4"><ErrorState message={error} onRetry={load} /></div>;

    return (
        <div className="p-3 p-lg-4">
            <div className="mb-3">
                <h5 className="fw-bold text-dark mb-1">Employee Onboarding</h5>
                <div className="text-muted" style={{ fontSize: '0.84rem' }}>
                    New hires whose employee profiles need completing, verifying and approving.
                </div>
            </div>

            <Row className="g-2 g-md-3 mb-3">
                <Col xs={6} md={3}>
                    <StatCard label="Awaiting Employee" value={countOf('pending_onboarding') + countOf('employee_completing')}
                              icon={FaUserCheck} tone="#64748B" hint="Profile not submitted yet" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="To Verify" value={countOf('under_hr_verification')}
                              icon={FaClipboardCheck} tone="#D97706" hint="Submitted by employee" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="To Approve" value={countOf('pending_manager_approval')}
                              icon={FaCheck} tone="#1E40AF" hint="Verified by HR Expert" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="Complete" value={countOf('complete')}
                              icon={FaCheck} tone="#16A34A" hint="Approved records" />
                </Col>
            </Row>

            <Card className="p-3">
                <SectionHeader
                    title="Onboarding records"
                    description={`${visible.length} of ${rows.length} shown`}
                    action={
                        <div className="d-flex gap-2 flex-wrap">
                            <div className="position-relative">
                                <FaSearch className="position-absolute" style={{ left: 10, top: 11, color: TOKENS.muted, fontSize: 12 }} />
                                <Form.Control size="sm" placeholder="Search name or ID" value={search}
                                              onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30, minWidth: 190 }} />
                            </div>
                            <Form.Select size="sm" value={filter} onChange={e => setFilter(e.target.value)} style={{ minWidth: 180 }}>
                                {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </Form.Select>
                        </div>
                    }
                />

                {visible.length === 0 ? (
                    <EmptyState
                        icon={FaUserCheck}
                        title="Nothing here yet"
                        description={rows.length === 0
                            ? 'Employee profiles appear here automatically when an HR Manager approves a hire.'
                            : 'No records match your current filter.'}
                    />
                ) : (
                    <div className="table-responsive">
                        <Table hover className="align-middle mb-0" style={{ fontSize: '0.85rem' }}>
                            <thead>
                                <tr className="text-uppercase" style={{ fontSize: '0.66rem', color: TOKENS.muted }}>
                                    <th>Employee</th>
                                    <th>Position</th>
                                    <th>Completion</th>
                                    <th>Status</th>
                                    <th className="text-end">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(row => {
                                    const status = row.onboarding?.status;
                                    return (
                                        <tr key={row._id}>
                                            <td>
                                                <div className="fw-semibold text-dark">{row.name}</div>
                                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>{row.employeeId}</div>
                                            </td>
                                            <td className="text-muted">{row.jobTitle || '—'}</td>
                                            <td style={{ width: 150 }}>
                                                <CompletionMeter percent={row.completion?.percent ?? 0} compact />
                                            </td>
                                            <td><StatusBadge status={status} /></td>
                                            <td className="text-end">
                                                <div className="d-inline-flex gap-2">
                                                    {status === 'under_hr_verification' && !isHRManager && (
                                                        <Button size="sm" variant="outline-primary"
                                                                onClick={() => { setAction({ type: 'verify', row }); setNote(''); }}>
                                                            Verify
                                                        </Button>
                                                    )}
                                                    {status === 'pending_manager_approval' && isHRManager && (
                                                        <Button size="sm" variant="success"
                                                                onClick={() => { setAction({ type: 'approve', row }); setNote(''); }}>
                                                            Approve
                                                        </Button>
                                                    )}
                                                    {['under_hr_verification', 'pending_manager_approval'].includes(status) && (
                                                        <Button size="sm" variant="outline-danger"
                                                                onClick={() => { setAction({ type: 'return', row }); setNote(''); }}>
                                                            <FaUndo className="me-1" size={11} />Return
                                                        </Button>
                                                    )}
                                                    {!['under_hr_verification', 'pending_manager_approval'].includes(status) && (
                                                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                            {status === 'complete' ? 'Approved' : 'Waiting on employee'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </Table>
                    </div>
                )}
            </Card>

            <Modal show={!!action} onHide={() => setAction(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        {action?.type === 'verify' && 'Verify and forward'}
                        {action?.type === 'approve' && 'Approve onboarding'}
                        {action?.type === 'return' && 'Return for correction'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ fontSize: '0.9rem' }}>
                    <div className="mb-3">
                        <span className="text-muted">Employee: </span>
                        <span className="fw-semibold text-dark">{action?.row?.name}</span>
                    </div>

                    {action?.type === 'verify' && (
                        <p className="text-muted">
                            Confirm the submitted information and documents are correct. It will be sent
                            to the HR Manager for approval.
                        </p>
                    )}
                    {action?.type === 'approve' && (
                        <p className="text-muted">
                            This completes the employee's onboarding. You cannot approve a record you
                            verified yourself.
                        </p>
                    )}

                    <Form.Label className="small fw-semibold">
                        {action?.type === 'return' ? 'What needs correcting?' : 'Note (optional)'}
                    </Form.Label>
                    <Form.Control
                        as="textarea" rows={3} value={note} onChange={e => setNote(e.target.value)}
                        placeholder={action?.type === 'return'
                            ? 'Explain clearly what the employee must fix'
                            : 'Add a note for the record'}
                    />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                    <Button
                        variant={action?.type === 'return' ? 'danger' : action?.type === 'approve' ? 'success' : 'primary'}
                        onClick={runAction} disabled={busy}
                    >
                        {busy ? 'Working…'
                            : action?.type === 'verify' ? 'Verify & forward'
                                : action?.type === 'approve' ? 'Approve'
                                    : 'Return to employee'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default OnboardingQueue;
