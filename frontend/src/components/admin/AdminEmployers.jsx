import React, { useCallback, useEffect, useState } from 'react';
import { Button, Modal, Form, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaBuilding, FaCheck, FaTimes, FaFileAlt, FaExclamationTriangle } from 'react-icons/fa';
import api, { openAuthenticatedFile, describeApiError } from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Platform-level employer management.
 *
 * The System Administrator verifies and suspends organizations but never
 * performs recruitment work inside them. A decision is made against recorded
 * evidence - registered name, TIN, licence and uploaded documents - because an
 * organization approved on its typed-in name alone could be fabricated and
 * would then collect real applicants' personal data.
 */
const AdminEmployers = () => {
    const [employers, setEmployers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [dossier, setDossier] = useState(null);
    const [dossierLoading, setDossierLoading] = useState(false);
    const [decision, setDecision] = useState(null);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employers');
            setEmployers(res.data.employers || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load employers.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openDossier = async (employer) => {
        setDossierLoading(true);
        setDossier({ employer });
        try {
            const res = await api.get(`/employers/${employer._id}/verification`);
            setDossier(res.data);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not load the verification details.');
            setDossier(null);
        } finally {
            setDossierLoading(false);
        }
    };

    const applyStatus = async (employer, status, why) => {
        setBusyId(employer._id);
        try {
            await api.put(`/employers/${employer._id}/status`, { status, reason: why });
            toast.success(`${employer.name} marked ${status}`);
            setEmployers(prev => prev.map(item =>
                item._id === employer._id ? { ...item, status, rejectionReason: why || '' } : item));
            setDecision(null);
            setReason('');
            setDossier(null);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update organization');
        } finally {
            setBusyId(null);
        }
    };

    const openDecision = (employer, status) => {
        setDecision({ employer, status });
        setReason('');
    };

    if (loading) return <LoadingState label="Loading employers…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const pendingCount = employers.filter(e => e.status === 'pending').length;

    return (
        <Card className="p-3">
            <SectionHeader
                title="Employers"
                description="Organizations registered on the platform. Review the submitted evidence before activating one."
            />

            {pendingCount > 0 && (
                <div className="mb-3 p-2 rounded" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
                    <span className="text-dark" style={{ fontSize: '0.8rem' }}>
                        <FaExclamationTriangle className="me-2 text-warning" />
                        {pendingCount} organization(s) awaiting review.
                    </span>
                </div>
            )}

            {employers.length === 0 ? (
                <EmptyState icon={FaBuilding} title="No employers registered"
                            description="Organizations appear here when an employer account signs up." />
            ) : (
                <div className="table-responsive">
                    <table className="table align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                <th className="fw-semibold">Organization</th>
                                <th className="fw-semibold">Owner</th>
                                <th className="fw-semibold">TIN / Licence</th>
                                <th className="fw-semibold">Status</th>
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employers.map(employer => (
                                <tr key={employer._id}>
                                    <td>
                                        <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>
                                            {employer.name}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                                            Registered {new Date(employer.createdAt).toLocaleDateString()}
                                            {employer.industry ? ` · ${employer.industry}` : ''}
                                        </div>
                                    </td>
                                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                        {employer.owner?.name || '—'}
                                        <div style={{ fontSize: '0.72rem' }}>{employer.owner?.email}</div>
                                    </td>
                                    <td className="text-muted" style={{ fontSize: '0.78rem' }}>
                                        {employer.tin ? (
                                            <>
                                                TIN {employer.tin}
                                                <div style={{ fontSize: '0.72rem' }}>
                                                    {employer.businessLicenceNumber || 'No licence number'}
                                                </div>
                                            </>
                                        ) : (
                                            <span className="text-danger">No evidence supplied</span>
                                        )}
                                    </td>
                                    <td>
                                        <StatusBadge status={employer.status} />
                                        {employer.rejectionReason && (
                                            <div className="text-muted" style={{ fontSize: '0.7rem', maxWidth: 190 }}>
                                                {employer.rejectionReason}
                                            </div>
                                        )}
                                    </td>
                                    <td className="text-end">
                                        <div className="d-flex gap-2 justify-content-end">
                                            <Button size="sm" variant="outline-secondary"
                                                    onClick={() => openDossier(employer)}>
                                                Review
                                            </Button>
                                            {employer.status !== 'active' && (
                                                <Button size="sm" variant="success" disabled={busyId === employer._id}
                                                        onClick={() => applyStatus(employer, 'active')}>
                                                    Activate
                                                </Button>
                                            )}
                                            {employer.status !== 'suspended' && (
                                                <Button size="sm" variant="outline-danger" disabled={busyId === employer._id}
                                                        onClick={() => openDecision(employer, 'suspended')}>
                                                    Suspend
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Verification dossier: every recorded fact behind the decision. */}
            <Modal show={!!dossier} onHide={() => setDossier(null)} size="lg" centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1rem' }}>
                        Verification review — {dossier?.employer?.name}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {dossierLoading ? <LoadingState label="Loading evidence…" /> : (
                        <>
                            {dossier?.duplicates?.length > 0 && (
                                <div className="mb-3 p-2 rounded" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                                    <strong style={{ fontSize: '0.82rem' }}>Duplicate TIN.</strong>
                                    <div style={{ fontSize: '0.78rem' }}>
                                        Already used by {dossier.duplicates.map(d => `${d.name} (${d.status})`).join(', ')}
                                    </div>
                                </div>
                            )}

                            <h6 className="fw-bold" style={{ fontSize: '0.85rem' }}>Approval checklist</h6>
                            <div className="mb-3">
                                {(dossier?.checklist || []).map(item => (
                                    <div key={item.key} className="d-flex align-items-start gap-2 py-1"
                                         style={{ fontSize: '0.8rem', borderBottom: '1px solid #F1F5F9' }}>
                                        <span style={{ color: item.met ? '#16A34A' : '#DC2626', minWidth: 16 }}>
                                            {item.met ? <FaCheck size={12} /> : <FaTimes size={12} />}
                                        </span>
                                        <div className="flex-grow-1">
                                            <div className={item.met ? 'text-dark' : 'text-danger fw-semibold'}>
                                                {item.label}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.74rem' }}>{item.detail}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <h6 className="fw-bold" style={{ fontSize: '0.85rem' }}>Uploaded documents</h6>
                            {(dossier?.employer?.verificationDocuments || []).length === 0 ? (
                                <p className="text-danger" style={{ fontSize: '0.8rem' }}>
                                    No documents uploaded. There is nothing to check the organization against.
                                </p>
                            ) : (
                                <div className="d-flex flex-column gap-1 mb-3">
                                    {dossier.employer.verificationDocuments.map(doc => (
                                        <Button
                                            key={doc._id}
                                            variant="link"
                                            className="d-flex align-items-center gap-2 text-decoration-none p-0"
                                            style={{ fontSize: '0.8rem' }}
                                            onClick={() => openAuthenticatedFile(`/employers/${dossier.employer._id}/documents/${doc._id}`)
                                                .catch(err => toast.error(describeApiError(err, 'Could not open this document')))}
                                        >
                                            <FaFileAlt className="text-primary" />
                                            {doc.label}
                                            <Badge bg="light" text="dark">{doc.originalName}</Badge>
                                        </Button>
                                    ))}
                                </div>
                            )}

                            {dossier?.employer?.reviewedAt && (
                                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                    Last reviewed {new Date(dossier.employer.reviewedAt).toLocaleString()}
                                    {dossier.employer.reviewedBy?.name ? ` by ${dossier.employer.reviewedBy.name}` : ''}
                                </div>
                            )}
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-danger" size="sm"
                            onClick={() => openDecision(dossier.employer, 'rejected')}>
                        Reject
                    </Button>
                    <Button variant="success" size="sm"
                            disabled={busyId === dossier?.employer?._id}
                            onClick={() => applyStatus(dossier.employer, 'active')}>
                        Approve
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Turning an organization away requires saying why. */}
            <Modal show={!!decision} onHide={() => setDecision(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1rem' }}>
                        {decision?.status === 'rejected' ? 'Reject' : 'Suspend'} {decision?.employer?.name}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Label className="fw-semibold" style={{ fontSize: '0.82rem' }}>
                        Reason (shown to the employer) *
                    </Form.Label>
                    <Form.Control as="textarea" rows={4} value={reason}
                                  onChange={e => setReason(e.target.value)}
                                  placeholder="e.g. The uploaded trade licence expired. Upload a renewed licence." />
                    <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
                        The organization sees this text, so state what must be corrected.
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" size="sm" onClick={() => setDecision(null)}>Cancel</Button>
                    <Button variant="danger" size="sm"
                            disabled={!reason.trim() || busyId === decision?.employer?._id}
                            onClick={() => applyStatus(decision.employer, decision.status, reason)}>
                        Confirm
                    </Button>
                </Modal.Footer>
            </Modal>
        </Card>
    );
};

export default AdminEmployers;
