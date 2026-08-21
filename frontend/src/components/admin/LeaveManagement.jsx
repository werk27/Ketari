import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Spinner, Alert, Button, Form, Modal } from 'react-bootstrap';
import { FaCalendarAlt, FaCheck, FaTimes, FaSync } from 'react-icons/fa';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';

const LeaveManagement = () => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [leaves, setLeaves] = useState([]);
    const [error, setError] = useState('');
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        fetchLeaves();
    }, []);

    const fetchLeaves = async () => {
        try {
            if (refreshing) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            
            const response = await api.get('/leaves');
            setLeaves(response.data.data || []);
            setError('');
        } catch (error) {
            console.error('Error fetching leaves:', error);
            setError('Failed to load leave requests');
            toast.error('Failed to load leave requests');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        fetchLeaves();
    };

    const handleApprove = async (leaveId) => {
        try {
            await api.put(`/leaves/${leaveId}/status`, { status: 'approved' });
            toast.success('Leave request approved');
            fetchLeaves();
        } catch (error) {
            console.error('Approve error:', error);
            toast.error('Failed to approve leave request');
        }
    };

    const handleRejectClick = (leave) => {
        setSelectedLeave(leave);
        setRejectionReason('');
        setShowRejectModal(true);
    };

    const handleReject = async () => {
        try {
            await api.put(`/leaves/${selectedLeave._id}/status`, { 
                status: 'rejected',
                rejectionReason: rejectionReason 
            });
            toast.success('Leave request rejected');
            setShowRejectModal(false);
            fetchLeaves();
        } catch (error) {
            console.error('Reject error:', error);
            toast.error('Failed to reject leave request');
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getStatusBadge = (status) => {
        const config = {
            pending: { bg: 'warning', text: 'Pending' },
            approved: { bg: 'success', text: 'Approved' },
            rejected: { bg: 'danger', text: 'Rejected' },
            cancelled: { bg: 'secondary', text: 'Cancelled' }
        };
        const { bg, text } = config[status] || config.pending;
        return <Badge bg={bg}>{text}</Badge>;
    };

    if (loading) {
        return (
            <Container className="py-5">
                <div className="text-center">
                    <Spinner animation="border" />
                    <p className="mt-3">Loading leave requests...</p>
                </div>
            </Container>
        );
    }

    return (
        <Container className="py-5">
            <BackButton to="/admin/dashboard" />
            <Row className="mb-4">
                <Col>
                    <h2 className="fw-bold mb-1">{t('admin.leave_management')}</h2>
                    <p className="text-muted">{t('leave.subtitle')}</p>
                </Col>
                <Col xs="auto">
                    <Button 
                        variant="outline-primary" 
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="d-flex align-items-center gap-2"
                    >
                        {refreshing ? <Spinner size="sm" /> : <FaSync />}
                        Refresh
                    </Button>
                </Col>
            </Row>

            {error && (
                <Alert variant="danger" dismissible onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {/* Stats Cards */}
            <Row className="mb-4">
                <Col md={3}>
                    <Card className="text-center shadow-sm h-100">
                        <Card.Body>
                            <h3 className="text-primary fw-bold">{leaves.length}</h3>
                            <p className="text-muted mb-0">Total Requests</p>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="text-center shadow-sm h-100">
                        <Card.Body>
                            <h3 className="text-warning fw-bold">{leaves.filter(l => l.status === 'pending').length}</h3>
                            <p className="text-muted mb-0">Pending</p>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="text-center shadow-sm h-100">
                        <Card.Body>
                            <h3 className="text-success fw-bold">{leaves.filter(l => l.status === 'approved').length}</h3>
                            <p className="text-muted mb-0">Approved</p>
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={3}>
                    <Card className="text-center shadow-sm h-100">
                        <Card.Body>
                            <h3 className="text-danger fw-bold">{leaves.filter(l => l.status === 'rejected').length}</h3>
                            <p className="text-muted mb-0">Rejected</p>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Leave Requests Table */}
            <Card className="shadow-sm">
                <Card.Header className="bg-white fw-bold d-flex justify-content-between align-items-center">
                    <span>Leave Requests</span>
                    <Badge bg="primary">{leaves.length} Records</Badge>
                </Card.Header>
                <Card.Body className="p-0">
                    {leaves.length === 0 ? (
                        <div className="text-center p-4">
                            <p className="text-muted">No leave requests found</p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table table-hover mb-0">
                                <thead className="table-light">
                                    <tr>
                                        <th>Employee</th>
                                        <th>Email</th>
                                        <th>Leave Type</th>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Days</th>
                                        <th>Reason</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaves.map((leave) => (
                                        <tr key={leave._id}>
                                            <td className="fw-semibold">{leave.employee?.user?.name || 'N/A'}</td>
                                            <td className="text-muted">{leave.employee?.user?.email || 'N/A'}</td>
                                            <td className="text-capitalize">{leave.leaveType}</td>
                                            <td>{formatDate(leave.startDate)}</td>
                                            <td>{formatDate(leave.endDate)}</td>
                                            <td>{leave.totalDays || '-'}</td>
                                            <td className="text-truncate" style={{ maxWidth: '150px' }}>{leave.reason}</td>
                                            <td>{getStatusBadge(leave.status)}</td>
                                            <td>
                                                {leave.status === 'pending' && (
                                                    <div className="d-flex gap-1">
                                                        <Button 
                                                            size="sm" 
                                                            variant="success"
                                                            onClick={() => handleApprove(leave._id)}
                                                            title="Approve"
                                                        >
                                                            <FaCheck />
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="danger"
                                                            onClick={() => handleRejectClick(leave)}
                                                            title="Reject"
                                                        >
                                                            <FaTimes />
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card.Body>
            </Card>

            {/* Reject Modal */}
            <Modal show={showRejectModal} onHide={() => setShowRejectModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Reject Leave Request</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label>Rejection Reason *</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={4}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Please provide a reason for rejection"
                            required
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowRejectModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={handleReject} disabled={!rejectionReason}>
                        Reject
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default LeaveManagement;
