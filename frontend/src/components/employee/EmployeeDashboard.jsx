import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col, Nav } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
    FaCalendarAlt, FaClipboardList, FaGraduationCap, FaUserClock, FaPlus, FaSignInAlt, FaSignOutAlt, FaEdit
} from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { describeEmployment } from '../workspace/navigationConfig';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const TABS = [
    { key: 'leave', label: 'My Leave' },
    { key: 'requests', label: 'My Requests' },
    { key: 'training', label: 'My Training' },
    { key: 'attendance', label: 'My Attendance' }
];

/** Whole days spanned by a date range, inclusive of both ends - client-side
 * preview only; the backend independently recalculates and is authoritative. */
const previewDays = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
    return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

/** Client-side pre-submission check so an employee cannot submit a request
 * that would obviously fail (insufficient balance, missing required
 * document, invalid date range) and instead sees a clear reason up front.
 * This mirrors - but does not replace - the backend's authoritative
 * validation, which is re-run independently on submit. */
const getSubmissionBlocker = (form, balances, document, hasExistingAttachment) => {
    if (!form.startDate || !form.endDate) return null;
    if (new Date(form.endDate) < new Date(form.startDate)) {
        return 'The end date cannot be before the start date. Please select a valid date range.';
    }
    const days = previewDays(form.startDate, form.endDate);
    if (!form.leaveType || days === null) return null;
    const balance = balances.find(b => b.leaveType === form.leaveType);
    if (!balance) return null;
    if (balance.entitlement > 0 && days > balance.available) {
        return `You have only ${balance.available} day${balance.available === 1 ? '' : 's'} available for `
            + `${form.leaveType}. Please select a valid date range.`;
    }
    if (balance.requiresAttachment && !document && !hasExistingAttachment) {
        return `A supporting document is required for ${form.leaveType}.`;
    }
    return null;
};

/**
 * Employee self-service (spec §23).
 *
 * An employee sees and manages only their own records: leave, requests,
 * training participation and attendance.
 */
