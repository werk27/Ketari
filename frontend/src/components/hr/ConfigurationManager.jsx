import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Nav, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaEdit, FaInfoCircle, FaTimes, FaPowerOff } from 'react-icons/fa';
import api from '../../services/api';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Configuration module (spec §19 / §20), redesigned around the organization's
 * actual structure:
 *
 *   Organization -> Departments -> Positions -> Position Ranks (+ salary band)
 *
 * Departments are the foundation. A Position always belongs to one of the
 * organization's own configured Departments (picked from a dropdown - never
 * free text, which used to fail with an opaque "Invalid"/"Validation Error").
 * Position Ranks are global and reusable across positions (e.g. "Senior"
 * applies to many roles), matching the pre-existing schema, and optionally
 * carry a salary band. Job Titles and Partners remain their own standalone
 * lists - nothing else in the system currently ties a Job Title to a
 * Department, so that relationship is not invented here.
 *
 * Skills, Languages, Training Types etc. have no such relationships and keep
 * the original simple "name + one detail field" list editor. Leave Types is
 * the one exception among the "HR Policies" lists: it uses the full
 * EntityManager editor (like Job Titles/Partners) so days/year - the actual
 * entitlement leave requests are validated against - can be edited in place
 * instead of forcing a delete-and-recreate.
 */
const GROUPS = [
    {
        key: 'organization',
        label: 'Organization',
        description: 'Departments are the foundation of your organization structure. Positions belong to a '
            + 'Department; Position Ranks are reusable across every position. Job Titles and Partners are separate lists.',
        custom: true
    },
    {
        key: 'professional',
        label: 'Skills & Qualifications',
        lists: [
            { type: 'skills', label: 'Skills', fields: ['name', 'category'] },
            { type: 'languages', label: 'Languages', fields: ['name', 'code'] },
            { type: 'licenses', label: 'Licenses', fields: ['name', 'issuingBody'] },
            { type: 'education-levels', label: 'Education Levels', fields: ['name', 'level'] }
        ]
    },
    {
        key: 'hr',
        label: 'HR Policies',
        // Leave Types is rendered separately via EntityManager (below), not in
        // this list - it needs full Edit/Update support (days/year is the
        // actual entitlement every leave request is validated against), unlike
        // the simple name-only lists here which only need add/remove.
        lists: [
            { type: 'training-types', label: 'Training Types', fields: ['name', 'category'] },
            { type: 'employment-status', label: 'Employment Status', fields: ['name'] },
            { type: 'termination-reasons', label: 'Termination Reasons', fields: ['name', 'category'] },
            { type: 'deduction-types', label: 'Deduction Types', fields: ['name', 'percentage'] }
        ]
    },
    {
        key: 'personal',
        label: 'Employee Profile Options',
        description: 'Option lists used when completing an employee profile. '
            + 'These are personal attributes and are never used as recruitment criteria.',
        lists: [
            { type: 'nations', label: 'Nations', fields: ['name', 'code'] },
            { type: 'titles', label: 'Titles', fields: ['name', 'abbreviation'] },
            { type: 'religions', label: 'Religions', fields: ['name'] },
            { type: 'marital-status', label: 'Marital Status', fields: ['name'] },
            { type: 'blood-types', label: 'Blood Types', fields: ['name'] }
        ]
    }
];

/** Map a route segment to the array key returned by the API. */
const FIELD_BY_TYPE = {
    'departments': 'departments', 'positions': 'positions', 'position-ranks': 'positionRanks',
    'job-titles': 'jobTitles', 'skills': 'skills', 'languages': 'languages', 'licenses': 'licenses',
    'education-levels': 'educationLevels', 'employment-status': 'employmentStatus',
    'leave-types': 'leaveTypes', 'training-types': 'trainingTypes',
    'termination-reasons': 'terminationReasons', 'deduction-types': 'deductionTypes',
    'nations': 'nations', 'titles': 'titles', 'partners': 'partners',
    'religions': 'religions', 'marital-status': 'maritalStatus', 'blood-types': 'bloodTypes'
};

const STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
];

