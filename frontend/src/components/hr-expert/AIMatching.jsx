import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaRobot, FaBriefcase, FaInfoCircle } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, LoadingState, EmptyState, ErrorState, MatchScore
} from '../workspace/ui';

/**
 * Explainable AI matching.
 *
 * Shows the score breakdown and the reasons behind each recommendation so the
 * recruiter can judge it. The AI ranks and explains; it never decides.
 */
const AIMatching = () => {
    const { jobId } = useParams();
    const [jobs, setJobs] = useState([]);
    const [selected, setSelected] = useState(jobId || '');
    const [result, setResult] = useState(null);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadJobs = async () => {
            try {
                const res = await api.get('/jobs/hr-expert/me');
                const live = (res.data.jobs || []).filter(job =>
                    ['published', 'approved', 'open'].includes(job.status));
                setJobs(live);
                if (!jobId && live.length > 0) setSelected(live[0]._id);
            } catch (err) {
                setError(err.response?.data?.message || 'Unable to load vacancies.');
            } finally {
                setLoadingJobs(false);
            }
        };
        loadJobs();
    }, [jobId]);

    const runMatching = useCallback(async (targetId) => {
        if (!targetId) return;
        setLoadingMatches(true);
        setError(null);
        try {
            const res = await api.get(`/jobs/${targetId}/matches`, { params: { limit: 20 } });
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to run AI matching.');
        } finally {
            setLoadingMatches(false);
        }
    }, []);

    useEffect(() => {
        if (selected) runMatching(selected);
    }, [selected, runMatching]);

    if (loadingJobs) return <LoadingState label="Loading vacancies…" />;

    if (jobs.length === 0) {
        return (
            <Card className="p-3">
                <EmptyState
                    icon={FaBriefcase}
                    title="No published vacancies to match against"
                    description="AI matching compares candidates to a published vacancy. Publish a vacancy first."
                    action={<Link to="/hr-expert/vacancies" className="btn btn-sm btn-primary">Go to vacancies</Link>}
                />
            </Card>
        );
    }

    const candidates = result?.candidates || [];

    return (
        <div>
            <Card className="p-3 mb-3">
                <SectionHeader
                    title="AI Candidate Matching"
                    description="Ranked candidates who have not yet applied to the selected vacancy."
                />
                <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-8">
                        <label className="form-label text-muted" style={{ fontSize: '0.78rem' }}>Vacancy</label>
                        <select className="form-select" value={selected} onChange={e => setSelected(e.target.value)}>
                            {jobs.map(job => (
                                <option key={job._id} value={job._id}>
                                    {job.title} — {job.department}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="col-12 col-md-4">
                        <button className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
                                onClick={() => runMatching(selected)} disabled={loadingMatches}>
                            <FaRobot size={13} /> {loadingMatches ? 'Analyzing…' : 'Run AI matching'}
                        </button>
                    </div>
                </div>
                {result?.disclaimer && (
                    <div className="d-flex align-items-start gap-2 mt-3 p-2 rounded"
                         style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                        <FaInfoCircle className="text-primary flex-shrink-0 mt-1" size={13} />
                        <div className="text-dark" style={{ fontSize: '0.78rem' }}>{result.disclaimer}</div>
                    </div>
                )}
            </Card>

            {error && <ErrorState message={error} onRetry={() => runMatching(selected)} />}

            {loadingMatches && <LoadingState label="Running AI analysis…" />}

            {!loadingMatches && !error && candidates.length === 0 && (
                <Card className="p-3">
                    <EmptyState
                        icon={FaRobot}
                        title="No matching candidates found"
                        description="Every suitable candidate may already have applied, or no candidate profiles match this vacancy's requirements yet."
                    />
                </Card>
            )}

            {!loadingMatches && candidates.length > 0 && (
                <div className="row g-3">
                    {candidates.map(match => (
                        <div className="col-12 col-lg-6" key={match.candidate.id}>
                            <Card className="p-3 h-100">
                                <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
                                    <div style={{ minWidth: 0 }}>
                                        <div className="fw-bold text-dark" style={{ fontSize: '0.95rem' }}>
                                            {match.candidate.name}
                                        </div>
                                        <div className="text-muted text-truncate" style={{ fontSize: '0.78rem' }}>
                                            {match.candidate.email}
                                        </div>
                                    </div>
                                </div>

                                <MatchScore score={match.matchScore} details={match.matchDetails} />

                                {match.matchDetails?.reasons?.length > 0 && (
                                    <div className="mt-3">
                                        <div className="fw-semibold text-dark mb-1" style={{ fontSize: '0.8rem' }}>
                                            Why is this candidate recommended?
                                        </div>
                                        <ul className="mb-0 ps-3 text-muted" style={{ fontSize: '0.77rem' }}>
                                            {match.matchDetails.reasons.map((reason, index) => (
                                                <li key={index}>{reason}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {match.matchDetails?.missingSkills?.length > 0 && (
                                    <div className="mt-3">
                                        <div className="fw-semibold text-dark mb-1" style={{ fontSize: '0.8rem' }}>
                                            Skill gap
                                        </div>
                                        <div className="d-flex flex-wrap gap-1">
                                            {match.matchDetails.missingSkills.map(skill => (
                                                <span key={skill} style={{
                                                    background: '#FEE2E2', color: '#991B1B', fontSize: '0.7rem',
                                                    padding: '2px 8px', borderRadius: 999
                                                }}>{skill}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AIMatching;
