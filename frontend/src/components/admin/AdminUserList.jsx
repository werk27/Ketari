import React, { useState, useEffect, useCallback } from 'react';
import {
    Row, Col, Card, Table, Badge, Spinner, Button,
    Form, Modal, InputGroup
} from 'react-bootstrap';
import {
    FaSearch, FaUserPlus, FaEdit, FaTrash, FaUsers,
    FaUserTie, FaUserCheck, FaShieldAlt, FaChevronLeft, FaChevronRight,
    FaToggleOn, FaToggleOff, FaFilter
} from 'react-icons/fa';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';

/* ── Role config map ── */
const ROLE_CONFIG = {
    all:            { apiRole: '',            title: 'All Users',       icon: <FaUsers size={20} />,     iconBg: '#4F46E5', badgeColor: '#4F46E5', description: 'Manage all system users across different roles.' },
    candidates:     { apiRole: 'candidate',   title: 'Candidates',      icon: <FaUserTie size={20} />,   iconBg: '#10B981', badgeColor: '#10B981', description: 'Candidates looking for jobs and tracking their applications.' },
    'hr-experts':   { apiRole: 'hr_expert',    title: 'HR Experts',      icon: <FaUserCheck size={20} />, iconBg: '#3B82F6', badgeColor: '#3B82F6', description: 'HR Experts manage day-to-day recruitment activities, including vacancies, applications, candidate screening, AI matching, shortlisting, interviews, and recruitment records.' },
    'hr-managers':  { apiRole: 'hr_manager',  title: 'HR Managers',     icon: <FaShieldAlt size={20} />, iconBg: '#F59E0B', badgeColor: '#F59E0B', description: 'HR Managers are responsible for REVIEW, APPROVAL, and SUPERVISION of recruitment activities.' },
    administrators: { apiRole: 'admin',       title: 'Administrators',  icon: <FaShieldAlt size={20} />, iconBg: '#EF4444', badgeColor: '#EF4444', description: 'System Administrators control the system configuration and manage all users.' },
};

/* ── Design Tokens ── */
const T = {
    primary: '#4F46E5', danger: '#EF4444',
    cardRadius: '16px',
    cardShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
};

