import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { FaSave, FaPaperPlane, FaTimes, FaPlus, FaTrash } from 'react-icons/fa';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import BackButton from '../common/BackButton';

const REQUEST_TYPES = [
    { value: 'new_position', label: 'New Position' },
    { value: 'replacement', label: 'Replacement' },
    { value: 'additional_headcount', label: 'Additional Headcount' }
];
// Fixed by the JobRequisition schema enums - these are workflow values the
// backend validates, not organization lookup lists.
const LEVELS = ['Beginner', 'Junior', 'Intermediate', 'Senior'];
const EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Freelance'];

const EMPTY_FORM = {
    department: '', position: '', positionTitle: '',
    numberOfPositions: 1, requestType: 'new_position', employmentType: 'Full-Time', level: 'Intermediate',
    education: '', experience: '', skills: [], languages: [], licenses: [],
    responsibilities: [], competencies: [], startDate: '',
    salary: { amount: '', currency: 'ETB', period: 'monthly' },
    reason: ''
};

/** Only options the organization still has switched on may be chosen. */
const activeOnly = (list) => (list || []).filter(item => item.status !== 'inactive');

/**
 * Multi-select over one of the organization's configured lookup lists.
 *
 * Requisitions store these as names (the vacancy created from the requisition
 * carries the same plain strings), but the choice always comes from
 * Configuration so a Department Head selects from what the organization has
 * already defined instead of inventing a parallel vocabulary. Falls back to
 * free entry only when the organization has not configured that list at all -
 * otherwise the field would be unusable for them.
 */
const ConfiguredMultiSelect = ({ label, options, values, onChange, emptyHint, placeholder }) => {
    const [draft, setDraft] = useState('');

    const remaining = options.filter(option => !values.includes(option));
    const add = (value) => {
        const trimmed = (value || '').trim();
        if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    };
    const remove = (value) => onChange(values.filter(v => v !== value));

    return (
        <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">{label}</Form.Label>
            {options.length > 0 ? (
                <Form.Select
                    value=""
                    className="form-control-custom"
                    disabled={remaining.length === 0}
                    onChange={(e) => { add(e.target.value); e.target.value = ''; }}
                >
                    <option value="">
                        {remaining.length === 0 ? 'All configured options selected' : `Select ${label.toLowerCase()}…`}
                    </option>
                    {remaining.map(option => <option key={option} value={option}>{option}</option>)}
                </Form.Select>
            ) : (
                <div className="d-flex gap-2">
                    <Form.Control
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={placeholder}
                        className="form-control-custom"
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); setDraft(''); } }}
                    />
                    <Button onClick={() => { add(draft); setDraft(''); }} variant="primary"><FaPlus /></Button>
                </div>
            )}
            {options.length === 0 && emptyHint && (
                <Form.Text className="text-muted">{emptyHint}</Form.Text>
            )}
            {values.length > 0 && (
                <div className="d-flex flex-wrap gap-2 mt-2">
                    {values.map((value) => (
                        <span key={value} className="badge bg-primary p-2 d-flex align-items-center gap-2">
                            {value}
                            <Button variant="link" className="p-0 text-white" style={{ fontSize: '0.7rem' }}
                                    onClick={() => remove(value)}>
                                <FaTrash />
                            </Button>
                        </span>
                    ))}
                </div>
            )}
        </Form.Group>
    );
};

/** A free-text "type and press Enter/+" list, for fields with no configured list to draw on. */
const TagListField = ({ label, values, onChange, placeholder }) => {
    const [draft, setDraft] = useState('');

    const add = () => {
        const value = draft.trim();
        if (value && !values.includes(value)) onChange([...values, value]);
        setDraft('');
    };
    const remove = (value) => onChange(values.filter(v => v !== value));

    return (
        <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">{label}</Form.Label>
            <div className="d-flex gap-2 mb-2">
                <Form.Control
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={placeholder}
                    className="form-control-custom"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                />
                <Button onClick={add} variant="primary"><FaPlus /></Button>
            </div>
            <div className="d-flex flex-wrap gap-2">
                {values.map((value) => (
                    <span key={value} className="badge bg-primary p-2 d-flex align-items-center gap-2">
                        {value}
                        <Button variant="link" className="p-0 text-white" style={{ fontSize: '0.7rem' }}
                                onClick={() => remove(value)}>
                            <FaTrash />
                        </Button>
                    </span>
                ))}
            </div>
        </Form.Group>
    );
};

