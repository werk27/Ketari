import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaUserFriends, FaUsers } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

// Exact label per role rather than a hr_manager/else ternary - the backend now
// scopes this list to hr_expert/hr_manager only, but a mislabeled fallback
// here previously showed plain employees as "HR Expert" whenever that
// scoping slipped, so this stays explicit rather than defaulting.
const ROLE_LABELS = { hr_expert: 'HR Expert', hr_manager: 'HR Manager', employee: 'Employee', employer: 'Employer' };

/**
 * HR team overview for the Employer - read only.
 *
 * A role must only ever be granted to an existing Employee record (see
 * employeeController.assignEmployeeRole), never created as a standalone user
 * account. This screen used to let the employer type in a name/email/password
 * and role directly, creating a User with no Employee behind it at all - the
 * exact thing that rule forbids, and it left the person invisible in the
 * Employee Directory despite having full HR access.
 *
 * Adding and role-assigning now happens only in the Employee Directory
 * (Add Employee -> Create/Link Account -> Assign Role). This page keeps the
 * quick-glance list and the activate/deactivate action, since those don't
 * create anything and are still useful here.
 */
const EmployerTeam = () => {
    const [team, setTeam] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
                        <Button as={Link} to="/employer/employees" size="sm" variant="outline-primary"
                                className="d-flex align-items-center gap-2">
                            <FaUsers size={11} /> Manage in Employee Directory
                        </Button>
                    }
                />

                {members.length === 0 ? (
                    <EmptyState
                        icon={FaUserFriends}
                        title="No HR team members yet"
                        description="Add an employee in the Employee Directory, then assign them the HR Expert or HR Manager role."
                        action={
                            <Button as={Link} to="/employer/employees" size="sm">
                                Go to Employee Directory
                            </Button>
                        }
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
                                            {ROLE_LABELS[member.role] || member.role}
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
        </div>
    );
};

export default EmployerTeam;

