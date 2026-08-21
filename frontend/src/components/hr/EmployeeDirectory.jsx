import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaUsers, FaPlus, FaSearch } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = {
    personalInfo: { firstName: '', lastName: '', gender: 'male', maritalStatus: '', bloodType: '' },
    contactInfo: { email: '', phone: '' },
    employmentInfo: { jobTitle: '', employmentStatus: 'active', workLocation: '' }
};

/**
 * Employee directory and information module (spec §7).
 *
 * HR Experts record employee information; HR Managers and the Employer view it.
 * Personal attributes such as blood type belong to the profile here - they are
 * never recruitment criteria.
 */
const EmployeeDirectory = () => {
    const { can } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState(null);

    const canRecord = can('employee:record');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employees', { params: search ? { search } : {} });
            setEmployees(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load the employee directory.');
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/employees', form);
            toast.success('Employee recorded');
            setShowForm(false);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not record the employee');
        } finally {
            setSaving(false);
        }
    };

    const setGroup = (group, field, value) =>
        setForm(prev => ({ ...prev, [group]: { ...prev[group], [field]: value } }));

    if (loading) return <LoadingState label="Loading employee directory…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Employee Directory"
                    description="Personal, professional and employment information for your organization."
                    action={canRecord && (
                        <Button size="sm" onClick={() => setShowForm(true)} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Record employee
                        </Button>
                    )}
                />

                <div className="mb-3" style={{ maxWidth: 420 }}>
                    <div className="position-relative">
                        <FaSearch size={12} className="position-absolute text-muted"
                                  style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                        <Form.Control
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name, employee number or email"
                            style={{ paddingLeft: 32, fontSize: '0.85rem' }}
                        />
                    </div>
                </div>

                {employees.length === 0 ? (
                    <EmptyState
                        icon={FaUsers}
                        title={search ? 'No employees match your search' : 'No employees recorded yet'}
                        description={search
                            ? 'Try a different name, employee number or email address.'
                            : 'Record your first employee to start building the directory.'}
                        action={canRecord && !search && (
                            <Button size="sm" onClick={() => setShowForm(true)}>Record employee</Button>
                        )}
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Employee</th>
                                    <th className="fw-semibold">Number</th>
                                    <th className="fw-semibold">Job title</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(employee => (
                                    <tr key={employee._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>
                                                {employee.personalInfo?.firstName} {employee.personalInfo?.lastName}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {employee.contactInfo?.email || '—'}
                                            </div>
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>{employee.employeeId}</td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {employee.employmentInfo?.jobTitle || '—'}
                                        </td>
                                        <td><StatusBadge status={employee.status} /></td>
                                        <td className="text-end">
                                            <Button size="sm" variant="outline-secondary"
                                                    onClick={() => setSelected(employee)}>
                                                View
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Record employee information</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Personal</div>
                        <Row className="g-2 mb-3">
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>First name</Form.Label>
                                <Form.Control required value={form.personalInfo.firstName}
                                              onChange={e => setGroup('personalInfo', 'firstName', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Last name</Form.Label>
                                <Form.Control required value={form.personalInfo.lastName}
                                              onChange={e => setGroup('personalInfo', 'lastName', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Gender</Form.Label>
                                <Form.Select value={form.personalInfo.gender}
                                             onChange={e => setGroup('personalInfo', 'gender', e.target.value)}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Marital status</Form.Label>
                                <Form.Control value={form.personalInfo.maritalStatus}
                                              onChange={e => setGroup('personalInfo', 'maritalStatus', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Blood type</Form.Label>
                                <Form.Control value={form.personalInfo.bloodType}
                                              onChange={e => setGroup('personalInfo', 'bloodType', e.target.value)} />
                            </Col>
                        </Row>

                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Contact</div>
                        <Row className="g-2 mb-3">
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Work email</Form.Label>
                                <Form.Control type="email" value={form.contactInfo.email}
                                              onChange={e => setGroup('contactInfo', 'email', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Phone</Form.Label>
                                <Form.Control value={form.contactInfo.phone}
                                              onChange={e => setGroup('contactInfo', 'phone', e.target.value)} />
                            </Col>
                        </Row>

                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Employment</div>
                        <Row className="g-2">
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Job title</Form.Label>
                                <Form.Control value={form.employmentInfo.jobTitle}
                                              onChange={e => setGroup('employmentInfo', 'jobTitle', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Work location</Form.Label>
                                <Form.Control value={form.employmentInfo.workLocation}
                                              onChange={e => setGroup('employmentInfo', 'workLocation', e.target.value)} />
                            </Col>
                        </Row>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record employee'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            <Modal show={!!selected} onHide={() => setSelected(null)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        {selected?.personalInfo?.firstName} {selected?.personalInfo?.lastName}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {selected && (
                        <Row className="g-3">
                            {[
                                ['Employee number', selected.employeeId],
                                ['Status', selected.status],
                                ['Work email', selected.contactInfo?.email],
                                ['Phone', selected.contactInfo?.phone],
                                ['Job title', selected.employmentInfo?.jobTitle],
                                ['Work location', selected.employmentInfo?.workLocation],
                                ['Gender', selected.personalInfo?.gender],
                                ['Marital status', selected.personalInfo?.maritalStatus],
                                ['Blood type', selected.personalInfo?.bloodType],
                                ['Hire date', selected.employmentInfo?.hireDate
                                    ? new Date(selected.employmentInfo.hireDate).toLocaleDateString() : null]
                            ].map(([label, value]) => (
                                <Col md={6} key={label}>
                                    <div className="text-uppercase text-muted"
                                         style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                        {label}
                                    </div>
                                    <div className="text-dark" style={{ fontSize: '0.86rem' }}>{value || '—'}</div>
                                </Col>
                            ))}
                        </Row>
                    )}
                </Modal.Body>
            </Modal>
        </div>
    );
};

export default EmployeeDirectory;
