import React, { useState, useEffect } from 'react';
import { Container, Card, Table, Badge, Button, Spinner, Alert, Modal, Form } from 'react-bootstrap';
import { FaCheck, FaTimes, FaExclamationTriangle, FaSearch, FaEye } from 'react-icons/fa';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';

const ComplaintManager = () => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [complaints, setComplaints] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [resolution, setResolution] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        fetchComplaints();
    }, []);

    const fetchComplaints = async () => {
        try {
            const response = await api.get('/complaints/unassigned');
            setComplaints(response.data.data || []);
            setError('');
        } catch (error) {
            console.error('Error fetching complaints:', error);
            setError('Failed to load complaints');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        try {
            await api.put(`/complaints/unassigned/${id}/status`, {
                status: newStatus,
                resolution: resolution || undefined
            });
            toast.success(`Complaint ${newStatus} successfully!`);
            fetchComplaints();
            setShowModal(false);
            setSelectedComplaint(null);
            setResolution('');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update complaint');
        }
    };

    const getStatusBadge = (status) => {
        const map = {
            pending: 'warning',
            submitted: 'warning',
            under_review: 'info',
            investigating: 'info',
            responded: 'primary',
            resolved: 'success',
            rejected: 'danger'
        };
        return map[status] || 'secondary';
    };

    const OPEN_STATUSES = ['pending', 'submitted', 'under_review'];
    const IN_PROGRESS_STATUSES = ['investigating', 'responded'];

    const getPriorityBadge = (priority) => {
        const map = {
            low: 'secondary',
            medium: 'info',
            high: 'warning',
            urgent: 'danger'
        };
        return map[priority] || 'secondary';
    };

    if (loading) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading complaints...</p>
            </Container>
        );
    }

    return (
        <Container className="py-4">
            <BackButton to="/admin/dashboard" />
            <h2 className="fw-bold mb-4">📋 {t('complaints.title')}</h2>

            {error && <Alert variant="danger">{error}</Alert>}

            <Card className="shadow-sm">
                <Card.Body>
                    <Table responsive hover>
                        <thead>
                            <tr>
                                <th>Submitted By</th>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Priority</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {complaints.map((complaint) => (
                                <tr key={complaint._id}>
                                    <td>{complaint.raisedBy?.name || 'N/A'}</td>
                                    <td>{complaint.title}</td>
                                    <td>{complaint.type}</td>
                                    <td>
                                        <Badge bg={getPriorityBadge(complaint.priority)}>
                                            {complaint.priority}
                                        </Badge>
                                    </td>
                                    <td>
                                        <Badge bg={getStatusBadge(complaint.status)}>
                                            {complaint.status}
                                        </Badge>
                                    </td>
                                    <td>{new Date(complaint.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        {OPEN_STATUSES.includes(complaint.status) && (
                                            <>
                                                <Button
                                                    variant="outline-success"
                                                    size="sm"
                                                    className="me-1"
                                                    onClick={() => {
                                                        setSelectedComplaint(complaint);
                                                        setStatus('investigating');
                                                        setResolution('');
                                                        setShowModal(true);
                                                    }}
                                                >
                                                    <FaSearch /> Investigate
                                                </Button>
                                            </>
                                        )}
                                        {IN_PROGRESS_STATUSES.includes(complaint.status) && (
                                            <Button
                                                variant="outline-success"
                                                size="sm"
                                                className="me-1"
                                                onClick={() => {
                                                    setSelectedComplaint(complaint);
                                                    setStatus('resolved');
                                                    setResolution('');
                                                    setShowModal(true);
                                                }}
                                            >
                                                <FaCheck /> Resolve
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline-info"
                                            size="sm"
                                            className="me-1"
                                            onClick={() => {
                                                setSelectedComplaint(complaint);
                                                // View details
                                            }}
                                        >
                                            <FaEye />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {complaints.length === 0 && (
                                <tr><td colSpan="7" className="text-center text-muted">No complaints found</td></tr>
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>

            {/* Action Modal */}
            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>
                        {status === 'investigating' ? 'Start Investigation' : 
                         status === 'resolved' ? 'Resolve Complaint' : 'Update Complaint'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p><strong>Submitted by:</strong> {selectedComplaint?.raisedBy?.name || 'N/A'}</p>
                    <p><strong>Title:</strong> {selectedComplaint?.title}</p>
                    <p><strong>Description:</strong> {selectedComplaint?.description}</p>
                    <Form.Group>
                        <Form.Label>
                            Resolution / Note
                            {status === 'resolved' && <span className="text-danger"> *</span>}
                        </Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={3}
                            value={resolution}
                            onChange={(e) => setResolution(e.target.value)}
                            placeholder="Add resolution details..."
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
                    <Button 
                        variant={status === 'investigating' ? 'info' : 'success'}
                        disabled={status === 'resolved' && !resolution.trim()}
                        onClick={() => handleStatusUpdate(selectedComplaint?._id, status)}
                    >
                        {status === 'investigating' ? 'Start Investigation' : 'Resolve Complaint'}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default ComplaintManager;