/**
 * Singular form of a list label for "Add ___"/"Add your first ___" copy.
 * A plain `/s$/` strip breaks any label that already ends in "s" without
 * being plural - e.g. "Employment Status" and "Marital Status" became
 * "...Statu" - so words that are singular despite ending in "s" are listed
 * here rather than assumed away by the regex.
 */
const NOT_PLURAL = new Set(['status']);
const singularize = (label) => {
    const lower = label.toLowerCase();
    if (NOT_PLURAL.has(lower) || [...NOT_PLURAL].some(word => lower.endsWith(` ${word}`))) {
        return label;
    }
    return label.replace(/s$/, '');
};

/** Friendly placeholder for a secondary list field, instead of the raw camelCase key. */
const FIELD_PLACEHOLDERS = {
    category: 'Category', code: 'Code', issuingBody: 'Issuing body', level: 'Level',
    daysPerYear: 'Days/year', percentage: 'Percentage (%)', abbreviation: 'Abbreviation'
};
const fieldPlaceholder = (field) => FIELD_PLACEHOLDERS[field]
    || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

/**
 * A full Create / List / Edit / Activate-Deactivate / Delete manager for one
 * organization-structure entity (Department, Position, Position Rank, Job
 * Title or Partner). The form fields themselves and the table columns are the
 * only things that differ between entities - everything else (load state,
 * add vs. update, specific-error surfacing, delete confirmation) is shared.
 */
const EntityManager = ({
    type, field, label, labelPlural,
    emptyForm, toFormValues, buildPayload,
    renderFields, columns, items
}) => {
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

    const startEdit = (item) => {
        setEditingId(item._id);
        setForm(toFormValues(item));
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyForm);
    };

    const submit = async () => {
        setBusy(true);
        try {
            const payload = buildPayload(form);
            if (editingId) {
                await api.put(`/config/${type}/${editingId}`, payload);
                toast.success(`${label} updated`);
            } else {
                await api.post(`/config/${type}`, payload);
                toast.success(`${label} added`);
            }
            cancelEdit();
            items.onChanged();
        } catch (err) {
            // Surface the SPECIFIC reason the backend returned - never a generic "Invalid".
            toast.error(err.response?.data?.message || `Could not save this ${label.toLowerCase()}`);
        } finally {
            setBusy(false);
        }
    };

    const toggleStatus = async (item) => {
        setBusy(true);
        try {
            const nextStatus = item.status === 'active' ? 'inactive' : 'active';
            const payload = { ...buildPayload(toFormValues(item)), status: nextStatus };
            await api.put(`/config/${type}/${item._id}`, payload);
            toast.success(nextStatus === 'active' ? `${label} activated` : `${label} deactivated`);
            items.onChanged();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not update the status');
        } finally {
            setBusy(false);
        }
    };

    const remove = (item) => setDeleteTarget(item);

    const confirmRemove = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await api.delete(`/config/${type}/${deleteTarget._id}`);
            toast.success(`${label} removed`);
            setDeleteTarget(null);
            items.onChanged();
        } catch (err) {
            // A 409 here always carries the specific reason it's still in use
            // (e.g. "assigned to one or more employees") - never a silent failure.
            toast.error(err.response?.data?.message || `Could not remove this ${label.toLowerCase()}`);
        } finally {
            setDeleting(false);
        }
    };

    const list = items.list;

    return (
        <>
        <Card className="p-3 h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>{labelPlural}</div>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>{list.length} item(s)</span>
            </div>

            <div className="p-2 rounded mb-3" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                {renderFields({ form, setField })}
                <div className="d-flex gap-2 mt-1">
                    <Button size="sm" disabled={busy} onClick={submit} className="d-flex align-items-center gap-2">
                        <FaPlus size={11} /> {editingId ? `Update ${label}` : `Add ${label}`}
                    </Button>
                    {editingId && (
                        <Button size="sm" variant="outline-secondary" disabled={busy} onClick={cancelEdit}
                                className="d-flex align-items-center gap-2">
                            <FaTimes size={11} /> Cancel
                        </Button>
                    )}
                </div>
            </div>

            {list.length === 0 ? (
                <EmptyState title="Nothing configured yet" description={`Add your first ${label.toLowerCase()}.`} />
            ) : (
                <div className="table-responsive">
                    <Table size="sm" className="align-middle mb-0">
                        <thead>
                            <tr style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase' }}>
                                {columns.map(col => <th key={col.header} className="fw-semibold">{col.header}</th>)}
                                <th className="fw-semibold text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(item => (
                                <tr key={item._id}>
                                    {columns.map(col => (
                                        <td key={col.header} style={{ fontSize: '0.8rem' }}>{col.render(item)}</td>
                                    ))}
                                    <td className="text-end">
                                        <div className="d-flex gap-1 justify-content-end">
                                            <Button size="sm" variant="outline-secondary" disabled={busy}
                                                    onClick={() => startEdit(item)} title="Edit">
                                                <FaEdit size={10} />
                                            </Button>
                                            <Button size="sm" variant="outline-secondary" disabled={busy}
                                                    onClick={() => toggleStatus(item)}
                                                    title={item.status === 'active' ? 'Deactivate' : 'Activate'}>
                                                <FaPowerOff size={10} />
                                            </Button>
                                            <Button size="sm" variant="outline-danger" disabled={busy}
                                                    onClick={() => remove(item)} title="Delete">
                                                <FaTrash size={10} />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            )}
        </Card>

        <ConfirmDeleteModal
            show={!!deleteTarget}
            title={`Delete ${label}?`}
            itemName={deleteTarget?.name || deleteTarget?.title}
            confirmLabel={`Delete ${label}`}
            busy={deleting}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmRemove}
        />
        </>
    );
};

