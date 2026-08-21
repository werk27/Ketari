import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col, Nav } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
    FaCalendarAlt, FaClipboardList, FaGraduationCap, FaUserClock, FaPlus, FaSignInAlt, FaSignOutAlt
} from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const TABS = [
    { key: 'leave', label: 'My Leave' },
    { key: 'requests', label: 'My Requests' },
    { key: 'training', label: 'My Training' },
    { key: 'attendance', label: 'My Attendance' }
];

/**
 * Employee self-service (spec §23).
 *
 * An employee sees and manages only their own records: leave, requests,
 * training participation and attendance.
 */
const EmployeeDashboard = () => {
    const [tab, setTab] = useState('leave');
    const [data, setData] = useState({ leaves: [], requests: [], trainings: [], attendance: null, balances: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const [showLeave, setShowLeave] = useState(false);
    const [leaveForm, setLeaveForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });
    const [showRequest, setShowRequest] = useState(false);
    const [requestForm, setRequestForm] = useState({ type: 'break_year', title: '', reason: '' });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [leaves, requests, trainings, attendance, balances] = await Promise.all([
                api.get('/leaves/me').catch(() => ({ data: { data: [] } })),
                api.get('/requests/me').catch(() => ({ data: { data: [] } })),
                api.get('/training/me').catch(() => ({ data: { data: [] } })),
                api.get('/attendance/me').catch(() => ({ data: null })),
                api.get('/leaves/balance').catch(() => ({ data: { balances: [] } }))
            ]);
            setData({
                leaves: leaves.data.data || [],
                requests: requests.data.data || [],
                trainings: trainings.data.data || [],
                attendance: attendance.data || null,
                balances: balances.data.balances || []
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
        setBusy(true);
        try {
            await api.post('/leaves', leaveForm);
            toast.success('Leave request submitted');
            setShowLeave(false);
            setLeaveForm({ leaveType: '', startDate: '', endDate: '', reason: '' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit the request');
        } finally {
            setBusy(false);
        }
    };

    const submitRequest = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post('/requests', requestForm);
            toast.success('Request submitted');
            setShowRequest(false);
            setRequestForm({ type: 'break_year', title: '', reason: '' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not submit the request');
        } finally {
            setBusy(false);
        }
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
    const pendingLeave = data.leaves.filter(l => ['pending', 'under_review'].includes(l.status)).length;
    const pendingRequests = data.requests.filter(r => ['submitted', 'processing'].includes(r.status)).length;

    return (
        <div>
            <div className="mb-3">
                <h5 className="fw-bold text-dark mb-1">My HR Services</h5>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                    Submit requests, track approvals and review your own records.
                </div>
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
                            action={<Button size="sm" onClick={() => setShowLeave(true)}
                                            className="d-flex align-items-center gap-2">
                                <FaPlus size={11} /> Request leave
                            </Button>}
                        />
                        {data.balances.length > 0 && (
                            <div className="row g-2 mb-3">
                                {data.balances.map(balance => (
                                    <div className="col-6 col-md-3" key={balance.leaveType}>
                                        <div className="p-2 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>{balance.leaveType}</div>
                                            <div className="fw-bold text-dark" style={{ fontSize: '1.1rem' }}>
                                                {balance.remaining}
                                                <span className="text-muted fw-normal" style={{ fontSize: '0.75rem' }}>
                                                    {' '}/ {balance.entitlement} days
                                                </span>
                                            </div>
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
                                                <td className="text-center" style={{ fontSize: '0.84rem' }}>{leave.totalDays}</td>
                                                <td>
                                                    <StatusBadge status={leave.status} />
                                                    {leave.rejectionReason && (
                                                        <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                            {leave.rejectionReason}
                                                        </div>
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
                                        </div>
                                        <StatusBadge status={request.status} />
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

            <Modal show={showLeave} onHide={() => setShowLeave(false)} centered>
                <Form onSubmit={submitLeave}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Request leave</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Row className="g-2">
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Leave type</Form.Label>
                                {data.balances.length > 0 ? (
                                    <Form.Select required value={leaveForm.leaveType}
                                                 onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
                                        <option value="">Select a leave type…</option>
                                        {data.balances.map(b => (
                                            <option key={b.leaveType} value={b.leaveType}>
                                                {b.leaveType} ({b.remaining} days remaining)
                                            </option>
                                        ))}
                                    </Form.Select>
                                ) : (
                                    <Form.Control required value={leaveForm.leaveType}
                                                  placeholder="e.g. Annual Leave"
                                                  onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })} />
                                )}
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
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Reason</Form.Label>
                                <Form.Control as="textarea" rows={3} required value={leaveForm.reason}
                                              onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowLeave(false)}>Cancel</Button>
                        <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <Modal show={showRequest} onHide={() => setShowRequest(false)} centered>
                <Form onSubmit={submitRequest}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>New HR request</Modal.Title>
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
                        <Button variant="light" onClick={() => setShowRequest(false)}>Cancel</Button>
                        <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default EmployeeDashboard;
