import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Form, Button, Alert, Modal } from 'react-bootstrap';
import {
    FaCheckCircle, FaUserEdit, FaPaperPlane, FaFileAlt, FaIdCard,
    FaGraduationCap, FaBriefcase, FaLanguage, FaTools, FaSave
} from 'react-icons/fa';
import api from '../../services/api';
import { toast } from 'react-toastify';
import {
    Card, SectionHeader, StatusBadge, LoadingState,
    EmptyState, CompletionMeter, TOKENS
} from '../workspace/ui';

/**
 * Employee onboarding.
 *
 * Everything recruitment already captured (name, contact, CV, education,
 * skills, experience, languages, hired position) is shown read-only as
 * "already on file". The form only asks for what the organization does not
 * already hold.
 */

const ReadOnlyRow = ({ icon: Icon, label, value }) => (
    <div className="d-flex align-items-start gap-2 py-2" style={{ borderBottom: `1px solid ${TOKENS.border}` }}>
        {Icon && <Icon className="mt-1 flex-shrink-0" size={13} style={{ color: TOKENS.muted }} />}
        <div style={{ minWidth: 0, flex: 1 }}>
            <div className="text-uppercase" style={{ fontSize: '0.62rem', fontWeight: 700, color: TOKENS.muted, letterSpacing: '.4px' }}>
                {label}
            </div>
            <div className="text-dark" style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>
                {value || <span className="text-muted">Not provided</span>}
            </div>
        </div>
    </div>
);