const OrganizationStructure = ({ config, meta, onChanged }) => {
    const departments = config?.departments || [];
    const positions = config?.positions || [];
    const positionRanks = config?.positionRanks || [];
    const jobTitles = config?.jobTitles || [];
    const partners = config?.partners || [];
    const partnerTypes = meta?.partnerTypes || [];

    // Department Head candidates: employees with a linked, active user
    // account. Loaded once here (Employer-only screen) rather than inside
    // EntityManager, since only the Department card needs it.
    const [employees, setEmployees] = useState([]);
    useEffect(() => {
        api.get('/employees').then(res => setEmployees(res.data.data || [])).catch(() => setEmployees([]));
    }, []);
    const headCandidates = employees.filter(e => e.user && e.user.status === 'active');

    const departmentName = (id) => {
        if (!id) return '—';
        return departments.find(d => d._id === (id._id || id))?.name || '—';
    };
    const rankName = (id) => {
        if (!id) return '—';
        return positionRanks.find(r => r._id === (id._id || id))?.name || '—';
    };
    const partnerTypeLabel = (value) => partnerTypes.find(t => t.value === value)?.label || value;
    const headName = (id) => {
        if (!id) return null;
        const rawId = id._id || id;
        const employee = employees.find(e => e.user && (e.user._id === rawId || e.user === rawId));
        return employee ? [employee.personalInfo?.firstName, employee.personalInfo?.lastName].filter(Boolean).join(' ') : null;
    };

    return (
        <div className="row g-3">
            <div className="col-12 col-lg-6">
                <EntityManager
                    type="departments" field="departments" label="Department" labelPlural="Departments"
                    items={{ list: departments, onChanged }}
                    emptyForm={{ name: '', code: '', manager: '', status: 'active', notifyHead: true }}
                    toFormValues={(item) => ({
                        name: item.name, code: item.code || '',
                        manager: item.manager ? String(item.manager) : '', status: item.status || 'active',
                        notifyHead: true
                    })}
                    buildPayload={(form) => ({
                        name: form.name.trim(), code: form.code.trim(), manager: form.manager || undefined, status: form.status,
                        notifyHead: form.notifyHead
                    })}
                    renderFields={({ form, setField }) => (
                        <div className="row g-2">
                            <div className="col-12 col-md-5">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Department Name</Form.Label>
                                <Form.Control size="sm" value={form.name} onChange={e => setField('name', e.target.value)}
                                              placeholder="e.g., Information Technology" />
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Code</Form.Label>
                                <Form.Control size="sm" value={form.code} onChange={e => setField('code', e.target.value)}
                                              placeholder="e.g., IT" />
                            </div>
                            <div className="col-6 col-md-4">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </Form.Select>
                            </div>
                            <div className="col-12">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Department Head</Form.Label>
                                <Form.Select size="sm" value={form.manager} onChange={e => setField('manager', e.target.value)}>
                                    <option value="">Not assigned</option>
                                    {headCandidates.map(e => (
                                        <option key={e.user._id} value={e.user._id}>
                                            {[e.personalInfo?.firstName, e.personalInfo?.lastName].filter(Boolean).join(' ')}
                                        </option>
                                    ))}
                                </Form.Select>
                                <Form.Text className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    May raise Job Requisitions for this department.
                                </Form.Text>
                            </div>
                            {form.manager && (
                                <div className="col-12">
                                    <Form.Check
                                        type="checkbox"
                                        id="notify-department-head"
                                        label="Notify department head by email"
                                        style={{ fontSize: '0.8rem' }}
                                        checked={form.notifyHead}
                                        onChange={e => setField('notifyHead', e.target.checked)}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    columns={[
                        { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.name}</span> },
                        { header: 'Code', render: (i) => i.code || '—' },
                        { header: 'Department Head', render: (i) => headName(i.manager) || '—' },
                        { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                    ]}
                />
            </div>

            <div className="col-12 col-lg-6">
                <EntityManager
                    type="positions" field="positions" label="Position" labelPlural="Positions"
                    items={{ list: positions, onChanged }}
                    emptyForm={{ title: '', department: '', rank: '', code: '', status: 'active' }}
                    toFormValues={(item) => ({
                        title: item.title, department: item.department ? String(item.department) : '',
                        rank: item.rank ? String(item.rank) : '', code: item.code || '', status: item.status || 'active'
                    })}
                    buildPayload={(form) => ({
                        title: form.title.trim(), department: form.department || undefined,
                        rank: form.rank || undefined, code: form.code.trim(), status: form.status
                    })}
                    renderFields={({ form, setField }) => (
                        <div className="row g-2">
                            <div className="col-12 col-md-6">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Position Name</Form.Label>
                                <Form.Control size="sm" value={form.title} onChange={e => setField('title', e.target.value)}
                                              placeholder="e.g., Software Developer" />
                            </div>
                            <div className="col-12 col-md-6">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Department</Form.Label>
                                <Form.Select size="sm" value={form.department} onChange={e => setField('department', e.target.value)}>
                                    <option value="">Select a department…</option>
                                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                </Form.Select>
                            </div>
                            <div className="col-12 col-md-6">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Position Rank</Form.Label>
                                <Form.Select size="sm" value={form.rank} onChange={e => setField('rank', e.target.value)}>
                                    <option value="">No rank</option>
                                    {positionRanks.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                                </Form.Select>
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Code</Form.Label>
                                <Form.Control size="sm" value={form.code} onChange={e => setField('code', e.target.value)}
                                              placeholder="e.g., IT-SD" />
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </Form.Select>
                            </div>
                        </div>
                    )}
                    columns={[
                        { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.title}</span> },
                        { header: 'Department', render: (i) => departmentName(i.department) },
                        { header: 'Rank', render: (i) => rankName(i.rank) },
                        { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                    ]}
                />
            </div>

            <div className="col-12 col-lg-6">
                <EntityManager
                    type="position-ranks" field="positionRanks" label="Position Rank" labelPlural="Position Ranks"
                    items={{ list: positionRanks, onChanged }}
                    emptyForm={{ name: '', level: '', salary: '', status: 'active' }}
                    toFormValues={(item) => ({
                        name: item.name, level: item.level ?? '', salary: item.salary ?? '', status: item.status || 'active'
                    })}
                    buildPayload={(form) => ({
                        name: form.name.trim(),
                        level: form.level === '' ? undefined : form.level,
                        salary: form.salary === '' ? undefined : form.salary,
                        status: form.status
                    })}
                    renderFields={({ form, setField }) => (
                        <div className="row g-2">
                            <div className="col-12 col-md-5">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Rank Name</Form.Label>
                                <Form.Control size="sm" value={form.name} onChange={e => setField('name', e.target.value)}
                                              placeholder="e.g., Senior" />
                            </div>
                            <div className="col-6 col-md-2">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Level</Form.Label>
                                <Form.Control size="sm" type="number" value={form.level} onChange={e => setField('level', e.target.value)}
                                              placeholder="e.g., 3" />
                            </div>
                            <div className="col-6 col-md-2">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Salary (ETB)</Form.Label>
                                <Form.Control size="sm" type="number" min="1" value={form.salary}
                                              onChange={e => setField('salary', e.target.value)} placeholder="e.g., 30000" />
                                <Form.Text className="text-muted" style={{ fontSize: '0.7rem' }}>Fixed amount, not a range.</Form.Text>
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </Form.Select>
                            </div>
                        </div>
                    )}
                    columns={[
                        { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.name}</span> },
                        { header: 'Level', render: (i) => i.level ?? '—' },
                        { header: 'Salary (ETB)', render: (i) => i.salary ? i.salary.toLocaleString() : '—' },
                        { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                    ]}
                />
            </div>

            <div className="col-12 col-lg-6">
                <EntityManager
                    type="job-titles" field="jobTitles" label="Job Title" labelPlural="Job Titles"
                    items={{ list: jobTitles, onChanged }}
                    emptyForm={{ name: '', code: '', status: 'active' }}
                    toFormValues={(item) => ({ name: item.name, code: item.code || '', status: item.status || 'active' })}
                    buildPayload={(form) => ({ name: form.name.trim(), code: form.code.trim(), status: form.status })}
                    renderFields={({ form, setField }) => (
                        <div className="row g-2">
                            <div className="col-12 col-md-6">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Job Title</Form.Label>
                                <Form.Control size="sm" value={form.name} onChange={e => setField('name', e.target.value)}
                                              placeholder="e.g., Software Engineer" />
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Code</Form.Label>
                                <Form.Control size="sm" value={form.code} onChange={e => setField('code', e.target.value)}
                                              placeholder="e.g., SE-001" />
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </Form.Select>
                            </div>
                        </div>
                    )}
                    columns={[
                        { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.name}</span> },
                        { header: 'Code', render: (i) => i.code || '—' },
                        { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                    ]}
                />
            </div>

            <div className="col-12 col-lg-6">
                <EntityManager
                    type="partners" field="partners" label="Partner" labelPlural="Partners"
                    items={{ list: partners, onChanged }}
                    emptyForm={{ name: '', type: '', status: 'active' }}
                    toFormValues={(item) => ({ name: item.name, type: item.type || '', status: item.status || 'active' })}
                    buildPayload={(form) => ({ name: form.name.trim(), type: form.type, status: form.status })}
                    renderFields={({ form, setField }) => (
                        <div className="row g-2">
                            <div className="col-12 col-md-6">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Partner Name</Form.Label>
                                <Form.Control size="sm" value={form.name} onChange={e => setField('name', e.target.value)}
                                              placeholder="e.g., Acme Staffing" />
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Partner Type</Form.Label>
                                <Form.Select size="sm" value={form.type} onChange={e => setField('type', e.target.value)}>
                                    <option value="">Select type…</option>
                                    {partnerTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </Form.Select>
                            </div>
                            <div className="col-6 col-md-3">
                                <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                    {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </Form.Select>
                            </div>
                        </div>
                    )}
                    columns={[
                        { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.name}</span> },
                        { header: 'Type', render: (i) => partnerTypeLabel(i.type) },
                        { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                    ]}
                />
            </div>
        </div>
    );
};

const ConfigurationManager = () => {
    const [config, setConfig] = useState(null);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [group, setGroup] = useState('organization');
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/config');
            setConfig(res.data.data || {});
            setMeta(res.data.meta || null);
        } catch (err) {
            setError(err.response?.data?.message || 'Unable to load configuration.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const activeGroup = useMemo(() => GROUPS.find(g => g.key === group), [group]);

    // ---- Generic simple lists (Skills, Languages, Leave Types, ...) -----------
    const add = async (list) => {
        const draft = drafts[list.type] || {};
        const nameField = list.nameField || 'name';
        const value = draft[nameField];

        if (!value || !value.trim()) {
            toast.error('Please enter a value first');
            return;
        }

        setBusy(list.type);
        try {
            const payload = { ...draft, name: value.trim() };
            await api.post(`/config/${list.type}`, payload);
            toast.success(`${list.label.replace(/s$/, '')} added`);
            setDrafts(prev => ({ ...prev, [list.type]: {} }));
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not add the item');
        } finally {
            setBusy(null);
        }
    };

    const remove = (list, item) => setDeleteTarget({ list, item });

    const confirmRemove = async () => {
        if (!deleteTarget) return;
        const { list, item } = deleteTarget;
        setDeleting(true);
        try {
            await api.delete(`/config/${list.type}/${item._id}`);
            toast.success('Removed');
            setDeleteTarget(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the item');
        } finally {
            setDeleting(false);
        }
    };

    const setDraft = (type, field, value) =>
        setDrafts(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: value } }));

    if (loading) return <LoadingState label="Loading configuration…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <>
        <div>
            <Card className="p-3 mb-3">
                <SectionHeader
                    title="Configuration"
                    description={meta?.scope === 'platform'
                        ? 'Platform defaults. New organizations start from a copy of these lists.'
                        : 'Lookup data for your organization. New organizations inherit the platform defaults.'}
                    action={<StatusBadge status={meta?.scope === 'platform' ? 'active' : 'approved'} />}
                />
                <Nav variant="tabs" activeKey={group} onSelect={setGroup}>
                    {GROUPS.map(g => (
                        <Nav.Item key={g.key}>
                            <Nav.Link eventKey={g.key} style={{ fontSize: '0.84rem' }}>{g.label}</Nav.Link>
                        </Nav.Item>
                    ))}
                </Nav>
            </Card>

            {activeGroup?.description && (
                <div className="d-flex align-items-start gap-2 mb-3 p-2 rounded info-note"
                     style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                    <FaInfoCircle className="text-primary flex-shrink-0 mt-1" size={13} />
                    <div className="text-dark" style={{ fontSize: '0.8rem' }}>{activeGroup.description}</div>
                </div>
            )}

            {activeGroup?.custom ? (
                <OrganizationStructure config={config} meta={meta} onChanged={load} />
            ) : (
                <div className="row g-3">
                    {group === 'hr' && (
                        <div className="col-12 col-lg-6">
                            <EntityManager
                                type="leave-types" field="leaveTypes" label="Leave Type" labelPlural="Leave Types"
                                items={{ list: config?.leaveTypes || [], onChanged: load }}
                                emptyForm={{ name: '', daysPerYear: '', status: 'active' }}
                                toFormValues={(item) => ({
                                    name: item.name,
                                    daysPerYear: item.daysPerYear ?? '',
                                    status: item.status || 'active'
                                })}
                                buildPayload={(form) => {
                                    // Frontend validation, mirrored by the backend (never rely on
                                    // frontend-only checks) - surfaced the same way the shared
                                    // EntityManager already surfaces a real backend error.
                                    const name = (form.name || '').trim();
                                    if (!name) {
                                        throw Object.assign(new Error('name required'), {
                                            response: { data: { message: 'Leave type name is required.' } }
                                        });
                                    }
                                    const daysPerYear = Number(form.daysPerYear);
                                    if (form.daysPerYear === '' || Number.isNaN(daysPerYear) || daysPerYear <= 0) {
                                        throw Object.assign(new Error('invalid days'), {
                                            response: { data: { message: 'Days/year must be a valid positive number.' } }
                                        });
                                    }
                                    return { name, daysPerYear, status: form.status };
                                }}
                                renderFields={({ form, setField }) => (
                                    <div className="row g-2">
                                        <div className="col-12 col-md-6">
                                            <Form.Label style={{ fontSize: '0.75rem' }}>Leave Type</Form.Label>
                                            <Form.Control size="sm" value={form.name} onChange={e => setField('name', e.target.value)}
                                                          placeholder="e.g., Marriage Leave" />
                                        </div>
                                        <div className="col-6 col-md-3">
                                            <Form.Label style={{ fontSize: '0.75rem' }}>Days/year</Form.Label>
                                            <Form.Control size="sm" type="number" min="1" step="1" value={form.daysPerYear}
                                                          onChange={e => setField('daysPerYear', e.target.value)} placeholder="e.g., 3" />
                                        </div>
                                        <div className="col-6 col-md-3">
                                            <Form.Label style={{ fontSize: '0.75rem' }}>Status</Form.Label>
                                            <Form.Select size="sm" value={form.status} onChange={e => setField('status', e.target.value)}>
                                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </Form.Select>
                                        </div>
                                    </div>
                                )}
                                columns={[
                                    { header: 'Name', render: (i) => <span className="fw-semibold text-dark">{i.name}</span> },
                                    { header: 'Days/year', render: (i) => i.daysPerYear ?? '—' },
                                    { header: 'Status', render: (i) => <StatusBadge status={i.status} /> }
                                ]}
                            />
                        </div>
                    )}
                    {activeGroup?.lists.map(list => {
                        const items = config?.[FIELD_BY_TYPE[list.type]] || [];
                        const nameField = list.nameField || 'name';
                        const draft = drafts[list.type] || {};

                        return (
                            <div className="col-12 col-lg-6" key={list.type}>
                                <Card className="p-3 h-100">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <div className="fw-semibold text-dark" style={{ fontSize: '0.9rem' }}>{list.label}</div>
                                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{items.length} item(s)</span>
                                    </div>

                                    <div className="d-flex gap-2 mb-3 flex-wrap">
                                        <Form.Control
                                            size="sm"
                                            value={draft[nameField] || ''}
                                            placeholder={`Add ${singularize(list.label).toLowerCase()}`}
                                            onChange={e => setDraft(list.type, nameField, e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(list); } }}
                                            style={{ flex: '1 1 140px', fontSize: '0.82rem' }}
                                        />
                                        {list.fields.filter(f => f !== nameField).map(field => (
                                            <Form.Control
                                                key={field}
                                                size="sm"
                                                value={draft[field] || ''}
                                                placeholder={fieldPlaceholder(field)}
                                                onChange={e => setDraft(list.type, field, e.target.value)}
                                                style={{ flex: '0 1 110px', fontSize: '0.82rem' }}
                                            />
                                        ))}
                                        <Button size="sm" disabled={busy === list.type} onClick={() => add(list)}>
                                            <FaPlus size={11} />
                                        </Button>
                                    </div>

                                    {items.length === 0 ? (
                                        <EmptyState title="Nothing configured yet"
                                                    description={`Add your first ${singularize(list.label).toLowerCase()}.`} />
                                    ) : (
                                        <div className="d-flex flex-wrap gap-2">
                                            {items.map(item => (
                                                <span key={item._id}
                                                      className="d-inline-flex align-items-center gap-2 soft-chip"
                                                      style={{
                                                          background: '#F1F5F9', borderRadius: 999,
                                                          padding: '4px 10px', fontSize: '0.78rem'
                                                      }}>
                                                    <span className="text-dark">{item[nameField] || item.name}</span>
                                                    {item.daysPerYear ? (
                                                        <span className="text-muted">{item.daysPerYear}d</span>
                                                    ) : null}
                                                    <button
                                                        className="btn btn-link p-0 text-danger border-0"
                                                        style={{ lineHeight: 1 }}
                                                        disabled={busy === list.type}
                                                        onClick={() => remove(list, item)}
                                                    >
                                                        <FaTrash size={10} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        <ConfirmDeleteModal
            show={!!deleteTarget}
            title="Delete this item?"
            itemName={deleteTarget ? (deleteTarget.item[deleteTarget.list.nameField || 'name'] || deleteTarget.item.name) : ''}
            busy={deleting}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmRemove}
        />
        </>
    );
};

export default ConfigurationManager;
