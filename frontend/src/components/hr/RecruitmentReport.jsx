import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Form, Table } from 'react-bootstrap';
import {
    FaChartBar, FaUsers, FaRobot, FaUserCheck, FaFileAlt, FaExternalLinkAlt
} from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatCard, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Recruitment report for a single vacancy.
 *
 * This is the reporting module's view of an existing vacancy's applicants - it
 * reads the same Application records the HR Expert works through, via
 * /api/reports/job/:jobId, rather than keeping any figures of its own. Nothing
 * here is illustrative: every count, score and candidate comes from the
 * database, and the endpoint refuses a vacancy belonging to another
 * organization.
 *
 * The detailed, searchable applicant list lives in the Applications screen;
 * this page is the summary that links into it.
 */

/** Pipeline order, matching the Application schema's status enum. */
const PIPELINE = [
    ['applied', 'Applied'],
    ['under_review', 'Under Review'],
    ['ai_analyzed', 'AI Analyzed'],
    ['shortlisted', 'Shortlisted'],
    ['interview_scheduled', 'Interview Scheduled'],
    ['interviewed', 'Interviewed'],
    ['selected', 'Selected'],
    ['offered', 'Offered'],
    ['hired', 'Hired'],
    ['rejected', 'Rejected'],
    ['withdrawn', 'Withdrawn']
];

const TOP_CANDIDATES = 10;

