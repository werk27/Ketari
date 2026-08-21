import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Form, Modal } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes, FaArrowLeft } from 'react-icons/fa';
import api from '../../services/api';
import { Card, SectionHeader, StatusBadge, LoadingState, ErrorState } from '../workspace/ui';

const Detail = ({ label, value }) => (
    <div className="mb-2">
        <div className="text-uppercase text-muted" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
            {label}
        </div>
        <div className="text-dark" style={{ fontSize: '0.86rem' }}>{value || '—'}</div>
    </div>
);

const Tags = ({ items, tone = '#EEF2FF', color = '#3730A3' }) => (
    <div className="d-flex flex-wrap gap-1">
        {(items && items.length > 0)
            ? items.map(item => (
                <span key={item} style={{ background: tone, color, fontSize: '0.72rem', padding: '2px 9px', borderRadius: 999 }}>
                    {item}
                </span>
            ))
            : <span className="text-muted" style={{ fontSize: '0.82rem' }}>—</span>}
    </div>
);

/**
 * Full vacancy review for the HR Manager.
 *
 * The manager inspects everything the HR Expert submitted before authorising it.
 * Rejection always carries written feedback so the expert can correct and resubmit.
 */
const VacancyReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [job, setJob] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showReject, setShowReject] = useState(false);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/jobs/${id}`);
            setJob(res.data.job);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load this vacancy.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const approve = async () => {
        setBusy(true);
        try {
            await api.put(`/jobs/${id}/approve`);
            toast.success('Vacancy approved and published');
            navigate('/hr-manager/vacancy-approvals');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed');
        } finally {
            setBusy(false);
        }
    };

    const reject = async () => {
        if (!reason.trim()) return;
        setBusy(true);
        try {
            await api.put(`/jobs/${id}/reject`, { reason: reason.trim() });
            toast.success('Vacancy returned to the HR Expert with feedback');
            navigate('/hr-manager/vacancy-approvals');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rejection failed');
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <LoadingState label="Loading vacancy…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!job) return null;

    const pending = job.status === 'pending_approval';
    const salary = job.salary?.min || job.salary?.max
        ? `${job.salary.min || 0} – ${job.salary.max || 0} ${job.salary.currency || ''}`
        : null;

    return (
        <div>
            <Link to="/hr-manager/vacancy-approvals"
                  className="text-decoration-none text-muted d-inline-flex align-items-center gap-2 mb-3"
                  style={{ fontSize: '0.82rem' }}>
                <FaArrowLeft size={11} /> Back to approvals
            </Link>

            <Card className="p-3 mb-3">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                    <div style={{ minWidth: 0 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <h5 className="fw-bold text-dark mb-0">{job.title}</h5>
                            <StatusBadge status={job.status} />
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                            Submitted by {job.hr_expert?.name || 'HR Expert'}
                            {job.submittedAt && ` on ${new Date(job.submittedAt).toLocaleDateString()}`}
                        </div>
                    </div>
                    {pending && (
                        <div className="d-flex gap-2">
                            <Button variant="success" disabled={busy} onClick={approve}
                                    className="d-flex align-items-center gap-2">
                                <FaCheck size={12} /> Approve &amp; Publish
                            </Button>
                            <Button variant="outline-danger" disabled={busy} onClick={() => setShowReject(true)}
                                    className="d-flex align-items-center gap-2">
                                <FaTimes size={12} /> Reject
                            </Button>
                        </div>
                    )}
                </div>

                {job.status === 'rejected' && job.rejectionReason && (
                    <div className="mt-3 p-2 rounded" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                        <div className="fw-semibold text-danger" style={{ fontSize: '0.8rem' }}>Returned for correction</div>
                        <div className="text-dark" style={{ fontSize: '0.82rem' }}>{job.rejectionReason}</div>
                    </div>
                )}
            </Card>

            <div className="row g-3">
                <div className="col-12 col-lg-7">
                    <Card className="p-3 mb-3">
                        <SectionHeader title="Job Description" />
                        <p className="text-dark" style={{ fontSize: '0.86rem', whiteSpace: 'pre-line' }}>{job.description}</p>

                        {job.responsibilities?.length > 0 && (
                            <>
                                <div className="fw-semibold text-dark mt-3 mb-1" style={{ fontSize: '0.86rem' }}>
                                    Responsibilities
                                </div>
                                <ul className="ps-3 text-dark mb-0" style={{ fontSize: '0.84rem' }}>
                                    {job.responsibilities.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </>
                        )}
                    </Card>

                    <Card className="p-3">
                        <SectionHeader title="Requirements" description="Used by the AI matching engine to rank candidates" />
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1"
                                 style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Required skills
                            </div>
                            <Tags items={job.requirements?.skills} />
                        </div>
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1"
                                 style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Preferred skills
                            </div>
                            <Tags items={job.requirements?.preferredSkills} tone="#F0FDF4" color="#166534" />
                        </div>
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1"
                                 style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Languages
                            </div>
                            <Tags items={job.requirements?.languages} tone="#F1F5F9" color="#475569" />
                        </div>
                        <div className="row">
                            <div className="col-6">
                                <Detail label="Education" value={job.requirements?.education} />
                            </div>
                            <div className="col-6">
                                <Detail label="Experience" value={job.requirements?.experience} />
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="col-12 col-lg-5">
                    <Card className="p-3">
                        <SectionHeader title="Vacancy Details" />
                        <Detail label="Department" value={job.department} />
                        <Detail label="Position" value={job.position} />
                        <Detail label="Location" value={job.location} />
                        <Detail label="Employment type" value={job.employmentType} />
                        <Detail label="Work mode" value={job.workMode} />
                        <Detail label="Openings" value={job.numberOfPositions} />
                        <Detail label="Salary range" value={salary} />
                        <Detail label="Application deadline"
                                value={job.applicationDeadline
                                    ? new Date(job.applicationDeadline).toLocaleDateString()
                                    : null} />
                    </Card>

                    {job.statusHistory?.length > 0 && (
                        <Card className="p-3 mt-3">
                            <SectionHeader title="Audit Trail" />
                            <div className="d-flex flex-column gap-2">
                                {[...job.statusHistory].reverse().map((entry, i) => (
                                    <div key={i} className="d-flex justify-content-between align-items-start gap-2">
                                        <div style={{ minWidth: 0 }}>
                                            <StatusBadge status={entry.status} />
                                            {entry.note && (
                                                <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>{entry.note}</div>
                                            )}
                                        </div>
                                        <div className="text-muted flex-shrink-0" style={{ fontSize: '0.72rem' }}>
                                            {entry.changedAt ? new Date(entry.changedAt).toLocaleDateString() : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <Modal show={showReject} onHide={() => setShowReject(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Return vacancy for correction</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain what must be corrected. The vacancy returns to the HR Expert as a draft.
                    </p>
                    <Form.Control as="textarea" rows={4} value={reason}
                                  onChange={e => setReason(e.target.value)}
                                  placeholder="e.g. Add the minimum experience and narrow the required skills." />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setShowReject(false)}>Cancel</Button>
                    <Button variant="danger" onClick={reject} disabled={busy || !reason.trim()}>
                        Return with feedback
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default VacancyReview;
