import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaUserFriends, FaPlus } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'hr_expert', department: '', jobTitle: '' };

/**
 * HR team management for the Employer.
 *
 * The employer may only create recruitment staff (HR Expert / HR Manager).
 * Platform administrators are never created here - that is a System
 * Administrator responsibility, and the backend rejects any other role.
 */
const EmployerTeam = () => {
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employers/me/team');
            setTeam(res.data.team || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your HR team.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/employers/me/team', form);
            toast.success(`${form.name} added to your HR team`);
            setShowForm(false);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not add team member');
        } finally {
            setSaving(false);
        }
    };

    const changeStatus = async (member, status) => {
        try {
            await api.put(`/employers/me/team/${member._id}`, { status });
            toast.success(`${member.name} is now ${status}`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update team member');
        }
    };

    if (loading) return <LoadingState label="Loading HR team…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const members = team.filter(member => member.role !== 'employer');

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="HR Team"
                    description="HR Experts run recruitment; HR Managers review and approve it."
                    action={
                        <Button size="sm" onClick={() => setShowForm(true)} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Add member
                        </Button>
                    }
                />

                {members.length === 0 ? (
                    <EmptyState
                        icon={FaUserFriends}
                        title="No HR team members yet"
                        description="Add an HR Expert to create vacancies and an HR Manager to approve them."
                        action={<Button size="sm" onClick={() => setShowForm(true)}>Add your first member</Button>}
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Name</th>
                                    <th className="fw-semibold">Role</th>
                                    <th className="fw-semibold">Department</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {members.map(member => (
                                    <tr key={member._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>{member.name}</div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{member.email}</div>
                                        </td>
                                        <td style={{ fontSize: '0.82rem' }}>
                                            {member.role === 'hr_manager' ? 'HR Manager' : 'HR Expert'}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {member.department || '—'}
                                        </td>
                                        <td><StatusBadge status={member.status} /></td>
                                        <td className="text-end">
                                            {member.status === 'active' ? (
                                                <Button size="sm" variant="outline-danger"
                                                        onClick={() => changeStatus(member, 'inactive')}>
                                                    Deactivate
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline-success"
                                                        onClick={() => changeStatus(member, 'active')}>
                                                    Activate
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
                        <Modal.Title style={{ fontSize: '1.05rem' }}>Add HR team member</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.84rem' }}>Full name</Form.Label>
                            <Form.Control required value={form.name}
                                          onChange={e => setForm({ ...form, name: e.target.value })} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.84rem' }}>Email</Form.Label>
                            <Form.Control type="email" required value={form.email}
                                          onChange={e => setForm({ ...form, email: e.target.value })} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.84rem' }}>Temporary password</Form.Label>
                            <Form.Control type="password" required minLength={6} value={form.password}
                                          onChange={e => setForm({ ...form, password: e.target.value })} />
                            <Form.Text className="text-muted" style={{ fontSize: '0.74rem' }}>
                                At least 6 characters. The member can change it after signing in.
                            </Form.Text>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label style={{ fontSize: '0.84rem' }}>Role</Form.Label>
                            <Form.Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                <option value="hr_expert">HR Expert — creates and processes recruitment</option>
                                <option value="hr_manager">HR Manager — reviews and approves recruitment</option>
                            </Form.Select>
                        </Form.Group>
                        <div className="row g-2">
                            <div className="col-6">
                                <Form.Label style={{ fontSize: '0.84rem' }}>Department</Form.Label>
                                <Form.Control value={form.department}
                                              onChange={e => setForm({ ...form, department: e.target.value })} />
                            </div>
                            <div className="col-6">
                                <Form.Label style={{ fontSize: '0.84rem' }}>Job title</Form.Label>
                                <Form.Control value={form.jobTitle}
                                              onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
                            </div>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add member'}</Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default EmployerTeam;
