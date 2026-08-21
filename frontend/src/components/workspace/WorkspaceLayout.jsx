import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { FaBars, FaSignOutAlt, FaTimes } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import { getNavigation, ROLE_LABELS } from './navigationConfig';

const T = {
    primary: '#4F46E5',
    sidebar: '#0F172A',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
};

/**
 * Shared application shell for every authenticated role.
 *
 * The sidebar, header and design system stay mounted while only the main
 * workspace region changes, so navigating from a dashboard never drops the
 * user onto a disconnected-looking page.
 */
const WorkspaceLayout = () => {
    const { user, organization, logout } = useAuth();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);

    const nav = getNavigation(user?.role);
    if (!nav) return <Outlet />;

    const allItems = nav.sections.flatMap(section => section.items);
    const current = allItems
        .filter(item => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))
        .sort((a, b) => b.to.length - a.to.length)[0];

    const pageTitle = current ? current.label : nav.title;
    const initials = (user?.name || '?').trim().charAt(0).toUpperCase();

    const linkStyle = ({ isActive }) => ({
        color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
        background: isActive ? 'rgba(79,70,229,0.18)' : 'transparent',
        borderLeft: isActive ? `3px solid ${T.primary}` : '3px solid transparent',
        textDecoration: 'none',
        fontSize: '0.84rem',
        padding: '8px 18px',
        transition: 'all .15s'
    });

    const sidebar = (
        <div style={{
            width: '260px',
            background: T.sidebar,
            minHeight: '100vh',
            height: '100vh',
            position: 'sticky',
            top: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: T.font,
            borderRight: '1px solid rgba(255,255,255,0.05)'
        }}>
            <div className="px-3 py-3 d-flex align-items-center gap-3 flex-shrink-0">
                <div style={{
                    width: '42px', height: '42px', borderRadius: '50%',
                    background: 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#0F172A', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0
                }}>
                    {organization?.logo
                        ? <img src={organization.logo} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        : '🏛️'}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div className="text-white fw-bold" style={{ fontSize: '0.86rem', lineHeight: 1.2 }}>
                        {organization?.name || 'RECRUITMENT SYSTEM ET'}
                    </div>
                    <small className="text-white-50" style={{ fontSize: '0.68rem' }}>{nav.subtitle}</small>
                </div>
            </div>

            <nav className="flex-grow-1 pb-3">
                {nav.sections.map((section, index) => (
                    <div key={index} className="mb-2">
                        {section.label && (
                            <div className="text-uppercase px-4 mt-3 mb-1"
                                 style={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.8px', color: '#64748B' }}>
                                {section.label}
                            </div>
                        )}
                        {section.items.map(item => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    style={linkStyle}
                                    onClick={() => setMobileOpen(false)}
                                    className="d-flex align-items-center gap-3"
                                >
                                    <Icon size={14} style={{ flexShrink: 0 }} />
                                    <span>{item.label}</span>
                                </NavLink>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="px-3 pb-3 flex-shrink-0">
                <Link to="/" className="d-block text-center text-white-50 text-decoration-none py-2"
                      style={{ fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}>
                    ← Back to public site
                </Link>
            </div>
        </div>
    );

    return (
        <div className="d-flex" style={{ minHeight: '100vh', fontFamily: T.font, background: T.bg }}>
            <div className="d-none d-lg-block" style={{ flexShrink: 0 }}>{sidebar}</div>

            {mobileOpen && (
                <div className="d-lg-none position-fixed top-0 start-0 w-100 h-100" style={{ zIndex: 1050 }}>
                    <div className="position-absolute top-0 start-0 w-100 h-100"
                         style={{ background: 'rgba(15,23,42,.5)' }} onClick={() => setMobileOpen(false)} />
                    <div className="position-relative" style={{ zIndex: 1051 }}>{sidebar}</div>
                </div>
            )}

            <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                <header className="bg-white border-bottom d-flex align-items-center justify-content-between px-3 px-md-4"
                        style={{ height: '62px', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                    <div className="d-flex align-items-center gap-3" style={{ minWidth: 0 }}>
                        <button className="btn btn-link text-dark p-0 border-0 d-lg-none"
                                onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">
                            {mobileOpen ? <FaTimes size={18} /> : <FaBars size={18} />}
                        </button>
                        <div style={{ minWidth: 0 }}>
                            <h5 className="fw-bold mb-0 text-dark text-truncate"
                                style={{ fontSize: '1.08rem', letterSpacing: '-0.3px' }}>
                                {pageTitle}
                            </h5>
                            <nav style={{ fontSize: '0.72rem' }} aria-label="Breadcrumb">
                                <Link to={nav.home} className="text-muted text-decoration-none">{nav.title}</Link>
                                {current && current.to !== nav.home && (
                                    <>
                                        <span className="text-muted mx-1">›</span>
                                        <span className="text-muted">{current.label}</span>
                                    </>
                                )}
                            </nav>
                        </div>
                    </div>

                    <div className="d-flex align-items-center gap-3">
                        <div className="d-flex align-items-center gap-2">
                            <div className="rounded-circle text-white d-flex align-items-center justify-content-center fw-bold"
                                 style={{ width: '34px', height: '34px', fontSize: '0.85rem', background: T.primary }}>
                                {initials}
                            </div>
                            <div className="d-none d-sm-block">
                                <div className="fw-semibold text-dark lh-1" style={{ fontSize: '0.84rem' }}>
                                    {user?.name}
                                </div>
                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    {ROLE_LABELS[user?.role] || user?.role}
                                </small>
                            </div>
                        </div>
                        <button onClick={logout} className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2"
                                style={{ fontSize: '0.78rem' }}>
                            <FaSignOutAlt size={12} />
                            <span className="d-none d-md-inline">Sign out</span>
                        </button>
                    </div>
                </header>

                <main className="flex-grow-1 p-3 p-md-4" style={{ overflowY: 'auto' }}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default WorkspaceLayout;
