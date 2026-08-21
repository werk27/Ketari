import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Nav } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaPlus, FaTrash, FaSlidersH, FaInfoCircle } from 'react-icons/fa';
import api from '../../services/api';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Configuration module (spec §19 / §20).
 *
 * Organizational lookup data is CONFIGURABLE. Personal attributes (religion,
 * marital status, blood type) are kept as selectable option lists for employee
 * profiles only - they are never recruitment criteria, so they are grouped
 * separately and clearly labelled.
 */
const GROUPS = [
    {
        key: 'organization',
        label: 'Organization',
        lists: [
            { type: 'departments', label: 'Departments', fields: ['name', 'code'] },
            { type: 'positions', label: 'Positions', fields: ['title', 'department'], nameField: 'title' },
            { type: 'position-ranks', label: 'Position Ranks', fields: ['name', 'level'] },
            { type: 'job-titles', label: 'Job Titles', fields: ['name'] },
            { type: 'partners', label: 'Partners', fields: ['name', 'type'] }
        ]
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
        lists: [
            { type: 'leave-types', label: 'Leave Types', fields: ['name', 'daysPerYear'] },
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

const ConfigurationManager = () => {
    const [config, setConfig] = useState(null);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [group, setGroup] = useState('organization');
    const [drafts, setDrafts] = useState({});
    const [busy, setBusy] = useState(null);

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
            // The API always expects `name`; a few lists display it under another label.
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

    const remove = async (list, item) => {
        setBusy(list.type);
        try {
            await api.delete(`/config/${list.type}/${item._id}`);
            toast.success('Removed');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not remove the item');
        } finally {
            setBusy(null);
        }
    };

    const setDraft = (type, field, value) =>
        setDrafts(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [field]: value } }));

    if (loading) return <LoadingState label="Loading configuration…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
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
                <div className="d-flex align-items-start gap-2 mb-3 p-2 rounded"
                     style={{ background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                    <FaInfoCircle className="text-primary flex-shrink-0 mt-1" size={13} />
                    <div className="text-dark" style={{ fontSize: '0.8rem' }}>{activeGroup.description}</div>
                </div>
            )}

            <div className="row g-3">
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
                                        placeholder={`Add ${list.label.replace(/s$/, '').toLowerCase()}`}
                                        onChange={e => setDraft(list.type, nameField, e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(list); } }}
                                        style={{ flex: '1 1 140px', fontSize: '0.82rem' }}
                                    />
                                    {list.fields.filter(f => f !== nameField).map(field => (
                                        <Form.Control
                                            key={field}
                                            size="sm"
                                            value={draft[field] || ''}
                                            placeholder={field}
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
                                                description={`Add your first ${list.label.replace(/s$/, '').toLowerCase()}.`} />
                                ) : (
                                    <div className="d-flex flex-wrap gap-2">
                                        {items.map(item => (
                                            <span key={item._id}
                                                  className="d-inline-flex align-items-center gap-2"
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
                                                    aria-label={`Remove ${item[nameField] || item.name}`}
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
        </div>
    );
};

export default ConfigurationManager;
