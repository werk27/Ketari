import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Container, Card, Table, Badge, Spinner, Alert, Button, Modal, Form, Image, Row, Col, InputGroup } from 'react-bootstrap';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    FaArrowLeft, FaCheck, FaTimes, FaCalendar,
    FaUser, FaFileAlt, FaSearch, FaSlidersH, FaSortUp, FaSortDown, FaSort, FaUndo
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import api, { getImageUrl, describeApiError } from '../../services/api';
import { toast } from 'react-toastify';
import BackButton from '../common/BackButton';
import { StatusBadge } from '../workspace/ui';
import CandidateProfileModal from '../workspace/CandidateProfileModal';

/**
 * The HR Expert's processing pipeline, mirroring the backend's allowed
 * transitions. Statuses must match the Application schema enum exactly - the
 * screen previously used 'pending'/'reviewed'/'offered', which no longer exist,
 * so its buttons never appeared and the ones that did were rejected by the API.
 */
const STAGE_LABELS = {
    applied: 'Applied',
    under_review: 'Under Review',
    ai_analyzed: 'AI Analyzed',
    shortlisted: 'Shortlisted',
    interview_scheduled: 'Interview Scheduled',
    interviewed: 'Interviewed',
    selected: 'Selected',
    offered: 'Offered',
    hired: 'Hired',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
};

// Once the HR Manager owns the record, the HR Expert can no longer change it.
const CLOSED_STATUSES = ['selected', 'offered', 'hired', 'rejected', 'withdrawn'];

/** Status options for the report filter, in pipeline order. */
const STATUS_FILTERS = [
    'applied', 'under_review', 'ai_analyzed', 'shortlisted',
    'interview_scheduled', 'interviewed', 'selected', 'offered',
    'hired', 'rejected', 'withdrawn'
];

/** Columns the report can be ordered by, mapped to the API's sort keys. */
const SORTABLE = {
    name: 'Candidate',
    createdAt: 'Applied',
    matchScore: 'Match',
    experience: 'Experience',
    status: 'Status'
};

const EMPTY_FILTERS = {
    search: '',
    status: '',
    minScore: '',
    education: '',
    minExperience: '',
    skills: '',
    dateFrom: '',
    dateTo: '',
    shortlisted: false
};

/**
 * Merge a processing response into a row without losing populated data.
 *
 * The status and interview endpoints populate only `job`, so `applicant` and
 * `resume` come back as bare ids. Spreading the whole response over the row
 * replaced the populated candidate with a string and the name/avatar turned into
 * "Unknown" until the page was reloaded, so only the fields the response is
 * authoritative for are copied across.
 */
const mergeProcessed = (row, updated = {}, fallback = {}) => ({
    ...row,
    status: updated.status || fallback.status || row.status,
    statusHistory: updated.statusHistory || row.statusHistory,
    screenedBy: updated.screenedBy ?? row.screenedBy,
    screenedAt: updated.screenedAt ?? row.screenedAt,
    shortlistedBy: updated.shortlistedBy ?? row.shortlistedBy,
    shortlistedAt: updated.shortlistedAt ?? row.shortlistedAt,
    interviewDate: updated.interviewDate ?? fallback.interviewDate ?? row.interviewDate,
    interviewLocation: updated.interviewLocation ?? fallback.interviewLocation ?? row.interviewLocation
});