const EmployeeOnboarding = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [employee, setEmployee] = useState(null);
    const [completion, setCompletion] = useState(null);
    const [showConfirm, setShowConfirm] = useState(false);

    const [form, setForm] = useState({
        dateOfBirth: '', gender: 'male', maritalStatus: '', nationality: '', religion: '', bloodType: '',
        phone: '', mobile: '', personalEmail: '',
        street: '', city: '', state: '', country: '', postalCode: '',
        ecName: '', ecRelationship: '', ecPhone: '',
        idDocumentName: '', idDocumentUrl: ''
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/employees/onboarding/me');
            const emp = res.data.employee;
            setEmployee(emp);
            setCompletion(res.data.completion);

            const p = emp.personalInfo || {};
            const c = emp.contactInfo || {};
            setForm({
                dateOfBirth: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString().slice(0, 10) : '',
                gender: p.gender || 'male',
                maritalStatus: p.maritalStatus || '',
                nationality: p.nationality || '',
                religion: p.religion || '',
                bloodType: p.bloodType || '',
                phone: c.phone || '',
                mobile: c.mobile || '',
                personalEmail: c.personalEmail || '',
                street: c.address?.street || '',
                city: c.address?.city || '',
                state: c.address?.state || '',
                country: c.address?.country || '',
                postalCode: c.address?.postalCode || '',
                ecName: c.emergencyContact?.name || '',
                ecRelationship: c.emergencyContact?.relationship || '',
                ecPhone: c.emergencyContact?.phone || '',
                idDocumentName: '', idDocumentUrl: ''
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load your onboarding record.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

    const buildPayload = (submit) => {
        const hasId = (employee?.documents || []).some(d => d.type === 'id');
        return {
            submit,
            personalInfo: {
                dateOfBirth: form.dateOfBirth || null,
                gender: form.gender,
                maritalStatus: form.maritalStatus,
                nationality: form.nationality,
                religion: form.religion,
                bloodType: form.bloodType
            },
            contactInfo: {
                phone: form.phone,
                mobile: form.mobile,
                personalEmail: form.personalEmail,
                address: {
                    street: form.street, city: form.city, state: form.state,
                    country: form.country, postalCode: form.postalCode
                },
                emergencyContact: {
                    name: form.ecName, relationship: form.ecRelationship, phone: form.ecPhone
                }
            },
            documents: (!hasId && form.idDocumentName)
                ? [{ name: form.idDocumentName, type: 'id', fileUrl: form.idDocumentUrl }]
                : []
        };
    };

    const save = async (submit) => {
        setSaving(true);
        try {
            const res = await api.put('/employees/onboarding/me', buildPayload(submit));
            setEmployee(res.data.employee);
            setCompletion(res.data.completion);
            toast.success(submit ? 'Submitted to HR for verification' : 'Progress saved');
            setShowConfirm(false);
            if (submit) await load();
        } catch (err) {
            const data = err.response?.data;
            if (data?.completion) setCompletion(data.completion);
            toast.error(data?.message || 'Could not save your information');
            setShowConfirm(false);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingState label="Loading your onboarding…" />;

    if (error) {
        return (
            <div className="p-3 p-lg-4">
                <EmptyState
                    icon={FaUserEdit}
                    title="No onboarding record yet"
                    description={error}
                />
            </div>
        );
    }

    const status = completion?.onboardingStatus;
    const locked = ['under_hr_verification', 'pending_manager_approval', 'complete'].includes(status);
    const transferred = completion?.transferred || {};
    const hasIdDocument = (employee?.documents || []).some(d => d.type === 'id');

    return (
        <div className="p-3 p-lg-4">
            <div className="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
                <div>
                    <h5 className="fw-bold text-dark mb-1">Complete Your Profile</h5>
                    <div className="text-muted" style={{ fontSize: '0.84rem' }}>
                        {employee?.employeeId} · {employee?.employmentInfo?.jobTitle || 'Employee'}
                    </div>
                </div>
                <StatusBadge status={status} />
            </div>

            {status === 'needs_correction' && completion?.correctionNote && (
                <Alert variant="warning" className="rounded-3">
                    <strong>HR asked for a correction:</strong> {completion.correctionNote}
                </Alert>
            )}

            {status === 'under_hr_verification' && (
                <Alert variant="info" className="rounded-3">
                    Your information has been submitted and is being verified by HR. You'll be notified if anything needs changing.
                </Alert>
            )}

            {status === 'pending_manager_approval' && (
                <Alert variant="info" className="rounded-3">
                    HR has verified your details and sent them to the HR Manager for approval.
                </Alert>
            )}

            {status === 'complete' && (
                <Alert variant="success" className="rounded-3">
                    <FaCheckCircle className="me-2" />
                    Your employee profile is complete and approved.
                </Alert>
            )}

            <Row className="g-3">
                <Col lg={4}>
                    <Card className="p-3 mb-3">
                        <CompletionMeter percent={completion?.percent ?? 0} missing={completion?.missing || []} />
                    </Card>

                    <Card className="p-3">
                        <SectionHeader
                            title="Already on file"
                            description="Carried over from your application - no need to re-enter."
                        />
                        <ReadOnlyRow icon={FaIdCard} label="Full name" value={transferred.fullName} />
                        <ReadOnlyRow icon={FaFileAlt} label="Email" value={transferred.email} />
                        <ReadOnlyRow icon={FaBriefcase} label="Hired position" value={transferred.appliedPosition} />
                        <ReadOnlyRow icon={FaTools} label="Skills" value={(transferred.skills || []).join(', ')} />
                        <ReadOnlyRow icon={FaLanguage} label="Languages" value={(transferred.languages || []).join(', ')} />
                        <ReadOnlyRow icon={FaGraduationCap} label="Education" value={transferred.education ? `${transferred.education} record(s)` : ''} />
                        <ReadOnlyRow icon={FaBriefcase} label="Work experience" value={transferred.workExperience ? `${transferred.workExperience} record(s)` : ''} />
                        <ReadOnlyRow icon={FaFileAlt} label="CV" value={transferred.hasResume ? 'On file' : ''} />
                    </Card>
                </Col>

                <Col lg={8}>
                    <Card className="p-3 p-lg-4">
                        <SectionHeader
                            title="Information we still need"
                            description="Only the details your application could not provide."
                        />

                        <Form>
                            <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Personal details</div>
                            <Row className="g-3 mb-3">
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Date of birth</Form.Label>
                                    <Form.Control type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} disabled={locked} />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Gender</Form.Label>
                                    <Form.Select value={form.gender} onChange={set('gender')} disabled={locked}>
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                        <option value="other">Other</option>
                                    </Form.Select>
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Marital status</Form.Label>
                                    <Form.Select value={form.maritalStatus} onChange={set('maritalStatus')} disabled={locked}>
                                        <option value="">Select…</option>
                                        <option value="single">Single</option>
                                        <option value="married">Married</option>
                                        <option value="divorced">Divorced</option>
                                        <option value="widowed">Widowed</option>
                                    </Form.Select>
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Blood type</Form.Label>
                                    <Form.Select value={form.bloodType} onChange={set('bloodType')} disabled={locked}>
                                        <option value="">Select…</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </Form.Select>
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Nationality</Form.Label>
                                    <Form.Control value={form.nationality} onChange={set('nationality')} disabled={locked} placeholder="e.g. Ethiopian" />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Religion <span className="text-muted fw-normal">(optional)</span></Form.Label>
                                    <Form.Control value={form.religion} onChange={set('religion')} disabled={locked} />
                                </Col>
                            </Row>

                            <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Contact & address</div>
                            <Row className="g-3 mb-3">
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Phone</Form.Label>
                                    <Form.Control value={form.phone} onChange={set('phone')} disabled={locked} />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Mobile <span className="text-muted fw-normal">(optional)</span></Form.Label>
                                    <Form.Control value={form.mobile} onChange={set('mobile')} disabled={locked} />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Personal email <span className="text-muted fw-normal">(optional)</span></Form.Label>
                                    <Form.Control type="email" value={form.personalEmail} onChange={set('personalEmail')} disabled={locked} />
                                </Col>
                                <Col md={6}>
                                    <Form.Label className="small fw-semibold">Street</Form.Label>
                                    <Form.Control value={form.street} onChange={set('street')} disabled={locked} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small fw-semibold">City</Form.Label>
                                    <Form.Control value={form.city} onChange={set('city')} disabled={locked} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small fw-semibold">Country</Form.Label>
                                    <Form.Control value={form.country} onChange={set('country')} disabled={locked} />
                                </Col>
                            </Row>

                            <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Emergency contact</div>
                            <Row className="g-3 mb-3">
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Full name</Form.Label>
                                    <Form.Control value={form.ecName} onChange={set('ecName')} disabled={locked} />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Relationship</Form.Label>
                                    <Form.Control value={form.ecRelationship} onChange={set('ecRelationship')} disabled={locked} placeholder="e.g. Sister" />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="small fw-semibold">Phone</Form.Label>
                                    <Form.Control value={form.ecPhone} onChange={set('ecPhone')} disabled={locked} />
                                </Col>
                            </Row>

                            <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Identification</div>
                            {hasIdDocument ? (
                                <div className="d-flex align-items-center gap-2 mb-3 text-success" style={{ fontSize: '0.85rem' }}>
                                    <FaCheckCircle /> Identification document on file
                                </div>
                            ) : (
                                <Row className="g-3 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="small fw-semibold">Document name</Form.Label>
                                        <Form.Control value={form.idDocumentName} onChange={set('idDocumentName')} disabled={locked} placeholder="e.g. National ID" />
                                    </Col>
                                    <Col md={6}>
                                        <Form.Label className="small fw-semibold">Reference / file link</Form.Label>
                                        <Form.Control value={form.idDocumentUrl} onChange={set('idDocumentUrl')} disabled={locked} placeholder="ID number or uploaded file link" />
                                    </Col>
                                </Row>
                            )}

                            {!locked && (
                                <div className="d-flex gap-2 flex-wrap pt-2" style={{ borderTop: `1px solid ${TOKENS.border}` }}>
                                    <Button variant="outline-secondary" onClick={() => save(false)} disabled={saving} className="mt-3">
                                        <FaSave className="me-2" />{saving ? 'Saving…' : 'Save progress'}
                                    </Button>
                                    <Button variant="primary" onClick={() => setShowConfirm(true)} disabled={saving} className="mt-3">
                                        <FaPaperPlane className="me-2" />Submit to HR
                                    </Button>
                                </div>
                            )}
                        </Form>
                    </Card>
                </Col>
            </Row>

            <Modal show={showConfirm} onHide={() => setShowConfirm(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Submit for verification?</Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ fontSize: '0.9rem' }}>
                    Your details will be sent to HR for verification and you won't be able to edit them
                    while they are being reviewed. HR can send them back if a correction is needed.
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="outline-secondary" onClick={() => setShowConfirm(false)} disabled={saving}>Cancel</Button>
                    <Button variant="primary" onClick={() => save(true)} disabled={saving}>
                        {saving ? 'Submitting…' : 'Submit'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default EmployeeOnboarding;
