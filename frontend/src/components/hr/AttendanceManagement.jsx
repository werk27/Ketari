import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaUserClock, FaPlus } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = { employeeId: '', date: '', status: 'present', checkInTime: '', checkOutTime: '', note: '' };

/**
 * Attendance oversight for HR Expert/Manager.
 *
 * The backend has always supported this (GET /api/attendance/report,
 * POST /api/attendance/record - also the integration point for an external
 * time-attendance device) and both hr_expert/hr_manager already hold the
 * attendance:view / attendance:record capabilities for it, but no page ever
 * existed to use them - an employee could only ever see their own
 * check-in/out (EmployeeDashboard's "My Attendance" tab). This is the
 * organization-wide counterpart: view every employee's recorded attendance,
 * and (HR Expert) record/correct a day's entry - the same one record-per-
 * employee-per-day store, so this can never diverge from what employee
 * self-check-in/out already writes.
 */
const AttendanceManagement = () => {
    const { can } = useAuth();
    const [records, setRecords] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [employees, setEmployees] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const canRecord = can('attendance:record');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;
            const res = await api.get('/attendance/report', { params });
            setRecords(res.data.data || []);
            setStats(res.data.stats || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load attendance records.');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => { load(); }, [load]);

    const openForm = async () => {
        if (employees.length === 0) {
            try {
                const res = await api.get('/employees');
                setEmployees((res.data.data || []).filter(e => e.status === 'active'));
            } catch {
                // Non-fatal: the picker just stays empty if this fails.
            }
        }
        setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) });
        setShowForm(true);
    };

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = {
                employeeId: form.employeeId,
                date: form.date,
                status: form.status,
                note: form.note,
                ...(form.checkInTime ? { checkIn: { time: `${form.date}T${form.checkInTime}`, method: 'manual' } } : {}),
                ...(form.checkOutTime ? { checkOut: { time: `${form.date}T${form.checkOutTime}`, method: 'manual' } } : {})
            };
            await api.post('/attendance/record', body);
            toast.success('Attendance recorded');
            setShowForm(false);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record attendance');
        } finally {
            setSaving(false);
        }
    };

    const employeeName = (employee) => employee?.personalInfo
        ? `${employee.personalInfo.firstName} ${employee.personalInfo.lastName}`
        : (employee?.employeeId || 'Employee');

    if (loading) return <LoadingState label="Loading attendance…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Row className="g-2 g-md-3 mb-3">
                <Col xs={6} md={3}>
                    <StatCard label="Present" value={stats?.present ?? 0} icon={FaUserClock} tone="#16A34A" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="Absent" value={stats?.absent ?? 0} icon={FaUserClock} tone="#DC2626" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="Late" value={stats?.late ?? 0} icon={FaUserClock} tone="#D97706" />
                </Col>
                <Col xs={6} md={3}>
                    <StatCard label="On Leave / Holiday" value={stats?.leave ?? 0} icon={FaUserClock} tone="#5B21B6" />
                </Col>
            </Row>

            <Card className="p-3">
                <SectionHeader
                    title="Attendance"
                    description="Every employee's recorded check-in/check-out for your organization."
                    action={canRecord && (
                        <Button size="sm" onClick={openForm} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Record attendance
                        </Button>
                    )}
                />

                <Row className="g-2 mb-3">
                    <Col md={3}>
                        <Form.Label style={{ fontSize: '0.76rem' }}>From</Form.Label>
                        <Form.Control type="date" size="sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </Col>
                    <Col md={3}>
                        <Form.Label style={{ fontSize: '0.76rem' }}>To</Form.Label>
                        <Form.Control type="date" size="sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </Col>
                </Row>

                {records.length === 0 ? (
                    <EmptyState
                        icon={FaUserClock}
                        title="No attendance records in this view"
                        description="Records appear here once employees check in, or HR records them directly."
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Employee</th>
                                    <th className="fw-semibold">Date</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold">Check In</th>
                                    <th className="fw-semibold">Check Out</th>
                                    <th className="fw-semibold text-end">Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(record => (
                                    <tr key={record._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                {employeeName(record.employee)}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                {record.employee?.employeeId || '—'}
                                            </div>
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {new Date(record.date).toLocaleDateString()}
                                        </td>
                                        <td><StatusBadge status={record.status} /></td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {record.checkIn?.time ? new Date(record.checkIn.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {record.checkOut?.time ? new Date(record.checkOut.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="text-end" style={{ fontSize: '0.82rem' }}>
                                            {record.hoursWorked || 0}
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
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Record attendance</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Row className="g-2">
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Employee</Form.Label>
                                <Form.Select required value={form.employeeId}
                                             onChange={e => setForm({ ...form, employeeId: e.target.value })}>
                                    <option value="">Select an employee…</option>
                                    {employees.map(e => (
                                        <option key={e._id} value={e._id}>{employeeName(e)} ({e.employeeId})</option>
                                    ))}
                                </Form.Select>
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Date</Form.Label>
                                <Form.Control type="date" required value={form.date}
                                              onChange={e => setForm({ ...form, date: e.target.value })} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Status</Form.Label>
                                <Form.Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                                    <option value="present">Present</option>
                                    <option value="absent">Absent</option>
                                    <option value="late">Late</option>
                                    <option value="half_day">Half Day</option>
                                    <option value="leave">On Leave</option>
                                    <option value="holiday">Holiday</option>
                                </Form.Select>
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Check-in time</Form.Label>
                                <Form.Control type="time" value={form.checkInTime}
                                              onChange={e => setForm({ ...form, checkInTime: e.target.value })} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Check-out time</Form.Label>
                                <Form.Control type="time" value={form.checkOutTime}
                                              onChange={e => setForm({ ...form, checkOutTime: e.target.value })} />
                            </Col>
                            <Col md={12}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Note</Form.Label>
                                <Form.Control as="textarea" rows={2} value={form.note}
                                              onChange={e => setForm({ ...form, note: e.target.value })} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving || !form.employeeId}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default AttendanceManagement;
