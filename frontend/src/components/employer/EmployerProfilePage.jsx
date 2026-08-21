import React, { useCallback, useEffect, useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes, FaFileAlt } from 'react-icons/fa';
import api from '../../services/api';
import { Card, SectionHeader, StatusBadge, LoadingState, ErrorState } from '../workspace/ui';

/**
 * Organization profile.
 *
 * Represents the EMPLOYER as a company - not an individual HR user.
 * Platform-controlled fields (verification status) are read-only here.
 */
const EmployerProfilePage = () => {
    const [form, setForm] = useState(null);
    const [status, setStatus] = useState('');
    const [checklist, setChecklist] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [rejectionReason, setRejectionReason] = useState('');
    const [employerId, setEmployerId] = useState(null);
    const [docLabel, setDocLabel] = useState('Business licence');
    const [docFile, setDocFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employers/me');
            const employer = res.data.employer || {};
            setStatus(employer.status);
            setChecklist(res.data.checklist || []);
            setDocuments(employer.verificationDocuments || []);
            setRejectionReason(employer.rejectionReason || '');
            setEmployerId(employer._id);
            setForm({
                name: employer.name || '',
                legalName: employer.legalName || '',
                organizationType: employer.organizationType || 'private_company',
                tin: employer.tin || '',
                businessLicenceNumber: employer.businessLicenceNumber || '',
                licenceExpiryDate: employer.licenceExpiryDate
                    ? String(employer.licenceExpiryDate).slice(0, 10) : '',
                industry: employer.industry || '',
                website: employer.website || '',
                description: employer.description || '',
                address: {
                    street: employer.address?.street || '',
                    city: employer.address?.city || '',
                    region: employer.address?.region || '',
                    country: employer.address?.country || 'Ethiopia'
                },
                contact: {
                    email: employer.contact?.email || '',
                    phone: employer.contact?.phone || '',
                    contactPerson: employer.contact?.contactPerson || ''
                }
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your organization profile.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put('/employers/me', form);
            toast.success('Organization profile updated');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the profile');
        } finally {
            setSaving(false);
        }
    };

    const uploadDocument = async () => {
        if (!docFile) return;
        setUploading(true);
        const body = new FormData();
        body.append('document', docFile);
        body.append('label', docLabel);
        try {
            const res = await api.post('/employers/me/documents', body,
                { headers: { 'Content-Type': 'multipart/form-data' } });
            setDocuments(res.data.documents || []);
            setDocFile(null);
            toast.success('Document uploaded');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not upload the document');
        } finally {
            setUploading(false);
        }
    };

    const removeDocument = async (docId) => {
        try {
            const res = await api.delete(`/employers/me/documents/${docId}`);
            setDocuments(res.data.documents || []);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the document');
        }
    };

    const submitForReview = async () => {
        setSubmitting(true);
        try {
            const res = await api.post('/employers/me/submit-verification');
            toast.success(res.data.message);
            load();
        } catch (err) {
            const data = err.response?.data;
            toast.error(data?.missing?.length
                ? `Still missing: ${data.missing.join(', ')}`
                : (data?.message || 'Could not submit for verification'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <LoadingState label="Loading organization profile…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const setNested = (group, field, value) =>
        setForm(prev => ({ ...prev, [group]: { ...prev[group], [field]: value } }));

    return (
        <Card className="p-3">
            <SectionHeader
                title="Company Profile"
                description="This information is shown to candidates on your published vacancies."
                action={<StatusBadge status={status} />}
            />

            {status !== 'active' && (
                <div className="mb-4 p-3 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <h6 className="fw-bold text-dark mb-1" style={{ fontSize: '0.9rem' }}>Verification</h6>
                    <p className="text-muted mb-3" style={{ fontSize: '0.78rem' }}>
                        A System Administrator checks these details before your organization may publish
                        vacancies or add HR team members.
                    </p>

                    {status === 'rejected' && rejectionReason && (
                        <div className="mb-3 p-2 rounded" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
                            <strong style={{ fontSize: '0.8rem' }}>Not approved:</strong>
                            <div className="fst-italic" style={{ fontSize: '0.8rem' }}>“{rejectionReason}”</div>
                        </div>
                    )}

                    <div className="mb-3">
                        {checklist.map(item => (
                            <div key={item.key} className="d-flex align-items-start gap-2 py-1"
                                 style={{ fontSize: '0.79rem', borderBottom: '1px solid #F1F5F9' }}>
                                <span style={{ color: item.met ? '#16A34A' : '#DC2626', minWidth: 16 }}>
                                    {item.met ? <FaCheck size={11} /> : <FaTimes size={11} />}
                                </span>
                                <div>
                                    <div className={item.met ? 'text-dark' : 'text-danger fw-semibold'}>{item.label}</div>
                                    <div className="text-muted" style={{ fontSize: '0.73rem' }}>{item.detail}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h6 className="fw-semibold text-dark" style={{ fontSize: '0.82rem' }}>Supporting documents</h6>
                    {documents.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.78rem' }}>
                            Upload your trade licence, TIN certificate or authorising letter.
                        </p>
                    ) : (
                        <div className="d-flex flex-column gap-1 mb-2">
                            {documents.map(doc => (
                                <div key={doc._id} className="d-flex align-items-center gap-2" style={{ fontSize: '0.78rem' }}>
                                    <FaFileAlt className="text-primary" />
                                    <a href={`${api.defaults.baseURL}/employers/${employerId}/documents/${doc._id}`}
                                       target="_blank" rel="noreferrer">{doc.label}</a>
                                    <span className="text-muted">{doc.originalName}</span>
                                    <Button size="sm" variant="link" className="text-danger p-0"
                                            onClick={() => removeDocument(doc._id)}>remove</Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <Row className="g-2 align-items-end mb-3">
                        <Col md={4}>
                            <Form.Label style={{ fontSize: '0.78rem' }}>Document type</Form.Label>
                            <Form.Select value={docLabel} onChange={e => setDocLabel(e.target.value)}>
                                <option>Business licence</option>
                                <option>TIN certificate</option>
                                <option>Commercial registration</option>
                                <option>Authorising letter</option>
                                <option>Other</option>
                            </Form.Select>
                        </Col>
                        <Col md={5}>
                            <Form.Label style={{ fontSize: '0.78rem' }}>File (PDF or image, max 8MB)</Form.Label>
                            <Form.Control type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                                          onChange={e => setDocFile(e.target.files[0])} />
                        </Col>
                        <Col md={3}>
                            <Button variant="outline-primary" size="sm" className="w-100"
                                    disabled={!docFile || uploading} onClick={uploadDocument}>
                                {uploading ? 'Uploading…' : 'Upload'}
                            </Button>
                        </Col>
                    </Row>

                    <Button variant="primary" size="sm" disabled={submitting} onClick={submitForReview}>
                        {submitting ? 'Submitting…' : 'Submit for verification'}
                    </Button>
                    <div className="text-muted mt-2" style={{ fontSize: '0.74rem' }}>
                        Save your details below first, then submit.
                    </div>
                </div>
            )}

            <Form onSubmit={save}>
                <Row className="g-3">
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Organization name</Form.Label>
                        <Form.Control required value={form.name} onChange={e => setField('name', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Registered legal name</Form.Label>
                        <Form.Control value={form.legalName} onChange={e => setField('legalName', e.target.value)}
                                      placeholder="Exactly as on the licence" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Organization type</Form.Label>
                        <Form.Select value={form.organizationType}
                                     onChange={e => setField('organizationType', e.target.value)}>
                            <option value="private_company">Private company</option>
                            <option value="sole_proprietor">Sole proprietor</option>
                            <option value="government">Government body</option>
                            <option value="ngo">NGO / non-profit</option>
                            <option value="other">Other</option>
                        </Form.Select>
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>TIN</Form.Label>
                        <Form.Control value={form.tin} onChange={e => setField('tin', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Licence number</Form.Label>
                        <Form.Control value={form.businessLicenceNumber}
                                      onChange={e => setField('businessLicenceNumber', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Licence expiry date</Form.Label>
                        <Form.Control type="date" value={form.licenceExpiryDate}
                                      onChange={e => setField('licenceExpiryDate', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Industry</Form.Label>
                        <Form.Control value={form.industry} onChange={e => setField('industry', e.target.value)}
                                      placeholder="e.g. Information Technology" />
                    </Col>
                    <Col md={12}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Description</Form.Label>
                        <Form.Control as="textarea" rows={3} value={form.description}
                                      onChange={e => setField('description', e.target.value)}
                                      placeholder="What your organization does" />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Website</Form.Label>
                        <Form.Control value={form.website} onChange={e => setField('website', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Contact person</Form.Label>
                        <Form.Control value={form.contact.contactPerson}
                                      onChange={e => setNested('contact', 'contactPerson', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Contact email</Form.Label>
                        <Form.Control type="email" value={form.contact.email}
                                      onChange={e => setNested('contact', 'email', e.target.value)} />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Contact phone</Form.Label>
                        <Form.Control value={form.contact.phone}
                                      onChange={e => setNested('contact', 'phone', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>City</Form.Label>
                        <Form.Control value={form.address.city}
                                      onChange={e => setNested('address', 'city', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Region</Form.Label>
                        <Form.Control value={form.address.region}
                                      onChange={e => setNested('address', 'region', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Country</Form.Label>
                        <Form.Control value={form.address.country}
                                      onChange={e => setNested('address', 'country', e.target.value)} />
                    </Col>
                </Row>

                <div className="mt-4 d-flex gap-2">
                    <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                    <Button variant="light" type="button" onClick={load} disabled={saving}>Reset</Button>
                </div>
            </Form>
        </Card>
    );
};

export default EmployerProfilePage;
