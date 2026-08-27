import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBuilding, FaUsers, FaBriefcase, FaLayerGroup, FaLock } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * My Department - read-only.
 *
 * The department's identity, its configured positions, its headcount and what
 * it is currently recruiting for. A Department Head reads the organization's
 * structure here but never edits it: departments, positions, ranks and
 * salaries belong to Configuration, which only the Employer maintains. The
 * backend refuses those writes for this user regardless, so there is nothing
 * on this page that could be enabled by tampering with the UI.
 */
const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const Detail = ({ label, children }) => (
    <div className="col-12 col-md-4 mb-3">
        <div className="text-uppercase" style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748B', letterSpacing: '.5px' }}>
            {label}
        </div>
        <div className="text-dark" style={{ fontSize: '0.88rem' }}>{children || '—'}</div>
    </div>
);

const MyDepartment = () => {
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/departments/mine');
            setDepartments(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your department.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <LoadingState label="Loading your department…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    if (departments.length === 0) {
        return (
            <EmptyState
                icon={FaBuilding}
                title="No department assigned"
                description="You are not currently assigned as the head of any department."
            />
        );
    }

    return (
        <div className="d-flex flex-column gap-3">
            {departments.map(department => (
                <Card className="p-3" key={department._id}>
                    <SectionHeader
                        title={department.name}
                        description="Your department as the organization has configured it."
                        action={<StatusBadge status={department.status} />}
                    />

                    <div className="row">
                        <Detail label="Department Name">{department.name}</Detail>
                        <Detail label="Department Code">{department.code}</Detail>
                        <Detail label="Employees">
                            <Link to="/employee/department/employees" className="text-decoration-none">
                                {department.employeeCount} in this department
                            </Link>
                        </Detail>
                        <Detail label="Description">{department.description}</Detail>
                    </div>

                    <div className="d-flex align-items-center gap-2 text-muted mb-3 mt-2"
                         style={{ fontSize: '0.76rem' }}>
                        <FaLock size={11} />
                        <span>
                            Department and position details are maintained by your Employer in Configuration.
                            Ask them to make any change here.
                        </span>
                    </div>

                    <div className="row g-3">
                        <div className="col-12 col-lg-6">
                            <div className="fw-semibold text-dark mb-2 d-flex align-items-center gap-2"
                                 style={{ fontSize: '0.88rem' }}>
                                <FaLayerGroup size={13} color="#0F6B4F" /> Positions
                            </div>
                            {department.positions.length === 0 ? (
                                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    No positions configured for this department yet.
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead>
                                            <tr style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748B' }}>
                                                <th>Position</th>
                                                <th>Code</th>
                                                <th>Rank</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {department.positions.map(position => (
                                                <tr key={position._id} style={{ fontSize: '0.82rem' }}>
                                                    <td className="fw-semibold text-dark">{position.title}</td>
                                                    <td>{position.code || '—'}</td>
                                                    <td>{position.rankName || '—'}</td>
                                                    <td><StatusBadge status={position.status} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="col-12 col-lg-6">
                            <div className="fw-semibold text-dark mb-2 d-flex align-items-center gap-2"
                                 style={{ fontSize: '0.88rem' }}>
                                <FaBriefcase size={13} color="#0EA5E9" /> Current Vacancies
                            </div>
                            {department.vacancies.length === 0 ? (
                                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    Nothing being recruited for this department right now.
                                </div>
                            ) : (
                                <div className="table-responsive">
                                    <table className="table table-sm align-middle mb-0">
                                        <thead>
                                            <tr style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748B' }}>
                                                <th>Vacancy</th>
                                                <th>Closes</th>
                                                <th>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {department.vacancies.map(job => (
                                                <tr key={job._id} style={{ fontSize: '0.82rem' }}>
                                                    <td className="fw-semibold text-dark">{job.title}</td>
                                                    <td>{formatDate(job.applicationDeadline)}</td>
                                                    <td><StatusBadge status={job.status} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="d-flex gap-2 flex-wrap mt-3">
                        <Link to="/employee/department/employees"
                              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
                              style={{ fontSize: '0.78rem' }}>
                            <FaUsers size={12} /> View employees
                        </Link>                        <Link to="/employee/requisitions"
                              className="btn btn-sm btn-outline-secondary"
                              style={{ fontSize: '0.78rem' }}>
                            {department.requisitionCount} requisition{department.requisitionCount === 1 ? '' : 's'} raised
                        </Link>
                    </div>
                </Card>
            ))}
        </div>
    );
};

export default MyDepartment;