const Applications = () => {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const { user, can } = useAuth();
    // This screen is mounted under both /hr-expert and /hr-manager, so every
    // link and action must follow the caller's role rather than assume HR Expert.
    const basePath = user?.role === 'hr_manager' ? '/hr-manager' : '/hr-expert';
    const canProcess = can('application:process');
    const canDecide = can('application:decide');
    const [loading, setLoading] = useState(true);
    const [applications, setApplications] = useState([]);
    const [job, setJob] = useState(null);
    const [error, setError] = useState('');
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [selectedApp, setSelectedApp] = useState(null);
    const [profileApp, setProfileApp] = useState(null);
    const [resumeLoadingId, setResumeLoadingId] = useState(null);
    const [interviewData, setInterviewData] = useState({
        interviewDate: '',
        interviewLocation: '',
        note: ''
    });

    // ---- Report state: search, filters, sorting and paging ------------------
    // Every one of these is sent to the API, so the table always reflects the
    // real matching records rather than a slice filtered in the browser.
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [sort, setSort] = useState('matchScore');
    const [order, setOrder] = useState('desc');
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({ total: 0, totalPages: 1, statusCounts: {} });

    // Typing in the search box must not fire a request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(filters.search), 350);
        return () => clearTimeout(timer);
    }, [filters.search]);

    const activeFilterCount = useMemo(() => (
        Object.entries(filters).filter(([key, value]) => (
            key !== 'search' && (typeof value === 'boolean' ? value : value !== '')
        )).length
    ), [filters]);

    const queryParams = useMemo(() => {
        const params = { page, limit: 25, sort, order };
        if (debouncedSearch) params.search = debouncedSearch;
        if (filters.status) params.status = filters.status;
        if (filters.minScore !== '') params.minScore = filters.minScore;
        if (filters.education) params.education = filters.education;
        if (filters.minExperience !== '') params.minExperience = filters.minExperience;
        if (filters.skills) params.skills = filters.skills;
        if (filters.dateFrom) params.dateFrom = filters.dateFrom;
        if (filters.dateTo) params.dateTo = filters.dateTo;
        if (filters.shortlisted) params.shortlisted = 'true';
        return params;
    }, [page, sort, order, debouncedSearch, filters]);

    // Changing what is being asked for always returns to the first page,
    // otherwise a narrower filter can land the user on a page that no longer exists.
    useEffect(() => { setPage(1); }, [debouncedSearch, filters.status, filters.minScore,
        filters.education, filters.minExperience, filters.skills,
        filters.dateFrom, filters.dateTo, filters.shortlisted, sort, order]);

    const isFirstLoad = useRef(true);

    const fetchApplications = useCallback(async () => {
        setLoading(true);
        try {
            const requests = [api.get(`/applications/job/${jobId}`, { params: queryParams })];
            if (isFirstLoad.current) requests.push(api.get(`/jobs/${jobId}`));

            const [appRes, jobRes] = await Promise.all(requests);
            setApplications(appRes.data.applications || []);
            setMeta({
                total: appRes.data.total ?? 0,
                totalPages: appRes.data.totalPages ?? 1,
                statusCounts: appRes.data.statusCounts || {}
            });
            if (jobRes) setJob(jobRes.data.job);
            isFirstLoad.current = false;
            setError('');
        } catch (err) {
            console.error('Error fetching applications:', err);
            setError(describeApiError(err, 'Failed to load applications'));
        } finally {
            setLoading(false);
        }
    }, [jobId, queryParams]);

    useEffect(() => { fetchApplications(); }, [fetchApplications]);

    const toggleSort = (field) => {
        if (sort === field) {
            setOrder(order === 'asc' ? 'desc' : 'asc');
        } else {
            setSort(field);
            setOrder(field === 'name' ? 'asc' : 'desc');
        }
    };

    const sortIcon = (field) => {
        if (sort !== field) return <FaSort size={10} className="text-muted ms-1" />;
        return order === 'asc'
            ? <FaSortUp size={10} className="ms-1" />
            : <FaSortDown size={10} className="ms-1" />;
    };

    const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));
    const resetFilters = () => setFilters(EMPTY_FILTERS);

    const handleStatusUpdate = async (applicationId, status) => {
        try {
            const res = await api.put(`/applications/${applicationId}/status`, { status });
            setApplications(applications.map(app =>
                app._id === applicationId ? mergeProcessed(app, res.data.application, { status }) : app
            ));
            toast.success(`Application moved to ${STAGE_LABELS[status] || status}`);
            // Re-read so the pipeline tallies and any active status filter stay
            // truthful - the row may no longer belong in the current view.
            fetchApplications();
        } catch (error) {
            toast.error(describeApiError(error, 'Failed to update status'));
        }
    };

    const handleScheduleInterview = async (e) => {
        e.preventDefault();
        try {
            const res = await api.put(`/applications/${selectedApp._id}/schedule-interview`, interviewData);
            setApplications(applications.map(app =>
                app._id === selectedApp._id
                    // The backend sets `interview_scheduled`; the interview has not
                    // happened yet, so claiming `interviewed` here skipped a stage.
                    ? mergeProcessed(app, res.data.application, {
                        status: 'interview_scheduled',
                        interviewDate: interviewData.interviewDate,
                        interviewLocation: interviewData.interviewLocation
                    })
                    : app
            ));
            toast.success('Interview scheduled successfully');
            setShowInterviewModal(false);
            setSelectedApp(null);
            setInterviewData({ interviewDate: '', interviewLocation: '', note: '' });
            fetchApplications();
        } catch (error) {
            toast.error(describeApiError(error, 'Failed to schedule interview'));
        }
    };

    const handleViewProfile = (application) => {
        setProfileApp(application);
        setShowProfileModal(true);
    };

    const handleViewResume = async (application) => {
        if (!application.resume?._id) return;
        setResumeLoadingId(application._id);
        try {
            const res = await api.get(`/resumes/${application.resume._id}/file`, { responseType: 'blob' });
            const fileUrl = URL.createObjectURL(
                new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' })
            );
            window.open(fileUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            toast.error(describeApiError(err, 'Could not open this CV'));
        } finally {
            setResumeLoadingId(null);
        }
    };

    const getMatchScoreClass = (score) => {
        if (score >= 70) return 'match-high';
        if (score >= 40) return 'match-medium';
        return 'match-low';
    };

    if (loading && isFirstLoad.current) {
        return (
            <Container className="py-5 text-center">
                <Spinner animation="border" variant="primary" />
                <p className="mt-3">Loading applications...</p>
            </Container>
        );
    }

    if (error) {
        return (
            <Container className="py-5">
                <Alert variant="danger">{error}</Alert>
                <Button as={Link} to={`${basePath}/vacancies`} variant="outline-primary">
                    <FaArrowLeft className="me-2" /> Back to Jobs
                </Button>
            </Container>
        );
    }

    return (
        <section className="applications-section py-4">
            <Container>
                <BackButton to={`${basePath}/vacancies`} />
                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <Button
                            variant="link"
                            className="text-decoration-none p-0 mb-2 d-inline-flex align-items-center gap-2"
                            onClick={() => navigate(`${basePath}/vacancies`)}
                        >
                            <FaArrowLeft /> Back to Jobs
                        </Button>
                        <h2 className="fw-bold mb-0">Applications for {job?.title}</h2>
                        <p className="text-muted mb-0">{job?.department} &middot; {job?.location}</p>
                    </div>
                    <Badge bg="primary" className="fs-6 p-2">
                        {meta.total} Applicant{meta.total === 1 ? '' : 's'}
                    </Badge>
                </div>

                {/* ---- Report controls -------------------------------------
                    Search, filter and sort are all resolved by the API against
                    the real application records, so what is counted above and
                    listed below always agree. */}
                <Card className="shadow-sm mb-3">
                    <Card.Body className="p-3">
                        <Row className="g-2 align-items-center">
                            <Col md={5}>
                                <InputGroup size="sm">
                                    <InputGroup.Text><FaSearch size={12} /></InputGroup.Text>
                                    <Form.Control
                                        placeholder="Search candidates by name, email or skill"
                                        value={filters.search}
                                        onChange={(e) => setFilter('search', e.target.value)}
                                    />
                                </InputGroup>
                            </Col>
                            <Col md={3}>
                                <Form.Select size="sm" value={filters.status}
                                             onChange={(e) => setFilter('status', e.target.value)}>
                                    <option value="">All statuses</option>
                                    {STATUS_FILTERS.map(status => (
                                        <option key={status} value={status}>
                                            {STAGE_LABELS[status]}
                                            {meta.statusCounts[status] ? ` (${meta.statusCounts[status]})` : ''}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Col>
                            <Col md={4} className="d-flex gap-2 justify-content-md-end">
                                <Form.Check
                                    type="switch"
                                    id="shortlisted-only"
                                    className="align-self-center text-nowrap"
                                    label="Shortlisted only"
                                    checked={filters.shortlisted}
                                    onChange={(e) => setFilter('shortlisted', e.target.checked)}
                                />
                                <Button size="sm" variant={showFilters ? 'primary' : 'outline-secondary'}
                                        onClick={() => setShowFilters(!showFilters)}>
                                    <FaSlidersH className="me-1" /> Filters
                                    {activeFilterCount > 0 && (
                                        <Badge bg="light" text="dark" className="ms-1">{activeFilterCount}</Badge>
                                    )}
                                </Button>
                            </Col>
                        </Row>

                        {showFilters && (
                            <Row className="g-2 mt-1 pt-3" style={{ borderTop: '1px solid #E2E8F0' }}>
                                <Col md={2}>
                                    <Form.Label className="small text-muted mb-1">Min AI score</Form.Label>
                                    <Form.Control size="sm" type="number" min="0" max="100" placeholder="0"
                                                  value={filters.minScore}
                                                  onChange={(e) => setFilter('minScore', e.target.value)} />
                                </Col>
                                <Col md={2}>
                                    <Form.Label className="small text-muted mb-1">Min experience (yrs)</Form.Label>
                                    <Form.Control size="sm" type="number" min="0" step="0.5" placeholder="0"
                                                  value={filters.minExperience}
                                                  onChange={(e) => setFilter('minExperience', e.target.value)} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small text-muted mb-1">Education</Form.Label>
                                    <Form.Control size="sm" placeholder="e.g. Computer Science"
                                                  value={filters.education}
                                                  onChange={(e) => setFilter('education', e.target.value)} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small text-muted mb-1">Skills (comma separated)</Form.Label>
                                    <Form.Control size="sm" placeholder="e.g. React, Node.js"
                                                  value={filters.skills}
                                                  onChange={(e) => setFilter('skills', e.target.value)} />
                                </Col>
                                <Col md={2} className="d-flex align-items-end">
                                    <Button size="sm" variant="outline-secondary" className="w-100"
                                            onClick={resetFilters} disabled={activeFilterCount === 0}>
                                        <FaUndo className="me-1" /> Reset
                                    </Button>
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small text-muted mb-1">Applied from</Form.Label>
                                    <Form.Control size="sm" type="date" value={filters.dateFrom}
                                                  onChange={(e) => setFilter('dateFrom', e.target.value)} />
                                </Col>
                                <Col md={3}>
                                    <Form.Label className="small text-muted mb-1">Applied to</Form.Label>
                                    <Form.Control size="sm" type="date" value={filters.dateTo}
                                                  onChange={(e) => setFilter('dateTo', e.target.value)} />
                                </Col>
                            </Row>
                        )}
                    </Card.Body>
                </Card>

                {applications.length === 0 ? (
                    <Card className="text-center py-5">
                        <Card.Body>
                            <div className="mb-3 text-muted"><FaUser size={42} /></div>
                            <h4>No applicants match this view</h4>
                            <p className="text-muted mb-3">
                                {meta.total === 0 && activeFilterCount === 0 && !debouncedSearch
                                    ? 'There are no applications for this vacancy yet.'
                                    : 'No application matches the current search and filters.'}
                            </p>
                            {(activeFilterCount > 0 || debouncedSearch) && (
                                <Button size="sm" variant="outline-primary"
                                        onClick={() => { resetFilters(); setFilter('search', ''); }}>
                                    Clear search and filters
                                </Button>
                            )}
                        </Card.Body>
                    </Card>
                ) : (
                    <Card className="shadow-sm">
                        <Card.Body className="p-0">
                            <div className="table-responsive">
                                <Table hover className="mb-0 align-middle">
                                    <thead className="bg-light">
                                        <tr>
                                            {Object.entries(SORTABLE).map(([field, label]) => (
                                                <th key={field}
                                                    role="button"
                                                    onClick={() => toggleSort(field)}
                                                    className="user-select-none"
                                                    title={`Sort by ${label.toLowerCase()}`}>
                                                    {label}{sortIcon(field)}
                                                </th>
                                            ))}
                                            <th>Education</th>
                                            <th>Relevant skills</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {applications.map((app) => (
                                            <tr key={app._id}>
                                                <td>
                                                    <div className="d-flex align-items-center gap-2">
                                                        {/* Candidate Photo */}
                                                        {app.applicant?.profile?.profilePhoto ? (
                                                            <Image 
                                                                src={getImageUrl(app.applicant.profile.profilePhoto)} 
                                                                roundedCircle 
                                                                style={{ 
                                                                    width: '40px', 
                                                                    height: '40px', 
                                                                    objectFit: 'cover',
                                                                    border: '2px solid #2c3e8f'
                                                                }} 
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none';
                                                                }}
                                                            />
                                                        ) : (
                                                            <div 
                                                                style={{ 
                                                                    width: '40px', 
                                                                    height: '40px', 
                                                                    borderRadius: '50%',
                                                                    background: 'linear-gradient(135deg, #2c3e8f, #1a237e)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: 'var(--surface)',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '1rem'
                                                                }}
                                                            >
                                                                {app.applicant?.name?.charAt(0)?.toUpperCase() || 'U'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="fw-semibold">{app.applicant?.name || 'Unknown'}</div>
                                                            <div className="text-muted small">{app.applicant?.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-nowrap">{new Date(app.createdAt).toLocaleDateString()}</td>
                                                <td>
                                                    {typeof app.matchScore === 'number' ? (
                                                        <span className={`match-score ${getMatchScoreClass(app.matchScore)}`}>
                                                            {app.matchScore}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted">&mdash;</span>
                                                    )}
                                                </td>
                                                <td className="text-nowrap">
                                                    {app.insights?.experienceYears
                                                        ? `${app.insights.experienceYears} yr${app.insights.experienceYears === 1 ? '' : 's'}`
                                                        : <span className="text-muted">&mdash;</span>}
                                                </td>
                                                <td>
                                                    <StatusBadge status={app.status} />
                                                </td>
                                                <td style={{ maxWidth: 190 }}>
                                                    <div className="small">{app.insights?.educationSummary || <span className="text-muted">&mdash;</span>}</div>
                                                    {typeof app.matchDetails?.educationScore === 'number' && (
                                                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                                                            {app.matchDetails.educationScore}% education match
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ maxWidth: 220 }}>
                                                    <div className="d-flex flex-wrap gap-1">
                                                        {(app.matchDetails?.matchingSkills || []).slice(0, 3).map((skill, i) => (
                                                            <Badge key={i} bg="success" className="fw-normal">{skill}</Badge>
                                                        ))}
                                                        {(app.matchDetails?.matchingSkills || []).length > 3 && (
                                                            <Badge bg="light" text="dark" className="fw-normal">
                                                                +{app.matchDetails.matchingSkills.length - 3}
                                                            </Badge>
                                                        )}
                                                        {(app.matchDetails?.matchingSkills || []).length === 0 && (
                                                            <span className="text-muted small">&mdash;</span>
                                                        )}
                                                    </div>
                                                    {(app.matchDetails?.missingSkills || []).length > 0 && (
                                                        <div className="text-danger" style={{ fontSize: '0.72rem' }}>
                                                            {app.matchDetails.missingSkills.length} missing
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="d-flex gap-1 flex-wrap">
                                                        <Button
                                                            size="sm"
                                                            variant="outline-info"
                                                            onClick={() => handleViewProfile(app)}
                                                            title="View Profile"
                                                        >
                                                            <FaUser />
                                                        </Button>
                                                        {app.resume?._id && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline-secondary"
                                                                onClick={() => handleViewResume(app)}
                                                                disabled={resumeLoadingId === app._id}
                                                                title="View CV"
                                                            >
                                                                {resumeLoadingId === app._id
                                                                    ? <Spinner animation="border" size="sm" />
                                                                    : <FaFileAlt />}
                                                            </Button>
                                                        )}
                                                        {canProcess && app.status === 'applied' && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-success"
                                                                    onClick={() => handleStatusUpdate(app._id, 'under_review')}
                                                                    title="Start screening"
                                                                >
                                                                    <FaCheck className="me-1" /> Screen
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-danger"
                                                                    onClick={() => handleStatusUpdate(app._id, 'rejected')}
                                                                    title="Reject"
                                                                >
                                                                    <FaTimes />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {canProcess && ['under_review', 'ai_analyzed'].includes(app.status) && (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-success"
                                                                    onClick={() => handleStatusUpdate(app._id, 'shortlisted')}
                                                                    title="Shortlist"
                                                                >
                                                                    Shortlist
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline-danger"
                                                                    onClick={() => handleStatusUpdate(app._id, 'rejected')}
                                                                    title="Reject"
                                                                >
                                                                    <FaTimes />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {canProcess && ['shortlisted', 'interview_scheduled'].includes(app.status) && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline-primary"
                                                                onClick={() => {
                                                                    setSelectedApp(app);
                                                                    setShowInterviewModal(true);
                                                                }}
                                                                title="Schedule Interview"
                                                            >
                                                                <FaCalendar className="me-1" />
                                                                {app.status === 'interview_scheduled' ? 'Reschedule' : 'Interview'}
                                                            </Button>
                                                        )}
                                                        {canProcess && app.status === 'interview_scheduled' && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline-success"
                                                                onClick={() => handleStatusUpdate(app._id, 'interviewed')}
                                                                title="Mark the interview as completed"
                                                            >
                                                                Mark Interviewed
                                                            </Button>
                                                        )}
                                                        {/* Final outcomes belong to the HR Manager. The expert hands
                                                            the candidate over instead of deciding here. */}
                                                        {canProcess && app.status === 'interviewed' && (
                                                            <Badge bg="info" className="align-self-center">
                                                                Awaiting HR Manager decision
                                                            </Badge>
                                                        )}
                                                        {canDecide && ['shortlisted', 'interview_scheduled', 'interviewed', 'selected', 'offered'].includes(app.status) && (
                                                            <Button
                                                                size="sm"
                                                                variant="success"
                                                                as={Link}
                                                                to="/hr-manager/shortlists"
                                                                title="Go to the decision queue"
                                                            >
                                                                Decide
                                                            </Button>
                                                        )}
                                                        {CLOSED_STATUSES.includes(app.status) && (
                                                            <span className="text-muted small align-self-center">
                                                                {STAGE_LABELS[app.status]}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </div>
                        </Card.Body>

                        {/* Paging footer - "showing X of Y" is what makes a long
                            applicant list reviewable without scrolling forever. */}
                        <Card.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2 bg-white">
                            <span className="text-muted small">
                                Showing {applications.length} of {meta.total} applicant{meta.total === 1 ? '' : 's'}
                                {meta.totalPages > 1 ? ` · page ${page} of ${meta.totalPages}` : ''}
                                {loading ? ' · updating…' : ''}
                            </span>
                            {meta.totalPages > 1 && (
                                <div className="d-flex gap-2">
                                    <Button size="sm" variant="outline-secondary"
                                            disabled={page <= 1 || loading}
                                            onClick={() => setPage(p => Math.max(p - 1, 1))}>
                                        Previous
                                    </Button>
                                    <Button size="sm" variant="outline-secondary"
                                            disabled={page >= meta.totalPages || loading}
                                            onClick={() => setPage(p => Math.min(p + 1, meta.totalPages))}>
                                        Next
                                    </Button>
                                </div>
                            )}
                        </Card.Footer>
                    </Card>
                )}

                {/* Interview Modal */}
                <Modal show={showInterviewModal} onHide={() => setShowInterviewModal(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>Schedule Interview</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <Form onSubmit={handleScheduleInterview}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Interview Date <span className="text-danger">*</span></Form.Label>
                                <Form.Control
                                    type="datetime-local"
                                    value={interviewData.interviewDate}
                                    onChange={(e) => setInterviewData({ ...interviewData, interviewDate: e.target.value })}
                                    required
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Interview Location</Form.Label>
                                <Form.Control
                                    type="text"
                                    value={interviewData.interviewLocation}
                                    onChange={(e) => setInterviewData({ ...interviewData, interviewLocation: e.target.value })}
                                    placeholder="e.g., SITA Office, Hawassa"
                                />
                            </Form.Group>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-semibold">Additional Note</Form.Label>
                                <Form.Control
                                    as="textarea"
                                    rows={3}
                                    value={interviewData.note}
                                    onChange={(e) => setInterviewData({ ...interviewData, note: e.target.value })}
                                    placeholder="Add any instructions or notes for the candidate"
                                />
                            </Form.Group>
                            <div className="d-flex gap-2">
                                <Button type="submit" variant="primary-gradient">
                                    <FaCalendar className="me-2" /> Schedule Interview
                                </Button>
                                <Button variant="outline-secondary" onClick={() => setShowInterviewModal(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </Form>
                    </Modal.Body>
                </Modal>

                {/* Candidate Profile Modal - shared with the HR Manager decision queue */}
                <CandidateProfileModal
                    show={showProfileModal}
                    onHide={() => setShowProfileModal(false)}
                    application={profileApp}
                />
            </Container>
        </section>
    );
};

export default Applications;
