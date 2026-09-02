import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCalendarAlt, FaPaperPlane, FaCheck, FaTimes, FaUndo, FaEye, FaPaperclip } from 'react-icons/fa';
import api, { getImageUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'New' },
    { key: 'returned_for_correction', label: 'Returned' },
    { key: 'under_review', label: 'Awaiting approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' }
];

/**
 * Leave management.
 *
 * HR Expert is the verification/processing gate: it forwards a valid
 * request, or sends one back to the employee ("Send Back / Request
 * Clarification") when something needs correcting - e.g. a document is
 * unclear, dates conflict, or a policy question needs the employee's
 * input. HR Expert has no final rejection authority. Only a request an
 * HR Expert has forwarded (under_review) reaches the HR Manager, who
 * makes the final approve/reject decision (rejection requires a reason).
 * The two stages are deliberately separate so nobody approves their own
 * work, and HR Manager can never decide on a request that has not passed
 * HR Expert verification.
 */
const LeaveManagement = () => {
    const { can } = useAuth();
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [busyId, setBusyId] = useState(null);
    // { leave, kind: 'reject' | 'return' } - 'reject' is HR Manager-only;
    // 'return' is the HR Expert's "Send Back / Request Clarification"
    const [actionTarget, setActionTarget] = useState(null);
    const [reason, setReason] = useState('');
    const [detailLeave, setDetailLeave] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const canProcess = can('leave:process');
    const canApprove = can('leave:approve');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/leaves', {
                params: filter === 'all' ? {} : { status: filter }
            });
            setLeaves(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load leave requests.');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => { load(); }, [load]);

    const forwardLeave = async (leave) => {
        setBusyId(leave._id);
        try {
            await api.put(`/leaves/${leave._id}/process`, {});
            toast.success('Forwarded for HR Manager approval');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not forward the request');
        } finally {
            setBusyId(null);
        }
    };

    const decide = async (leave, status, rejectionReason) => {
        setBusyId(leave._id);
        try {
            await api.put(`/leaves/${leave._id}/status`, { status, rejectionReason });
            toast.success(`Leave request ${status}`);
            setActionTarget(null);
            setReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the request');
        } finally {
            setBusyId(null);
        }
    };

    const returnForCorrection = async (leave, note) => {
        setBusyId(leave._id);
        try {
            await api.put(`/leaves/${leave._id}/return`, { note });
            toast.success('Sent back to the employee for correction');
            setActionTarget(null);
            setReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not send the request back');
        } finally {
            setBusyId(null);
        }
    };

    const openDetail = async (leave) => {
        setDetailLeave({ _id: leave._id });
        setDetailLoading(true);
        try {
            const res = await api.get(`/leaves/${leave._id}`);
            setDetailLeave(res.data.data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not load the request details');
            setDetailLeave(null);
        } finally {
            setDetailLoading(false);
        }
    };

    if (loading) return <LoadingState label="Loading leave requests…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Leave Management"
                    description="HR Experts verify and forward requests; HR Managers make the final approve/reject decision."
                />

                <div className="d-flex gap-2 flex-wrap mb-3">
                    {FILTERS.map(item => (
                        <button key={item.key} onClick={() => setFilter(item.key)}
                                className={`btn btn-sm ${filter === item.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                                style={{ fontSize: '0.78rem' }}>
                            {item.label}
                        </button>
                    ))}
                </div>

                {leaves.length === 0 ? (
                    <EmptyState
                        icon={FaCalendarAlt}
                        title="No leave requests in this view"
                        description="Requests submitted by members of your organization appear here."
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Employee</th>
                                    <th className="fw-semibold">Type</th>
                                    <th className="fw-semibold">Period</th>
                                    <th className="fw-semibold text-center">Days</th>
                                    <th className="fw-semibold">Reason</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaves.map(leave => {
                                    const isNew = leave.status === 'pending';
                                    const awaiting = leave.status === 'under_review';
                                    return (
                                        <tr key={leave._id}>
                                            <td>
                                                <div className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>
                                                    {leave.employee?.personalInfo
                                                        ? `${leave.employee.personalInfo.firstName} ${leave.employee.personalInfo.lastName}`
                                                        : 'Employee'}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                    {leave.employee?.employeeId || '—'}
                                                </div>
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                                {leave.leaveTypeName}
                                                {leave.attachments?.length > 0 && (
                                                    <FaPaperclip size={10} className="ms-1 text-muted" title="Supporting document attached" />
                                                )}
                                                {leave.leaveTypeName === 'Other' && leave.otherLeaveCountThisYear > 1 && (
                                                    <div className="text-warning" style={{ fontSize: '0.68rem' }}
                                                         title="Consider adding a dedicated leave type in Configuration for this employee's recurring need.">
                                                        ⚠ {leave.otherLeaveCountThisYear}
                                                        {leave.otherLeaveCountThisYear === 2 ? 'nd' : leave.otherLeaveCountThisYear === 3 ? 'rd' : 'th'} "Other" request this year
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                {new Date(leave.startDate).toLocaleDateString()} –{' '}
                                                {new Date(leave.endDate).toLocaleDateString()}
                                            </td>
                                            <td className="text-center fw-semibold" style={{ fontSize: '0.85rem' }}>
                                                {leave.totalDays}
                                                {leave.payBreakdown && (
                                                    <div className="text-muted fw-normal" style={{ fontSize: '0.68rem' }}>
                                                        {[
                                                            leave.payBreakdown.fullPayDays ? `${leave.payBreakdown.fullPayDays} full-pay` : null,
                                                            leave.payBreakdown.halfPayDays ? `${leave.payBreakdown.halfPayDays} half-pay` : null,
                                                            leave.payBreakdown.unpaidDays ? `${leave.payBreakdown.unpaidDays} unpaid` : null
                                                        ].filter(Boolean).join(', ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-muted" style={{ fontSize: '0.8rem', maxWidth: 220 }}>
                                                <div className="text-truncate" title={leave.reason || ''}>
                                                    {leave.reason || '—'}
                                                </div>
                                            </td>
                                            <td>
                                                <StatusBadge status={leave.status} />
                                                {leave.rejectionReason && (
                                                    <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                        {leave.rejectionReason}
                                                    </div>
                                                )}
                                                {leave.returnReason && (
                                                    <div className="text-danger mt-1" style={{ fontSize: '0.72rem' }}>
                                                        {leave.returnReason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="text-end">
                                                <div className="d-flex gap-2 justify-content-end flex-wrap">
                                                    <Button size="sm" variant="outline-secondary" disabled={busyId === leave._id}
                                                            className="d-flex align-items-center gap-1"
                                                            onClick={() => openDetail(leave)}>
                                                        <FaEye size={10} /> Details
                                                    </Button>
                                                    {canProcess && isNew && (
                                                        <>
                                                            <Button size="sm" variant="outline-primary" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => forwardLeave(leave)}>
                                                                <FaPaperPlane size={10} /> Forward
                                                            </Button>
                                                            <Button size="sm" variant="outline-warning" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => { setActionTarget({ leave, kind: 'return' }); setReason(''); }}>
                                                                <FaUndo size={10} /> Send Back
                                                            </Button>
                                                        </>
                                                    )}
                                                    {canApprove && awaiting && (
                                                        <>
                                                            <Button size="sm" variant="success" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => decide(leave, 'approved')}>
                                                                <FaCheck size={10} /> Approve
                                                            </Button>
                                                            <Button size="sm" variant="outline-danger" disabled={busyId === leave._id}
                                                                    className="d-flex align-items-center gap-1"
                                                                    onClick={() => { setActionTarget({ leave, kind: 'reject' }); setReason(''); }}>
                                                                <FaTimes size={10} /> Reject
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <Modal show={!!actionTarget} onHide={() => setActionTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        {actionTarget?.kind === 'return' && 'Send back / request clarification'}
                        {actionTarget?.kind === 'reject' && 'Reject leave request'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        {actionTarget?.kind === 'return'
                            ? 'Explain what needs correcting or clarifying (e.g. unclear document, conflicting dates, a policy question for the employee). They can edit and resubmit the request.'
                            : 'Explain why this request cannot proceed. The employee sees this note.'}
                    </p>
                    <Form.Control as="textarea" rows={3} value={reason}
                                  onChange={e => setReason(e.target.value)}
                                  placeholder={actionTarget?.kind === 'return'
                                      ? 'e.g. Please correct the end date - it overlaps an existing request.'
                                      : 'e.g. Insufficient leave balance for the requested period.'} />
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setActionTarget(null)}>Cancel</Button>
                    <Button variant={actionTarget?.kind === 'return' ? 'warning' : 'danger'} disabled={!reason.trim()}
                            onClick={() => {
                                if (actionTarget?.kind === 'return') return returnForCorrection(actionTarget.leave, reason.trim());
                                return decide(actionTarget.leave, 'rejected', reason.trim());
                            }}>
                        {actionTarget?.kind === 'return' ? 'Send back to employee' : 'Reject request'}
                    </Button>
                </Modal.Footer>
            </Modal>

            <Modal show={!!detailLeave} onHide={() => setDetailLeave(null)} centered size="lg">
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Leave request details</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {detailLoading || !detailLeave?.leaveTypeName ? (
                        <LoadingState label="Loading details…" />
                    ) : (
                        <div style={{ fontSize: '0.85rem' }}>
                            <div className="row g-3 mb-3">
                                <div className="col-6">
                                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>EMPLOYEE</div>
                                    <div className="fw-semibold">
                                        {detailLeave.employee?.personalInfo
                                            ? `${detailLeave.employee.personalInfo.firstName} ${detailLeave.employee.personalInfo.lastName}`
                                            : 'Employee'}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.76rem' }}>{detailLeave.employee?.employeeId}</div>
                                </div>
                                <div className="col-6">
                                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>STATUS</div>
                                    <StatusBadge status={detailLeave.status} />
                                </div>
                                <div className="col-6">
                                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>LEAVE TYPE</div>
                                    <div>{detailLeave.leaveTypeName}</div>
                                </div>
                                <div className="col-6">
                                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>DATES</div>
                                    <div>
                                        {new Date(detailLeave.startDate).toLocaleDateString()} –{' '}
                                        {new Date(detailLeave.endDate).toLocaleDateString()} ({detailLeave.totalDays} day{detailLeave.totalDays === 1 ? '' : 's'})
                                    </div>
                                </div>
                                <div className="col-12">
                                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>REASON</div>
                                    <div>{detailLeave.reason}</div>
                                </div>
                                {detailLeave.attachments?.length > 0 && (
                                    <div className="col-12">
                                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>SUPPORTING DOCUMENT</div>
                                        <a href={getImageUrl(detailLeave.attachments[0].url)}
                                           target="_blank" rel="noreferrer">
                                            {detailLeave.attachments[0].name}
                                        </a>
                                    </div>
                                )}
                            </div>

                            {detailLeave.balanceContext && (
                                <>
                                    <SectionHeader title="Leave balance" description="As of before this request." />
                                    <div className="row g-2 mb-3">
                                        {[
                                            ['Entitlement', detailLeave.balanceContext.entitlement],
                                            ['Approved/Used', detailLeave.balanceContext.approvedUsed],
                                            ['Pending', detailLeave.balanceContext.pending],
                                            ['Available', detailLeave.balanceContext.available],
                                            ['Requested', detailLeave.balanceContext.requestedDays],
                                            ['Remaining after', detailLeave.balanceContext.remainingAfterDecision]
                                        ].map(([label, value]) => (
                                            <div className="col-4" key={label}>
                                                <div className="p-2 rounded text-center" style={{ border: '1px solid #E2E8F0' }}>
                                                    <div className="text-muted" style={{ fontSize: '0.66rem' }}>{label}</div>
                                                    <div className="fw-bold">{value}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {detailLeave.auditTrail?.length > 0 && (
                                <>
                                    <SectionHeader title="History" />
                                    <ul className="list-unstyled mb-0">
                                        {detailLeave.auditTrail.map((entry, idx) => (
                                            <li key={idx} className="mb-2 pb-2" style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <div className="fw-semibold">
                                                    {entry.action.replace(/_/g, ' ')} — {entry.by?.name || 'System'}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                                                    {new Date(entry.at).toLocaleString()}
                                                </div>
                                                {entry.note && <div style={{ fontSize: '0.8rem' }}>{entry.note}</div>}
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setDetailLeave(null)}>Close</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default LeaveManagement;