/**
 * Raise or edit a Job Requisition / Manpower Request.
 *
 * Department must always come from the organization's own configured list -
 * never free text - and Position/Job Title uses that same configuration
 * where the organization has set one up.
 *
 * Editing is only possible while a requisition is draft, returned or
 * rejected; once submitted it belongs to the HR review workflow.
 */
const ROLE_HOME = { employer: 'employer', hr_expert: 'hr-expert', hr_manager: 'hr-manager', employee: 'employee' };

const RequisitionForm = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { user } = useAuth();
    const isEditing = Boolean(id);
    const homePath = `/${ROLE_HOME[user?.role] || 'hr-expert'}/requisitions`;

    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [config, setConfig] = useState({
        departments: [], positions: [], jobTitles: [], skills: [],
        languages: [], licenses: [], educationLevels: [], positionRanks: []
    });
    const [form, setForm] = useState(EMPTY_FORM);
    const [status, setStatus] = useState(null);

    const isAmending = isEditing && ['approved', 'job_created'].includes(status);

    // A Department Head (any non-employer account) may only raise a
    // requisition for the department(s) they are assigned to head - the
    // Employer may raise for any department. `employment.headOfDepartments`
    // comes from the backend auth payload and already includes departments
    // this user temporarily covers as an active delegate of the assigned
    // head. Enforced again server-side regardless; this just keeps the
    // dropdown from offering a choice that would only fail later.
    const headedIds = (user?.employment?.headOfDepartments || []).map(h => String(h.id));
    const selectableDepartments = user?.role === 'employer'
        ? config.departments
        : config.departments.filter(d =>
            String(d.manager) === String(user?.id) || headedIds.includes(String(d._id)));

    const loadConfig = useCallback(async () => {
        try {
            const res = await api.get('/config');
            const data = res.data.data || {};
            setConfig({
                departments: activeOnly(data.departments),
                positions: activeOnly(data.positions),
                jobTitles: activeOnly(data.jobTitles),
                skills: activeOnly(data.skills),
                languages: activeOnly(data.languages),
                licenses: activeOnly(data.licenses),
                educationLevels: activeOnly(data.educationLevels),
                positionRanks: activeOnly(data.positionRanks)
            });
        } catch (err) {
            console.error('Failed to load configuration', err);
        }
    }, []);

    const loadRequisition = useCallback(async () => {
        if (!isEditing) return;
        setLoading(true);
        try {
            const res = await api.get(`/requisitions/${id}`);
            const r = res.data.data;
            setForm({
                department: r.department || '',
                position: r.position || '',
                positionTitle: r.positionTitle || '',
                numberOfPositions: r.numberOfPositions || 1,
                requestType: r.requestType || 'new_position',
                employmentType: r.employmentType || 'Full-Time',
                level: r.level || 'Intermediate',
                education: r.education || '',
                experience: r.experience || '',
                skills: r.skills || [],
                languages: r.languages || [],
                licenses: r.licenses || [],
                responsibilities: r.responsibilities || [],
                competencies: r.competencies || [],
                startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : '',
                salary: { amount: r.salary?.amount || '', currency: r.salary?.currency || 'ETB', period: r.salary?.period || 'monthly' },
                reason: r.reason || ''
            });
            setStatus(r.status);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load this requisition.');
        } finally {
            setLoading(false);
        }
    }, [id, isEditing]);

    useEffect(() => { loadConfig(); }, [loadConfig]);
    useEffect(() => { loadRequisition(); }, [loadRequisition]);

    // A single Department Head heads exactly one department in almost every
    // organization, so preselect it rather than making them choose from a list
    // of one. The Employer, who may raise for any department, still chooses.
    useEffect(() => {
        if (isEditing || form.department) return;
        if (user?.role !== 'employer' && selectableDepartments.length === 1) {
            setForm(prev => ({ ...prev, department: selectableDepartments[0]._id }));
        }
    }, [isEditing, form.department, selectableDepartments, user?.role]);

    const positionsForDepartment = config.positions.filter(p => !form.department || String(p.department) === String(form.department));

    // Configured lookup values, as the plain names a requisition stores.
    const options = useMemo(() => ({
        skills: config.skills.map(s => s.name),
        languages: config.languages.map(l => l.name),
        licenses: config.licenses.map(l => l.name),
        educationLevels: config.educationLevels.map(e => e.name),
        jobTitles: config.jobTitles.map(j => j.name)
    }), [config]);

    // The Position Rank attached to the currently selected Position (if any).
    // A Rank carries one fixed salary figure, configured once by the Employer,
    // so the requester doesn't have to know or guess it when raising a
    // request for a position that already has a defined pay grade.
    const selectedRank = useMemo(() => {
        const chosen = config.positions.find(p => p._id === form.position);
        if (!chosen || !chosen.rank) return null;
        return config.positionRanks.find(r => r._id === chosen.rank) || null;
    }, [config.positions, config.positionRanks, form.position]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('salary.')) {
            setForm(prev => ({ ...prev, salary: { ...prev.salary, [name.split('.')[1]]: value } }));
        } else if (name === 'department') {
            const nextPositions = config.positions.filter(p => String(p.department) === String(value));
            setForm(prev => ({
                ...prev,
                department: value,
                position: '',
                positionTitle: nextPositions.length > 0 || prev.position ? '' : prev.positionTitle
            }));
        } else if (name === 'position') {
            const chosen = config.positions.find(p => p._id === value);
            const rank = chosen?.rank ? config.positionRanks.find(r => r._id === chosen.rank) : null;
            setForm(prev => ({
                ...prev,
                position: value,
                positionTitle: chosen ? chosen.title : prev.positionTitle,
                // Pre-fill the fixed salary from the position's rank so the
                // requester isn't left guessing the org's pay grade for it.
                // Still just a starting point - they can adjust it below.
                salary: (rank && typeof rank.salary === 'number')
                    ? { ...prev.salary, amount: rank.salary }
                    : prev.salary
            }));
        } else {
            setForm(prev => ({ ...prev, [name]: value }));
        }
        setError('');
    };

    const buildPayload = () => {
        const amount = Number(form.salary.amount);
        return {
            department: form.department,
            position: form.position || undefined,
            positionTitle: form.positionTitle.trim(),
            numberOfPositions: Number(form.numberOfPositions) || 1,
            requestType: form.requestType,
            employmentType: form.employmentType,
            level: form.level,
            education: form.education,
            experience: form.experience,
            skills: form.skills,
            languages: form.languages,
            licenses: form.licenses,
            responsibilities: form.responsibilities,
            competencies: form.competencies,
            startDate: form.startDate,
            salary: { amount, currency: form.salary.currency, period: form.salary.period },
            reason: form.reason.trim()
        };
    };

    const validate = () => {
        if (!form.department) return 'Department is required and must be one of your organization\'s configured departments.';
        if (!form.positionTitle.trim()) return 'Position/Job title is required.';
        if (!form.numberOfPositions || Number(form.numberOfPositions) < 1) return 'Number of employees required must be at least 1.';
        if (!form.level) return 'Required level is required.';
        if (!form.startDate) return 'Required start date is required.';
        if (!form.reason.trim()) return 'A reason/justification for hiring is required.';
        const amount = Number(form.salary.amount);
        if (!form.salary.amount || Number.isNaN(amount) || amount <= 0) return 'Please enter a valid, positive fixed salary amount.';
        return '';
    };

    const submitForm = async (intent) => {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = { ...buildPayload(), action: intent, submitForApproval: intent === 'submit' };
            if (isAmending) {
                await api.put(`/requisitions/${id}/amend`, payload);
                toast.success('Amendment submitted for HR Manager re-approval');
            } else if (isEditing) {
                await api.put(`/requisitions/${id}`, payload);
                if (intent === 'submit') await api.put(`/requisitions/${id}/submit`);
                toast.success(intent === 'submit' ? 'Requisition submitted for HR review' : 'Draft saved');
            } else {
                await api.post('/requisitions', payload);
                toast.success(intent === 'submit' ? 'Requisition submitted for HR review' : 'Draft saved');
            }
            navigate(homePath);
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to save requisition';
            setError(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
            </div>
        );
    }

    return (
        <section className="py-4">
            <Container>
                <BackButton to={homePath} />
                <div className="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <h2 className="fw-bold mb-0">
                            {isAmending ? 'Amend Job Requisition' : (isEditing ? 'Edit Job Requisition' : 'New Job Requisition')}
                        </h2>
                        <p className="text-muted">
                            {isAmending
                                ? 'This requisition was already approved (and may already have created a vacancy). Changing an essential requirement here requires HR Manager re-approval before it takes effect.'
                                : 'Raise a staffing need for HR to review and approve.'}
                        </p>
                    </div>
                    <Button variant="outline-secondary" onClick={() => navigate(homePath)}>
                        <FaTimes className="me-2" /> Cancel
                    </Button>
                </div>

                <Row>
                    <Col lg={8} className="mx-auto">
                        <Card className="shadow-sm">
                            <Card.Body className="p-4 p-md-5">
                                {error && <Alert variant="danger">{error}</Alert>}
                                {isAmending && (
                                    <Alert variant="info">
                                        Submitting here sends this requisition back to <strong>Pending Approval</strong>. If a vacancy was
                                        already created from it, that vacancy's fields will be updated automatically once the HR Manager re-approves.
                                    </Alert>
                                )}
                                {config.departments.length === 0 && (
                                    <Alert variant="warning">
                                        Your organization has no configured departments yet. Add one in Configuration before raising a requisition.
                                    </Alert>
                                )}
                                {config.departments.length > 0 && selectableDepartments.length === 0 && (
                                    <Alert variant="warning">
                                        You are not assigned as the Department Head of any department yet. Ask your Employer to assign
                                        you to a department in Configuration before you can raise a requisition.
                                    </Alert>
                                )}

                                <Form onSubmit={(e) => e.preventDefault()}>
                                    <h5 className="fw-bold mb-3">Staffing Need</h5>
                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Department <span className="text-danger">*</span></Form.Label>
                                            <Form.Select name="department" value={form.department} onChange={handleChange} className="form-control-custom" required>
                                                <option value="">Select a department…</option>
                                                {selectableDepartments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                            </Form.Select>
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Request Type <span className="text-danger">*</span></Form.Label>
                                            <Form.Select name="requestType" value={form.requestType} onChange={handleChange} className="form-control-custom">
                                                {REQUEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </Form.Select>
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Position / Job Title <span className="text-danger">*</span></Form.Label>
                                            {positionsForDepartment.length > 0 ? (
                                                <Form.Select name="position" value={form.position} onChange={handleChange} className="form-control-custom">
                                                    <option value="">Select a position…</option>
                                                    {positionsForDepartment.map(p => {
                                                        const rankName = p.rank
                                                            ? config.positionRanks.find(r => r._id === p.rank)?.name
                                                            : null;
                                                        return (
                                                            <option key={p._id} value={p._id}>
                                                                {p.title}{rankName ? ` (${rankName})` : ''}
                                                            </option>
                                                        );
                                                    })}
                                                </Form.Select>
                                            ) : options.jobTitles.length > 0 ? (
                                                <Form.Select name="positionTitle" value={form.positionTitle} onChange={handleChange}
                                                             className="form-control-custom" required>
                                                    <option value="">Select a job title…</option>
                                                    {options.jobTitles.map(title => <option key={title} value={title}>{title}</option>)}
                                                </Form.Select>
                                            ) : (
                                                <Form.Control
                                                    type="text" name="positionTitle" value={form.positionTitle} onChange={handleChange}
                                                    placeholder="e.g., Backend Developer" className="form-control-custom" required
                                                />
                                            )}
                                            {positionsForDepartment.length === 0 && (
                                                <Form.Text className="text-muted">
                                                    {options.jobTitles.length > 0
                                                        ? 'No positions configured for this department - choose one of the organization\'s job titles.'
                                                        : 'No positions or job titles configured yet - typed freely.'}
                                                </Form.Text>
                                            )}
                                        </Col>
                                        <Col md={3} className="mb-3">
                                            <Form.Label className="fw-semibold">No. of Employees <span className="text-danger">*</span></Form.Label>
                                            <Form.Control type="number" min="1" name="numberOfPositions" value={form.numberOfPositions}
                                                          onChange={handleChange} className="form-control-custom" required />
                                        </Col>
                                        <Col md={3} className="mb-3">
                                            <Form.Label className="fw-semibold">Employment Type</Form.Label>
                                            <Form.Select name="employmentType" value={form.employmentType} onChange={handleChange} className="form-control-custom">
                                                {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </Form.Select>
                                        </Col>
                                    </Row>

                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Required Level <span className="text-danger">*</span></Form.Label>
                                            <Form.Select name="level" value={form.level} onChange={handleChange} className="form-control-custom">
                                                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                                            </Form.Select>
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Required Start Date <span className="text-danger">*</span></Form.Label>
                                            <Form.Control type="date" name="startDate" value={form.startDate} onChange={handleChange} className="form-control-custom" required />
                                        </Col>
                                    </Row>

                                    <hr className="my-4" />
                                    <h5 className="fw-bold mb-3">Requirements</h5>
                                    <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: '-0.5rem' }}>
                                        These come from your organization's configuration. Ask your Employer to add an
                                        option if something you need is missing - a requisition never creates new
                                        departments, positions, skills or levels.
                                    </p>
                                    <Row>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Required Education</Form.Label>
                                            {options.educationLevels.length > 0 ? (
                                                <Form.Select name="education" value={form.education} onChange={handleChange}
                                                             className="form-control-custom">
                                                    <option value="">Select an education level…</option>
                                                    {options.educationLevels.map(level => (
                                                        <option key={level} value={level}>{level}</option>
                                                    ))}
                                                </Form.Select>
                                            ) : (
                                                <Form.Control type="text" name="education" value={form.education} onChange={handleChange}
                                                              placeholder="e.g., BSc Computer Science" className="form-control-custom" />
                                            )}
                                            {options.educationLevels.length === 0 && (
                                                <Form.Text className="text-muted">
                                                    No education levels configured yet - typed freely.
                                                </Form.Text>
                                            )}
                                        </Col>
                                        <Col md={6} className="mb-3">
                                            <Form.Label className="fw-semibold">Required Experience</Form.Label>
                                            <Form.Control type="text" name="experience" value={form.experience} onChange={handleChange}
                                                          placeholder="e.g., 2+ years" className="form-control-custom" />
                                            <Form.Text className="text-muted">
                                                Free text: experience is a duration, not one of the organization's lookup lists.
                                            </Form.Text>
                                        </Col>
                                    </Row>

                                    <ConfiguredMultiSelect
                                        label="Required Skills"
                                        options={options.skills}
                                        values={form.skills}
                                        placeholder="Enter a skill"
                                        emptyHint="No skills configured yet - typed freely."
                                        onChange={(skills) => setForm(prev => ({ ...prev, skills }))}
                                    />
                                    <ConfiguredMultiSelect
                                        label="Required Languages"
                                        options={options.languages}
                                        values={form.languages}
                                        placeholder="Enter a language"
                                        emptyHint="No languages configured yet - typed freely."
                                        onChange={(languages) => setForm(prev => ({ ...prev, languages }))}
                                    />
                                    <ConfiguredMultiSelect
                                        label="Licenses / Certifications"
                                        options={options.licenses}
                                        values={form.licenses}
                                        placeholder="Enter a license"
                                        emptyHint="No licenses configured yet - typed freely."
                                        onChange={(licenses) => setForm(prev => ({ ...prev, licenses }))}
                                    />
                                    <TagListField label="Job Responsibilities" values={form.responsibilities} placeholder="Enter a responsibility"
                                                  onChange={(responsibilities) => setForm(prev => ({ ...prev, responsibilities }))} />
                                    <TagListField label="Required Competencies" values={form.competencies} placeholder="Enter a competency"
                                                  onChange={(competencies) => setForm(prev => ({ ...prev, competencies }))} />

                                    <hr className="my-4" />
                                    <h5 className="fw-bold mb-3">Salary</h5>
                                    <Row>
                                        <Col md={5} className="mb-3">
                                            <Form.Label className="fw-semibold">Salary Amount <span className="text-danger">*</span></Form.Label>
                                            <Form.Control type="number" min="1" step="1" name="salary.amount" value={form.salary.amount}
                                                          onChange={handleChange} placeholder="e.g. 25000" className="form-control-custom" required />
                                            <Form.Text className="text-muted">
                                                Fixed amount, not a range.
                                                {selectedRank && typeof selectedRank.salary === 'number' && (
                                                    <> Pre-filled from the <strong>{selectedRank.name}</strong> rank's configured salary - you may still adjust it.</>
                                                )}
                                            </Form.Text>
                                        </Col>
                                        <Col md={4} className="mb-3">
                                            <Form.Label className="fw-semibold">Currency</Form.Label>
                                            <Form.Select name="salary.currency" value={form.salary.currency} onChange={handleChange} className="form-control-custom">
                                                <option value="ETB">ETB</option>
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                            </Form.Select>
                                        </Col>
                                        <Col md={3} className="mb-3">
                                            <Form.Label className="fw-semibold">Pay period</Form.Label>
                                            <Form.Select name="salary.period" value={form.salary.period} onChange={handleChange} className="form-control-custom">
                                                <option value="hourly">Hourly</option>
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="monthly">Monthly</option>
                                                <option value="annual">Annual</option>
                                            </Form.Select>
                                        </Col>
                                    </Row>

                                    <hr className="my-4" />
                                    <Form.Group className="mb-4">
                                        <Form.Label className="fw-semibold">Reason / Justification for Hiring <span className="text-danger">*</span></Form.Label>
                                        <Form.Control as="textarea" rows={3} name="reason" value={form.reason} onChange={handleChange}
                                                      placeholder="Why is this position needed?" className="form-control-custom" required />
                                    </Form.Group>

                                    <div className="d-flex gap-2">
                                        {isAmending ? (
                                            <Button variant="warning" disabled={saving} onClick={() => submitForm('amend')}
                                                    className="d-flex align-items-center gap-2">
                                                {saving ? <Spinner size="sm" animation="border" /> : <FaPaperPlane />} Submit Amendment for Re-approval
                                            </Button>
                                        ) : (
                                            <>
                                                <Button variant="outline-primary" disabled={saving} onClick={() => submitForm('draft')}
                                                        className="d-flex align-items-center gap-2">
                                                    {saving ? <Spinner size="sm" animation="border" /> : <FaSave />} Save Draft
                                                </Button>
                                                <Button variant="primary" disabled={saving} onClick={() => submitForm('submit')}
                                                        className="d-flex align-items-center gap-2">
                                                    {saving ? <Spinner size="sm" animation="border" /> : <FaPaperPlane />} Submit for HR Review
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default RequisitionForm;
