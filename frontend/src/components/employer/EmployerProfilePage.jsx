import React, { useCallback, useEffect, useState } from 'react';
import { Form, Button, Row, Col } from 'react-bootstrap';
import { toast } from 'react-toastify';
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
            setForm({
                name: employer.name || '',
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
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the profile');
        } finally {
            setSaving(false);
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

            <Form onSubmit={save}>
                <Row className="g-3">
                    <Col md={6}>
                        <Form.Label style={{ fontSize: '0.82rem' }}>Organization name</Form.Label>
                        <Form.Control required value={form.name} onChange={e => setField('name', e.target.value)} />
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
