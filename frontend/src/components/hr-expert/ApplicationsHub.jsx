import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFileAlt, FaUsers } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Applications hub.
 *
 * Applications always belong to a vacancy, so this lists the organization's
 * vacancies with their application volume and links into each one.
 */
const ApplicationsHub = () => {
    const { user } = useAuth();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const basePath = user?.role === 'hr_manager' ? '/hr-manager' : '/hr-expert';

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = user?.role === 'hr_expert' ? {} : { scope: 'organization' };
            const res = await api.get('/jobs/hr-expert/me', { params });
            const withApplications = (res.data.jobs || [])
                .filter(job => ['published', 'approved', 'open', 'closed'].includes(job.status))
                .sort((a, b) => (b.applications?.length || 0) - (a.applications?.length || 0));
            setJobs(withApplications);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load applications.');
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <LoadingState label="Loading applications…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const total = jobs.reduce((sum, job) => sum + (job.applications?.length || 0), 0);

    return (
        <Card className="p-3">
            <SectionHeader
                title="Applications"
                description={`${total} application${total === 1 ? '' : 's'} across your published vacancies`}
            />

            {jobs.length === 0 ? (
                <EmptyState
                    icon={FaFileAlt}
                    title="No published vacancies yet"
                    description="Applications appear here once a vacancy is approved and published."
                />
            ) : (
                <div className="d-flex flex-column gap-2">
                    {jobs.map(job => {
                        const count = job.applications?.length || 0;
                        return (
                            <Link key={job._id} to={`${basePath}/applications/${job._id}`}
                                  className="text-decoration-none">
                                <div className="d-flex justify-content-between align-items-center p-3 rounded"
                                     style={{ border: '1px solid #E2E8F0' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="d-flex align-items-center gap-2 flex-wrap">
                                            <span className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>
                                                {job.title}
                                            </span>
                                            <StatusBadge status={job.status} />
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                                            {job.department} · {job.location}
                                        </div>
                                    </div>
                                    <div className="d-flex align-items-center gap-2 flex-shrink-0 text-dark">
                                        <FaUsers size={13} className="text-muted" />
                                        <span className="fw-bold" style={{ fontSize: '1.05rem' }}>{count}</span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};

export default ApplicationsHub;
