import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaBuilding, FaCamera, FaTrash } from 'react-icons/fa';
import api, { getImageUrl } from '../../services/api';
import { Card, SectionHeader, StatusBadge, LoadingState, ErrorState } from '../workspace/ui';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Organization profile.
 *
 * Represents the EMPLOYER as a company - not an individual HR user. This is the
 * public-facing description candidates see. The verification application, which
 * an administrator reviews, lives on its own page so that the identifying
 * evidence and its documents stay together.
 */
const EmployerProfilePage = () => {
    const [form, setForm] = useState(null);
    const [status, setStatus] = useState('');
    const [logo, setLogo] = useState(null);
    const [logoBusy, setLogoBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileInput = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employers/me');
            const employer = res.data.employer || {};
            setStatus(employer.status);
            setLogo(employer.logo || null);
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

    const pickLogo = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Checked here as well as on the server so the browser does not spend
        // time uploading a file that would only be rejected.
        if (file.size > MAX_LOGO_BYTES) {
            toast.error('That image is larger than 2MB. Choose a smaller file.');
            event.target.value = '';
            return;
        }

        setLogoBusy(true);
        const body = new FormData();
        body.append('logo', file);
        try {
            const res = await api.post('/employers/me/logo', body,
                { headers: { 'Content-Type': 'multipart/form-data' } });
            setLogo(res.data.logo);
            toast.success('Logo updated');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not upload the logo');
        } finally {
            setLogoBusy(false);
            event.target.value = '';
        }
    };

    const removeLogo = async () => {
        setLogoBusy(true);
        try {
            await api.delete('/employers/me/logo');
            setLogo(null);
            toast.success('Logo removed');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the logo');
        } finally {
            setLogoBusy(false);
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

            {/* Logo */}
            <div className="d-flex align-items-center gap-3 mb-4 p-3 rounded"
                 style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="d-flex align-items-center justify-content-center flex-shrink-0 overflow-hidden"
                     style={{ width: 84, height: 84, borderRadius: 16, background: '#EEF2FF', color: '#4F46E5' }}>
                    {logo
                        ? <img src={getImageUrl(logo)} alt="Organization logo"
                               style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <FaBuilding size={30} />}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold text-dark" style={{ fontSize: '0.88rem' }}>Organization logo</div>
                    <div className="text-muted mb-2" style={{ fontSize: '0.76rem' }}>
                        Shown next to your vacancies. JPEG, PNG, WebP or SVG, up to 2MB.
                        A square image works best.
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-primary" disabled={logoBusy}
                                onClick={() => fileInput.current?.click()}>
                            <FaCamera className="me-2" size={12} />
                            {logoBusy ? 'Working…' : (logo ? 'Replace' : 'Upload logo')}
                        </Button>
                        {logo && (
                            <Button size="sm" variant="outline-danger" disabled={logoBusy} onClick={removeLogo}>
                                <FaTrash className="me-2" size={12} />Remove
                            </Button>
                        )}
                    </div>
                    <input ref={fileInput} type="file" className="d-none"
                           accept="image/jpeg,image/png,image/webp,image/svg+xml"
                           onChange={pickLogo} />
                </div>
            </div>

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