const AdminUserList = () => {
    const { roleSlug } = useParams();
    const config = ROLE_CONFIG[roleSlug] || ROLE_CONFIG.all;

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [roleStats, setRoleStats] = useState(null);
    const limit = 15;

    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', role: config.apiRole || 'candidate', password: '' });

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const params = { page, limit, search };
            if (config.apiRole) params.role = config.apiRole;
            const res = await api.get('/admin/users', { params });
            setUsers(res.data.users || []);
            setTotalUsers(res.data.totalUsers || 0);
            setRoleStats(res.data.roleStats || null);
        } catch (err) {
            console.error('Fetch users error:', err);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [page, search, config.apiRole]);

    useEffect(() => { setPage(1); }, [roleSlug]);
    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleEdit = (user) => {
        setEditingUser(user);
        setFormData({ name: user.name, email: user.email, role: user.role, password: '' });
        setShowModal(true);
    };

    const handleCreate = () => {
        setEditingUser(null);
        setFormData({ name: '', email: '', role: config.apiRole || 'candidate', password: '' });
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await api.put(`/admin/users/${editingUser._id}`, {
                    name: formData.name, email: formData.email, role: formData.role
                });
                toast.success('User updated successfully');
            } else {
                await api.post('/admin/users', {
                    name: formData.name, email: formData.email, role: formData.role, password: formData.password
                });
                toast.success('User created successfully');
            }
            setShowModal(false);
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save user');
        }
    };

    const handleDelete = async (userId) => {
        if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
        try {
            await api.delete(`/admin/users/${userId}`);
            toast.success('User deleted');
            fetchUsers();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleToggleStatus = async (user) => {
        try {
            const newStatus = user.status === 'active' ? 'inactive' : 'active';
            await api.put(`/admin/users/${user._id}`, { status: newStatus });
            toast.success(`User ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
            fetchUsers();
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const totalPages = Math.ceil(totalUsers / limit);

    const getRoleBadge = (role) => {
        const map = {
            admin:     { bg: '#FEE2E2', color: '#DC2626', label: 'Administrator' },
            hr_expert:  { bg: '#EFF6FF', color: '#2563EB', label: 'HR Expert' },
            hr_manager: { bg: '#FEF3C7', color: '#D97706', label: 'HR Manager' },
            candidate: { bg: '#D1FAE5', color: '#059669', label: 'Candidate' },
        };
        const r = map[role] || { bg: '#F1F5F9', color: '#64748B', label: role };
        return <Badge style={{ background: r.bg, color: r.color, fontWeight: 600, fontSize: '0.72rem', padding: '5px 10px' }}>{r.label}</Badge>;
    };

    const getStatusBadge = (status) => {
        const isActive = status === 'active' || !status;
        return (
            <Badge style={{ background: isActive ? '#D1FAE5' : '#FEE2E2', color: isActive ? '#059669' : '#DC2626', fontWeight: 600, fontSize: '0.72rem', padding: '5px 10px' }}>
                {isActive ? '● Active' : '● Inactive'}
            </Badge>
        );
    };

    return (
        <div className="p-4">
            {/* ── Page Header ── */}
            <div className="d-flex align-items-center justify-content-between mb-4">
                <div className="d-flex align-items-center gap-3">
                    <div className="rounded-circle d-flex align-items-center justify-content-center text-white" style={{ width: '48px', height: '48px', background: config.iconBg }}>
                        {config.icon}
                    </div>
                    <div>
                        <h4 className="fw-bold text-dark mb-0" style={{ fontSize: '1.25rem' }}>{config.title}</h4>
                        <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {totalUsers} {totalUsers === 1 ? 'user' : 'users'} found
                        </small>
                    </div>
                </div>
                <Button className="d-flex align-items-center gap-2 fw-semibold rounded-pill px-4 text-white border-0"
                    style={{ background: config.iconBg, fontSize: '0.85rem' }}
                    onClick={handleCreate}>
                    <FaUserPlus size={14} />
                    Add {config.title === 'All Users' ? 'User' : config.title.replace(/s$/, '')}
                </Button>
            </div>

            {/* ── Role Description ── */}
            {config.description && (
                <p className="text-muted mb-4" style={{ fontSize: '0.9rem', maxWidth: '800px', lineHeight: '1.5' }}>
                    {config.description}
                </p>
            )}

            {/* ── Statistics Cards ── */}
            {roleStats && (
                <Row className="mb-4 g-3">
                    <Col md={3} sm={6}>
                        <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                            <Card.Body className="p-3">
                                <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Total {config.title}</small>
                                <h3 className="fw-bold text-dark mb-0 mt-1">{roleStats.total}</h3>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col md={3} sm={6}>
                        <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                            <Card.Body className="p-3">
                                <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Active</small>
                                <h3 className="fw-bold text-success mb-0 mt-1">{roleStats.active}</h3>
                            </Card.Body>
                        </Card>
                    </Col>
                    {config.apiRole === 'hr_expert' && (
                        <>
                            <Col md={3} sm={6}>
                                <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                                    <Card.Body className="p-3">
                                        <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Total Vacancies</small>
                                        <h3 className="fw-bold text-primary mb-0 mt-1">{roleStats.totalVacancies || 0}</h3>
                                    </Card.Body>
                                </Card>
                            </Col>
                            <Col md={3} sm={6}>
                                <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                                    <Card.Body className="p-3">
                                        <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Total Applications</small>
                                        <h3 className="fw-bold text-info mb-0 mt-1">{roleStats.totalApplications || 0}</h3>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </>
                    )}
                    {config.apiRole === 'hr_manager' && (
                        <>
                            <Col md={3} sm={6}>
                                <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                                    <Card.Body className="p-3">
                                        <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Pending Vacancies</small>
                                        <h3 className="fw-bold text-warning mb-0 mt-1">{roleStats.pendingVacancies || 0}</h3>
                                    </Card.Body>
                                </Card>
                            </Col>
                            <Col md={3} sm={6}>
                                <Card className="border-0 h-100" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                                    <Card.Body className="p-3">
                                        <small className="text-uppercase fw-bold text-muted d-block" style={{ fontSize: '0.64rem', letterSpacing: '0.6px' }}>Pending Shortlists</small>
                                        <h3 className="fw-bold text-info mb-0 mt-1">{roleStats.pendingShortlists || 0}</h3>
                                    </Card.Body>
                                </Card>
                            </Col>
                        </>
                    )}
                </Row>
            )}

            {/* ── Search + Filter Bar ── */}
            <Card className="border-0 mb-4" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                <Card.Body className="p-3">
                    <Row className="g-2 align-items-center">
                        <Col md={6}>
                            <InputGroup>
                                <InputGroup.Text className="bg-white border-end-0" style={{ borderRadius: '10px 0 0 10px' }}>
                                    <FaSearch size={14} className="text-muted" />
                                </InputGroup.Text>
                                <Form.Control
                                    type="text"
                                    placeholder={`Search ${config.title.toLowerCase()} by name or email...`}
                                    value={search}
                                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                                    className="border-start-0"
                                    style={{ borderRadius: '0 10px 10px 0', fontSize: '0.85rem' }}
                                />
                            </InputGroup>
                        </Col>
                        <Col md={6} className="d-flex justify-content-end gap-2">
                            <Button variant="light" className="d-flex align-items-center gap-2 border" style={{ borderRadius: '10px', fontSize: '0.82rem' }}>
                                <FaFilter size={12} /> Filter
                            </Button>
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            {/* ── User Table ── */}
            <Card className="border-0" style={{ borderRadius: T.cardRadius, boxShadow: T.cardShadow }}>
                <Card.Body className="p-0">
                    {loading ? (
                        <div className="d-flex justify-content-center align-items-center py-5">
                            <Spinner animation="border" style={{ color: T.primary }} />
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-5">
                            <FaUsers size={48} className="text-muted mb-3" style={{ opacity: 0.3 }} />
                            <h6 className="text-muted">No {config.title.toLowerCase()} found</h6>
                            <p className="text-muted small">Try adjusting your search or add a new user.</p>
                        </div>
                    ) : (
                        <Table responsive hover className="mb-0 align-middle" style={{ fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#FAFBFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <th className="fw-semibold text-muted text-uppercase py-3 ps-4" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>USER</th>
                                    <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>EMAIL</th>
                                    <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>DEPARTMENT</th>
                                    <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>STATUS</th>
                                    
                                    {config.apiRole === 'hr_expert' ? (
                                        <>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>VACANCIES MANAGED</th>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>APPLICATIONS PROCESSED</th>
                                        </>
                                    ) : config.apiRole === 'hr_manager' ? (
                                        <>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>PENDING APPROVALS</th>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>VACANCIES APPROVED</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>ROLE</th>
                                            <th className="fw-semibold text-muted text-uppercase py-3" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>JOINED</th>
                                        </>
                                    )}
                                    <th className="fw-semibold text-muted text-uppercase py-3 text-center" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((u) => (
                                    <tr key={u._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td className="ps-4 py-3">
                                            <div className="d-flex align-items-center gap-2">
                                                <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                                                     style={{ width: '34px', height: '34px', fontSize: '0.78rem', background: config.iconBg, flexShrink: 0 }}>
                                                    {u.name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <span className="fw-semibold text-dark">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted">{u.email}</td>
                                        <td className="text-muted">{u.profile?.department || '—'}</td>
                                        <td>{getStatusBadge(u.status)}</td>
                                        
                                        {config.apiRole === 'hr_expert' ? (
                                            <>
                                                <td className="text-dark fw-semibold">{u.stats?.vacanciesManaged || 0}</td>
                                                <td className="text-dark fw-semibold">{u.stats?.applicationsProcessed || 0}</td>
                                            </>
                                        ) : config.apiRole === 'hr_manager' ? (
                                            <>
                                                <td className="text-warning fw-semibold">{u.stats?.pendingApprovals || 0}</td>
                                                <td className="text-success fw-semibold">{u.stats?.vacanciesApproved || 0}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{getRoleBadge(u.role)}</td>
                                                <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                                                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                </td>
                                            </>
                                        )}
                                        
                                        <td>
                                            <div className="d-flex justify-content-center gap-1">
                                                <Button variant="light" size="sm" className="border-0 rounded-2 text-primary" title="View Activity" style={{ padding: '6px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                    Activity
                                                </Button>
                                                <Button variant="light" size="sm" className="border-0 rounded-2" title="Edit" onClick={() => handleEdit(u)}
                                                    style={{ padding: '6px 10px' }}>
                                                    <FaEdit size={13} className="text-primary" />
                                                </Button>
                                                <Button variant="light" size="sm" className="border-0 rounded-2" title={u.status === 'active' ? 'Deactivate' : 'Activate'}
                                                    onClick={() => handleToggleStatus(u)} style={{ padding: '6px 10px' }}>
                                                    {u.status === 'inactive' ? <FaToggleOff size={13} className="text-muted" /> : <FaToggleOn size={13} className="text-success" />}
                                                </Button>
                                                <Button variant="light" size="sm" className="border-0 rounded-2" title="Delete" onClick={() => handleDelete(u._id)}
                                                    style={{ padding: '6px 10px' }}>
                                                    <FaTrash size={12} className="text-danger" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    )}

                    {/* ── Pagination ── */}
                    {totalPages > 1 && (
                        <div className="d-flex justify-content-between align-items-center px-4 py-3 border-top" style={{ background: '#FAFBFC' }}>
                            <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalUsers)} of {totalUsers}
                            </small>
                            <div className="d-flex gap-1">
                                <Button variant="light" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                                    className="border rounded-2 d-flex align-items-center" style={{ padding: '5px 10px' }}>
                                    <FaChevronLeft size={11} />
                                </Button>
                                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                                    const p = i + 1;
                                    return (
                                        <Button key={p} size="sm" onClick={() => setPage(p)}
                                            className="border-0 rounded-2 fw-semibold"
                                            style={{ padding: '5px 12px', fontSize: '0.8rem',
                                                background: page === p ? T.primary : 'transparent',
                                                color: page === p ? '#fff' : '#64748B' }}>
                                            {p}
                                        </Button>
                                    );
                                })}
                                <Button variant="light" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                                    className="border rounded-2 d-flex align-items-center" style={{ padding: '5px 10px' }}>
                                    <FaChevronRight size={11} />
                                </Button>
                            </div>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* ── Create/Edit User Modal ── */}
            <Modal show={showModal} onHide={() => setShowModal(false)} centered>
                <Modal.Header closeButton className="border-0" style={{ background: '#FAFBFC' }}>
                    <Modal.Title className="fw-bold" style={{ fontSize: '1.05rem' }}>
                        <FaUserPlus className="me-2" style={{ color: config.iconBg }} />
                        {editingUser ? 'Edit User' : `Add New ${config.title === 'All Users' ? 'User' : config.title.replace(/s$/, '')}`}
                    </Modal.Title>
                </Modal.Header>
                <Form onSubmit={handleSubmit}>
                    <Modal.Body>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Full Name</Form.Label>
                            <Form.Control type="text" required value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Enter full name" style={{ borderRadius: '10px' }} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Email Address</Form.Label>
                            <Form.Control type="email" required value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="name@company.com" style={{ borderRadius: '10px' }} />
                        </Form.Group>
                        <Form.Group className="mb-3">
                            <Form.Label className="fw-semibold small">Role</Form.Label>
                            <Form.Select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                style={{ borderRadius: '10px' }}>
                                <option value="candidate">Candidate</option>
                                <option value="hr_expert">HR Expert</option>
                                <option value="hr_manager">HR Manager</option>
                                <option value="admin">Administrator</option>
                            </Form.Select>
                        </Form.Group>
                        {!editingUser && (
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold small">Password</Form.Label>
                                <Form.Control type="password" required minLength={6} value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="Minimum 6 characters" style={{ borderRadius: '10px' }} />
                            </Form.Group>
                        )}
                    </Modal.Body>
                    <Modal.Footer className="border-0">
                        <Button variant="light" className="rounded-pill px-4" onClick={() => setShowModal(false)}>Cancel</Button>
                        <Button type="submit" className="rounded-pill px-4 fw-bold text-white" style={{ background: config.iconBg, borderColor: config.iconBg }}>
                            {editingUser ? 'Update User' : 'Create Account'}
                        </Button>
                    </Modal.Footer>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminUserList;
