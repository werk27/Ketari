import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaUsers, FaSearch, FaLock } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * The people in the Department Head's own department.
 *
 * Work information only. The backend selects a deliberately narrow set of
 * fields - no salary, bank details, documents, dependents, home address,
 * emergency contacts or onboarding trail - because a Department Head manages
 * work, not HR records. This screen shows exactly what the API returns and has
 * no editing at all: employee records stay with HR.
 */
const EMPLOYMENT_STATUSES = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'on_leave', label: 'On Leave' },
    { value: 'terminated', label: 'Terminated' }
];

const fullName = (employee) => [
    employee.personalInfo?.firstName,
    employee.personalInfo?.middleName,
    employee.personalInfo?.lastName
].filter(Boolean).join(' ') || employee.user?.name || 'Unnamed';

const initials = (employee) => fullName(employee).trim().charAt(0).toUpperCase();
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const DepartmentEmployees = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [employmentStatus, setEmploymentStatus] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/departments/mine/employees',
                { params: employmentStatus ? { employmentStatus } : {} });
            setEmployees(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your department employees.');
        } finally {
            setLoading(false);
        }
    }, [employmentStatus]);

    useEffect(() => { load(); }, [load]);

    // Filtering by name is instant on the list already fetched; the status
    // filter narrows the query itself because it changes what the department
    // contains rather than how it is displayed.
    const visible = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return employees;
        return employees.filter(employee =>
            fullName(employee).toLowerCase().includes(term)
            || (employee.employeeId || '').toLowerCase().includes(term)
            || (employee.positionTitle || '').toLowerCase().includes(term));
    }, [employees, search]);

    if (loading) return <LoadingState label="Loading department employees…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <Card className="p-3">
            <SectionHeader
                title="Department Employees"
                description="Everyone assigned to the department you head."
            />

            <div className="d-flex gap-2 flex-wrap mb-3">
                <div className="position-relative" style={{ maxWidth: '280px', flexGrow: 1 }}>
                    <FaSearch size={12} className="position-absolute text-muted"
                              style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                        className="form-control form-control-sm"
                        style={{ paddingLeft: 32, fontSize: '0.82rem' }}
                        placeholder="Search by name, ID or position"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select className="form-select form-select-sm" style={{ width: 'auto', fontSize: '0.82rem' }}
                        value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)}>
                    {EMPLOYMENT_STATUSES.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>

            {visible.length === 0 ? (
                <EmptyState
                    icon={FaUsers}
                    title={employees.length === 0 ? 'No employees yet' : 'No matches'}
                    description={employees.length === 0
                        ? 'Nobody is assigned to your department yet. New hires appear here once HR records them.'
                        : 'No one in your department matches that search.'}
                />
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748B' }}>
                                <th>Employee</th>
                                <th>Position</th>
                                <th>Work contact</th>
                                <th>Joined</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(employee => (
                                <tr key={employee._id} style={{ fontSize: '0.83rem' }}>
                                    <td>
                                        <div className="d-flex align-items-center gap-2">
                                            <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold flex-shrink-0"
                                                 style={{ width: 32, height: 32, fontSize: '0.8rem', background: '#0F6B4F' }}>
                                                {initials(employee)}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="fw-semibold text-dark text-truncate">{fullName(employee)}</div>
                                                <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                    {employee.employeeId}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{employee.positionTitle || '—'}</td>
                                    <td className="text-muted">{employee.contactInfo?.email || '—'}</td>
                                    <td>{formatDate(employee.employmentInfo?.hireDate)}</td>
                                    <td><StatusBadge status={employee.employmentInfo?.employmentStatus || employee.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="d-flex align-items-center gap-2 text-muted mt-3" style={{ fontSize: '0.76rem' }}>
                <FaLock size={11} />
                <span>
                    Work information only. Pay, documents and personal HR records stay with the HR team.
                </span>
            </div>
        </Card>
    );
};

export default DepartmentEmployees;