const EmployeeDashboard = () => {
    const { user, organization } = useAuth();
    const identity = describeEmployment(user);
    const [tab, setTab] = useState('leave');
    const [data, setData] = useState({ leaves: [], requests: [], trainings: [], attendance: null, balances: [], leaveTypesConfigured: null });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [balanceError, setBalanceError] = useState(null);
    const [busy, setBusy] = useState(false);

    const [showLeave, setShowLeave] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });
    const [leaveDocument, setLeaveDocument] = useState(null);
    const [hasExistingAttachment, setHasExistingAttachment] = useState(false);
    const [resubmitTarget, setResubmitTarget] = useState(null);
    const [showRequest, setShowRequest] = useState(false);
    const [requestForm, setRequestForm] = useState({ type: 'break_year', title: '', reason: '' });
    // The returned HR request being corrected, if any (mirrors the leave flow).
    const [requestResubmitTarget, setRequestResubmitTarget] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setBalanceError(null);
        try {
            const [leaves, requests, trainings, attendance, balanceRes] = await Promise.all([
                api.get('/leaves/me').catch(() => ({ data: { data: [] } })),
                api.get('/requests/me').catch(() => ({ data: { data: [] } })),
                api.get('/training/me').catch(() => ({ data: { data: [] } })),
                api.get('/attendance/me').catch(() => ({ data: null })),
                // Do NOT collapse a failed balance lookup into "balances: []" -
                // that is indistinguishable from a real empty/zero balance
                // (spec: no fake fallback values). The failure is surfaced
                // separately via balanceError instead.
                api.get('/leaves/balance').catch(err => ({ failed: true, err }))
            ]);

            if (balanceRes.failed) {
                setBalanceError(balanceRes.err?.response?.data?.message || 'Unable to retrieve leave balance. Please try again.');
            }

            setData({
                leaves: leaves.data.data || [],
                requests: requests.data.data || [],
                trainings: trainings.data.data || [],
                attendance: attendance.data || null,
                balances: balanceRes.failed ? [] : (balanceRes.data.balances || []),
                // Whether the organization has any leave types configured at
                // all - distinct from "the balance call failed" and from
                // "you legitimately have 0 days available" (spec: distinguish
                // these UI states rather than showing a misleading "0 days").
                leaveTypesConfigured: balanceRes.failed ? null : balanceRes.data.leaveTypesConfigured !== false
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your HR workspace.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const submitLeave = async (e) => {
        e.preventDefault();
        // Defensive re-check: the Submit button is already disabled while a
        // blocker is present, but guard here too in case of stale state.
        const blocker = getSubmissionBlocker(leaveForm, data.balances, leaveDocument, hasExistingAttachment);
        if (blocker) {
            toast.error(blocker);
            return;
        }
        setBusy(true);
        try {
            const body = new FormData();
            body.append('leaveType', leaveForm.leaveType);
            body.append('startDate', leaveForm.startDate);
            body.append('endDate', leaveForm.endDate);
            body.append('reason', leaveForm.reason);
            if (leaveDocument) body.append('document', leaveDocument);

            if (resubmitTarget) {
                await api.put(`/leaves/${resubmitTarget}/resubmit`, body);
                toast.success('Leave request resubmitted for HR Expert validation');
            } else {
                await api.post('/leaves', body);
                toast.success('Leave request submitted');
            }
            setShowLeave(false);
            setResubmitTarget(null);
            setLeaveForm({ leaveType: '', startDate: '', endDate: '', reason: '' });
            setLeaveDocument(null);
            setHasExistingAttachment(false);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit the request');
        } finally {
            setBusy(false);
        }
    };

    /** Open the request form pre-filled to edit and resubmit a returned request. */
    const openResubmit = (leave) => {
        setResubmitTarget(leave._id);
        setLeaveForm({
            leaveType: leave.leaveTypeName,
            startDate: leave.startDate ? leave.startDate.slice(0, 10) : '',
            endDate: leave.endDate ? leave.endDate.slice(0, 10) : '',
            reason: leave.reason || ''
        });
        setLeaveDocument(null);
        setHasExistingAttachment(!!(leave.attachments && leave.attachments.length > 0));
        setShowLeave(true);
    };

    const submitRequest = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            if (requestResubmitTarget) {
                await api.put(`/requests/${requestResubmitTarget}/resubmit`, requestForm);
                toast.success('Request corrected and resubmitted');
            } else {
                await api.post('/requests', requestForm);
                toast.success('Request submitted');
            }
            setShowRequest(false);
            setRequestResubmitTarget(null);
            setRequestForm({ type: 'break_year', title: '', reason: '' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit the request');
        } finally {
            setBusy(false);
        }
    };

    /** Open the HR-request form pre-filled to correct and resubmit a returned request. */
    const openRequestResubmit = (request) => {
        setRequestResubmitTarget(request._id);
        setRequestForm({
            type: request.type || 'break_year',
            title: request.title || '',
            reason: request.reason || ''
        });
        setShowRequest(true);
    };

    const clock = async (action) => {
        setBusy(true);
        try {
            await api.post(`/attendance/${action}`, { method: 'web' });
            toast.success(action === 'check-in' ? 'Checked in' : 'Checked out');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record attendance');
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <LoadingState label="Loading your HR workspace…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const today = data.attendance?.today;
    const pendingLeave = data.leaves.filter(l => ['pending', 'under_review', 'returned_for_correction'].includes(l.status)).length;
    const pendingRequests = data.requests.filter(r => ['submitted', 'returned_for_correction', 'processing'].includes(r.status)).length;

    return (
        <div>
            <div className="mb-3">
                <h5 className="fw-bold text-dark mb-1">My HR Services</h5>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                    Submit requests, track approvals and review your own records.
                </div>
                {identity.subtitle && (
                    <div className="d-flex align-items-center gap-2 flex-wrap mt-2">
                        <span className="badge rounded-pill"
                              style={{ background: '#ECFDF5', color: '#0F6B4F', fontSize: '0.72rem', fontWeight: 600 }}>
                            {identity.title}
                        </span>
                        {identity.department && (
                            <span className="text-muted" style={{ fontSize: '0.76rem' }}>{identity.department}</span>
                        )}
                        {identity.isDepartmentHead && identity.positionTitle && (
                            <span className="text-muted" style={{ fontSize: '0.76rem' }}>{identity.positionTitle}</span>
                        )}
                        {organization?.name && (
                            <span className="text-muted" style={{ fontSize: '0.76rem' }}>at {organization.name}</span>
                        )}
                    </div>
                )}
            </div>

            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Pending Leave" value={pendingLeave} icon={FaCalendarAlt} tone="#D97706"
                              hint="Awaiting a decision" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Open Requests" value={pendingRequests} icon={FaClipboardList} tone="#0EA5E9"
                              hint="In the approval workflow" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="My Training" value={data.trainings.length} icon={FaGraduationCap} tone="#7C3AED"
                              hint="Programmes you joined" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Days Present" value={data.attendance?.stats?.present ?? 0} icon={FaUserClock}
                              tone="#16A34A" hint="Recorded attendance" />
                </div>
            </div>

            <Card className="p-3 mb-4">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <div className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>Today</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {today?.checkedIn
                                ? (today.checkedOut ? 'You have checked out for today.' : 'You are checked in.')
                                : 'You have not checked in yet.'}
                        </div>
                    </div>
                    <div className="d-flex gap-2">
                        <Button size="sm" disabled={busy || today?.checkedIn}
                                className="d-flex align-items-center gap-2" onClick={() => clock('check-in')}>
                            <FaSignInAlt size={11} /> Check in
                        </Button>
                        <Button size="sm" variant="outline-secondary"
                                disabled={busy || !today?.checkedIn || today?.checkedOut}
                                className="d-flex align-items-center gap-2" onClick={() => clock('check-out')}>
                            <FaSignOutAlt size={11} /> Check out
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="p-3">
                <Nav variant="tabs" activeKey={tab} onSelect={setTab} className="mb-3">
                    {TABS.map(item => (
                        <Nav.Item key={item.key}>
                            <Nav.Link eventKey={item.key} style={{ fontSize: '0.84rem' }}>{item.label}</Nav.Link>
                        </Nav.Item>
                    ))}
                </Nav>

                {tab === 'leave' && (
                    <>
                        <SectionHeader
                            title="My Leave"
                            description="Your leave history and remaining allowance."
                            action={<Button size="sm" onClick={() => { setResubmitTarget(null); setLeaveForm({ leaveType: '', startDate: '', endDate: '', reason: '' }); setLeaveDocument(null); setHasExistingAttachment(false); setShowLeave(true); }}
                                            className="d-flex align-items-center gap-2">
                                <FaPlus size={11} /> Request leave
                            </Button>}
                        />
                        {balanceError ? (
                            <ErrorState message={balanceError} onRetry={load} />
                        ) : data.leaveTypesConfigured === false ? (
                            <div className="alert alert-warning py-2 px-3 mb-3" style={{ fontSize: '0.82rem' }}>
                                No leave types have been configured for your organization yet. Contact HR to set up leave entitlements.
                            </div>
                        ) : data.balances.length > 0 && (
                            <div className="row g-2 mb-3">
                                {data.balances.map(balance => (
                                    <div className="col-6 col-md-3" key={balance.leaveType}>
                                        <div className="p-2 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>{balance.leaveType}</div>
                                            {balance.entitlement > 0 ? (
                                                <div className="fw-bold text-dark" style={{ fontSize: '1.1rem' }}>
                                                    {balance.remaining}
                                                    <span className="text-muted fw-normal" style={{ fontSize: '0.75rem' }}>
                                                        {' '}/ {balance.entitlement} days
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="text-muted" style={{ fontSize: '0.78rem' }}>Not configured</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {data.leaves.length === 0 ? (
                            <EmptyState icon={FaCalendarAlt} title="No leave requests yet"
                                        description="Submit a request and track its approval here." />
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle mb-0">
                                    <thead>
                                        <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                            <th className="fw-semibold">Type</th>
                                            <th className="fw-semibold">Period</th>
                                            <th className="fw-semibold text-center">Days</th>
                                            <th className="fw-semibold">Status</th>
                                            <th className="fw-semibold text-end">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.leaves.map(leave => (
                                            <tr key={leave._id}>
                                                <td style={{ fontSize: '0.84rem' }}>{leave.leaveTypeName}</td>
                                                <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {new Date(leave.startDate).toLocaleDateString()} –{' '}
                                                    {new Date(leave.endDate).toLocaleDateString()}
                                                </td>
                                                <td className="text-center" style={{ fontSize: '0.84rem' }}>
                                                    {leave.totalDays}
                                                    {leave.payBreakdown && (
                                                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                                                            {[
                                                                leave.payBreakdown.fullPayDays ? `${leave.payBreakdown.fullPayDays} full-pay` : null,
                                                                leave.payBreakdown.halfPayDays ? `${leave.payBreakdown.halfPayDays} half-pay` : null,
                                                                leave.payBreakdown.unpaidDays ? `${leave.payBreakdown.unpaidDays} unpaid` : null
                                                            ].filter(Boolean).join(', ')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusBadge status={leave.status} />
                                                    {leave.rejectionReason && (
                                                        <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                            {leave.rejectionReason}
                                                        </div>
                                                    )}
                                                    {leave.returnReason && (
                                                        <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                            {leave.returnReason}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="text-end">
                                                    {leave.status === 'returned_for_correction' && (
                                                        <Button size="sm" variant="outline-warning"
                                                                className="d-flex align-items-center gap-1 ms-auto"
                                                                onClick={() => openResubmit(leave)}>
                                                            <FaEdit size={10} /> Edit &amp; resubmit
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {tab === 'requests' && (
                    <>
                        <SectionHeader
                            title="My Requests"
                            description="Break-year, resignation, transfer and other HR requests."
                            action={<Button size="sm" onClick={() => setShowRequest(true)}
                                            className="d-flex align-items-center gap-2">
                                <FaPlus size={11} /> New request
                            </Button>}
                        />
                        {data.requests.length === 0 ? (
                            <EmptyState icon={FaClipboardList} title="No requests yet"
                                        description="Raise a request and track its progress here." />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {data.requests.map(request => (
                                    <div key={request._id} className="d-flex justify-content-between align-items-start p-2 rounded"
                                         style={{ border: '1px solid #E2E8F0' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                {request.title}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {String(request.type).replace('_', '-')} ·{' '}
                                                {new Date(request.createdAt).toLocaleDateString()}
                                            </div>
                                            {request.decisionReason && (
                                                <div className="text-muted mt-1" style={{ fontSize: '0.74rem' }}>
                                                    {request.decisionReason}
                                                </div>
                                            )}
                                            {request.status === 'returned_for_correction' && request.returnReason && (
                                                <div className="mt-1" style={{ fontSize: '0.74rem', color: '#B45309' }}>
                                                    Sent back: {request.returnReason}
                                                </div>
                                            )}
                                        </div>
                                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                            {request.status === 'returned_for_correction' && (
                                                <Button size="sm" variant="outline-warning"
                                                        style={{ fontSize: '0.72rem' }}
                                                        onClick={() => openRequestResubmit(request)}>
                                                    Fix &amp; resubmit
                                                </Button>
                                            )}
                                            <StatusBadge status={request.status} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'training' && (
                    <>
                        <SectionHeader title="My Training" description="Programmes you are registered for." />
                        {data.trainings.length === 0 ? (
                            <EmptyState icon={FaGraduationCap} title="No training yet"
                                        description="Training you register for appears here." />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {data.trainings.map(training => (
                                    <div key={training._id} className="d-flex justify-content-between align-items-center p-2 rounded"
                                         style={{ border: '1px solid #E2E8F0' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                {training.title}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {training.startDate && new Date(training.startDate).toLocaleDateString()}
                                                {training.location ? ` · ${training.location}` : ''}
                                            </div>
                                        </div>
                                        <div className="text-end">
                                            <StatusBadge status={training.status} />
                                            {training.participation?.completed && (
                                                <div className="text-success mt-1" style={{ fontSize: '0.72rem' }}>Completed</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {tab === 'attendance' && (
                    <>
                        <SectionHeader title="My Attendance" description="Your recorded attendance history." />
                        {(!data.attendance?.data || data.attendance.data.length === 0) ? (
                            <EmptyState icon={FaUserClock} title="No attendance records"
                                        description="Check in above to start recording attendance." />
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle mb-0">
                                    <thead>
                                        <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                            <th className="fw-semibold">Date</th>
                                            <th className="fw-semibold">Check in</th>
                                            <th className="fw-semibold">Check out</th>
                                            <th className="fw-semibold text-center">Hours</th>
                                            <th className="fw-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.attendance.data.slice(0, 20).map(record => (
                                            <tr key={record._id}>
                                                <td style={{ fontSize: '0.83rem' }}>
                                                    {new Date(record.date).toLocaleDateString()}
                                                </td>
                                                <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {record.checkIn?.time
                                                        ? new Date(record.checkIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : '—'}
                                                </td>
                                                <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {record.checkOut?.time
                                                        ? new Date(record.checkOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                        : '—'}
                                                </td>
                                                <td className="text-center" style={{ fontSize: '0.83rem' }}>
                                                    {record.hoursWorked || 0}
                                                </td>
                                                <td><StatusBadge status={record.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </Card>

            <Modal show={showLeave} onHide={() => { setShowLeave(false); setResubmitTarget(null); }} centered>
                <Form onSubmit={submitLeave}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>
                            {resubmitTarget ? 'Edit and resubmit leave request' : 'Request leave'}
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {balanceError && (
                            <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: '0.8rem' }}>
                                {balanceError} Your leave type balance could not be checked here - the server still
                                validates it independently when you submit.
                            </div>
                        )}
                        <Row className="g-2">
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Leave type</Form.Label>
                                {data.balances.length > 0 ? (
                                    <Form.Select required value={leaveForm.leaveType}
                                                 onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
                                        <option value="">Select a leave type…</option>
                                        {data.balances.map(b => (
                                            <option key={b.leaveType} value={b.leaveType}>{b.leaveType}</option>
                                        ))}
                                    </Form.Select>
                                ) : (
                                    <Form.Control required value={leaveForm.leaveType}
                                                  placeholder="e.g. Annual Leave"
                                                  onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} />
                                )}
                                {leaveForm.leaveType && (() => {
                                    const selectedBalance = data.balances.find(b => b.leaveType === leaveForm.leaveType);
                                    if (!selectedBalance) return null;
                                    return selectedBalance.entitlement > 0 ? (
                                        <div className="mt-1 text-muted" style={{ fontSize: '0.78rem' }}>
                                            Available balance: <strong>{selectedBalance.available}</strong>{' '}
                                            day{selectedBalance.available === 1 ? '' : 's'}
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-warning" style={{ fontSize: '0.78rem' }}>
                                            No leave entitlement has been configured for this leave type.
                                        </div>
                                    );
                                })()}
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Start date</Form.Label>
                                <Form.Control type="date" required value={leaveForm.startDate}
                                              onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>End date</Form.Label>
                                <Form.Control type="date" required value={leaveForm.endDate}
                                              onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
                            </Col>
                            {previewDays(leaveForm.startDate, leaveForm.endDate) !== null && (
                                <Col md={12}>
                                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                        Requested days: <strong>{previewDays(leaveForm.startDate, leaveForm.endDate)}</strong>
                                        {' '}(the server independently confirms this figure)
                                    </div>
                                </Col>
                            )}
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Reason</Form.Label>
                                <Form.Control as="textarea" rows={3} required value={leaveForm.reason}
                                              onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>
                                    Supporting document
                                    {data.balances.find(b => b.leaveType === leaveForm.leaveType)?.requiresAttachment && ' (required for this leave type)'}
                                </Form.Label>
                                <Form.Control type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                                              onChange={e => setLeaveDocument(e.target.files?.[0] || null)} />
                                {hasExistingAttachment && !leaveDocument && (
                                    <div className="text-muted mt-1" style={{ fontSize: '0.74rem' }}>
                                        A document is already attached to this request. Choose a new file only if you need to replace it.
                                    </div>
                                )}
                            </Col>
                            {(() => {
                                const submissionBlocker = getSubmissionBlocker(leaveForm, data.balances, leaveDocument, hasExistingAttachment);
                                return submissionBlocker ? (
                                    <Col md={12}>
                                        <div className="alert alert-danger py-2 px-3 mb-0" style={{ fontSize: '0.8rem' }}>
                                            {submissionBlocker}
                                        </div>
                                    </Col>
                                ) : null;
                            })()}
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => { setShowLeave(false); setResubmitTarget(null); }}>Cancel</Button>
                        <Button type="submit" disabled={busy || !!getSubmissionBlocker(leaveForm, data.balances, leaveDocument, hasExistingAttachment)}>
                            {busy ? 'Submitting…' : (resubmitTarget ? 'Resubmit request' : 'Submit request')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <Modal show={showRequest} onHide={() => { setShowRequest(false); setRequestResubmitTarget(null); }} centered>
                <Form onSubmit={submitRequest}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>
                            {requestResubmitTarget ? 'Edit and resubmit request' : 'New HR request'}
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.8rem' }}>Request type</Form.Label>
                            <Form.Select value={requestForm.type}
                                         onChange={e => setRequestForm({ ...requestForm, type: e.target.value })}>
                                <option value="break_year">Break-Year</option>
                                <option value="resignation">Resignation</option>
                                <option value="transfer">Transfer</option>
                                <option value="promotion">Promotion</option>
                                <option value="other">Other</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.8rem' }}>Title</Form.Label>
                            <Form.Control required value={requestForm.title}
                                          onChange={e => setRequestForm({ ...requestForm, title: e.target.value })} />
                        </Form.Group>
                        <Form.Group>
                            <Form.Label style={{ fontSize: '0.8rem' }}>Reason</Form.Label>
                            <Form.Control as="textarea" rows={3} value={requestForm.reason}
                                          onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => { setShowRequest(false); setRequestResubmitTarget(null); }}>Cancel</Button>
                        <Button type="submit" disabled={busy}>
                            {busy ? 'Submitting…' : (requestResubmitTarget ? 'Resubmit request' : 'Submit request')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default EmployeeDashboard;
