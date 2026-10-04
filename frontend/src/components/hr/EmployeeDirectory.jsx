import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Form, Row, Col, Tabs, Tab, Badge, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { FaUsers, FaPlus, FaSearch, FaUserShield, FaUserCog } from 'react-icons/fa';
import api, { describeApiError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { resolveDisplayRole } from '../workspace/navigationConfig';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import {
    Card, SectionHeader, StatusBadge, LoadingState, EmptyState, ErrorState
} from '../workspace/ui';

/**
 * Employee directory and information module (spec §7), extended to cover the
 * full Employee -> User Account -> Organizational Role workflow.
 *
 * These three stay separate concepts throughout this screen:
 *   - An Employee record can exist with no login access at all.
 *   - A User account, once created or linked, is what actually authenticates.
 *   - A role (hr_expert / hr_manager / employee) is only ever assigned to the
 *     account already linked to an employee - never created independently of
 *     one. See "Roles & Permissions" in the profile below.
 *
 * Only the employer (org:team capability) may manage accounts and roles here;
 * an HR Expert can still record and edit employee information (employee:record)
 * but cannot grant themselves or anyone else an organizational role.
 */

const EMPTY_FORM = {
    personalInfo: { firstName: '', middleName: '', lastName: '', gender: 'male', dateOfBirth: '' },
    contactInfo: { email: '', phone: '', address: { street: '', city: '', country: '' } },
    employmentInfo: {
        department: '', position: '', employmentStatus: 'active',
        hireDate: '', workLocation: '', supervisor: ''
    }
};

// Employee.status options (used both as the fallback "Employment status" list
// on the Add/Edit form and, extended below, as the directory's Status filter
// list - do not add 'pending_approval'/'rejected' here, they are top-level
// registration-workflow states, never a valid employmentInfo.employmentStatus
// value).
const EMPLOYEE_STATUS_OPTIONS = ['active', 'inactive', 'on_leave', 'suspended', 'terminated', 'resigned'];

// 'pending_approval' and 'rejected' are the registration-workflow states an
// HR-Expert-recorded employee passes through before an HR Manager approves
// it (see employeeController.createEmployee/approveRegistration). Only the
// directory's Status filter needs them - the top-level `status` field, not
// the separate employmentInfo.employmentStatus above - so this stays a
// distinct list rather than being folded into EMPLOYEE_STATUS_OPTIONS.
const STATUS_FILTER_OPTIONS = ['pending_approval', 'active', 'rejected', ...EMPLOYEE_STATUS_OPTIONS.filter(s => s !== 'active')];

const ASSIGNABLE_ROLES = [
    { value: 'employee', label: 'Employee (no special role)', hint: 'Standard employee self-service access only.' },
    { value: 'hr_expert', label: 'HR Expert', hint: 'Operational HR: records information, recruitment, training, leave and attendance processing.' },
    { value: 'hr_manager', label: 'HR Manager', hint: 'Supervisory HR: reviews HR Expert work, approves requests, oversees HR operations.' }
];

const roleLabel = (role) => ({ hr_expert: 'HR Expert', hr_manager: 'HR Manager', employee: 'Employee', employer: 'Employer' }[role] || role);

const fullName = (employee) => [employee?.personalInfo?.firstName, employee?.personalInfo?.middleName, employee?.personalInfo?.lastName]
    .filter(Boolean).join(' ') || 'Unnamed employee';

const toDateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';

const EmployeeDirectory = () => {
    const { can } = useAuth();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [positionFilter, setPositionFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    const [config, setConfig] = useState({ departments: [], positions: [], employmentStatus: [] });

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const [profileId, setProfileId] = useState(null);
    const [profile, setProfile] = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const [unlinkedAccounts, setUnlinkedAccounts] = useState([]);
    const [accountMode, setAccountMode] = useState(null); // 'create' | 'link' | null
    const [accountForm, setAccountForm] = useState({ email: '', password: '', role: 'employee', userId: '', sendCredentials: true });
    const [accountBusy, setAccountBusy] = useState(false);

    const [roleValue, setRoleValue] = useState('employee');
    const [sendRoleCredentials, setSendRoleCredentials] = useState(true);
    const [roleBusy, setRoleBusy] = useState(false);
    const [resendBusy, setResendBusy] = useState(false);
    const [terminateTarget, setTerminateTarget] = useState(null);
    const [terminating, setTerminating] = useState(false);

    // Registration approval workflow (HR Manager approves/rejects what an
    // HR Expert recorded - see employeeController.createEmployee).
    const [registrationBusy, setRegistrationBusy] = useState(false);
    const [rejectTarget, setRejectTarget] = useState(null); // employee _id, or null
    const [rejectReason, setRejectReason] = useState('');
    const [resubmitNote, setResubmitNote] = useState('');

    const canRecord = can('employee:record');
    const canManageTeam = can('org:team');
    const canApproveRegistration = can('employee:delete');

    // ---------------------------------------------------------------- data

    const loadConfig = useCallback(async () => {
        try {
            const res = await api.get('/config');
            setConfig({
                departments: res.data.data?.departments || [],
                positions: res.data.data?.positions || [],
                positionRanks: res.data.data?.positionRanks || [],
                employmentStatus: res.data.data?.employmentStatus || []
            });
        } catch (err) {
            // Dropdowns just fall back to free text; not fatal to the page.
            console.error('Failed to load configuration', err);
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (search) params.search = search;
            if (departmentFilter) params.department = departmentFilter;
            if (positionFilter) params.position = positionFilter;
            if (statusFilter) params.status = statusFilter;
            if (roleFilter) params.role = roleFilter;
            const res = await api.get('/employees', { params });
            setEmployees(res.data.data || []);
        } catch (err) {
            setError(describeApiError(err, 'Unable to load the employee directory.'));
        } finally {
            setLoading(false);
        }
    }, [search, departmentFilter, positionFilter, statusFilter, roleFilter]);

    useEffect(() => { loadConfig(); }, [loadConfig]);
    useEffect(() => {
        const timer = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    const departmentName = (id) => {
        if (!id) return '—';
        const rawId = id._id || id;
        return config.departments.find(d => d._id === rawId)?.name || '—';
    };
    const positionInfo = (id) => {
        if (!id) return null;
        const rawId = id._id || id;
        return config.positions.find(p => p._id === rawId) || null;
    };
    const positionTitle = (id) => positionInfo(id)?.title || '—';
    const positionRankName = (id) => {
        const info = positionInfo(id);
        const rankId = info?.rank;
        if (!rankId) return null;
        const rawRankId = rankId._id || rankId;
        return (config.positionRanks || []).find(r => r._id === rawRankId)?.name || null;
    };

    // Being a Department Head is not an account role (see the Role column) -
    // it's recorded as Configuration.departments[].manager and is what
    // authorises someone to raise Job Requisitions for that department (see
    // requisitionController / authController's loadEmployment). The API
    // annotates every employee's linked account with `headOfDepartments`
    // (services/roleDisplay.js) so this - and the Role column below - never
    // has to re-derive it from a second, independently-loaded Configuration
    // fetch that could drift from what the backend actually enforces.
    const headedDepartments = (person) => {
        if (person?.user?.headOfDepartments) return person.user.headOfDepartments;
        const userId = person?.user?._id || person?.user;
        if (!userId) return [];
        return config.departments.filter(d => d.manager && String(d.manager) === String(userId));
    };

    // Anyone with a linked account can be picked as a supervisor.
    const supervisorOptions = employees.filter(e => e.user);

    // ---------------------------------------------------------------- add / edit

    const openAdd = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (employee) => {
        setEditingId(employee._id);
        setForm({
            personalInfo: {
                firstName: employee.personalInfo?.firstName || '',
                middleName: employee.personalInfo?.middleName || '',
                lastName: employee.personalInfo?.lastName || '',
                gender: employee.personalInfo?.gender || 'male',
                dateOfBirth: toDateInput(employee.personalInfo?.dateOfBirth)
            },
            contactInfo: {
                email: employee.contactInfo?.email || '',
                phone: employee.contactInfo?.phone || '',
                address: {
                    street: employee.contactInfo?.address?.street || '',
                    city: employee.contactInfo?.address?.city || '',
                    country: employee.contactInfo?.address?.country || ''
                }
            },
            employmentInfo: {
                department: employee.employmentInfo?.department?._id || employee.employmentInfo?.department || '',
                position: employee.employmentInfo?.position?._id || employee.employmentInfo?.position || '',
                employmentStatus: employee.employmentInfo?.employmentStatus || 'active',
                hireDate: toDateInput(employee.employmentInfo?.hireDate),
                workLocation: employee.employmentInfo?.workLocation || '',
                supervisor: employee.employmentInfo?.supervisor?._id || employee.employmentInfo?.supervisor || ''
            }
        });
        setShowForm(true);
    };

    const setGroup = (group, field, value) =>
        setForm(prev => ({ ...prev, [group]: { ...prev[group], [field]: value } }));

    const submit = async (e) => {
        e.preventDefault();
        if (!form.personalInfo.firstName.trim() || !form.personalInfo.lastName.trim()) {
            toast.error('First name and last name are required');
            return;
        }
        setSaving(true);
        try {
            if (editingId) {
                await api.put(`/employees/${editingId}`, form);
                toast.success('Employee updated');
            } else {
                // The backend message already reflects whether this record
                // needed HR Manager approval (HR Expert) or was auto-approved
                // (Employer) - see employeeController.createEmployee - so the
                // toast never claims "recorded" when it is really pending.
                const res = await api.post('/employees', form);
                toast.success(res.data.message || `Employee recorded (${res.data.data?.employeeId || ''})`);
            }
            setShowForm(false);
            setForm(EMPTY_FORM);
            setEditingId(null);
            load();
            if (editingId && profileId === editingId) openProfile(editingId);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not save the employee'));
        } finally {
            setSaving(false);
        }
    };

    const terminate = (employee) => setTerminateTarget(employee);

    const confirmTerminate = async () => {
        if (!terminateTarget) return;
        setTerminating(true);
        try {
            await api.delete(`/employees/${terminateTarget._id}`);
            toast.success('Employee marked as terminated');
            const terminatedId = terminateTarget._id;
            setTerminateTarget(null);
            load();
            if (profileId === terminatedId) openProfile(terminatedId);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not update this employee'));
        } finally {
            setTerminating(false);
        }
    };

    // ------------------------------------------------------- registration approval

    const approveRegistration = async (employee) => {
        setRegistrationBusy(true);
        try {
            const res = await api.put(`/employees/${employee._id}/registration/approve`);
            toast.success(res.data.message || 'Employee registration approved');
            load();
            if (profileId === employee._id) openProfile(employee._id);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not approve this registration'));
        } finally {
            setRegistrationBusy(false);
        }
    };

    const openReject = (employee) => {
        setRejectTarget(employee);
        setRejectReason('');
    };

    const confirmReject = async () => {
        if (!rejectTarget || !rejectReason.trim()) {
            toast.error('Explain what the HR Expert needs to correct');
            return;
        }
        setRegistrationBusy(true);
        try {
            const res = await api.put(`/employees/${rejectTarget._id}/registration/reject`, { reason: rejectReason.trim() });
            toast.success(res.data.message || 'Employee registration rejected');
            const rejectedId = rejectTarget._id;
            setRejectTarget(null);
            setRejectReason('');
            load();
            if (profileId === rejectedId) openProfile(rejectedId);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not reject this registration'));
        } finally {
            setRegistrationBusy(false);
        }
    };

    const resubmitRegistration = async (employee) => {
        setRegistrationBusy(true);
        try {
            const res = await api.put(`/employees/${employee._id}/registration/resubmit`, { note: resubmitNote.trim() });
            toast.success(res.data.message || 'Resubmitted for HR Manager approval');
            setResubmitNote('');
            load();
            if (profileId === employee._id) openProfile(employee._id);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not resubmit this registration'));
        } finally {
            setRegistrationBusy(false);
        }
    };

    // ---------------------------------------------------------------- profile

    const openProfile = async (id, tab = 'overview') => {
        setProfileId(id);
        setActiveTab(tab);
        setAccountMode(null);
        setSendRoleCredentials(true);
        setProfileLoading(true);
        try {
            const res = await api.get(`/employees/${id}`);
            setProfile(res.data.data);
            setRoleValue(res.data.data?.user?.role || 'employee');
        } catch (err) {
            toast.error(describeApiError(err, 'Could not load this employee'));
            setProfileId(null);
        } finally {
            setProfileLoading(false);
        }
    };

    const closeProfile = () => {
        setProfileId(null);
        setProfile(null);
        setAccountMode(null);
    };

    const refreshProfile = () => profileId && openProfile(profileId);

    // ---------------------------------------------------------------- account

    const openCreateAccount = () => {
        setAccountForm({ email: profile?.contactInfo?.email || '', password: '', role: 'employee', userId: '', sendCredentials: true });
        setAccountMode('create');
    };

    const openLinkAccount = async () => {
        setAccountMode('link');
        try {
            const res = await api.get('/employees/accounts/unlinked');
            setUnlinkedAccounts(res.data.users || []);
        } catch (err) {
            toast.error(describeApiError(err, 'Could not load unlinked accounts'));
        }
    };

    const submitAccount = async (e) => {
        e.preventDefault();
        setAccountBusy(true);
        try {
            if (accountMode === 'create') {
                const res = await api.post(`/employees/${profileId}/account`, {
                    email: accountForm.email, password: accountForm.password, role: accountForm.role,
                    sendCredentials: accountForm.sendCredentials
                });
                toast.success(res.data.message || 'Account created and linked');
            } else {
                if (!accountForm.userId) {
                    toast.error('Choose an account to link');
                    setAccountBusy(false);
                    return;
                }
                await api.put(`/employees/${profileId}/account/link`, { userId: accountForm.userId });
                toast.success('Account linked');
            }
            setAccountMode(null);
            refreshProfile();
            load();
        } catch (err) {
            toast.error(describeApiError(err, 'Could not complete this action'));
        } finally {
            setAccountBusy(false);
        }
    };

    const toggleAccountStatus = async () => {
        const nextStatus = profile?.user?.status === 'active' ? 'inactive' : 'active';
        if (!window.confirm(`${nextStatus === 'active' ? 'Activate' : 'Deactivate'} ${profile?.user?.name}'s account?`)) return;
        try {
            await api.put(`/employees/${profileId}/account/status`, { status: nextStatus });
            toast.success(`Account ${nextStatus === 'active' ? 'activated' : 'deactivated'}`);
            refreshProfile();
        } catch (err) {
            toast.error(describeApiError(err, 'Could not update the account'));
        }
    };

    const resendCredentials = async () => {
        setResendBusy(true);
        try {
            const res = await api.post(`/employees/${profileId}/account/resend-credentials`);
            toast.success(res.data.message || 'Login credentials resent');
        } catch (err) {
            toast.error(describeApiError(err, 'Could not resend login credentials'));
        } finally {
            setResendBusy(false);
        }
    };

    // ---------------------------------------------------------------- role

    const submitRole = async (e) => {
        e.preventDefault();
        if (roleValue === profile?.user?.role) {
            toast.info('Employee already has this role');
            return;
        }
        if (!window.confirm(`Assign the ${roleLabel(roleValue)} role to ${fullName(profile)}?`)) return;
        setRoleBusy(true);
        try {
            const res = await api.put(`/employees/${profileId}/role`, { role: roleValue, sendCredentials: sendRoleCredentials });
            toast.success(res.data.message || `Role assigned: ${roleLabel(roleValue)}`);
            refreshProfile();
            load();
        } catch (err) {
            toast.error(describeApiError(err, 'Could not assign this role'));
        } finally {
            setRoleBusy(false);
        }
    };

    // ---------------------------------------------------------------- render

    if (loading) return <LoadingState label="Loading employee directory…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div>
            <Card className="p-3">
                <SectionHeader
                    title="Employee Directory"
                    description="Personal, professional and employment information for your organization."
                    action={canRecord && (
                        <Button size="sm" onClick={openAdd} className="d-flex align-items-center gap-2">
                            <FaPlus size={11} /> Add employee
                        </Button>
                    )}
                />

                <Row className="g-2 mb-3">
                    <Col md={3}>
                        <div className="position-relative">
                            <FaSearch size={12} className="position-absolute text-muted"
                                      style={{ left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                            <Form.Control
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search by name, employee number or email"
                                style={{ paddingLeft: 32, fontSize: '0.85rem' }}
                            />
                        </div>
                    </Col>
                    <Col md={2}>
                        <Form.Select size="sm" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
                            <option value="">All departments</option>
                            {config.departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                        </Form.Select>
                    </Col>
                    <Col md={2}>
                        <Form.Select size="sm" value={positionFilter} onChange={e => setPositionFilter(e.target.value)}>
                            <option value="">All positions</option>
                            {config.positions.map(p => <option key={p._id} value={p._id}>{p.title}</option>)}
                        </Form.Select>
                    </Col>
                    <Col md={2}>
                        <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                            <option value="">All statuses</option>
                            {STATUS_FILTER_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </Form.Select>
                    </Col>
                    <Col md={3}>
                        {/* "department_head" is a virtual filter, not a stored
                            role - it matches the same assigned-standing
                            annotation the Role column renders (see
                            employeeController.getEmployees / roleDisplay.js),
                            so filtering here always agrees with what the
                            column shows. */}
                        <Form.Select size="sm" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                            <option value="">All roles</option>
                            <option value="employee">Employee</option>
                            <option value="hr_expert">HR Expert</option>
                            <option value="hr_manager">HR Manager</option>
                            <option value="department_head">Department Head</option>
                        </Form.Select>
                    </Col>
                </Row>

                {employees.length === 0 ? (
                    <EmptyState
                        icon={FaUsers}
                        title={search || departmentFilter || positionFilter || statusFilter || roleFilter ? 'No employees match these filters' : 'No employees recorded yet'}
                        description={search || departmentFilter || positionFilter || statusFilter || roleFilter
                            ? 'Try different search terms or clear the filters.'
                            : 'Record your first employee to start building the directory.'}
                        action={canRecord && !search && (
                            <Button size="sm" onClick={openAdd}>Add employee</Button>
                        )}
                    />
                ) : (
                    <div className="table-responsive">
                        <table className="table align-middle mb-0">
                            <thead>
                                <tr style={{ fontSize: '0.72rem', color: '#64748B', textTransform: 'uppercase' }}>
                                    <th className="fw-semibold">Employee</th>
                                    <th className="fw-semibold">Number</th>
                                    <th className="fw-semibold">Department</th>
                                    <th className="fw-semibold">Position</th>
                                    <th className="fw-semibold">Status</th>
                                    <th className="fw-semibold">Account</th>
                                    <th className="fw-semibold">Role</th>
                                    <th className="fw-semibold text-end">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(employee => (
                                    <tr key={employee._id}>
                                        <td>
                                            <div className="fw-semibold text-dark" style={{ fontSize: '0.86rem' }}>
                                                {fullName(employee)}
                                            </div>
                                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                {employee.contactInfo?.email || '—'}
                                            </div>
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>{employee.employeeId}</td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {departmentName(employee.employmentInfo?.department)}
                                            {headedDepartments(employee).length > 0 && (
                                                <div className="mt-1">
                                                    <span className="badge bg-success-subtle text-success d-inline-flex align-items-center gap-1"
                                                          style={{ fontSize: '0.66rem', fontWeight: 600 }}
                                                          title={`Department Head of: ${headedDepartments(employee).map(d => d.name).join(', ')}`}>
                                                        <FaUserShield size={9} /> Dept. Head
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="text-muted" style={{ fontSize: '0.82rem' }}>
                                            {positionTitle(employee.employmentInfo?.position) !== '—'
                                                ? positionTitle(employee.employmentInfo?.position)
                                                : (employee.employmentInfo?.jobTitle || '—')}
                                        </td>
                                        <td><StatusBadge status={employee.status} /></td>
                                        <td>
                                            {employee.user ? (
                                                <StatusBadge status={employee.user.status} />
                                            ) : (
                                                <span className="text-muted" style={{ fontSize: '0.76rem' }}>No account</span>
                                            )}
                                        </td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            {employee.user ? resolveDisplayRole(employee.user.role, employee.user.isDepartmentHead) : '—'}
                                        </td>
                                        <td className="text-end">
                                            <div className="d-flex gap-1 justify-content-end">
                                                <Button size="sm" variant="outline-secondary" onClick={() => openProfile(employee._id)}>
                                                    View
                                                </Button>
                                                {/* Registration approval - HR Manager decides, HR Expert corrects and
                                                    resubmits. Gated on the same capabilities the backend enforces
                                                    (employee:delete / employee:record), so a button is never shown
                                                    to someone the API would reject anyway. */}
                                                {employee.status === 'pending_approval' && canApproveRegistration && (
                                                    <>
                                                        <Button size="sm" variant="outline-success" disabled={registrationBusy}
                                                                onClick={() => approveRegistration(employee)}
                                                                title="Approve this employee's registration">
                                                            Approve
                                                        </Button>
                                                        <Button size="sm" variant="outline-danger" disabled={registrationBusy}
                                                                onClick={() => openReject(employee)}
                                                                title="Reject with a reason for the HR Expert to correct">
                                                            Reject
                                                        </Button>
                                                    </>
                                                )}
                                                {employee.status === 'rejected' && canRecord && (
                                                    <Button size="sm" variant="outline-warning"
                                                            onClick={() => openProfile(employee._id)}
                                                            title="Review the rejection reason, correct the record, then resubmit">
                                                        Correct &amp; Resubmit
                                                    </Button>
                                                )}
                                                {canManageTeam && (
                                                    employee.user ? (
                                                        <Button size="sm" variant="outline-primary"
                                                                onClick={() => openProfile(employee._id, 'roles')}
                                                                title="Assign or change this employee's organizational role">
                                                            Assign Role
                                                        </Button>
                                                    ) : (
                                                        <Button size="sm" variant="outline-primary"
                                                                onClick={() => openProfile(employee._id, 'account')}
                                                                title="Create or link a login account first">
                                                            Create Account
                                                        </Button>
                                                    )
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* -------------------------------------------------- Add / Edit -------------------------------------------------- */}
            <Modal show={showForm} onHide={() => setShowForm(false)} centered size="lg">
                <Form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title style={{ fontSize: '1.05rem' }}>
                            {editingId ? 'Edit employee' : 'Add employee'}
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Personal Information</div>
                        <Row className="g-2 mb-3">
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>First name *</Form.Label>
                                <Form.Control required value={form.personalInfo.firstName}
                                              onChange={e => setGroup('personalInfo', 'firstName', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Middle name</Form.Label>
                                <Form.Control value={form.personalInfo.middleName}
                                              onChange={e => setGroup('personalInfo', 'middleName', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Last name *</Form.Label>
                                <Form.Control required value={form.personalInfo.lastName}
                                              onChange={e => setGroup('personalInfo', 'lastName', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Gender</Form.Label>
                                <Form.Select value={form.personalInfo.gender}
                                             onChange={e => setGroup('personalInfo', 'gender', e.target.value)}>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Date of birth</Form.Label>
                                <Form.Control type="date" value={form.personalInfo.dateOfBirth}
                                              onChange={e => setGroup('personalInfo', 'dateOfBirth', e.target.value)} />
                            </Col>
                        </Row>

                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Contact</div>
                        <Row className="g-2 mb-3">
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Email</Form.Label>
                                <Form.Control type="email" value={form.contactInfo.email}
                                              onChange={e => setGroup('contactInfo', 'email', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Phone</Form.Label>
                                <Form.Control value={form.contactInfo.phone}
                                              onChange={e => setGroup('contactInfo', 'phone', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Street</Form.Label>
                                <Form.Control value={form.contactInfo.address.street}
                                              onChange={e => setGroup('contactInfo', 'address', { ...form.contactInfo.address, street: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>City</Form.Label>
                                <Form.Control value={form.contactInfo.address.city}
                                              onChange={e => setGroup('contactInfo', 'address', { ...form.contactInfo.address, city: e.target.value })} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Country</Form.Label>
                                <Form.Control value={form.contactInfo.address.country}
                                              onChange={e => setGroup('contactInfo', 'address', { ...form.contactInfo.address, country: e.target.value })} />
                            </Col>
                        </Row>

                        <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Employment Information</div>
                        <Row className="g-2">
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Department</Form.Label>
                                <Form.Select value={form.employmentInfo.department}
                                             onChange={e => setGroup('employmentInfo', 'department', e.target.value)}>
                                    <option value="">Not set</option>
                                    {config.departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                </Form.Select>
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Position</Form.Label>
                                <Form.Select value={form.employmentInfo.position}
                                             onChange={e => setGroup('employmentInfo', 'position', e.target.value)}>
                                    <option value="">Not set</option>
                                    {config.positions
                                        .filter(p => !form.employmentInfo.department || String(p.department) === String(form.employmentInfo.department))
                                        .map(p => <option key={p._id} value={p._id}>{p.title}</option>)}
                                </Form.Select>
                                {positionRankName(form.employmentInfo.position) && (
                                    <Form.Text className="text-muted" style={{ fontSize: '0.72rem' }}>
                                        Rank: {positionRankName(form.employmentInfo.position)}
                                    </Form.Text>
                                )}
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Employment status</Form.Label>
                                <Form.Select value={form.employmentInfo.employmentStatus}
                                             onChange={e => setGroup('employmentInfo', 'employmentStatus', e.target.value)}>
                                    {(config.employmentStatus.length > 0
                                        ? config.employmentStatus.map(s => s.name)
                                        : EMPLOYEE_STATUS_OPTIONS
                                    ).map(s => <option key={s} value={s}>{s}</option>)}
                                </Form.Select>
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Hire / join date</Form.Label>
                                <Form.Control type="date" value={form.employmentInfo.hireDate}
                                              onChange={e => setGroup('employmentInfo', 'hireDate', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Work location</Form.Label>
                                <Form.Control value={form.employmentInfo.workLocation}
                                              onChange={e => setGroup('employmentInfo', 'workLocation', e.target.value)} />
                            </Col>
                            <Col md={4}>
                                <Form.Label style={{ fontSize: '0.8rem' }}>Supervisor / manager</Form.Label>
                                <Form.Select value={form.employmentInfo.supervisor}
                                             onChange={e => setGroup('employmentInfo', 'supervisor', e.target.value)}>
                                    <option value="">None</option>
                                    {supervisorOptions
                                        .filter(e => e._id !== editingId)
                                        .map(e => (
                                            <option key={e._id} value={e.user._id || e.user}>{fullName(e)}</option>
                                        ))}
                                </Form.Select>
                            </Col>
                        </Row>
                        {!editingId && (
                            <div className="text-muted mt-2" style={{ fontSize: '0.74rem' }}>
                                An employee number is assigned automatically once saved.
                            </div>
                        )}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="light" onClick={() => setShowForm(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add employee')}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>

            {/* -------------------------------------------------- Profile -------------------------------------------------- */}
            <Modal show={!!profileId} onHide={closeProfile} centered size="xl" scrollable>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>
                        {profile ? fullName(profile) : 'Employee profile'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {profileLoading || !profile ? (
                        <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
                    ) : (
                        <Tabs activeKey={activeTab} onSelect={setActiveTab} className="mb-3">
                            <Tab eventKey="overview" title="Overview">
                                <Row className="g-3">
                                    {[
                                        ['Employee number', profile.employeeId],
                                        ['Department', departmentName(profile.employmentInfo?.department)],
                                        ['Position', positionTitle(profile.employmentInfo?.position)],
                                        ['Job title', profile.employmentInfo?.jobTitle],
                                        ['Hire date', profile.employmentInfo?.hireDate
                                            ? new Date(profile.employmentInfo.hireDate).toLocaleDateString() : null],
                                        ['Account', profile.user ? `${profile.user.email} (${profile.user.status})` : 'No account linked'],
                                        ['Organizational role', profile.user ? resolveDisplayRole(profile.user.role, profile.user.isDepartmentHead) : '—'],
                                        ['Department Head of', headedDepartments(profile).map(d => d.name).join(', ') || null]
                                    ].map(([label, value]) => (
                                        <Col md={6} key={label}>
                                            <div className="text-uppercase text-muted"
                                                 style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                                {label}
                                            </div>
                                            <div className="text-dark" style={{ fontSize: '0.86rem' }}>{value || '—'}</div>
                                        </Col>
                                    ))}
                                    <Col md={6}>
                                        <div className="text-uppercase text-muted"
                                             style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                            Status
                                        </div>
                                        <div className="mt-1"><StatusBadge status={profile.status} /></div>
                                    </Col>
                                </Row>

                                {/* Registration approval workflow - only shown while it is relevant
                                    (pending or rejected). Once approved the record is simply an
                                    active employee, same as one the Employer recorded directly. */}
                                {profile.status === 'pending_approval' && (
                                    <div className="alert alert-warning mt-3 mb-0" style={{ fontSize: '0.82rem' }}>
                                        <div className="fw-semibold mb-1">Awaiting HR Manager approval</div>
                                        <div>
                                            Submitted by {profile.registration?.submittedBy?.name || 'an HR Expert'}
                                            {profile.registration?.submittedAt
                                                ? ` on ${new Date(profile.registration.submittedAt).toLocaleString()}` : ''}.
                                            This employee is not yet officially active.
                                        </div>
                                        {canApproveRegistration ? (
                                            <div className="d-flex gap-2 mt-2">
                                                <Button size="sm" variant="success" disabled={registrationBusy}
                                                        onClick={() => approveRegistration(profile)}>
                                                    Approve
                                                </Button>
                                                <Button size="sm" variant="danger" disabled={registrationBusy}
                                                        onClick={() => openReject(profile)}>
                                                    Reject
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-muted mt-1" style={{ fontSize: '0.78rem' }}>
                                                Only an HR Manager - other than whoever submitted it - can approve or reject this registration.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {profile.status === 'rejected' && (
                                    <div className="alert alert-danger mt-3 mb-0" style={{ fontSize: '0.82rem' }}>
                                        <div className="fw-semibold mb-1">Registration rejected</div>
                                        <div>
                                            {profile.registration?.reviewedBy?.name ? `${profile.registration.reviewedBy.name} rejected` : 'Rejected'} this
                                            registration{profile.registration?.reviewedAt
                                                ? ` on ${new Date(profile.registration.reviewedAt).toLocaleString()}` : ''}:
                                        </div>
                                        <div className="fst-italic mt-1">"{profile.registration?.rejectionReason}"</div>
                                        {canRecord && (
                                            <>
                                                <Form.Group className="mt-2">
                                                    <Form.Label style={{ fontSize: '0.76rem' }}>Note for the HR Manager (optional)</Form.Label>
                                                    <Form.Control as="textarea" rows={2} size="sm" value={resubmitNote}
                                                                  onChange={e => setResubmitNote(e.target.value)}
                                                                  placeholder="What did you correct?" />
                                                </Form.Group>
                                                <div className="d-flex gap-2 mt-2">
                                                    <Button size="sm" variant="outline-primary" onClick={() => openEdit(profile)}>
                                                        Correct information
                                                    </Button>
                                                    <Button size="sm" variant="warning" disabled={registrationBusy}
                                                            onClick={() => resubmitRegistration(profile)}>
                                                        Resubmit for approval
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {canRecord && (
                                    <div className="mt-4 d-flex gap-2">
                                        <Button size="sm" variant="outline-primary" onClick={() => openEdit(profile)}>Edit employee</Button>
                                        {profile.status !== 'terminated' && (
                                            <Button size="sm" variant="outline-danger" onClick={() => terminate(profile)}>
                                                Mark terminated
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </Tab>

                            <Tab eventKey="personal" title="Personal Information">
                                <Row className="g-3">
                                    {[
                                        ['Gender', profile.personalInfo?.gender],
                                        ['Date of birth', profile.personalInfo?.dateOfBirth
                                            ? new Date(profile.personalInfo.dateOfBirth).toLocaleDateString() : null],
                                        ['Marital status', profile.personalInfo?.maritalStatus],
                                        ['Blood type', profile.personalInfo?.bloodType],
                                        ['Nationality', profile.personalInfo?.nationality],
                                        ['Phone', profile.contactInfo?.phone],
                                        ['Email', profile.contactInfo?.email],
                                        ['Address', [profile.contactInfo?.address?.street, profile.contactInfo?.address?.city, profile.contactInfo?.address?.country]
                                            .filter(Boolean).join(', ')]
                                    ].map(([label, value]) => (
                                        <Col md={6} key={label}>
                                            <div className="text-uppercase text-muted"
                                                 style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                                {label}
                                            </div>
                                            <div className="text-dark" style={{ fontSize: '0.86rem' }}>{value || '—'}</div>
                                        </Col>
                                    ))}
                                </Row>
                            </Tab>

                            <Tab eventKey="employment" title="Employment">
                                <Row className="g-3">
                                    {[
                                        ['Department', departmentName(profile.employmentInfo?.department)],
                                        ['Position', positionTitle(profile.employmentInfo?.position)],
                                        ['Position rank', positionRankName(profile.employmentInfo?.position)],
                                        ['Employment status', profile.employmentInfo?.employmentStatus],
                                        ['Work location', profile.employmentInfo?.workLocation],
                                        ['Supervisor', profile.employmentInfo?.supervisor?.name],
                                        ['Hire date', profile.employmentInfo?.hireDate
                                            ? new Date(profile.employmentInfo.hireDate).toLocaleDateString() : null]
                                    ].map(([label, value]) => (
                                        <Col md={6} key={label}>
                                            <div className="text-uppercase text-muted"
                                                 style={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '.5px' }}>
                                                {label}
                                            </div>
                                            <div className="text-dark" style={{ fontSize: '0.86rem' }}>{value || '—'}</div>
                                        </Col>
                                    ))}
                                </Row>
                            </Tab>

                            <Tab eventKey="organization" title="Organization">
                                <div className="fw-semibold text-dark mb-2" style={{ fontSize: '0.85rem' }}>Employment history</div>
                                {(profile.employmentHistory || []).length === 0 ? (
                                    <p className="text-muted" style={{ fontSize: '0.82rem' }}>No history recorded yet.</p>
                                ) : (
                                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                                        {[...profile.employmentHistory].reverse().map((h, idx) => (
                                            <div key={idx} className="d-flex justify-content-between align-items-start p-2 border-bottom">
                                                <div>
                                                    <Badge bg="light" text="dark" className="border me-2">{h.type?.replace('_', ' ')}</Badge>
                                                    <span style={{ fontSize: '0.82rem' }}>{h.note}</span>
                                                </div>
                                                <div className="text-muted text-end" style={{ fontSize: '0.74rem' }}>
                                                    {h.effectiveDate ? new Date(h.effectiveDate).toLocaleDateString() : ''}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="fw-semibold text-dark mt-4 mb-2" style={{ fontSize: '0.85rem' }}>Documents on file</div>
                                {(profile.documents || []).length === 0 ? (
                                    <p className="text-muted" style={{ fontSize: '0.82rem' }}>No documents recorded yet.</p>
                                ) : (
                                    <ul className="ps-3" style={{ fontSize: '0.82rem' }}>
                                        {profile.documents.map((d, idx) => (
                                            <li key={idx}>{d.name} <span className="text-muted">({d.type})</span></li>
                                        ))}
                                    </ul>
                                )}
                            </Tab>

                            <Tab eventKey="account" title="Account">
                                {profile.user ? (
                                    <div>
                                        <Row className="g-3 mb-3">
                                            <Col md={6}>
                                                <div className="text-uppercase text-muted" style={{ fontSize: '0.64rem', fontWeight: 700 }}>Name</div>
                                                <div style={{ fontSize: '0.86rem' }}>{profile.user.name}</div>
                                            </Col>
                                            <Col md={6}>
                                                <div className="text-uppercase text-muted" style={{ fontSize: '0.64rem', fontWeight: 700 }}>Email</div>
                                                <div style={{ fontSize: '0.86rem' }}>{profile.user.email}</div>
                                            </Col>
                                            <Col md={6}>
                                                <div className="text-uppercase text-muted" style={{ fontSize: '0.64rem', fontWeight: 700 }}>Status</div>
                                                <StatusBadge status={profile.user.status} />
                                            </Col>
                                        </Row>
                                        {canManageTeam && (
                                            <div className="d-flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant={profile.user.status === 'active' ? 'outline-danger' : 'outline-success'}
                                                    onClick={toggleAccountStatus}
                                                >
                                                    {profile.user.status === 'active' ? 'Deactivate account' : 'Activate account'}
                                                </Button>
                                                {profile.user.email && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline-secondary"
                                                        disabled={resendBusy}
                                                        onClick={resendCredentials}
                                                        title="Email a fresh secure link so the employee can set/reset their password"
                                                    >
                                                        {resendBusy ? 'Sending…' : 'Resend login credentials'}
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : canManageTeam ? (
                                    <div>
                                        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                            This employee has no login access yet.
                                        </p>
                                        <div className="d-flex gap-2 mb-3">
                                            <Button size="sm" onClick={openCreateAccount}>Create account</Button>
                                            <Button size="sm" variant="outline-secondary" onClick={openLinkAccount}>
                                                Link existing account
                                            </Button>
                                        </div>

                                        {accountMode === 'create' && (
                                            <Form onSubmit={submitAccount} className="border rounded p-3">
                                                <Form.Group className="mb-2">
                                                    <Form.Label style={{ fontSize: '0.8rem' }}>Email</Form.Label>
                                                    <Form.Control type="email" required value={accountForm.email}
                                                                  onChange={e => setAccountForm({ ...accountForm, email: e.target.value })} />
                                                </Form.Group>
                                                <Form.Group className="mb-2">
                                                    <Form.Label style={{ fontSize: '0.8rem' }}>Temporary password</Form.Label>
                                                    <Form.Control type="password" required minLength={6} value={accountForm.password}
                                                                  onChange={e => setAccountForm({ ...accountForm, password: e.target.value })} />
                                                </Form.Group>
                                                <Form.Group className="mb-3">
                                                    <Form.Label style={{ fontSize: '0.8rem' }}>Initial role</Form.Label>
                                                    <Form.Select value={accountForm.role}
                                                                 onChange={e => setAccountForm({ ...accountForm, role: e.target.value })}>
                                                        {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                    </Form.Select>
                                                </Form.Group>
                                                <Form.Group className="mb-3">
                                                    <Form.Check
                                                        type="checkbox"
                                                        id="send-credentials-create"
                                                        label="Send login credentials by email"
                                                        style={{ fontSize: '0.82rem' }}
                                                        checked={accountForm.sendCredentials}
                                                        onChange={e => setAccountForm({ ...accountForm, sendCredentials: e.target.checked })}
                                                    />
                                                    <Form.Text className="text-muted" style={{ fontSize: '0.72rem' }}>
                                                        Emails the employee a secure link to set their own password -
                                                        the temporary password above is never sent by email.
                                                    </Form.Text>
                                                </Form.Group>
                                                <div className="d-flex gap-2">
                                                    <Button type="submit" size="sm" disabled={accountBusy}>
                                                        {accountBusy ? 'Creating…' : 'Create account'}
                                                    </Button>
                                                    <Button size="sm" variant="light" onClick={() => setAccountMode(null)}>Cancel</Button>
                                                </div>
                                            </Form>
                                        )}

                                        {accountMode === 'link' && (
                                            <Form onSubmit={submitAccount} className="border rounded p-3">
                                                <Form.Group className="mb-3">
                                                    <Form.Label style={{ fontSize: '0.8rem' }}>Existing account in your organization</Form.Label>
                                                    {unlinkedAccounts.length === 0 ? (
                                                        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                            No unlinked accounts available.
                                                        </p>
                                                    ) : (
                                                        <Form.Select value={accountForm.userId}
                                                                     onChange={e => setAccountForm({ ...accountForm, userId: e.target.value })}>
                                                            <option value="">Choose an account</option>
                                                            {unlinkedAccounts.map(u => (
                                                                <option key={u._id} value={u._id}>{u.name} ({u.email}) — {roleLabel(u.role)}</option>
                                                            ))}
                                                        </Form.Select>
                                                    )}
                                                </Form.Group>
                                                <div className="d-flex gap-2">
                                                    <Button type="submit" size="sm" disabled={accountBusy || unlinkedAccounts.length === 0}>
                                                        {accountBusy ? 'Linking…' : 'Link account'}
                                                    </Button>
                                                    <Button size="sm" variant="light" onClick={() => setAccountMode(null)}>Cancel</Button>
                                                </div>
                                            </Form>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                        This employee has no login access yet. Only your organization owner can create or link one.
                                    </p>
                                )}
                            </Tab>

                            <Tab eventKey="roles" title="Roles & Permissions">
                                {!profile.user ? (
                                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                                        Create or link a user account first, then a role can be assigned here.
                                    </p>
                                ) : (
                                    <div>
                                        <div className="d-flex align-items-center gap-2 mb-3">
                                            {profile.user.role === 'hr_manager' ? <FaUserShield className="text-primary" /> : <FaUserCog className="text-primary" />}
                                            <div>
                                                <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>
                                                    Current role: {roleLabel(profile.user.role)}
                                                </div>
                                                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                                                    {ASSIGNABLE_ROLES.find(r => r.value === profile.user.role)?.hint
                                                        || 'Owns and manages the organization.'}
                                                </div>
                                            </div>
                                        </div>

                                            {headedDepartments(profile).length > 0 && (
                                                <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: '0.82rem' }}>
                                                    <FaUserShield className="me-2" />
                                                    Also the assigned <strong>Department Head</strong> of{' '}
                                                    <strong>{headedDepartments(profile).map(d => d.name).join(', ')}</strong>
                                                    {' '}- set in Configuration, not a separate role. This lets them raise Job
                                                    Requisitions for that department regardless of their role above.
                                                </div>
                                            )}

                                        {canManageTeam ? (
                                            <Form onSubmit={submitRole} className="border rounded p-3" style={{ maxWidth: 420 }}>
                                                <Form.Group className="mb-3">
                                                    <Form.Label style={{ fontSize: '0.8rem' }}>Assign role</Form.Label>
                                                    <Form.Select value={roleValue} onChange={e => setRoleValue(e.target.value)}>
                                                        {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                                    </Form.Select>
                                                    <Form.Text className="text-muted" style={{ fontSize: '0.74rem' }}>
                                                        {ASSIGNABLE_ROLES.find(r => r.value === roleValue)?.hint}
                                                    </Form.Text>
                                                </Form.Group>
                                                <Form.Group className="mb-3">
                                                    <Form.Check
                                                        type="checkbox"
                                                        id="send-credentials-role"
                                                        label="Send login credentials by email"
                                                        style={{ fontSize: '0.82rem' }}
                                                        checked={sendRoleCredentials}
                                                        onChange={e => setSendRoleCredentials(e.target.checked)}
                                                    />
                                                </Form.Group>
                                                <Button type="submit" size="sm" disabled={roleBusy || roleValue === profile.user.role}>
                                                    {roleBusy ? 'Saving…' : 'Assign role'}
                                                </Button>
                                            </Form>
                                        ) : (
                                            <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                                                Only your organization owner can change organizational roles.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </Tab>
                        </Tabs>
                    )}
                </Modal.Body>
            </Modal>

            <ConfirmDeleteModal
                show={!!terminateTarget}
                title="Terminate employee?"
                itemName={terminateTarget ? fullName(terminateTarget) : ''}
                description="Their record is kept for history."
                confirmLabel="Mark terminated"
                busyLabel="Terminating…"
                busy={terminating}
                onCancel={() => setTerminateTarget(null)}
                onConfirm={confirmTerminate}
            />

            {/* Reject a pending registration - a reason is mandatory so the HR
                Expert who submitted it knows exactly what to correct. */}
            <Modal show={!!rejectTarget} onHide={() => setRejectTarget(null)} centered>
                <Modal.Header closeButton>
                    <Modal.Title style={{ fontSize: '1.05rem' }}>Reject employee registration</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Explain what {rejectTarget ? fullName(rejectTarget) : 'this employee'}'s record needs corrected.
                        The HR Expert who submitted it will see this reason and can resubmit.
                    </p>
                    <Form.Group>
                        <Form.Label style={{ fontSize: '0.8rem' }}>Rejection reason (required)</Form.Label>
                        <Form.Control as="textarea" rows={3} value={rejectReason}
                                      onChange={e => setRejectReason(e.target.value)}
                                      placeholder="e.g. Employment start date conflicts with the offer letter" />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="light" onClick={() => setRejectTarget(null)}>Cancel</Button>
                    <Button variant="danger" disabled={registrationBusy || !rejectReason.trim()} onClick={confirmReject}>
                        {registrationBusy ? 'Rejecting…' : 'Reject registration'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default EmployeeDirectory;