const RecruitmentReport = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const basePath = user?.role === 'hr_manager' ? '/hr-manager' : '/hr-expert';

    const [vacancies, setVacancies] = useState([]);
    const [report, setReport] = useState(null);
    const [loadingVacancies, setLoadingVacancies] = useState(true);
    const [loadingReport, setLoadingReport] = useState(false);
    const [error, setError] = useState(null);

    // Only vacancies that can actually have applicants are worth reporting on.
    const loadVacancies = useCallback(async () => {
        setLoadingVacancies(true);
        try {
            const params = user?.role === 'hr_expert' ? {} : { scope: 'organization' };
            const res = await api.get('/jobs/hr-expert/me', { params });
            setVacancies((res.data.jobs || []).filter(
                job => ['published', 'approved', 'open', 'closed'].includes(job.status)
            ));
        } catch (err) {
            setError(describeApiError(err, 'Unable to load your vacancies.'));
        } finally {
            setLoadingVacancies(false);
        }
    }, [user]);

    useEffect(() => { loadVacancies(); }, [loadVacancies]);

    const loadReport = useCallback(async () => {
        if (!jobId) { setReport(null); return; }
        setLoadingReport(true);
        setError(null);
        try {
            const res = await api.get(`/reports/job/${jobId}`);
            setReport(res.data.data);
        } catch (err) {
            setError(describeApiError(err, 'Unable to load this recruitment report.'));
            setReport(null);
        } finally {
            setLoadingReport(false);
        }
    }, [jobId]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const stats = report?.statistics;
    const breakdown = useMemo(() => report?.statistics?.statusBreakdown || {}, [report]);

    // Only stages this vacancy actually reached are shown, so the pipeline
    // reports what happened rather than listing empty rows for every status.
    const pipelineRows = useMemo(
        () => PIPELINE.filter(([key]) => (breakdown[key] || 0) > 0),
        [breakdown]
    );

    const selector = (
        <Form.Select
            size="sm"
            style={{ maxWidth: 320 }}
            value={jobId || ''}
            onChange={(e) => navigate(e.target.value
                ? `${basePath}/reports/${e.target.value}`
                : `${basePath}/reports`)}
        >
            <option value="">Choose a vacancy…</option>
            {vacancies.map(job => (
                <option key={job._id} value={job._id}>
                    {job.title} — {job.applications?.length || 0} applicant
                    {(job.applications?.length || 0) === 1 ? '' : 's'}
                </option>
            ))}
        </Form.Select>
    );

    if (loadingVacancies) return <LoadingState label="Loading recruitment reports…" />;

    return (
        <div>
            <Card className="p-3 mb-3">
                <SectionHeader
                    title="Recruitment Report"
                    description="Applicant activity for a published vacancy, taken straight from its application records."
                    action={selector}
                />

                {vacancies.length === 0 && (
                    <EmptyState
                        icon={FaChartBar}
                        title="No vacancies to report on yet"
                        description="Once a vacancy is published and starts receiving applications, its recruitment report appears here."
                    />
                )}

                {vacancies.length > 0 && !jobId && (
                    <EmptyState
                        icon={FaChartBar}
                        title="Choose a vacancy"
                        description="Pick a vacancy above to see how its applicants are progressing through the pipeline."
                    />
                )}
            </Card>

            {error && <ErrorState message={error} onRetry={loadReport} />}

            {loadingReport && <LoadingState label="Building the report…" />}

            {!loadingReport && !error && report && (
                <>
                    <Card className="p-3 mb-3">
                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                            <div style={{ minWidth: 0 }}>
                                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                    <h5 className="fw-bold text-dark mb-0">{report.job.title}</h5>
                                    <StatusBadge status={report.job.status} />
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                                    {report.job.department} · {report.job.location}
                                    {report.job.hr_expert?.name && ` · Recruiter: ${report.job.hr_expert.name}`}
                                </div>
                            </div>
                            <Link to={`${basePath}/applications/${report.job.id}`}
                                  className="btn btn-sm btn-primary d-flex align-items-center gap-2">
                                <FaExternalLinkAlt size={11} /> Review applicants
                            </Link>
                        </div>
                    </Card>

                    <div className="row g-3 mb-3">
                        <div className="col-6 col-lg-3">
                            <StatCard label="Total Applicants" value={stats.totalApplications} icon={FaUsers}
                                      hint="Applications received"
                                      to={`${basePath}/applications/${report.job.id}`} />
                        </div>
                        <div className="col-6 col-lg-3">
                            <StatCard label="Average AI Match" value={`${stats.averageMatchScore}%`} icon={FaRobot}
                                      tone="#7C3AED" hint="Across scored applications" />
                        </div>
                        <div className="col-6 col-lg-3">
                            <StatCard label="Shortlist Rate" value={`${stats.shortlistRate}%`} icon={FaUserCheck}
                                      tone="#0891B2" hint={`${breakdown.shortlisted || 0} currently shortlisted`} />
                        </div>
                        <div className="col-6 col-lg-3">
                            <StatCard label="Hired" value={breakdown.hired || 0} icon={FaFileAlt}
                                      tone="#16A34A" hint="Completed hires" />
                        </div>
                    </div>

                    <div className="row g-3">
                        <div className="col-12 col-lg-5">
                            <Card className="p-3 h-100">
                                <SectionHeader
                                    title="Pipeline"
                                    description="Where this vacancy's applicants currently stand"
                                />
                                {pipelineRows.length === 0 ? (
                                    <EmptyState
                                        icon={FaUsers}
                                        title="No applications yet"
                                        description="Nobody has applied to this vacancy so far."
                                    />
                                ) : (
                                    <div className="d-flex flex-column gap-2">
                                        {pipelineRows.map(([key, label]) => {
                                            const count = breakdown[key] || 0;
                                            const percent = stats.totalApplications > 0
                                                ? Math.round((count / stats.totalApplications) * 100)
                                                : 0;
                                            return (
                                                <div key={key}>
                                                    <div className="d-flex justify-content-between align-items-center"
                                                         style={{ fontSize: '0.78rem' }}>
                                                        <span className="text-dark">{label}</span>
                                                        <span className="text-muted">
                                                            <span className="fw-semibold text-dark">{count}</span> · {percent}%
                                                        </span>
                                                    </div>
                                                    <div style={{ height: 6, background: '#F1F5F9', borderRadius: 999 }}>
                                                        <div style={{
                                                            width: `${percent}%`, height: '100%',
                                                            background: '#0F6B4F', borderRadius: 999
                                                        }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </Card>
                        </div>

                        <div className="col-12 col-lg-7">
                            <Card className="p-3 h-100">
                                <SectionHeader
                                    title="Top candidates by AI match"
                                    description="Ranked by match score. AI is decision support - the hiring decision stays with an authorised HR user."
                                    action={report.applications.length > TOP_CANDIDATES && (
                                        <Link to={`${basePath}/applications/${report.job.id}`}
                                              className="btn btn-sm btn-outline-secondary">
                                            View all {report.applications.length}
                                        </Link>
                                    )}
                                />
                                {report.applications.length === 0 ? (
                                    <EmptyState
                                        icon={FaUsers}
                                        title="No applicants yet"
                                        description="Candidates appear here as soon as they apply."
                                    />
                                ) : (
                                    <div className="table-responsive">
                                        <Table hover className="mb-0 align-middle">
                                            <thead>
                                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                                    <th className="fw-semibold">Candidate</th>
                                                    <th className="fw-semibold">Match</th>
                                                    <th className="fw-semibold">Status</th>
                                                    <th className="fw-semibold">Applied</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {report.applications.slice(0, TOP_CANDIDATES).map(item => (
                                                    <tr key={item.id}>
                                                        <td>
                                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                                {item.applicant?.name || 'Unknown candidate'}
                                                            </div>
                                                            <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                                {item.applicant?.profile?.location || item.applicant?.email || ''}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {typeof item.matchScore === 'number' ? (
                                                                <Badge bg={item.matchScore >= 80 ? 'success'
                                                                    : item.matchScore >= 60 ? 'warning' : 'secondary'}>
                                                                    {item.matchScore}%
                                                                </Badge>
                                                            ) : <span className="text-muted">—</span>}
                                                        </td>
                                                        <td><StatusBadge status={item.status} /></td>
                                                        <td className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                            {new Date(item.appliedDate).toLocaleDateString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                    </div>
                                )}
                            </Card>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default RecruitmentReport;
