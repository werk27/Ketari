import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import {
    FaClipboardCheck, FaBriefcase, FaFileAlt, FaUserFriends, FaCheck, FaTimes
} from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, StatCard, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * HR Manager dashboard.
 *
 * Supervisory workspace: review and approve work submitted by HR Experts.
 * The manager never creates vacancies here - that is the HR Expert's role.
 */
const HRManagerDashboard = () => {
    const [pending, setPending] = useState([]);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [reviewTarget, setReviewTarget] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [pendingRes, overviewRes] = await Promise.all([
                api.get('/jobs/pending-approval'),
                api.get('/employers/me/overview').catch(() => null)
            ]);
            setPending(pendingRes.data.jobs || []);
            setOverview(overviewRes ? overviewRes.data.statistics : null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load the approval workspace.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const approve = async (job) => {
        setSubmitting(true);
        try {
            await api.put(`/jobs/${job._id}/approve`);
            toast.success(`"${job.title}" approved and published`);
            setPending(prev => prev.filter(item => item._id !== job._id));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed');
        } finally {
            setSubmitting(false);
        }
    };

    const reject = async () => {
        if (!rejectReason.trim()) {
            toast.error('Please provide feedback so the HR Expert can correct the vacancy');
            return;
        }
        setSubmitting(true);
        try {
            await api.put(`/jobs/${reviewTarget._id}/reject`, { reason: rejectReason.trim() });
            toast.success('Vacancy returned to the HR Expert with feedback');
            setPending(prev => prev.filter(item => item._id !== reviewTarget._id));
            setReviewTarget(null);
            setRejectReason('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rejection failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <LoadingState label="Loading approvals…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const vacancies = overview?.vacancies;
    const applications = overview?.applications;

    return (
        <div>
            <div className="mb-3">
                <h5 className="fw-bold text-dark mb-1">Review &amp; Approval</h5>
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                    Supervise recruitment activity and authorise vacancies and hiring decisions.
                </div>
            </div>

            <div className="row g-3 mb-4">
                <div className="col-6 col-lg-3">
                    <StatCard label="Pending Approvals" value={pending.length} icon={FaClipboardCheck} tone="#D97706"
                              hint="Vacancies awaiting your review" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Active Vacancies" value={vacancies?.active ?? 0} icon={FaBriefcase}
                              hint="Currently published" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Shortlisted" value={applications?.shortlisted ?? 0} icon={FaUserFriends} tone="#0891B2"
                              hint="Awaiting your decision" to="/hr-manager/shortlists" />
                </div>
                <div className="col-6 col-lg-3">
                    <StatCard label="Total Applications" value={applications?.total ?? 0} icon={FaFileAlt} tone="#0EA5E9"
                              hint="Across the organization" to="/hr-manager/applications" />
                </div>
            </div>

            <Card className="p-3">
                <SectionHeader
                    title="Pending Vacancy Approvals"
                    description="Submitted by HR Experts in your organization"
                />
                {pending.length === 0 ? (
                    <EmptyState
                        icon={FaClipboardCheck}
                        title="No vacancies awaiting approval"
                        description="When an HR Expert submits a vacancy, it will appear here for your review."
                    />
                ) : (
                    <div className="d-flex flex-column gap-2">
                        {pending.map(job => (
                            <div key={job._id} className="p-3 rounded" style={{ border: '1px solid #E2E8F0' }}>
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                            <span className="fw-bold text-dark" style={{ fontSize: '0.92rem' }}>{job.title}</span>
                                            <StatusBadge status={job.status} />
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            {job.department} · {job.location} · {job.employmentType}
                                            {job.workMode ? ` · ${job.workMode}` : ''}
                                        </div>
                                        <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                                            Submitted by <span className="fw-semibold">
                                                {job.submittedBy?.name || job.hr_expert?.name || 'HR Expert'}
                                            </span>
                                            {job.submittedAt && ` on ${new Date(job.submittedAt).toLocaleDateString()}`}
                                        </div>
                                    </div>
                                    <div className="d-flex gap-2 flex-shrink-0">
                                        <Link to={`/hr-manager/vacancy-approvals/${job._id}`}
                                              className="btn btn-sm btn-outline-secondary">
                                            View
                                        </Link>
                                        <Button size="sm" variant="success" disabled={submitting}
                                                className="d-flex align-items-center gap-1"
                                                onClick={() => approve(job)}>
                                            <FaCheck size={11} /> Approve
                                        </Button>
                                        <Button size="sm" variant="outline-danger" disabled={submitting}
                                                className="d-flex align-items-center gap-1"
                                                onClick={() => { setReviewTarget(job); setRejectReason(''); }}>
                                            <FaTimes size={11} /> Reject
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Modal show={!!reviewTarget} onHide={() => setReviewTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Return vacancy for correction</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain what the HR Expert must correct in
                        {' '}<span className="fw-semibold text-dark">{reviewTarget?.title}</span>.
                        The vacancy returns to them as a draft with your feedback.
                    </p>
                    <Form.Control
                        as="textarea"
                        rows={4}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="e.g. The required skills are too broad and the experience requirement is missing."
                    />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setReviewTarget(null)}>Cancel</Button>
                    <Button variant="danger" onClick={reject} disabled={submitting || !rejectReason.trim()}>
                        Return with feedback
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default HRManagerDashboard;
