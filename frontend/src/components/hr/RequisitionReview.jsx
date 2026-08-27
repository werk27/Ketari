import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Form, Modal } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes, FaArrowLeft, FaPaperPlane, FaPlusCircle, FaUndo } from 'react-icons/fa';
import api, { formatSalary } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
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

const ROLE_HOME = { employer: 'employer', hr_expert: 'hr-expert', hr_manager: 'hr-manager', employee: 'employee' };

/**
 * Full requisition review.
 *
 * HR Expert reviews a submitted requisition (return it or forward it for
 * approval); HR Manager decides on one pending approval; once approved, HR
 * Expert can create the vacancy from it. Every action is recorded on the
 * audit trail shown at the bottom.
 */
const RequisitionReview = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, can } = useAuth();
    const homePrefix = ROLE_HOME[user?.role] || 'hr-expert';

    const [requisition, setRequisition] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const [showReturn, setShowReturn] = useState(false);
    const [returnNote, setReturnNote] = useState('');
    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [clarification, setClarification] = useState('');

    const canProcess = can('requisition:process');
    const canApprove = can('requisition:approve');

    // Answering a clarification is the requester's own action - typically the
    // Department Head who raised it - and is separate from HR's review powers.
    const isRequester = !!requisition
        && String(requisition.requestedBy?._id || requisition.requestedBy) === String(user?.id);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/requisitions/${id}`);
            setRequisition(res.data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load this requisition.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const returnToRequester = async () => {
        if (!returnNote.trim()) return;
        setBusy(true);
        try {
            await api.put(`/requisitions/${id}/return`, { note: returnNote.trim() });
            toast.success('Requisition returned to the requester');
            setShowReturn(false);
            navigate(`/${homePrefix}/requisitions`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not return this requisition');
        } finally {
            setBusy(false);
        }
    };

    const respondToClarification = async () => {
        if (!clarification.trim()) return;
        setBusy(true);
        try {
            const res = await api.put(`/requisitions/${id}/clarify`, { response: clarification.trim() });
            toast.success('Your response was sent back to HR for review');
            setClarification('');
            setRequisition(prev => ({ ...prev, ...res.data.data }));
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send your response');
        } finally {
            setBusy(false);
        }
    };

    const prepare = async () => {        setBusy(true);
        try {
            await api.put(`/requisitions/${id}/prepare`);
            toast.success('Requisition forwarded for HR Manager approval');
            navigate(`/${homePrefix}/requisitions`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not forward this requisition');
        } finally {
            setBusy(false);
        }
    };

    const approve = async () => {
        setBusy(true);
        try {
            await api.put(`/requisitions/${id}/decision`, { outcome: 'approved' });
            toast.success('Requisition approved');
            navigate(`/${homePrefix}/requisitions`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Approval failed');
        } finally {
            setBusy(false);
        }
    };

    const reject = async () => {
        if (!rejectReason.trim()) return;
        setBusy(true);
        try {
            await api.put(`/requisitions/${id}/decision`, { outcome: 'rejected', reason: rejectReason.trim() });
            toast.success('Requisition rejected');
            setShowReject(false);
            navigate(`/${homePrefix}/requisitions`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Rejection failed');
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <LoadingState label="Loading requisition…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;
    if (!requisition) return null;

    const r = requisition;
    const inHrQueue = canProcess && r.status === 'submitted';
    const inApprovalQueue = canApprove && r.status === 'pending_approval';
    const canMakeJob = canProcess && r.status === 'approved';

    return (
        <div>
            <Link to={`/${homePrefix}/requisitions`}
                  className="text-decoration-none text-muted d-inline-flex align-items-center gap-2 mb-3"
                  style={{ fontSize: '0.82rem' }}>
                <FaArrowLeft size={11} /> Back to requisitions
            </Link>

            <Card className="p-3 mb-3">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                    <div style={{ minWidth: 0 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                            <h5 className="fw-bold text-dark mb-0">{r.positionTitle}</h5>
                            <StatusBadge status={r.status} />
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                            Raised by {r.requestedBy?.name || 'a requester'} for {r.departmentName}
                            {r.createdAt && ` on ${new Date(r.createdAt).toLocaleDateString()}`}
                        </div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                        {inHrQueue && (
                            <>
                                <Button variant="primary" disabled={busy} onClick={prepare}
                                        className="d-flex align-items-center gap-2">
                                    <FaPaperPlane size={12} /> Forward for Approval
                                </Button>
                                <Button variant="outline-danger" disabled={busy} onClick={() => setShowReturn(true)}
                                        className="d-flex align-items-center gap-2">
                                    <FaUndo size={12} /> Return for Correction
                                </Button>
                            </>
                        )}
                        {inApprovalQueue && (
                            <>
                                <Button variant="success" disabled={busy} onClick={approve}
                                        className="d-flex align-items-center gap-2">
                                    <FaCheck size={12} /> Approve
                                </Button>
                                <Button variant="outline-danger" disabled={busy} onClick={() => setShowReject(true)}
                                        className="d-flex align-items-center gap-2">
                                    <FaTimes size={12} /> Reject
                                </Button>
                            </>
                        )}
                        {canMakeJob && (
                            <Button variant="success" disabled={busy}
                                    onClick={() => navigate(`/${homePrefix}/job-creator?requisitionId=${r._id}`)}
                                    className="d-flex align-items-center gap-2">
                                <FaPlusCircle size={12} /> Create Job From This Requisition
                            </Button>
                        )}
                    </div>
                </div>

                {r.status === 'returned' && r.returnReason && (
                    <div className="mt-3 p-2 rounded" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                        <div className="fw-semibold text-danger" style={{ fontSize: '0.8rem' }}>Returned for correction</div>
                        <div className="text-dark" style={{ fontSize: '0.82rem' }}>{r.returnReason}</div>

                        {isRequester && (
                            <div className="mt-3">
                                <div className="fw-semibold text-dark mb-1" style={{ fontSize: '0.8rem' }}>
                                    Answer HR
                                </div>
                                <div className="text-muted mb-2" style={{ fontSize: '0.76rem' }}>
                                    If HR only needs an explanation, reply here and the requisition goes straight back
                                    for review. If a requirement itself must change, edit the requisition instead.
                                </div>
                                <Form.Control
                                    as="textarea" rows={3} value={clarification}
                                    onChange={(e) => setClarification(e.target.value)}
                                    placeholder="Explain or clarify what HR asked about…"
                                    style={{ fontSize: '0.84rem' }}
                                />
                                <div className="d-flex gap-2 mt-2">
                                    <Button size="sm" variant="primary" disabled={busy || !clarification.trim()}
                                            onClick={respondToClarification}
                                            className="d-flex align-items-center gap-2">
                                        <FaPaperPlane size={11} /> Send response to HR
                                    </Button>
                                    <Link to={`/${homePrefix}/requisitions/${r._id}/edit`}
                                          className="btn btn-sm btn-outline-secondary">
                                        Edit the requisition instead
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {r.status === 'rejected' && r.rejectionReason && (
                    <div className="mt-3 p-2 rounded" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                        <div className="fw-semibold text-danger" style={{ fontSize: '0.8rem' }}>Rejected</div>
                        <div className="text-dark" style={{ fontSize: '0.82rem' }}>{r.rejectionReason}</div>
                    </div>
                )}
                {r.linkedJob && (
                    <div className="mt-3 p-2 rounded" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                        <div className="fw-semibold text-success" style={{ fontSize: '0.8rem' }}>Vacancy created</div>
                        <div className="text-dark" style={{ fontSize: '0.82rem' }}>
                            "{r.linkedJob.title}" - <StatusBadge status={r.linkedJob.status} />
                        </div>
                    </div>
                )}
            </Card>

            <div className="row g-3">
                <div className="col-12 col-lg-7">
                    <Card className="p-3 mb-3">
                        <SectionHeader title="Reason / Justification" />
                        <p className="text-dark" style={{ fontSize: '0.86rem', whiteSpace: 'pre-line' }}>{r.reason}</p>

                        {r.responsibilities?.length > 0 && (
                            <>
                                <div className="fw-semibold text-dark mt-3 mb-1" style={{ fontSize: '0.86rem' }}>Responsibilities</div>
                                <ul className="ps-3 text-dark mb-0" style={{ fontSize: '0.84rem' }}>
                                    {r.responsibilities.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </>
                        )}
                    </Card>

                    <Card className="p-3">
                        <SectionHeader title="Requirements" />
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Required skills
                            </div>
                            <Tags items={r.skills} />
                        </div>
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Languages / Licenses
                            </div>
                            <Tags items={[...(r.languages || []), ...(r.licenses || [])]} tone="#F1F5F9" color="#475569" />
                        </div>
                        <div className="mb-3">
                            <div className="text-uppercase text-muted mb-1" style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                Required competencies
                            </div>
                            <Tags items={r.competencies} tone="#F0FDF4" color="#166534" />
                        </div>
                        <div className="row">
                            <div className="col-6">
                                <Detail label="Education" value={r.education} />
                            </div>
                            <div className="col-6">
                                <Detail label="Experience" value={r.experience} />
                            </div>
                        </div>
                    </Card>
                </div>

                <div className="col-12 col-lg-5">
                    <Card className="p-3">
                        <SectionHeader title="Staffing Details" />
                        <Detail label="Department" value={r.departmentName} />
                        <Detail label="Request type" value={r.requestType?.replace('_', ' ')} />
                        <Detail label="Employment type" value={r.employmentType} />
                        <Detail label="Required level" value={r.level} />
                        <Detail label="Number of employees" value={r.numberOfPositions} />
                        <Detail label="Salary" value={formatSalary(r.salary)} />
                        <Detail label="Required start date" value={r.startDate ? new Date(r.startDate).toLocaleDateString() : null} />
                    </Card>

                    {r.auditTrail?.length > 0 && (
                        <Card className="p-3 mt-3">
                            <SectionHeader title="Audit Trail" />
                            <div className="d-flex flex-column gap-2">
                                {[...r.auditTrail].reverse().map((entry, i) => (
                                    <div key={i} className="d-flex justify-content-between align-items-start gap-2">
                                        <div style={{ minWidth: 0 }}>
                                            <StatusBadge status={entry.action} />
                                            <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                                                {entry.by?.name || 'Someone'}{entry.note ? ` — ${entry.note}` : ''}
                                            </div>
                                        </div>
                                        <div className="text-muted flex-shrink-0" style={{ fontSize: '0.72rem' }}>
                                            {entry.at ? new Date(entry.at).toLocaleDateString() : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                </div>
            </div>

            <Modal show={showReturn} onHide={() => setShowReturn(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Return requisition for correction</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label className="fw-semibold">What needs to change?</Form.Label>
                        <Form.Control as="textarea" rows={3} value={returnNote} onChange={(e) => setReturnNote(e.target.value)}
                                      placeholder="Explain what the requester should correct…" />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={() => setShowReturn(false)}>Cancel</Button>
                    <Button variant="danger" disabled={busy || !returnNote.trim()} onClick={returnToRequester}>Return</Button>
                </Modal.Footer>
            </Modal>

            <Modal show={showReject} onHide={() => setShowReject(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject requisition</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label className="fw-semibold">Reason for rejection</Form.Label>
                        <Form.Control as="textarea" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                                      placeholder="Explain why this requisition is rejected…" />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={() => setShowReject(false)}>Cancel</Button>
                    <Button variant="danger" disabled={busy || !rejectReason.trim()} onClick={reject}>Reject</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default RequisitionReview;
