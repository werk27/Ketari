import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Table, Badge, Spinner, Alert, Tabs, Tab, Modal } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes } from 'react-icons/fa';
import { useLanguage } from '../../context/LanguageContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';

const ConfigManager = () => {
    const { t } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState(null);
    const [activeTab, setActiveTab] = useState('organization');
    const [showAddModal, setShowAddModal] = useState(false);
    const [newItem, setNewItem] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const response = await api.get('/config');
            setConfig(response.data.data || {});
        } catch (error) {
            console.error('Error fetching config:', error);
            setError('Failed to load configurations');
        } finally {
            setLoading(false);
        }
    };

    const handleOrganizationUpdate = async (e) => {
        e.preventDefault();
        try {
            const response = await api.put('/config/organization', config.organization);
            setConfig(response.data.data);
            toast.success('Organization updated successfully!');
        } catch (error) {
            toast.error('Failed to update organization');
        }
    };

    const handleAddItem = async (type) => {
        try {
            console.log('=== Add Item Debug ===');
            console.log('Type:', type);
            console.log('New item data:', newItem);
            
            // Map frontend type to backend route
            const typeToRoute = {
                'departments': 'departments',
                'positions': 'positions',
                'skills': 'skills',
                'leaveTypes': 'leave-types',
                'jobTitles': 'job-titles',
                'languages': 'languages',
                'licenses': 'licenses',
                'religions': 'religions',
                'employmentStatus': 'employment-status',
                'educationLevels': 'education-levels',
                'maritalStatus': 'marital-status',
                'trainingTypes': 'training-types',
                'terminationReasons': 'termination-reasons',
                'deductionTypes': 'deduction-types',
                'nations': 'nations',
                'titles': 'titles',
                'bloodTypes': 'blood-types',
                'partners': 'partners',
                'positionRanks': 'position-ranks'
            };
            
            const route = typeToRoute[type] || type;
            console.log('API endpoint:', `/config/${route}`);
            
            const response = await api.post(`/config/${route}`, newItem);
            
            console.log('Response:', response.data);
            
            setConfig(response.data.data);
            setNewItem({});
            setShowAddModal(false);
            toast.success(`${type} added successfully!`);
        } catch (error) {
            console.error('=== Add Item Error ===');
            console.error('Error:', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);
            console.error('Error message:', error.message);
            
            const errorMessage = error.response?.data?.message || error.message || 'Failed to add item';
            toast.error(errorMessage);
        }
    };

    const handleDeleteItem = async (type, id) => {
        if (!window.confirm('Are you sure you want to delete this?')) return;
        try {
            // Map frontend type to backend route
            const typeToRoute = {
                'departments': 'departments',
                'positions': 'positions',
                'skills': 'skills',
                'leaveTypes': 'leave-types',
                'jobTitles': 'job-titles',
                'languages': 'languages',
                'licenses': 'licenses',
                'religions': 'religions',
                'employmentStatus': 'employment-status',
                'educationLevels': 'education-levels',
                'maritalStatus': 'marital-status',
                'trainingTypes': 'training-types',
                'terminationReasons': 'termination-reasons',
                'deductionTypes': 'deduction-types',
                'nations': 'nations',
                'titles': 'titles',
                'bloodTypes': 'blood-types',
                'partners': 'partners',
                'positionRanks': 'position-ranks'
            };
            
            const route = typeToRoute[type] || type;
            const response = await api.delete(`/config/${route}/${id}`);
            setConfig(response.data.data);
            toast.success('Item deleted successfully!');
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('Failed to delete item');
        }
    };

    const renderOrganization = () => (
        <Form onSubmit={handleOrganizationUpdate}>
            <Row>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Organization Name</Form.Label>
                        <Form.Control
                            type="text"
                            value={config?.organization?.name || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                organization: { ...config?.organization, name: e.target.value }
                            })}
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Email</Form.Label>
                        <Form.Control
                            type="email"
                            value={config?.organization?.email || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                organization: { ...config?.organization, email: e.target.value }
                            })}
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Phone</Form.Label>
                        <Form.Control
                            type="text"
                            value={config?.organization?.phone || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                organization: { ...config?.organization, phone: e.target.value }
                            })}
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
                    <Form.Group className="mb-3">
                        <Form.Label>Website</Form.Label>
                        <Form.Control
                            type="text"
                            value={config?.organization?.website || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                organization: { ...config?.organization, website: e.target.value }
                            })}
                        />
                    </Form.Group>
                </Col>
                <Col md={12}>
                    <Form.Group className="mb-3">
                        <Form.Label>Address</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={2}
                            value={config?.organization?.address || ''}
                            onChange={(e) => setConfig({
                                ...config,
                                organization: { ...config?.organization, address: e.target.value }
                            })}
                        />
                    </Form.Group>
                </Col>
                <Col md={12}>
                    <Button type="submit" variant="primary-gradient">
                        <FaSave className="me-2" /> Update Organization
                    </Button>
                </Col>
            </Row>
        </Form>
    );

    const renderList = (items, type, fields, label) => (
        <div>
            <div className="d-flex justify-content-between mb-3">
                <h6>{label}</h6>
                <Button variant="primary" size="sm" onClick={() => { setNewItem({}); setShowAddModal(true); }}>
                    <FaPlus className="me-1" /> Add {label}
                </Button>
            </div>
            <Table responsive hover>
                <thead>
                    <tr>
                        {fields.map((field) => (
                            <th key={field}>{field}</th>
                        ))}
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {items?.map((item) => (
                        <tr key={item._id}>
                            {fields.map((field) => (
                                <td key={field}>{item[field] || 'N/A'}</td>
                            ))}
                            <td>
                                <Badge bg={item.status === 'active' ? 'success' : 'danger'}>
                                    {item.status || 'active'}
                                </Badge>
                            </td>
                            <td>
                                <Button variant="outline-danger" size="sm" onClick={() => handleDeleteItem(type, item._id)}>
                                    <FaTrash />
                                </Button>
                            </td>
                        </tr>
                    ))}
                    {(!items || items.length === 0) && (
                        <tr><td colSpan={fields.length + 2} className="text-center text-muted">No items found</td></tr>
                    )}
                </tbody>
            </Table>
        </div>
    );

    if (loading) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading configurations...</p>
            </Container>
        );
    }

    return (
        <Container className="py-4">
            <BackButton to="/admin/dashboard" />
            <h2 className="fw-bold mb-4">⚙️ {t('config.title')}</h2>
            
            {error && <Alert variant="danger">{error}</Alert>}

            <Card className="shadow-sm">
                <Card.Body>
                    <Tabs
                        activeKey={activeTab}
                        onSelect={(k) => setActiveTab(k)}
                        className="mb-4"
                    >
                        <Tab eventKey="organization" title="Organization">
                            {renderOrganization()}
                        </Tab>
                        <Tab eventKey="departments" title="Departments">
                            {renderList(
                                config?.departments,
                                'departments',
                                ['name', 'code', 'description'],
                                'Departments'
                            )}
                        </Tab>
                        <Tab eventKey="positions" title="Positions">
                            {renderList(
                                config?.positions,
                                'positions',
                                ['title', 'code', 'rank'],
                                'Positions'
                            )}
                        </Tab>
                        <Tab eventKey="skills" title="Skills">
                            {renderList(
                                config?.skills,
                                'skills',
                                ['name', 'category'],
                                'Skills'
                            )}
                        </Tab>
                        <Tab eventKey="jobTitles" title="Job Titles">
                            {renderList(
                                config?.jobTitles,
                                'jobTitles',
                                ['name', 'code', 'description'],
                                'Job Titles'
                            )}
                        </Tab>
                        <Tab eventKey="languages" title="Languages">
                            {renderList(
                                config?.languages,
                                'languages',
                                ['name', 'code'],
                                'Languages'
                            )}
                        </Tab>
                        <Tab eventKey="employmentStatus" title="Employment Status">
                            {renderList(
                                config?.employmentStatus,
                                'employmentStatus',
                                ['name', 'type', 'description'],
                                'Employment Status'
                            )}
                        </Tab>
                        <Tab eventKey="educationLevels" title="Education Levels">
                            {renderList(
                                config?.educationLevels,
                                'educationLevels',
                                ['name', 'level', 'description'],
                                'Education Levels'
                            )}
                        </Tab>
                        <Tab eventKey="positionRanks" title="Position Ranks">
                            {renderList(
                                config?.positionRanks,
                                'positionRanks',
                                ['name', 'level', 'minSalary'],
                                'Position Ranks'
                            )}
                        </Tab>
                    </Tabs>
                </Card.Body>
            </Card>

            {/* Add Item Modal */}
            <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Add New Item</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {activeTab === 'departments' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'positions' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Title *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.title || ''}
                                    onChange={(e) => setNewItem({...newItem, title: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Rank</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.rank || ''}
                                    onChange={(e) => setNewItem({...newItem, rank: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'skills' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Category</Form.Label>
                                <Form.Select
                                    value={newItem.category || 'technical'}
                                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                                >
                                    <option value="technical">Technical</option>
                                    <option value="soft">Soft Skills</option>
                                    <option value="language">Language</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'leaveTypes' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Days Per Year</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.daysPerYear || ''}
                                    onChange={(e) => setNewItem({...newItem, daysPerYear: parseInt(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Check
                                    type="checkbox"
                                    label="Paid"
                                    checked={newItem.paid !== false}
                                    onChange={(e) => setNewItem({...newItem, paid: e.target.checked})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'jobTitles' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'languages' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'licenses' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Type</Form.Label>
                                <Form.Select
                                    value={newItem.type || 'professional'}
                                    onChange={(e) => setNewItem({...newItem, type: e.target.value})}
                                >
                                    <option value="professional">Professional</option>
                                    <option value="driver">Driver</option>
                                    <option value="security">Security</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Issuing Authority</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.issuingAuthority || ''}
                                    onChange={(e) => setNewItem({...newItem, issuingAuthority: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Validity Period (months)</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.validityPeriod || ''}
                                    onChange={(e) => setNewItem({...newItem, validityPeriod: parseInt(e.target.value)})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'religions' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'employmentStatus' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Type</Form.Label>
                                <Form.Select
                                    value={newItem.type || 'active'}
                                    onChange={(e) => setNewItem({...newItem, type: e.target.value})}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="terminated">Terminated</option>
                                    <option value="on_leave">On Leave</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'educationLevels' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Level</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.level || ''}
                                    onChange={(e) => setNewItem({...newItem, level: parseInt(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'maritalStatus' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'trainingTypes' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Category</Form.Label>
                                <Form.Select
                                    value={newItem.category || 'technical'}
                                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                                >
                                    <option value="technical">Technical</option>
                                    <option value="soft_skills">Soft Skills</option>
                                    <option value="leadership">Leadership</option>
                                    <option value="compliance">Compliance</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Duration (hours)</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.duration || ''}
                                    onChange={(e) => setNewItem({...newItem, duration: parseInt(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'terminationReasons' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Category</Form.Label>
                                <Form.Select
                                    value={newItem.category || 'voluntary'}
                                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                                >
                                    <option value="voluntary">Voluntary</option>
                                    <option value="involuntary">Involuntary</option>
                                    <option value="mutual">Mutual</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'deductionTypes' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Type</Form.Label>
                                <Form.Select
                                    value={newItem.type || 'fixed'}
                                    onChange={(e) => setNewItem({...newItem, type: e.target.value})}
                                >
                                    <option value="fixed">Fixed</option>
                                    <option value="percentage">Percentage</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Amount</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.amount || ''}
                                    onChange={(e) => setNewItem({...newItem, amount: parseFloat(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'nations' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Code</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.code || ''}
                                    onChange={(e) => setNewItem({...newItem, code: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Nationality</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.nationality || ''}
                                    onChange={(e) => setNewItem({...newItem, nationality: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'titles' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Abbreviation</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.abbreviation || ''}
                                    onChange={(e) => setNewItem({...newItem, abbreviation: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Gender</Form.Label>
                                <Form.Select
                                    value={newItem.gender || 'neutral'}
                                    onChange={(e) => setNewItem({...newItem, gender: e.target.value})}
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="neutral">Neutral</option>
                                </Form.Select>
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'bloodTypes' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Rhesus Factor</Form.Label>
                                <Form.Select
                                    value={newItem.rhesusFactor || 'positive'}
                                    onChange={(e) => setNewItem({...newItem, rhesusFactor: e.target.value})}
                                >
                                    <option value="positive">Positive (+)</option>
                                    <option value="negative">Negative (-)</option>
                                </Form.Select>
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'partners' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Type</Form.Label>
                                <Form.Select
                                    value={newItem.type || 'client'}
                                    onChange={(e) => setNewItem({...newItem, type: e.target.value})}
                                >
                                    <option value="client">Client</option>
                                    <option value="vendor">Vendor</option>
                                    <option value="government">Government</option>
                                    <option value="ngo">NGO</option>
                                    <option value="other">Other</option>
                                </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Contact Person</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.contactPerson || ''}
                                    onChange={(e) => setNewItem({...newItem, contactPerson: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Phone</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.phone || ''}
                                    onChange={(e) => setNewItem({...newItem, phone: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Email</Form.Label>
                                <Form.Control
                                    type="email"
                                    value={newItem.email || ''}
                                    onChange={(e) => setNewItem({...newItem, email: e.target.value})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Address</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.address || ''}
                                    onChange={(e) => setNewItem({...newItem, address: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                    {activeTab === 'positionRanks' && (
                        <>
                            <Form.Group className="mb-3">
                                <Form.Label>Name *</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={newItem.name || ''}
                                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Level</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.level || ''}
                                    onChange={(e) => setNewItem({...newItem, level: parseInt(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Min Salary</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.minSalary || ''}
                                    onChange={(e) => setNewItem({...newItem, minSalary: parseFloat(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Max Salary</Form.Label>
                                <Form.Control
                                    type="number"
                                    value={newItem.maxSalary || ''}
                                    onChange={(e) => setNewItem({...newItem, maxSalary: parseFloat(e.target.value)})}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label>Description</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={2}
                                    value={newItem.description || ''}
                                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                                />
                            </Form.Group>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowAddModal(false)}>
                        <FaTimes className="me-2" /> Cancel
                    </Button>
                    <Button variant="primary" onClick={() => handleAddItem(activeTab)}>
                        <FaSave className="me-2" /> Save
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
};

export default ConfigManager;