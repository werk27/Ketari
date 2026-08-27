import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Form, Modal } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes, FaUserCheck, FaIdBadge } from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';
import { Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState, MatchScore } from '../workspace/ui';
import CandidateProfileModal from '../workspace/CandidateProfileModal';

/**
 * HR Manager decision queue.
 *
 * The HR Expert screens, shortlists and interviews; the authorised hiring
 * decision belongs to the HR Manager alone. This is the screen that calls
 * PUT /applications/:id/decision - previously nothing in the UI did, so a
 * candidate could never actually be marked hired.
 *
 * Approving with the "Hire" outcome is also what triggers the recruitment ->
 * employee bridge on the server, creating the employee record for onboarding.
 */

// Outcomes the manager may authorise, in escalating order of commitment.
const APPROVE_OPTIONS = [
    { status: 'selected', label: 'Select', hint: 'Candidate chosen, offer not sent yet.' },
    { status: 'offered', label: 'Send Offer', hint: 'Formal offer extended to the candidate.' },
    { status: 'hired', label: 'Hire', hint: 'Confirms the hire and starts employee onboarding.' }
];

const ShortlistReview = () => {
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [target, setTarget] = useState(null);
    const [mode, setMode] = useState('approve');
    const [approveStatus, setApproveStatus] = useState('hired');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [profileApp, setProfileApp] = useState(null);
    const [showProfileModal, setShowProfileModal] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/applications/pending-decision');
            setApplications(res.data.applications || []);
        } catch (err) {
            setError(describeApiError(err, 'Unable to load the decision queue.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openDecision = (application, nextMode) => {
        setTarget(application);
        setMode(nextMode);
        setApproveStatus('hired');
        setReason('');
    };
    const closeDecision = () => {
        setTarget(null);
        setReason('');
    };

    const openProfile = (application) => {
        setProfileApp(application);
        setShowProfileModal(true);
    };

    const submit = async () => {
        if (mode === 'reject' && !reason.trim()) return;
        setBusy(true);
        try {
            const res = await api.put(`/applications/${target._id}/decision`, {
                outcome: mode === 'approve' ? 'approved' : 'rejected',
                status: mode === 'approve' ? approveStatus : undefined,
                reason: reason.trim()
            });

            const onboarding = res.data.onboarding;
            if (onboarding?.error) {
                // The decision is saved even when onboarding fails, so say so
                // plainly rather than letting it look like the hire was lost.
                toast.warning(`Hire recorded, but onboarding could not start: ${onboarding.error}`);
            } else if (onboarding?.employeeId) {
                toast.success(`Hired. Employee ${onboarding.employeeId} created and invited to onboarding.`);
            } else {
                toast.success(res.data.message || 'Decision recorded');
            }

            closeDecision();
            load();
        } catch (err) {
            toast.error(describeApiError(err, 'Could not record the decision'));
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <LoadingState label="Loading decision queue…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <SectionHeader
                title="Hiring Decisions"
                description="Candidates the HR Expert has processed. The final recruitment decision is yours."
            />

            {applications.length === 0 ? (
                <EmptyState
                    icon={FaUserCheck}
                    title="No candidates awaiting a decision"
                    description="Shortlisted and interviewed candidates will appear here once an HR Expert forwards them."
                />
            ) : (
                <div className="d-flex flex-column gap-2">
                    {applications.map(app => (
                        <Card key={app._id} className="p-3">
                            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                                <div style={{ minWidth: 0 }}>
                                    <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                        <h6 className="fw-bold text-dark mb-0">{app.applicant?.name || 'Unknown candidate'}</h6>
                                        <StatusBadge status={app.status} />
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                                        {app.job?.title || 'Unknown vacancy'}
                                        {app.job?.department ? ` • ${app.job.department}` : ''}
                                        {app.applicant?.email ? ` • ${app.applicant.email}` : ''}
                                    </div>
                                    <div className="text-muted mt-1" style={{ fontSize: '0.76rem' }}>
                                        {app.shortlistedBy?.name
                                            ? `Shortlisted by ${app.shortlistedBy.name}`
                                            : 'Not yet shortlisted by an HR Expert'}
                                        {app.shortlistedAt ? ` on ${new Date(app.shortlistedAt).toLocaleDateString()}` : ''}
                                    </div>
                                    {app.onboardingFailed && (
                                        // The hire was recorded but the employee record was not
                                        // created. Approving again retries it safely.
                                        <div className="text-danger mt-1" style={{ fontSize: '0.76rem' }}>
                                            Hired, but the employee record was not created. Approve again to retry onboarding.
                                        </div>
                                    )}
                                </div>

                                <div className="d-flex align-items-center gap-3 flex-wrap">
                                    {typeof app.matchScore === 'number' && (
                                        <MatchScore score={app.matchScore} details={app.matchDetails} compact />
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline-primary"
                                        onClick={() => openProfile(app)}
                                        title="View full profile, AI analysis, screening and interview details"
                                    >
                                        <FaIdBadge className="me-1" /> View Candidate
                                    </Button>
                                    {app.job?._id && (
                                        <Link to={`/hr-manager/applications/${app.job._id}`}
                                              className="text-decoration-none"
                                              style={{ fontSize: '0.82rem' }}>
                                            View applicants
                                        </Link>
                                    )}
                                    {app.canDecide ? (
                                        <div className="d-flex gap-2">
                                            <Button size="sm" variant="success" onClick={() => openDecision(app, 'approve')}>
                                                <FaCheck className="me-1" /> Approve
                                            </Button>
                                            <Button size="sm" variant="outline-danger" onClick={() => openDecision(app, 'reject')}>
                                                <FaTimes className="me-1" /> Reject
                                            </Button>
                                        </div>
                                    ) : (
                                        // Separation of duties: whoever shortlisted a candidate
                                        // cannot also authorise the hire.
                                        <span className="text-muted" style={{ fontSize: '0.78rem' }}>
                                            You shortlisted this candidate — another manager must decide.
                                        </span>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal show={!!target} onHide={closeDecision} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        {mode === 'approve' ? 'Approve candidate' : 'Reject candidate'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.86rem' }}>
                        {target?.applicant?.name} — {target?.job?.title}
                    </p>

                    {mode === 'approve' && (
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold" style={{ fontSize: '0.86rem' }}>Outcome</Form.Label>
                            {APPROVE_OPTIONS.map(option => (
                                <Form.Check
                                    key={option.status}
                                    type="radio"
                                    name="approveStatus"
                                    id={`approve-${option.status}`}
                                    checked={approveStatus === option.status}
                                    onChange={() => setApproveStatus(option.status)}
                                    label={
                                        <span>
                                            <span className="fw-semibold">{option.label}</span>
                                            <span className="text-muted d-block" style={{ fontSize: '0.76rem' }}>
                                                {option.hint}
                                            </span>
                                        </span>
                                    }
                                />
                            ))}
                        </Form.Group>
                    )}

                    <Form.Group>
                        <Form.Label className="fw-semibold" style={{ fontSize: '0.86rem' }}>
                            {mode === 'approve' ? 'Note (optional)' : 'Reason'}
                            {mode === 'reject' && <span className="text-danger"> *</span>}
                        </Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={3}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={mode === 'approve'
                                ? 'Recorded on the application for audit purposes.'
                                : 'Explain why this candidate was not successful.'}
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={closeDecision} disabled={busy}>Cancel</Button>
                    <Button
                        variant={mode === 'approve' ? 'success' : 'danger'}
                        onClick={submit}
                        disabled={busy || (mode === 'reject' && !reason.trim())}
                    >
                        {busy ? 'Saving…' : (mode === 'approve' ? 'Confirm decision' : 'Reject candidate')}
                    </Button>
                </Modal.Footer>
            </Modal>

            <CandidateProfileModal
                show={showProfileModal}
                onHide={() => setShowProfileModal(false)}
                application={profileApp}
            />
        </div>
    );
};

export default ShortlistReview;
