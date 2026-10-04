import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaClipboardList, FaPlus, FaEdit, FaGraduationCap } from 'react-icons/fa';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

const EMPTY_FORM = { title: '', trainingType: 'technical', description: '', urgency: 'normal', estimatedCost: '', department: '' };

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'submitted', label: 'Pending Review' },
    { key: 'returned_for_correction', label: 'Returned' },
    { key: 'validated', label: 'Validated' },
    { key: 'program_created', label: 'Programme Prepared' }
];

/**
 * Training Need - the Department Head's channel for identifying a training
 * gap within their own department (spec: Training workflow step 1).
 *
 * Reachable by any employee account, but only an employee assigned as a
 * Department's Head can actually raise a department need - see
 * trainingNeedController.createNeed. A personal training interest (no
 * department restriction) is submitted from the employee's own dashboard
 * instead (EmployeeDashboard's "My Training" tab), never here.
 */
const TrainingNeeds = () => {
    const { user } = useAuth();
    const isDepartmentHead = !!user?.employment?.isDepartmentHead;
    const headedDepartments = user?.employment?.headOfDepartments || [];

    const [needs, setNeeds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [resubmitTarget, setResubmitTarget] = useState(null);
    const [saving, setSaving] = useState(false);

    // Department-scoped Training Programs, for nominating participants from
    // this head's own department once a programme is approved (spec:
    // Training workflow step 5 - Employee Selection).
    const [deptTrainings, setDeptTrainings] = useState([]);
    const [deptEmployees, setDeptEmployees] = useState([]);
    const [nominating, setNominating] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/training-needs');
            setNeeds(res.data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load training needs.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDeptTrainingData = useCallback(async () => {
        if (!isDepartmentHead) return;
        try {
            const [trainingsRes, employeesRes] = await Promise.all([
                api.get('/training/department'),
                api.get('/departments/mine/employees')
            ]);
            setDeptTrainings(trainingsRes.data.data || []);
            setDeptEmployees(employeesRes.data.data || []);
        } catch {
            // Non-fatal: the nomination section simply stays empty if this fails.
        }
    }, [isDepartmentHead]);

    useEffect(() => { load(); loadDeptTrainingData(); }, [load, loadDeptTrainingData]);

    const nominate = async (trainingId, employeeId) => {
        if (!employeeId) return;
        setNominating(prev => ({ ...prev, [trainingId]: true }));
        try {
            await api.put(`/training/${trainingId}/nominate`, { employeeId });
            toast.success('Employee nominated for training');
            loadDeptTrainingData();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not nominate this employee');
        } finally {
            setNominating(prev => ({ ...prev, [trainingId]: false }));
        }
    };

    const visible = useMemo(() => {
        const departmentOnly = needs.filter(n => n.origin === 'department');
        if (filter === 'all') return departmentOnly;
        return departmentOnly.filter(n => n.status === filter);
    }, [needs, filter]);

    const openResubmit = (need) => {
        setResubmitTarget(need._id);
        setForm({
            title: need.title || '',
            trainingType: need.trainingType || 'technical',
            description: need.description || '',
            urgency: need.urgency || 'normal',
            estimatedCost: need.estimatedCost ?? '',
            department: ''
        });
        setShowForm(true);
    };

    const openCreate = () => {
        setResubmitTarget(null);
        setForm({ ...EMPTY_FORM, department: headedDepartments[0]?.id || '' });
        setShowForm(true);
    };

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { department, ...rest } = form;
            const body = { ...rest, estimatedCost: form.estimatedCost === '' ? null : Number(form.estimatedCost) };
            if (resubmitTarget) {
                await api.put(`/training-needs/${resubmitTarget}/resubmit`, body);
                toast.success('Training need corrected and resubmitted');
            } else {
                await api.post('/training-needs', { origin: 'department', department, ...body });
                toast.success('Training need submitted for HR review');
            }
            setShowForm(false);
            setResubmitTarget(null);
            setForm(EMPTY_FORM);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not save the training need');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <LoadingState label="Loading training needs…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <SectionHeader
                title="Training Needs"
                description="Identify a training gap in your department for HR to review and prepare into a programme."
                action={isDepartmentHead && (
                    <Button size="sm" onClick={openCreate}>
                        <FaPlus className="me-1" /> New Training Need
                    </Button>
                )}
            />

            <div className="d-flex gap-2 mb-3 flex-wrap">
                {FILTERS.map(f => (
                    <Button key={f.key} size="sm" variant={filter === f.key ? 'primary' : 'outline-secondary'}
                            onClick={() => setFilter(f.key)}>{f.label}</Button>
                ))}
            </div>

            {visible.length === 0 ? (
                <EmptyState icon={FaClipboardList} title="No training needs"
                            description={isDepartmentHead
                                ? 'Raise a training need for your department using the button above.'
                                : 'You are not assigned as the head of any department, so there is nothing to raise here.'} />
            ) : (
                <div className="d-flex flex-column gap-2">
                    {visible.map(need => {
                        const isRequester = need.requestedBy?._id === user?.id || need.requestedBy === user?.id;
                        return (
                            <Card key={need._id} className="p-3">
                                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                    <div style={{ minWidth: 0 }}>
                                        <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                            <h6 className="fw-bold text-dark mb-0">{need.title}</h6>
                                            <StatusBadge status={need.status} />
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {need.departmentName} · {need.trainingType.replace('_', ' ')}
                                            {need.urgency === 'high' && <span className="text-danger ms-1">· High urgency</span>}
                                        </div>
                                        <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>{need.description}</div>
                                        {need.status === 'returned_for_correction' && need.returnReason && (
                                            <div className="text-danger mt-1" style={{ fontSize: '0.78rem' }}>
                                                Returned: {need.returnReason}
                                            </div>
                                        )}
                                        {need.linkedTraining && (
                                            <div className="text-success mt-1" style={{ fontSize: '0.78rem' }}>
                                                Prepared into programme: {need.linkedTraining.title} ({need.linkedTraining.status})
                                            </div>
                                        )}
                                    </div>
                                    {isRequester && need.status === 'returned_for_correction' && (
                                        <Button size="sm" variant="outline-primary" onClick={() => openResubmit(need)}>
                                            <FaEdit className="me-1" /> Correct &amp; Resubmit
                                        </Button>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {isDepartmentHead && (
                <div className="mt-4">
                    <SectionHeader
                        title="Department Training Programs"
                        description="Approved/open programmes relevant to your department - nominate your employees once approved."
                    />
                    {deptTrainings.length === 0 ? (
                        <EmptyState icon={FaGraduationCap} title="No department training yet"
                                    description="Programmes prepared from your department's training needs appear here once approved." />
                    ) : (
                        <div className="d-flex flex-column gap-2">
                            {deptTrainings.map(t => {
                                const participantIds = new Set((t.participants || []).map(p => p.employee?._id || p.employee));
                                const nominable = deptEmployees.filter(e => !participantIds.has(e._id));
                                const canNominate = ['approved', 'open'].includes(t.status);
                                return (
                                    <Card key={t._id} className="p-3">
                                        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                                            <div>
                                                <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
                                                    <h6 className="fw-bold text-dark mb-0">{t.title}</h6>
                                                    <StatusBadge status={t.status} />
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {(t.participants || []).length} department participant(s)
                                                </div>
                                            </div>
                                            {canNominate && nominable.length > 0 && (
                                                <Form.Select size="sm" style={{ maxWidth: 220 }} disabled={nominating[t._id]}
                                                             onChange={e => nominate(t._id, e.target.value)} value="">
                                                    <option value="" disabled>Nominate an employee…</option>
                                                    {nominable.map(e => (
                                                        <option key={e._id} value={e._id}>
                                                            {e.personalInfo?.firstName} {e.personalInfo?.lastName}
                                                        </option>
                                                    ))}
                                                </Form.Select>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <Modal show={showForm} onHide={() => { setShowForm(false); setResubmitTarget(null); }} centered>
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title>{resubmitTarget ? 'Correct Training Need' : 'New Training Need'}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {!resubmitTarget && (
                            headedDepartments.length > 1 ? (
                                <Form.Group className="mb-3">
                                    <Form.Label>Department</Form.Label>
                                    <Form.Select required value={form.department}
                                                 onChange={e => setForm({ ...form, department: e.target.value })}>
                                        {headedDepartments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </Form.Select>
                                </Form.Group>
                            ) : (
                                <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                                    For: {headedDepartments[0]?.name || 'your department'}
                                </p>
                            )
                        )}
                        <Form.Group className="mb-3">
                            <Form.Label>Title</Form.Label>
                            <Form.Control required value={form.title}
                                          onChange={e => setForm({ ...form, title: e.target.value })} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Training Type</Form.Label>
                            <Form.Select value={form.trainingType}
                                         onChange={e => setForm({ ...form, trainingType: e.target.value })}>
                                <option value="technical">Technical</option>
                                <option value="soft_skills">Soft Skills</option>
                                <option value="leadership">Leadership</option>
                                <option value="compliance">Compliance</option>
                                <option value="other">Other</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Description / Justification</Form.Label>
                            <Form.Control as="textarea" rows={3} required value={form.description}
                                          onChange={e => setForm({ ...form, description: e.target.value })} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label>Urgency</Form.Label>
                            <Form.Select value={form.urgency}
                                         onChange={e => setForm({ ...form, urgency: e.target.value })}>
                                <option value="low">Low</option>
                                <option value="normal">Normal</option>
                                <option value="high">High</option>
                            </Form.Select>
                        </Form.Group>
                        <Form.Group>
                            <Form.Label>Estimated Cost (optional)</Form.Label>
                            <Form.Control type="number" min="0" value={form.estimatedCost}
                                          onChange={e => setForm({ ...form, estimatedCost: e.target.value })} />
                        </Form.Group>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => { setShowForm(false); setResubmitTarget(null); }}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : (resubmitTarget ? 'Resubmit' : 'Submit')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default TrainingNeeds;
