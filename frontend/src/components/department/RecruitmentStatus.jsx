import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaClipboardCheck, FaCheck, FaTimes, FaCircle, FaPlusCircle } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Recruitment Status - what happened after a requisition was approved.
 *
 * A monitoring view only. It reads the requisition, the vacancy created from
 * it and that vacancy's applications, and shows how far the request has
 * travelled. There are no HR Expert or HR Manager controls here: a Department
 * Head watches recruitment, they do not run it.
 */
const STAGE_COLORS = {
    done: { dot: '#16A34A', text: '#166534' },
    current: { dot: '#D97706', text: '#92400E' },
    rejected: { dot: '#DC2626', text: '#991B1B' },
    pending: { dot: '#CBD5E1', text: '#94A3B8' }
};

const StageIcon = ({ state }) => {
    if (state === 'done') return <FaCheck size={9} color="#FFFFFF" />;
    if (state === 'rejected') return <FaTimes size={9} color="#FFFFFF" />;
    return <FaCircle size={6} color="#FFFFFF" />;
};

/** One horizontal, wrapping progress track for a single requisition. */
const ProgressTrack = ({ stages }) => (
    <div className="d-flex flex-wrap align-items-center gap-1 mt-3">
        {stages.map((stage, index) => {
            const tone = STAGE_COLORS[stage.state] || STAGE_COLORS.pending;
            return (
                <React.Fragment key={stage.key}>
                    <div className="d-flex align-items-center gap-2 pe-1">
                        <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                              style={{ width: 18, height: 18, background: tone.dot }}>
                            <StageIcon state={stage.state} />
                        </span>
                        <span style={{ fontSize: '0.76rem', color: tone.text, fontWeight: stage.state === 'pending' ? 400 : 600 }}>
                            {stage.label}
                        </span>
                    </div>
                    {index < stages.length - 1 && (
                        <span style={{ width: 14, height: 2, background: '#E2E8F0', display: 'inline-block' }} />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);

const RecruitmentStatus = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/departments/mine/recruitment');
            setItems(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load recruitment status.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return <LoadingState label="Loading recruitment status…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <Card className="p-3">
            <SectionHeader
                title="Recruitment Status"
                description="How far each of your staffing requests has travelled, from submission through to hiring."
                action={
                    <Link to="/employee/requisitions/new" className="btn btn-sm btn-primary d-flex align-items-center gap-2"
                          style={{ fontSize: '0.78rem' }}>
                        <FaPlusCircle size={12} /> New Requisition
                    </Link>
                }
            />

            {items.length === 0 ? (
                <EmptyState
                    icon={FaClipboardCheck}
                    title="Nothing in recruitment yet"
                    description="Submit a Job Requisition and its progress through HR review, approval and hiring appears here."
                />
            ) : (
                <div className="d-flex flex-column gap-3">
                    {items.map(item => (
                        <div key={item._id} className="pb-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                <div style={{ minWidth: 0 }}>
                                    <div className="fw-bold text-dark" style={{ fontSize: '0.92rem' }}>
                                        {item.positionTitle}
                                        <span className="text-muted fw-normal" style={{ fontSize: '0.82rem' }}>
                                            {' '}— {item.numberOfPositions} position{item.numberOfPositions === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                                        {item.departmentName} · raised {new Date(item.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <div className="d-flex align-items-center gap-2">
                                    <StatusBadge status={item.status} />
                                    <Link to={`/employee/requisitions/${item._id}`}
                                          className="btn btn-sm btn-outline-secondary" style={{ fontSize: '0.76rem' }}>
                                        Details
                                    </Link>
                                </div>
                            </div>

                            <ProgressTrack stages={item.progress} />

                            {item.job && (
                                <div className="d-flex flex-wrap gap-3 mt-3 text-muted" style={{ fontSize: '0.78rem' }}>
                                    <span>Vacancy: <span className="text-dark fw-semibold">{item.job.title}</span></span>
                                    <span>{item.applications.total} applicant{item.applications.total === 1 ? '' : 's'}</span>
                                    <span>{item.applications.shortlisted} shortlisted</span>
                                    <span>{item.applications.interviewing} at interview</span>
                                    <span>{item.applications.hired} hired</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

export default RecruitmentStatus;
