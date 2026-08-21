import React, { useCallback, useEffect, useState } from 'react';
import { Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { FaCheck, FaTimes, FaFileAlt, FaPaperPlane } from 'react-icons/fa';
import api from '../../services/api';
import { Card, SectionHeader, StatusBadge, LoadingState, ErrorState } from '../workspace/ui';

const DOCUMENT_TYPES = [
    'Business licence',
    'TIN certificate',
    'Commercial registration',
    'Authorising letter',
    'Other'
];

const LICENCE_EXEMPT = ['government', 'ngo'];

/**
 * Verification application.
 *
 * Everything an administrator reviews is gathered here rather than on the
 * sign-up form: an applicant rarely has their TIN and trade licence to hand at
 * the moment they create an account, and requiring them there would stop the
 * account being created at all. The organization can save what it has and come
 * back. Nothing is lost by waiting, because publishing vacancies and adding
 * team members are gated on the administrator's decision, not on sign-up.
 */
const EmployerVerification = () => {
    const [form, setForm] = useState(null);
    const [status, setStatus] = useState('');
    const [checklist, setChecklist] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [rejectionReason, setRejectionReason] = useState('');
    const [employerId, setEmployerId] = useState(null);
    const [docLabel, setDocLabel] = useState(DOCUMENT_TYPES[0]);
    const [docFile, setDocFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

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
            setError(err.response?.data?.message || 'Unable to load your organization.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const setNested = (group, field, value) =>
        setForm(prev => ({ ...prev, [group]: { ...prev[group], [field]: value } }));

    const save = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        try {
            await api.put('/employers/me', form);
            toast.success('Saved');
            await load();
            return true;
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save your details');
            return false;
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
            await api.post('/employers/me/documents', body,
                { headers: { 'Content-Type': 'multipart/form-data' } });
            setDocFile(null);
            toast.success('Document uploaded');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not upload the document');
        } finally {
            setUploading(false);
        }
    };

    const removeDocument = async (docId) => {
        try {
            await api.delete(`/employers/me/documents/${docId}`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the document');
        }
    };

    // Saving first means the reviewer never sees a half-entered application
    // just because the applicant forgot to press Save.
    const submit = async () => {
        const saved = await save();
        if (!saved) return;
        setSubmitting(true);
        try {
            const res = await api.post('/employers/me/submit-verification');
            toast.success(res.data.message);
            await load();
            navigate('/employer/dashboard');
        } catch (err) {
            const data = err.response?.data;
            toast.error(data?.missing?.length
                ? `Still missing: ${data.missing.join(', ')}`
                : (data?.message || 'Could not submit for verification'));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <LoadingState label="Loading your application…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    const licenceExempt = LICENCE_EXEMPT.includes(form.organizationType);
    const outstanding = checklist.filter(item => !item.met && item.key !== 'representative');

    return (
        <Card className="p-3">
            <SectionHeader
                title="Verification application"
                description="A System Administrator checks these details before your organization can publish vacancies or add HR team members."
                action={<StatusBadge status={status} />}
            />

            {status === 'active' && (
                <Alert variant="success" className="py-2" style={{ fontSize: '0.82rem' }}>
                    Your organization is verified. You can publish vacancies and add HR team members.
                </Alert>
            )}
            {status === 'rejected' && (
                <Alert variant="danger" className="py-2" style={{ fontSize: '0.82rem' }}>
                    <strong>Your application was not approved.</strong>
                    {rejectionReason && <div className="fst-italic mt-1">“{rejectionReason}”</div>}
                    <div className="mt-1">Correct the points below and submit again.</div>
                </Alert>
            )}
            {status === 'pending' && (
                <Alert variant="warning" className="py-2" style={{ fontSize: '0.82rem' }}>
                    {outstanding.length
                        ? 'Your application is not complete yet. Fill in the items marked below, attach a document, then submit.'
                        : 'Submitted. An administrator will review your organization.'}
                </Alert>
            )}

            {/* What is still outstanding */}
            <div className="mb-4 p-3 rounded" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <h6 className="fw-bold text-dark mb-2" style={{ fontSize: '0.86rem' }}>Checklist</h6>
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

            <Form onSubmit={save}>
                <h6 className="fw-bold text-dark" style={{ fontSize: '0.86rem' }}>Organization details</h6>
                <Row className="g-3 mb-4">
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Organization name *</Form.Label>
                        <Form.Control required value={form.name}
                                      onChange={e => setField('name', e.target.value)}
                                      placeholder="The name candidates will see" />
                    </Col>
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Registered legal name *</Form.Label>
                        <Form.Control value={form.legalName}
                                      onChange={e => setField('legalName', e.target.value)}
                                      placeholder="Exactly as written on your licence" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Organization type *</Form.Label>
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
                        <Form.Label style={{ fontSize: '0.8rem' }}>TIN *</Form.Label>
                        <Form.Control value={form.tin} onChange={e => setField('tin', e.target.value)}
                                      placeholder="Tax Identification Number" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>
                            {licenceExempt ? 'Authorising letter reference' : 'Trade licence number *'}
                        </Form.Label>
                        <Form.Control value={form.businessLicenceNumber}
                                      onChange={e => setField('businessLicenceNumber', e.target.value)} />
                    </Col>
                    {!licenceExempt && (
                        <Col md={4}>
                            <Form.Label style={{ fontSize: '0.8rem' }}>Licence expiry date *</Form.Label>
                            <Form.Control type="date" value={form.licenceExpiryDate}
                                          onChange={e => setField('licenceExpiryDate', e.target.value)} />
                        </Col>
                    )}
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Industry</Form.Label>
                        <Form.Control value={form.industry} onChange={e => setField('industry', e.target.value)}
                                      placeholder="e.g. Information Technology" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Website</Form.Label>
                        <Form.Control value={form.website} onChange={e => setField('website', e.target.value)}
                                      placeholder="https://…" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Official phone *</Form.Label>
                        <Form.Control value={form.contact.phone}
                                      onChange={e => setNested('contact', 'phone', e.target.value)}
                                      placeholder="+251 …" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Contact email</Form.Label>
                        <Form.Control type="email" value={form.contact.email}
                                      onChange={e => setNested('contact', 'email', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>City / town *</Form.Label>
                        <Form.Control value={form.address.city}
                                      onChange={e => setNested('address', 'city', e.target.value)}
                                      placeholder="e.g. Hawassa" />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Street</Form.Label>
                        <Form.Control value={form.address.street}
                                      onChange={e => setNested('address', 'street', e.target.value)} />
                    </Col>
                    <Col md={4}>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Region</Form.Label>
                        <Form.Control value={form.address.region}
                                      onChange={e => setNested('address', 'region', e.target.value)}
                                      placeholder="e.g. Sidama" />
                    </Col>
                </Row>

                <Button type="submit" variant="outline-primary" size="sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save progress'}
                </Button>
                <span className="text-muted ms-2" style={{ fontSize: '0.76rem' }}>
                    You can save now and finish later.
                </span>
            </Form>

            <hr className="my-4" />

            <h6 className="fw-bold text-dark" style={{ fontSize: '0.86rem' }}>Supporting documents</h6>
            <p className="text-muted" style={{ fontSize: '0.78rem' }}>
                Attach your trade licence, TIN certificate or authorising letter. Only you and the
                System Administrator can open these files.
            </p>

            {documents.length > 0 && (
                <div className="d-flex flex-column gap-1 mb-3">
                    {documents.map(doc => (
                        <div key={doc._id} className="d-flex align-items-center gap-2" style={{ fontSize: '0.79rem' }}>
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

            <Row className="g-2 align-items-end mb-4">
                <Col md={4}>
                    <Form.Label style={{ fontSize: '0.8rem' }}>Document type</Form.Label>
                    <Form.Select value={docLabel} onChange={e => setDocLabel(e.target.value)}>
                        {DOCUMENT_TYPES.map(type => <option key={type}>{type}</option>)}
                    </Form.Select>
                </Col>
                <Col md={5}>
                    <Form.Label style={{ fontSize: '0.8rem' }}>File (PDF or image, max 8MB)</Form.Label>
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

            {status !== 'active' && status !== 'suspended' && (
                <>
                    <hr className="my-4" />
                    <Button variant="primary" disabled={submitting} onClick={submit}>
                        <FaPaperPlane className="me-2" size={13} />
                        {submitting ? 'Submitting…' : 'Submit for verification'}
                    </Button>
                    {outstanding.length > 0 && (
                        <div className="text-danger mt-2" style={{ fontSize: '0.78rem' }}>
                            Still outstanding: {outstanding.map(i => i.label).join(', ')}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
};

export default EmployerVerification;
