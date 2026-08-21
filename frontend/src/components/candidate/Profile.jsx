import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Spinner, Alert, Badge, Tab, Tabs, Nav, Table, Image } from 'react-bootstrap';
import { FaUser, FaUpload, FaTrash, FaStar, FaCheck, FaPlus, FaTimes, FaGraduationCap, FaBriefcase, FaCertificate, FaLanguage, FaEdit, FaSave, FaCamera, FaBuilding } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import api, { getImageUrl } from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';
import './Profile.css';

const Profile = () => {
    const { user, updateProfile, reloadUser } = useAuth();
    const { t } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [activeTab, setActiveTab] = useState('personal');
    const [resumes, setResumes] = useState([]);
    const [profilePhoto, setProfilePhoto] = useState(user?.profile?.profilePhoto || null);
    const [previewPhoto, setPreviewPhoto] = useState(null);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        if (user?.profile?.profilePhoto) {
            setProfilePhoto(user.profile.profilePhoto);
            setImageError(false);
        } else {
            setProfilePhoto(null);
        }
    }, [user]);

    const [formData, setFormData] = useState({
        name: user?.name || '',
        profile: {
            phone: user?.profile?.phone || '',
            location: user?.profile?.location || '',
            bio: user?.profile?.bio || '',
            title: user?.profile?.title || '',
            availabilityStatus: user?.profile?.availabilityStatus || 'Available now',
            expectedSalary: {
                amount: user?.profile?.expectedSalary?.amount || '',
                rateType: user?.profile?.expectedSalary?.rateType || 'Hourly'
            },
            skills: user?.profile?.skills || [],
            education: user?.profile?.education || [],
            workExperience: user?.profile?.workExperience || [],
            certifications: user?.profile?.certifications || [],
            languages: user?.profile?.languages || [],
            profilePhoto: user?.profile?.profilePhoto || null
        }
    });

    useEffect(() => {
        if (user) {
            setFormData(prev => ({
                ...prev,
                name: user.name || prev.name,
                profile: {
                    ...prev.profile,
                    ...user.profile,
                    profilePhoto: user.profile?.profilePhoto || null
                }
            }));
        }
    }, [user]);

    // New item states
    const [newSkill, setNewSkill] = useState('');
    const [newCertification, setNewCertification] = useState('');
    const [newLanguage, setNewLanguage] = useState('');
    const [newEducation, setNewEducation] = useState({
        institution: '',
        degree: '',
        field: '',
        graduationYear: ''
    });
    const [newExperience, setNewExperience] = useState({
        company: '',
        position: '',
        startDate: '',
        endDate: '',
        description: '',
        currentlyWorking: false
    });

    useEffect(() => {
        fetchResumes();
    }, []);

    const fetchResumes = async () => {
        try {
            const response = await api.get('/resumes');
            setResumes(response.data.resumes || []);
        } catch (error) {
            console.error('Error fetching resumes:', error);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('profile.')) {
            const path = name.split('.');
            if (path.length === 2) {
                setFormData({
                    ...formData,
                    profile: { ...formData.profile, [path[1]]: value }
                });
            } else if (path.length === 3) {
                setFormData({
                    ...formData,
                    profile: { 
                        ...formData.profile, 
                        [path[1]]: {
                            ...formData.profile[path[1]],
                            [path[2]]: value
                        }
                    }
                });
            }
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const result = await updateProfile({
            name: formData.name,
            profile: {
                ...formData.profile,
                profilePhoto: profilePhoto || formData.profile.profilePhoto
            }
        });
        setLoading(false);
        if (result.success) {
            toast.success('Profile updated successfully!');
            if (reloadUser) await reloadUser();
        }
    };

    // ============ PHOTO UPLOAD ============
    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Only JPEG, PNG, GIF, and WebP images are allowed');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB');
            return;
        }

        const uploadFormData = new FormData();
        uploadFormData.append('photo', file);

        const localPreview = URL.createObjectURL(file);
        setPreviewPhoto(localPreview);
        setImageError(false);
        setUploadingPhoto(true);

        try {
            const response = await api.post('/upload/profile-photo', uploadFormData);
            const uploadedPhoto = response.data.data.profilePhoto;
            setProfilePhoto(uploadedPhoto);
            setFormData(prev => ({
                ...prev,
                profile: {
                    ...prev.profile,
                    profilePhoto: uploadedPhoto
                }
            }));
            setPreviewPhoto(null);
            
            if (reloadUser) {
                await reloadUser();
            }
        } catch (error) {
            console.error('=== Upload error ===');
            console.error('Error:', error);
            console.error('Response:', error.response?.data);
            setPreviewPhoto(null);
            toast.error(error.response?.data?.message || 'Failed to upload photo');
        } finally {
            setUploadingPhoto(false);
            e.target.value = '';
        }
    };

    const handleRemovePhoto = async () => {
        if (!window.confirm('Are you sure you want to remove your profile photo?')) return;
        try {
            await api.delete('/upload/profile-photo');
            setProfilePhoto(null);
            setPreviewPhoto(null);
            setImageError(false);
            setFormData(prev => ({
                ...prev,
                profile: {
                    ...prev.profile,
                    profilePhoto: null
                }
            }));
            toast.success('Profile photo removed');
            if (reloadUser) {
                await reloadUser();
            }
        } catch (error) {
            toast.error('Failed to remove photo');
        }
    };

    // ============ SKILLS ============
    const handleAddSkill = () => {
        if (newSkill.trim() && !formData.profile.skills.includes(newSkill.trim())) {
            setFormData({
                ...formData,
                profile: {
                    ...formData.profile,
                    skills: [...formData.profile.skills, newSkill.trim()]
                }
            });
            setNewSkill('');
            toast.success('Skill added!');
        }
    };

    const handleRemoveSkill = (skill) => {
        setFormData({
            ...formData,
            profile: {
                ...formData.profile,
                skills: formData.profile.skills.filter(s => s !== skill)
            }
        });
    };

    // ============ CERTIFICATIONS ============
    const handleAddCertification = () => {
        if (newCertification.trim() && !formData.profile.certifications.includes(newCertification.trim())) {
            setFormData({
                ...formData,
                profile: {
                    ...formData.profile,
                    certifications: [...formData.profile.certifications, newCertification.trim()]
                }
            });
            setNewCertification('');
            toast.success('Certification added!');
        }
    };

    const handleRemoveCertification = (cert) => {
        setFormData({
            ...formData,
            profile: {
                ...formData.profile,
                certifications: formData.profile.certifications.filter(c => c !== cert)
            }
        });
    };

    // ============ LANGUAGES ============
    const handleAddLanguage = () => {
        if (newLanguage.trim() && !formData.profile.languages.includes(newLanguage.trim())) {
            setFormData({
                ...formData,
                profile: {
                    ...formData.profile,
                    languages: [...formData.profile.languages, newLanguage.trim()]
                }
            });
            setNewLanguage('');
            toast.success('Language added!');
        }
    };

    const handleRemoveLanguage = (lang) => {
        setFormData({
            ...formData,
            profile: {
                ...formData.profile,
                languages: formData.profile.languages.filter(l => l !== lang)
            }
        });
    };

    // ============ EDUCATION ============
    const handleAddEducation = () => {
        if (newEducation.institution && newEducation.degree) {
            setFormData({
                ...formData,
                profile: {
                    ...formData.profile,
                    education: [...formData.profile.education, { ...newEducation }]
                }
            });
            setNewEducation({ institution: '', degree: '', field: '', graduationYear: '' });
            toast.success('Education added!');
        }
    };

    const handleRemoveEducation = (index) => {
        setFormData({
            ...formData,
            profile: {
                ...formData.profile,
                education: formData.profile.education.filter((_, i) => i !== index)
            }
        });
    };

    // ============ WORK EXPERIENCE ============
    const handleAddExperience = () => {
        if (newExperience.company && newExperience.position) {
            const expToAdd = { ...newExperience };
            if (expToAdd.currentlyWorking) {
                expToAdd.endDate = 'Present';
            }
            setFormData({
                ...formData,
                profile: {
                    ...formData.profile,
                    workExperience: [...formData.profile.workExperience, expToAdd]
                }
            });
            setNewExperience({ 
                company: '', 
                position: '', 
                startDate: '', 
                endDate: '', 
                description: '',
                currentlyWorking: false 
            });
            toast.success('Work experience added!');
        }
    };

    const handleRemoveExperience = (index) => {
        setFormData({
            ...formData,
            profile: {
                ...formData.profile,
                workExperience: formData.profile.workExperience.filter((_, i) => i !== index)
            }
        });
    };

    // ============ RESUME UPLOAD ============
    const handleResumeUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
            toast.error('Only PDF and DOCX files are allowed');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast.error('Resume file must be less than 10MB');
            return;
        }

        const resumeFormData = new FormData();
        resumeFormData.append('resume', file);

        setUploading(true);
        try {
            const response = await api.post('/resumes', resumeFormData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setResumes([response.data.resume, ...resumes]);
            toast.success('Resume uploaded successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to upload resume');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleSetDefaultResume = async (resumeId) => {
        try {
            await api.put(`/resumes/${resumeId}/default`);
            setResumes(resumes.map(r => ({
                ...r,
                isDefault: r._id === resumeId
            })));
            toast.success('Default resume updated');
        } catch (error) {
            toast.error('Failed to set default resume');
        }
    };

    const handleDeleteResume = async (resumeId) => {
        if (!window.confirm('Are you sure you want to delete this resume?')) return;
        try {
            await api.delete(`/resumes/${resumeId}`);
            setResumes(resumes.filter(r => r._id !== resumeId));
            toast.success('Resume deleted');
        } catch (error) {
            toast.error('Failed to delete resume');
        }
    };

    return (
        <section className="profile-section py-4">
            <Container>
                <BackButton to="/candidate/dashboard" />
                <h2 className="fw-bold mb-4">
                    <FaUser className="me-2 text-primary" /> {t('profile.title') || 'My Profile'}
                </h2>
                
                <Row>
                    <Col lg={3}>
                        {/* Profile Photo Card */}
                        <Card className="shadow-sm border-0 rounded-4 mb-4 text-center">
                            <Card.Body className="p-4">
                                <div className="avatar-profile-wrapper mb-3">
                                    <div className="avatar-circle">
                                        {(previewPhoto || (profilePhoto && !imageError)) ? (
                                            <img 
                                                src={previewPhoto || getImageUrl(profilePhoto)} 
                                                alt={user?.name || 'Profile Avatar'} 
                                                onError={() => setImageError(true)}
                                            />
                                        ) : (
                                            <span className="avatar-fallback-text">
                                                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                                            </span>
                                        )}
                                    </div>
                                    <label 
                                        htmlFor="photo-upload" 
                                        className="avatar-upload-badge"
                                        title="Change profile photo"
                                    >
                                        <FaCamera size={15} />
                                    </label>
                                    <input
                                        id="photo-upload" 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handlePhotoUpload} 
                                        style={{ display: 'none' }} 
                                        disabled={uploadingPhoto}
                                    />
                                </div>
                                <h5 className="mt-3 fw-bold">{user?.name}</h5>
                                <p className="text-muted small mb-0">{formData.profile.title || user?.role}</p>
                                {profilePhoto && (
                                    <Button variant="outline-danger" size="sm" onClick={handleRemovePhoto} className="mt-2 w-100 rounded-pill">
                                        <FaTrash className="me-1" /> Remove Photo
                                    </Button>
                                )}
                                {uploadingPhoto && (
                                    <div className="mt-2">
                                        <Spinner animation="border" size="sm" />
                                        <span className="ms-2">Uploading...</span>
                                    </div>
                                )}
                            </Card.Body>
                        </Card>

                        {/* Profile Completion */}
                        <Card className="shadow-sm border-0 rounded-4 mb-4">
                            <Card.Body>
                                <div className="mb-3">
                                    <div className="d-flex justify-content-between mb-2">
                                        <span className="fw-semibold text-muted">Profile Completion</span>
                                        <span className="fw-bold text-primary">
                                            {Math.min(100,
                                                (formData.profile.skills.length * 5) + (formData.profile.education.length * 5) +
                                                (formData.profile.workExperience.length * 5) + (formData.profile.certifications.length * 5) +
                                                (formData.profile.languages.length * 5) + (formData.profile.bio ? 10 : 0) +
                                                (formData.profile.phone ? 5 : 0) + (formData.profile.location ? 5 : 0) +
                                                (resumes.length > 0 ? 10 : 0) + (profilePhoto ? 10 : 0)
                                            )}%
                                        </span>
                                    </div>
                                    <div className="progress" style={{ height: '8px' }}>
                                        <div 
                                            className="progress-bar bg-primary-gradient" 
                                            style={{ 
                                                width: `${Math.min(100,
                                                    (formData.profile.skills.length * 5) + (formData.profile.education.length * 5) +
                                                    (formData.profile.workExperience.length * 5) + (formData.profile.certifications.length * 5) +
                                                    (formData.profile.languages.length * 5) + (formData.profile.bio ? 10 : 0) +
                                                    (formData.profile.phone ? 5 : 0) + (formData.profile.location ? 5 : 0) +
                                                    (resumes.length > 0 ? 10 : 0) + (profilePhoto ? 10 : 0)
                                                )}%` 
                                            }}
                                        />
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>

                        {/* Sidebar Navigation */}
                        <Card className="shadow-sm border-0 rounded-4 sticky-top" style={{ top: '90px' }}>
                            <Card.Body className="p-2">
                                <Nav variant="pills" className="flex-column profile-sidebar-nav">
                                    <Nav.Item>
                                        <Nav.Link active={activeTab === 'personal'} onClick={() => setActiveTab('personal')} className="d-flex align-items-center py-3 px-3 rounded-3 mb-1">
                                            <FaUser className="me-3 fs-5" /> <span className="fw-semibold">Personal Info</span>
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link active={activeTab === 'experience'} onClick={() => setActiveTab('experience')} className="d-flex align-items-center py-3 px-3 rounded-3 mb-1">
                                            <FaBriefcase className="me-3 fs-5" /> <span className="fw-semibold">Experience & Education</span>
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link active={activeTab === 'skills'} onClick={() => setActiveTab('skills')} className="d-flex align-items-center py-3 px-3 rounded-3 mb-1">
                                            <FaStar className="me-3 fs-5" /> <span className="fw-semibold">Skills & Languages</span>
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link active={activeTab === 'resumes'} onClick={() => setActiveTab('resumes')} className="d-flex align-items-center py-3 px-3 rounded-3">
                                            <FaUpload className="me-3 fs-5" /> <span className="fw-semibold">Resumes & CVs</span>
                                        </Nav.Link>
                                    </Nav.Item>
                                </Nav>
                            </Card.Body>
                        </Card>
                    </Col>

                    <Col lg={9}>
                        <Card className="shadow-sm border-0 rounded-4">
                            <Card.Body className="p-4 p-md-5">
                                {activeTab === 'personal' && (
                                    <div className="fade-in">
                                        <h4 className="fw-bold mb-4 border-bottom pb-3"><FaUser className="me-2 text-primary" /> Personal Information</h4>
                                        <Form onSubmit={handleSubmit}>
                                            <Row>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Full Name <span className="text-danger">*</span></Form.Label>
                                                        <Form.Control type="text" name="name" value={formData.name} onChange={handleChange} className="form-control-custom bg-light border-0 py-2" required />
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Email Address</Form.Label>
                                                        <Form.Control type="email" value={user?.email} disabled className="form-control-custom bg-light border-0 py-2 text-muted" />
                                                    </Form.Group>
                                                </Col>
                                            </Row>

                                            <Row>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Professional Title</Form.Label>
                                                        <Form.Control type="text" name="profile.title" value={formData.profile.title} onChange={handleChange} placeholder="e.g., Senior Frontend Developer" className="form-control-custom bg-light border-0 py-2" />
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Availability Status</Form.Label>
                                                        <Form.Select name="profile.availabilityStatus" value={formData.profile.availabilityStatus} onChange={handleChange} className="form-control-custom bg-light border-0 py-2 text-dark">
                                                            <option value="Available now">Available now</option>
                                                            <option value="Available part-time">Available part-time</option>
                                                            <option value="Busy">Busy (Not open to work)</option>
                                                        </Form.Select>
                                                    </Form.Group>
                                                </Col>
                                            </Row>

                                            <Row>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Expected Salary</Form.Label>
                                                        <div className="d-flex gap-2">
                                                            <Form.Control type="number" name="profile.expectedSalary.amount" value={formData.profile.expectedSalary.amount} onChange={handleChange} placeholder="Amount" className="form-control-custom bg-light border-0 py-2" />
                                                            <Form.Select name="profile.expectedSalary.rateType" value={formData.profile.expectedSalary.rateType} onChange={handleChange} className="form-control-custom bg-light border-0 py-2 w-auto">
                                                                <option value="Hourly">/ hr</option>
                                                                <option value="Monthly">/ mo</option>
                                                                <option value="Fixed">Fixed</option>
                                                            </Form.Select>
                                                        </div>
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Phone Number</Form.Label>
                                                        <Form.Control type="text" name="profile.phone" value={formData.profile.phone} onChange={handleChange} placeholder="+251..." className="form-control-custom bg-light border-0 py-2" />
                                                    </Form.Group>
                                                </Col>
                                            </Row>

                                            <Row>
                                                <Col md={6}>
                                                    <Form.Group className="mb-4">
                                                        <Form.Label className="fw-semibold text-muted small text-uppercase">Location</Form.Label>
                                                        <Form.Control type="text" name="profile.location" value={formData.profile.location} onChange={handleChange} placeholder="e.g. Addis Ababa, Ethiopia" className="form-control-custom bg-light border-0 py-2" />
                                                    </Form.Group>
                                                </Col>
                                            </Row>

                                            <Form.Group className="mb-4">
                                                <Form.Label className="fw-semibold text-muted small text-uppercase">Professional Bio</Form.Label>
                                                <Form.Control as="textarea" rows={4} name="profile.bio" value={formData.profile.bio} onChange={handleChange} placeholder="Describe your background and expertise..." className="form-control-custom bg-light border-0" />
                                            </Form.Group>

                                            <div className="text-end mt-4">
                                                <Button type="submit" disabled={loading} className="btn-primary-gradient px-4 py-2 rounded-3 fw-semibold">
                                                    {loading ? <Spinner animation="border" size="sm" /> : <><FaSave className="me-2" /> Save Changes</>}
                                                </Button>
                                            </div>
                                        </Form>
                                    </div>
                                )}

                                {activeTab === 'experience' && (
                                    <div className="fade-in">
                                        <h4 className="fw-bold mb-4 border-bottom pb-3"><FaBriefcase className="me-2 text-primary" /> Experience & Education</h4>
                                        
                                        {/* Work Experience */}
                                        <div className="mb-5">
                                            <h5 className="fw-bold text-dark mb-3">Work Experience</h5>
                                            <Card className="bg-light border-0 p-3 mb-4 rounded-3">
                                                <Row className="g-3">
                                                    <Col md={6}>
                                                        <Form.Control type="text" placeholder="Company Name *" value={newExperience.company} onChange={e => setNewExperience({ ...newExperience, company: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="text" placeholder="Job Title / Position *" value={newExperience.position} onChange={e => setNewExperience({ ...newExperience, position: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="date" placeholder="Start Date" value={newExperience.startDate} onChange={e => setNewExperience({ ...newExperience, startDate: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="date" placeholder="End Date" disabled={newExperience.currentlyWorking} value={newExperience.endDate} onChange={e => setNewExperience({ ...newExperience, endDate: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={12}>
                                                        <Form.Check type="checkbox" label="I currently work here" checked={newExperience.currentlyWorking} onChange={e => setNewExperience({ ...newExperience, currentlyWorking: e.target.checked })} />
                                                    </Col>
                                                    <Col md={12}>
                                                        <Form.Control as="textarea" rows={2} placeholder="Description of responsibilities..." value={newExperience.description} onChange={e => setNewExperience({ ...newExperience, description: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={12} className="text-end">
                                                        <Button variant="primary" size="sm" onClick={handleAddExperience} className="rounded-2 px-3 fw-semibold">
                                                            <FaPlus className="me-1" /> Add Experience
                                                        </Button>
                                                    </Col>
                                                </Row>
                                            </Card>

                                            {formData.profile.workExperience.map((exp, idx) => (
                                                <Card key={idx} className="border-0 shadow-sm mb-3 rounded-3 p-3 position-relative">
                                                    <div className="d-flex justify-content-between align-items-start">
                                                        <div>
                                                            <h6 className="fw-bold mb-1 text-dark">{exp.position}</h6>
                                                            <p className="text-primary fw-semibold small mb-1"><FaBuilding className="me-1" /> {exp.company}</p>
                                                            <small className="text-muted d-block mb-2">{exp.startDate ? new Date(exp.startDate).toLocaleDateString() : ''} - {exp.currentlyWorking ? 'Present' : exp.endDate ? new Date(exp.endDate).toLocaleDateString() : ''}</small>
                                                            <p className="text-secondary small mb-0">{exp.description}</p>
                                                        </div>
                                                        <Button variant="link" className="text-danger p-0" onClick={() => handleRemoveExperience(idx)}><FaTrash /></Button>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>

                                        {/* Education */}
                                        <div>
                                            <h5 className="fw-bold text-dark mb-3"><FaGraduationCap className="me-2 text-primary" /> Education</h5>
                                            <Card className="bg-light border-0 p-3 mb-4 rounded-3">
                                                <Row className="g-3">
                                                    <Col md={6}>
                                                        <Form.Control type="text" placeholder="Institution / University *" value={newEducation.institution} onChange={e => setNewEducation({ ...newEducation, institution: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="text" placeholder="Degree / Certificate *" value={newEducation.degree} onChange={e => setNewEducation({ ...newEducation, degree: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="text" placeholder="Field of Study" value={newEducation.field} onChange={e => setNewEducation({ ...newEducation, field: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={6}>
                                                        <Form.Control type="number" placeholder="Graduation Year" value={newEducation.graduationYear} onChange={e => setNewEducation({ ...newEducation, graduationYear: e.target.value })} className="form-control-custom bg-white border-0" />
                                                    </Col>
                                                    <Col md={12} className="text-end">
                                                        <Button variant="primary" size="sm" onClick={handleAddEducation} className="rounded-2 px-3 fw-semibold">
                                                            <FaPlus className="me-1" /> Add Education
                                                        </Button>
                                                    </Col>
                                                </Row>
                                            </Card>

                                            {formData.profile.education.map((edu, idx) => (
                                                <Card key={idx} className="border-0 shadow-sm mb-3 rounded-3 p-3 position-relative">
                                                    <div className="d-flex justify-content-between align-items-start">
                                                        <div>
                                                            <h6 className="fw-bold mb-1 text-dark">{edu.degree} {edu.field ? `in ${edu.field}` : ''}</h6>
                                                            <p className="text-secondary fw-semibold small mb-1">{edu.institution}</p>
                                                            {edu.graduationYear && <small className="text-muted">Class of {edu.graduationYear}</small>}
                                                        </div>
                                                        <Button variant="link" className="text-danger p-0" onClick={() => handleRemoveEducation(idx)}><FaTrash /></Button>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>

                                        <div className="text-end mt-4">
                                            <Button onClick={handleSubmit} disabled={loading} className="btn-primary-gradient px-4 py-2 rounded-3 fw-semibold">
                                                {loading ? <Spinner animation="border" size="sm" /> : <><FaSave className="me-2" /> Save Experience & Education</>}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'skills' && (
                                    <div className="fade-in">
                                        <h4 className="fw-bold mb-4 border-bottom pb-3"><FaStar className="me-2 text-primary" /> Skills & Languages</h4>
                                        
                                        {/* Skills */}
                                        <div className="mb-4">
                                            <h5 className="fw-bold text-dark mb-3">Technical & Soft Skills</h5>
                                            <div className="d-flex gap-2 mb-3">
                                                <Form.Control type="text" placeholder="Add a skill (e.g. React, Node.js, Project Management)" value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())} className="form-control-custom bg-light border-0" />
                                                <Button variant="primary" onClick={handleAddSkill} className="px-4 fw-semibold rounded-3"><FaPlus /></Button>
                                            </div>
                                            <div className="d-flex flex-wrap gap-2">
                                                {formData.profile.skills.map((skill, idx) => (
                                                    <Badge key={idx} bg="primary" className="p-2 px-3 fs-6 rounded-pill d-flex align-items-center gap-2 font-sans fw-normal">
                                                        {skill}
                                                        <FaTimes style={{ cursor: 'pointer' }} onClick={() => handleRemoveSkill(skill)} />
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Certifications */}
                                        <div className="mb-4 mt-5">
                                            <h5 className="fw-bold text-dark mb-3"><FaCertificate className="me-2 text-primary" /> Certifications</h5>
                                            <div className="d-flex gap-2 mb-3">
                                                <Form.Control type="text" placeholder="Add certification (e.g. AWS Certified Developer)" value={newCertification} onChange={e => setNewCertification(e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddCertification())} className="form-control-custom bg-light border-0" />
                                                <Button variant="primary" onClick={handleAddCertification} className="px-4 fw-semibold rounded-3"><FaPlus /></Button>
                                            </div>
                                            <div className="d-flex flex-wrap gap-2">
                                                {formData.profile.certifications.map((cert, idx) => (
                                                    <Badge key={idx} bg="info" className="p-2 px-3 fs-6 rounded-pill d-flex align-items-center gap-2 font-sans fw-normal text-dark">
                                                        {cert}
                                                        <FaTimes style={{ cursor: 'pointer' }} onClick={() => handleRemoveCertification(cert)} />
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Languages */}
                                        <div className="mb-4 mt-5">
                                            <h5 className="fw-bold text-dark mb-3"><FaLanguage className="me-2 text-primary" /> Languages Spoken</h5>
                                            <div className="d-flex gap-2 mb-3">
                                                <Form.Control type="text" placeholder="Add language (e.g. Amharic, English, Oromo)" value={newLanguage} onChange={e => setNewLanguage(e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddLanguage())} className="form-control-custom bg-light border-0" />
                                                <Button variant="primary" onClick={handleAddLanguage} className="px-4 fw-semibold rounded-3"><FaPlus /></Button>
                                            </div>
                                            <div className="d-flex flex-wrap gap-2">
                                                {formData.profile.languages.map((lang, idx) => (
                                                    <Badge key={idx} bg="secondary" className="p-2 px-3 fs-6 rounded-pill d-flex align-items-center gap-2 font-sans fw-normal">
                                                        {lang}
                                                        <FaTimes style={{ cursor: 'pointer' }} onClick={() => handleRemoveLanguage(lang)} />
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="text-end mt-4">
                                            <Button onClick={handleSubmit} disabled={loading} className="btn-primary-gradient px-4 py-2 rounded-3 fw-semibold">
                                                {loading ? <Spinner animation="border" size="sm" /> : <><FaSave className="me-2" /> Save Skills & Languages</>}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'resumes' && (
                                    <div className="fade-in">
                                        <h4 className="fw-bold mb-4 border-bottom pb-3"><FaUpload className="me-2 text-primary" /> Resumes & Curriculum Vitae</h4>
                                        
                                        <Card className="border-dashed bg-light p-4 text-center mb-4 rounded-4">
                                            <div className="mb-3 text-primary" style={{ fontSize: '2.5rem' }}>📄</div>
                                            <h5 className="fw-bold">Upload Your Resume</h5>
                                            <p className="text-muted small mb-3">Upload PDF or DOCX format (Max 10MB). Having an updated resume boosts AI job matching accuracy!</p>
                                            <div>
                                                <label htmlFor="resume-file-input" className="btn btn-primary-gradient px-4 py-2 rounded-3 fw-semibold" style={{ cursor: 'pointer' }}>
                                                    {uploading ? <Spinner animation="border" size="sm" /> : <><FaUpload className="me-2" /> Select File & Upload</>}
                                                </label>
                                                <input id="resume-file-input" type="file" accept=".pdf,.docx" onChange={handleResumeUpload} style={{ display: 'none' }} disabled={uploading} />
                                            </div>
                                        </Card>

                                        <h5 className="fw-bold mb-3 text-dark">Uploaded Resumes</h5>
                                        {resumes.length === 0 ? (
                                            <p className="text-muted small">No resumes uploaded yet.</p>
                                        ) : (
                                            <div className="table-responsive">
                                                <Table hover className="align-middle">
                                                    <thead>
                                                        <tr>
                                                            <th>File Name</th>
                                                            <th>Uploaded Date</th>
                                                            <th>Status</th>
                                                            <th className="text-end">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {resumes.map(r => (
                                                            <tr key={r._id}>
                                                                <td className="fw-semibold">📄 {r.originalName}</td>
                                                                <td className="text-muted small">{new Date(r.createdAt).toLocaleDateString()}</td>
                                                                <td>
                                                                    {r.isDefault ? (
                                                                        <Badge bg="success" className="px-2 py-1"><FaCheck className="me-1" /> Default</Badge>
                                                                    ) : (
                                                                        <Button variant="outline-secondary" size="sm" onClick={() => handleSetDefaultResume(r._id)}>Set Default</Button>
                                                                    )}
                                                                </td>
                                                                <td className="text-end">
                                                                    <a href={getImageUrl(r.filePath)} target="_blank" rel="noreferrer" className="btn btn-light btn-sm me-2">Download</a>
                                                                    <Button variant="outline-danger" size="sm" onClick={() => handleDeleteResume(r._id)}><FaTrash /></Button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </section>
    );
};

export default Profile;