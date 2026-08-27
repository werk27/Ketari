import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FaUsers, FaClipboardList, FaHourglassHalf, FaCheckCircle, FaBriefcase,
    FaUserPlus, FaPlusCircle, FaExclamationTriangle
} from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Department Head dashboard.
 *
 * Answers the three questions a head opens the workspace with: what is
 * happening in my department, what staffing have I asked for, and where have
 * those requests got to. Everything here is scoped by the backend to the
 * department(s) this user actually heads - there are deliberately no
 * organization-wide HR figures and no other department's data.
 */
const employeeName = (employee) => [
    employee.personalInfo?.firstName,
    employee.personalInfo?.lastName
].filter(Boolean).join(' ') || employee.user?.name || 'Unnamed';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const DepartmentDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/departments/mine/overview');
            setData(res.data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your department dashboard.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <LoadingState label="Loading your department…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const stats = data?.stats || {};
    const departmentNames = (data?.departments || []).map(d => d.name).join(', ');

    return (
        <div>
            <div className="mb-3">
                <h5 className="fw-bold text-dark mb-1">{departmentNames || 'My Department'}</h5>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                    What is happening in your department, and where your staffing requests have reached.
                </div>
            </div>

            {stats.returnedRequisitions > 0 && (
                <Card className="p-3 mb-3 d-flex flex-row align-items-center gap-3"
                      style={{ borderColor: '#FCA5A5', background: '#FEF2F2' }}>
                    <FaExclamationTriangle color="#B91C1C" />
                    <div className="flex-grow-1">
                        <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>
                            HR has asked you for clarification
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                            {stats.returnedRequisitions} requisition{stats.returnedRequisitions === 1 ? '' : 's'} returned
                            and waiting on your response.
                        </div>
                    </div>
                    <Link to="/employee/requisitions" className="btn btn-sm btn-danger">Review</Link>
                </Card>
            )}

            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Department Employees" value={stats.totalEmployees ?? 0} icon={FaUsers}
                              tone="#0F6B4F" hint={`${stats.activeEmployees ?? 0} currently active`}
                              to="/employee/department/employees" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Open Requisitions" value={stats.openRequisitions ?? 0} icon={FaClipboardList}
                              tone="#0EA5E9" hint="Not yet finished" to="/employee/requisitions" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Pending with HR" value={stats.pendingRequisitions ?? 0} icon={FaHourglassHalf}
                              tone="#D97706" hint="Awaiting review or approval" to="/employee/requisitions" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Approved" value={stats.approvedRequisitions ?? 0} icon={FaCheckCircle}
                              tone="#16A34A" hint="Cleared for recruitment" to="/employee/recruitment" />
                </div>
            </div>

            <div className="row g-3">
                <div className="col-12 col-lg-7">
                    <Card className="p-3 h-100">
                        <SectionHeader
                            title="Active Recruitment"
                            description="Vacancies created from your approved requisitions that candidates can reach now."
                            action={
                                <Link to="/employee/recruitment" className="btn btn-sm btn-outline-secondary"
                                      style={{ fontSize: '0.78rem' }}>
                                    Full status
                                </Link>
                            }
                        />
                        {(data?.activeVacancies || []).length === 0 ? (
                            <EmptyState
                                icon={FaBriefcase}
                                title="No active recruitment"
                                description="Once HR publishes a vacancy from one of your approved requisitions it appears here."
                                action={
                                    <Link to="/employee/requisitions/new"
                                          className="btn btn-sm btn-primary d-inline-flex align-items-center gap-2">
                                        <FaPlusCircle size={12} /> Request staff
                                    </Link>
                                }
                            />
                        ) : (
                            <div className="table-responsive">
                                <table className="table table-sm align-middle mb-0">
                                    <thead>
                                        <tr style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748B' }}>
                                            <th>Vacancy</th>
                                            <th>Positions</th>
                                            <th>Closes</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.activeVacancies.map(job => (
                                            <tr key={job._id} style={{ fontSize: '0.82rem' }}>
                                                <td className="fw-semibold text-dark">{job.title}</td>
                                                <td>{job.numberOfPositions || 1}</td>
                                                <td>{formatDate(job.applicationDeadline)}</td>
                                                <td><StatusBadge status={job.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="text-muted mt-2" style={{ fontSize: '0.76rem' }}>
                                    {stats.applicationsInProgress ?? 0} candidate
                                    {stats.applicationsInProgress === 1 ? '' : 's'} in progress across these vacancies.
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                <div className="col-12 col-lg-5">
                    <Card className="p-3 h-100">
                        <SectionHeader
                            title="Recently Hired"
                            description="The newest people to join your department."
                        />
                        {(data?.recentHires || []).length === 0 ? (
                            <EmptyState
                                icon={FaUserPlus}
                                title="No recent hires"
                                description="People hired into your department will be listed here."
                            />
                        ) : (
                            <div className="d-flex flex-column gap-2">
                                {data.recentHires.map(employee => (
                                    <div key={employee._id}
                                         className="d-flex align-items-center justify-content-between gap-2 pb-2"
                                         style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div className="fw-semibold text-dark text-truncate" style={{ fontSize: '0.84rem' }}>
                                                {employeeName(employee)}
                                            </div>
                                            <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>
                                                {employee.employmentInfo?.jobTitle || employee.employeeId}
                                            </div>
                                        </div>
                                        <div className="text-muted flex-shrink-0" style={{ fontSize: '0.74rem' }}>
                                            {formatDate(employee.employmentInfo?.hireDate)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            <Card className="p-3 mt-3">
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <div className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>Need more people?</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                            Raise a Job Requisition. HR reviews it, the HR Manager approves it, and HR then creates the vacancy.
                        </div>
                    </div>
                    <Link to="/employee/requisitions/new" className="btn btn-primary btn-sm d-flex align-items-center gap-2">
                        <FaPlusCircle size={12} /> New Job Requisition
                    </Link>
                </div>
            </Card>
        </div>
    );
};

export default DepartmentDashboard;
