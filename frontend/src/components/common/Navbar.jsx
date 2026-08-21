import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Navbar, Nav, Container, Button, Dropdown, Badge } from 'react-bootstrap';
import { 
    FaUser, 
    FaBriefcase, 
    FaSignOutAlt, 
    FaUserPlus, 
    FaBuilding, 
    FaUserCog,
    FaUsers,
    FaMoon,
    FaSun,
    FaChartBar,
    FaCog,
    FaCalendar,
    FaClock,
    FaBook,
    FaFlag,
    FaExchangeAlt,
    FaBars,
    FaInfoCircle,
    FaEnvelope
} from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';
import NotificationMenu from './NotificationMenu';
import { useTheme } from '../../context/ThemeContext';
import { getImageUrl } from '../../services/api';
import './Navbar.css';

const CustomNavbar = () => {
    const { user, logout, isAuthenticated, isCandidate, isHRExpert, isHRManager, isAdmin } = useAuth();
    const { t } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [scrolled, setScrolled] = useState(false);

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 20) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Get role display name with translation
    const getRoleDisplay = (role) => {
        const roleMap = {
            candidate: 'Candidate',
            hr_expert: 'HR Expert',
            hr_manager: 'HR Manager',
            admin: t('auth.admin')
        };
        return roleMap[role] || role;
    };

    // Get role icon
    const getRoleIcon = (role) => {
        const iconMap = {
            candidate: <FaUser size={14} />,
            hr_expert: <FaBuilding size={14} />,
            hr_manager: <FaUserCog size={14} />,
            admin: <FaUserCog size={14} />
        };
        return iconMap[role] || <FaUser size={14} />;
    };

    const isActive = (path) => {
        if (path === '/' && location.pathname !== '/') return false;
        return location.pathname.startsWith(path);
    };

    return (
        <Navbar 
            expand="lg" 
            className={`custom-navbar ${scrolled ? 'scrolled' : ''}`}
            sticky="top" 
            style={{ background: 'var(--header-bg)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        >
            <Container>
                <Navbar.Brand 
                    as={Link} 
                    to="/" 
                    className="brand d-flex align-items-center gap-2 me-4" 
                    style={{ fontSize: '1.4rem', fontWeight: 800, textDecoration: 'none', letterSpacing: '-0.5px' }}
                >
                    <div style={{ 
                        width: '36px', height: '36px', 
                        background: 'var(--primary-color)', 
                        borderRadius: '8px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: '1.2rem', boxShadow: 'var(--shadow-sm)'
                    }}>
                        <FaBriefcase size={18} />
                    </div>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>KETARI</span>
                </Navbar.Brand>
                
                <Navbar.Toggle aria-controls="basic-navbar-nav" className="navbar-toggler-custom shadow-none">
                    <FaBars size={24} color="var(--text-primary)" />
                </Navbar.Toggle>
                
                <Navbar.Collapse id="basic-navbar-nav">
                    <Nav className="me-auto align-items-lg-center">
                        <Nav.Link 
                            as={Link} 
                            to="/jobs" 
                            className={`nav-link-custom ${isActive('/jobs') ? 'active' : ''}`}
                        >
                            {t('nav.jobs')}
                        </Nav.Link>

                        {(user?.role === 'hr_expert' || user?.role === 'hr_manager') && (
                            <Nav.Link
                                as={Link}
                                to={user.role === 'hr_manager' ? '/hr-manager/candidates' : '/hr-expert/candidates'}
                                className="nav-link-custom"
                            >
                                {t('nav.find_talent')}
                            </Nav.Link>
                        )}

                        <Nav.Link 
                            as={Link} 
                            to="/about" 
                            className={`nav-link-custom ${isActive('/about') ? 'active' : ''}`}
                        >
                            {t('nav.about')}
                        </Nav.Link>

                        <Nav.Link 
                            as={Link} 
                            to="/contact" 
                            className={`nav-link-custom ${isActive('/contact') ? 'active' : ''}`}
                        >
                            {t('nav.contact')}
                        </Nav.Link>
                    </Nav>

                    <Nav className="ms-auto align-items-lg-center">
                        <LanguageSwitcher />

                        <div className="ms-2 d-flex align-items-center">
                            <Button 
                                variant="outline-secondary" 
                                onClick={toggleTheme}
                                title={theme === 'light' ? t('nav.dark_mode') || 'Toggle theme' : t('nav.light_mode') || 'Toggle theme'}
                                style={{
                                    borderRadius: '8px',
                                    padding: '6px 10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginLeft: '8px',
                                    borderColor: 'var(--border-color)',
                                    color: 'var(--text-primary)',
                                    background: 'transparent'
                                }}
                            >
                                {theme === 'light' ? <FaMoon size={16} /> : <FaSun size={16} />}
                            </Button>
                        </div>

                        {!isAuthenticated ? (
                            <div className="d-flex flex-column flex-lg-row align-items-stretch align-items-lg-center gap-2 ms-lg-3 mt-3 mt-lg-0">
                                <Button 
                                    as={Link} 
                                    to="/login" 
                                    className="auth-btn-login px-4 py-2"
                                >
                                    {t('nav.login')}
                                </Button>
                                
                                <Button 
                                    as={Link} 
                                    to="/register" 
                                    className="auth-btn-signup px-4 py-2"
                                >
                                    {t('nav.register')}
                                </Button>
                            </div>
                        ) : (
                            <div className="d-flex align-items-center mt-3 mt-lg-0">
                                <NotificationMenu />
                                <Dropdown align="end" className="ms-2 d-block">
                                <Dropdown.Toggle 
                                    variant="light" 
                                    className="user-dropdown-toggle d-flex align-items-center w-100" 
                                    style={{ 
                                        background: 'transparent', 
                                        padding: '6px 12px', 
                                        borderRadius: '12px'
                                    }}
                                >
                                    {/* User Avatar */}
                                    <div style={{ 
                                        width: '32px', 
                                        height: '32px', 
                                        borderRadius: '50%', 
                                        background: 'var(--gradient)', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        color: 'white', 
                                        fontWeight: 600,
                                        fontSize: '0.9rem',
                                        overflow: 'hidden'
                                    }}>
                                        {user?.profile?.profilePhoto ? (
                                            <img 
                                                src={getImageUrl(user.profile.profilePhoto)} 
                                                alt={user?.name || 'User'} 
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                    e.target.parentElement.innerText = user?.name?.charAt(0)?.toUpperCase() || 'U';
                                                }}
                                            />
                                        ) : (
                                            user?.name?.charAt(0)?.toUpperCase() || 'U'
                                        )}
                                    </div>
                                    
                                    {/* User Name & Role container */}
                                    <div className="ms-2 d-flex flex-column align-items-start d-none d-md-flex">
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.2' }}>
                                            {user?.name}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                            {getRoleDisplay(user?.role)}
                                        </span>
                                    </div>
                                </Dropdown.Toggle>
                                
                                <Dropdown.Menu style={{ 
                                    border: '1px solid var(--border-color)', 
                                    borderRadius: '12px', 
                                    boxShadow: 'var(--shadow-lg)', 
                                    padding: '8px', 
                                    minWidth: '220px',
                                    background: 'var(--surface)'
                                }}>
                                    {isCandidate && (
                                        <>
                                            <Dropdown.Item as={Link} to="/candidate/dashboard" className="dropdown-item-custom">
                                                <FaChartBar className="me-2" /> {t('nav.dashboard')}
                                            </Dropdown.Item>
                                            <Dropdown.Item as={Link} to="/candidate/profile" className="dropdown-item-custom">
                                                <FaUserCog className="me-2" /> {t('nav.profile')}
                                            </Dropdown.Item>
                                            <Dropdown.Divider style={{ borderColor: 'var(--border-color)' }} />
                                        </>
                                    )}
                                    
                                    {(isHRExpert || isHRManager) && (
                                        <>
                                            <Dropdown.Item as={Link} to={isHRExpert ? "/hr-expert/dashboard" : "/hr-manager/dashboard"} className="dropdown-item-custom">
                                                <FaBriefcase className="me-2" /> Dashboard
                                            </Dropdown.Item>
                                            {isHRExpert && (
                                                <Dropdown.Item as={Link} to="/hr-expert/job-creator" className="dropdown-item-custom">
                                                    <FaUserPlus className="me-2" /> Create Vacancy
                                                </Dropdown.Item>
                                            )}
                                            {isHRExpert && (
                                                <Dropdown.Item as={Link} to="/hr-expert/dashboard" className="dropdown-item-custom">
                                                    <FaBuilding className="me-2" /> Company Profile
                                                </Dropdown.Item>
                                            )}
                                            <Dropdown.Divider style={{ borderColor: 'var(--border-color)' }} />
                                        </>
                                    )}
                                    
                                    {isAdmin && (
                                        <>
                                            <Dropdown.Item as={Link} to="/admin/dashboard" className="dropdown-item-custom">
                                                <FaChartBar className="me-2" /> Admin Dashboard
                                            </Dropdown.Item>
                                            <Dropdown.Item as={Link} to="/admin/config" className="dropdown-item-custom">
                                                <FaCog className="me-2" /> Recruitment Config
                                            </Dropdown.Item>
                                            <Dropdown.Item as={Link} to="/admin/users" className="dropdown-item-custom">
                                                <FaUsers className="me-2" /> User Management
                                            </Dropdown.Item>
                                            <Dropdown.Item as={Link} to="/hr-manager/dashboard" className="dropdown-item-custom">
                                                <FaBriefcase className="me-2" /> Pending Approvals
                                            </Dropdown.Item>
                                            <Dropdown.Divider style={{ borderColor: 'var(--border-color)' }} />
                                        </>
                                    )}
                                    
                                    <Dropdown.Item onClick={handleLogout} className="text-danger dropdown-item-custom">
                                        <FaSignOutAlt className="me-2" /> {t('nav.logout')}
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            </Dropdown>
                            </div>
                        )}
                    </Nav>
                </Navbar.Collapse>
            </Container>
        </Navbar>
    );
};

export default CustomNavbar;