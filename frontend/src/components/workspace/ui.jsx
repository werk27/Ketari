import React from 'react';
import { Link } from 'react-router-dom';

/** Colour tokens shared by the recruitment workspace. */
export const TOKENS = {
    primary: '#4F46E5',
    border: '#E2E8F0',
    muted: '#64748B'
};

/** Vacancy + application status presentation, aligned with the backend enums. */
const STATUS_STYLES = {
    // Vacancy lifecycle
    draft: { label: 'Draft', bg: '#F1F5F9', color: '#475569' },
    pending_approval: { label: 'Pending Approval', bg: '#FEF3C7', color: '#92400E' },
    approved: { label: 'Approved', bg: '#DCFCE7', color: '#166534' },
    published: { label: 'Published', bg: '#DCFCE7', color: '#166534' },
    open: { label: 'Open', bg: '#DCFCE7', color: '#166534' },
    closed: { label: 'Closed', bg: '#F1F5F9', color: '#475569' },
    rejected: { label: 'Rejected', bg: '#FEE2E2', color: '#991B1B' },
    archived: { label: 'Archived', bg: '#F1F5F9', color: '#475569' },

    // Application pipeline
    applied: { label: 'Applied', bg: '#E0E7FF', color: '#3730A3' },
    pending: { label: 'Pending', bg: '#F1F5F9', color: '#475569' },
    under_review: { label: 'Under Review', bg: '#FEF3C7', color: '#92400E' },
    ai_analyzed: { label: 'AI Analyzed', bg: '#EDE9FE', color: '#5B21B6' },
    shortlisted: { label: 'Shortlisted', bg: '#CFFAFE', color: '#155E75' },
    interview: { label: 'Interview', bg: '#DBEAFE', color: '#1E40AF' },
    interview_scheduled: { label: 'Interview Scheduled', bg: '#DBEAFE', color: '#1E40AF' },
    interviewed: { label: 'Interviewed', bg: '#DBEAFE', color: '#1E40AF' },
    selected: { label: 'Selected', bg: '#DCFCE7', color: '#166534' },
    offered: { label: 'Offered', bg: '#DCFCE7', color: '#166534' },
    hired: { label: 'Hired', bg: '#16A34A', color: '#FFFFFF' },
    withdrawn: { label: 'Withdrawn', bg: '#F1F5F9', color: '#475569' },

    // Organization status
    active: { label: 'Active', bg: '#DCFCE7', color: '#166534' },
    suspended: { label: 'Suspended', bg: '#FEE2E2', color: '#991B1B' },
    inactive: { label: 'Inactive', bg: '#F1F5F9', color: '#475569' },

    // Employee lifecycle
    on_leave: { label: 'On Leave', bg: '#FEF3C7', color: '#92400E' },
    resigned: { label: 'Resigned', bg: '#F1F5F9', color: '#475569' },
    terminated: { label: 'Terminated', bg: '#FEE2E2', color: '#991B1B' },

    // Employee onboarding workflow
    pending_onboarding: { label: 'Pending Onboarding', bg: '#F1F5F9', color: '#475569' },
    employee_completing: { label: 'Employee Completing', bg: '#E0E7FF', color: '#3730A3' },
    under_hr_verification: { label: 'Under HR Verification', bg: '#FEF3C7', color: '#92400E' },
    pending_manager_approval: { label: 'Pending Manager Approval', bg: '#DBEAFE', color: '#1E40AF' },
    needs_correction: { label: 'Needs Correction', bg: '#FEE2E2', color: '#991B1B' },
    complete: { label: 'Complete', bg: '#16A34A', color: '#FFFFFF' }
};

export const StatusBadge = ({ status }) => {
    const style = STATUS_STYLES[status] || { label: status || 'Unknown', bg: '#F1F5F9', color: '#475569' };
    return (
        <span style={{
            background: style.bg,
            color: style.color,
            fontSize: '0.72rem',
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: '999px',
            whiteSpace: 'nowrap',
            display: 'inline-block'
        }}>
            {style.label}
        </span>
    );
};

export const Card = ({ children, className = '', style = {} }) => (
    <div className={`bg-white ${className}`} style={{
        border: `1px solid ${TOKENS.border}`,
        borderRadius: '14px',
        ...style
    }}>
        {children}
    </div>
);

export const StatCard = ({ label, value, hint, icon: Icon, tone = TOKENS.primary, to }) => {
    const body = (
        <Card className="p-3 h-100">
            <div className="d-flex align-items-start justify-content-between">
                <div style={{ minWidth: 0 }}>
                    <div className="text-uppercase" style={{ fontSize: '0.66rem', fontWeight: 700, color: TOKENS.muted, letterSpacing: '.5px' }}>
                        {label}
                    </div>
                    <div className="fw-bold text-dark" style={{ fontSize: '1.7rem', lineHeight: 1.25 }}>{value}</div>
                    {hint && <div className="text-muted" style={{ fontSize: '0.74rem' }}>{hint}</div>}
                </div>
                {Icon && (
                    <div className="d-flex align-items-center justify-content-center flex-shrink-0"
                         style={{ width: 40, height: 40, borderRadius: 10, background: `${tone}14`, color: tone }}>
                        <Icon size={17} />
                    </div>
                )}
            </div>
        </Card>
    );

    return to ? <Link to={to} className="text-decoration-none d-block h-100">{body}</Link> : body;
};

export const SectionHeader = ({ title, description, action }) => (
    <div className="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
        <div>
            <h6 className="fw-bold text-dark mb-1" style={{ fontSize: '1rem' }}>{title}</h6>
            {description && <div className="text-muted" style={{ fontSize: '0.8rem' }}>{description}</div>}
        </div>
        {action}
    </div>
);

export const LoadingState = ({ label = 'Loading…' }) => (
    <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{label}</span>
        </div>
        <div className="text-muted mt-2" style={{ fontSize: '0.82rem' }}>{label}</div>
    </div>
);

export const EmptyState = ({ icon: Icon, title, description, action }) => (
    <div className="text-center py-5 px-3">
        {Icon && (
            <div className="d-inline-flex align-items-center justify-content-center mb-3"
                 style={{ width: 56, height: 56, borderRadius: '50%', background: '#F1F5F9', color: TOKENS.muted }}>
                <Icon size={22} />
            </div>
        )}
        <div className="fw-semibold text-dark" style={{ fontSize: '0.95rem' }}>{title}</div>
        {description && (
            <div className="text-muted mx-auto mt-1" style={{ fontSize: '0.82rem', maxWidth: 420 }}>{description}</div>
        )}
        {action && <div className="mt-3">{action}</div>}
    </div>
);

export const ErrorState = ({ message, onRetry }) => (
    <div className="text-center py-5 px-3">
        <div className="fw-semibold text-danger" style={{ fontSize: '0.95rem' }}>Something went wrong</div>
        <div className="text-muted mx-auto mt-1" style={{ fontSize: '0.82rem', maxWidth: 420 }}>{message}</div>
        {onRetry && (
            <button className="btn btn-sm btn-outline-primary mt-3" onClick={onRetry}>Try again</button>
        )}
    </div>
);

/** Profile completion indicator: how much is filled in and what is still missing. */
export const CompletionMeter = ({ percent = 0, missing = [], compact = false }) => {
    const tone = percent === 100 ? '#16A34A' : percent >= 50 ? '#D97706' : '#DC2626';

    if (compact) {
        return (
            <div className="d-flex align-items-center gap-2" style={{ minWidth: 110 }}>
                <div style={{ flex: 1, height: 5, background: '#F1F5F9', borderRadius: 999 }}>
                    <div style={{ width: `${percent}%`, height: '100%', background: tone, borderRadius: 999 }} />
                </div>
                <span className="fw-semibold" style={{ color: tone, fontSize: '0.75rem' }}>{percent}%</span>
            </div>
        );
    }

    return (
        <div>
            <div className="d-flex align-items-baseline justify-content-between mb-1">
                <span className="fw-semibold text-dark" style={{ fontSize: '0.85rem' }}>Profile completion</span>
                <span className="fw-bold" style={{ color: tone, fontSize: '1.1rem' }}>{percent}%</span>
            </div>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 999 }}>
                <div style={{ width: `${percent}%`, height: '100%', background: tone, borderRadius: 999, transition: 'width .3s' }} />
            </div>
            {missing.length > 0 && (
                <div className="text-muted mt-2" style={{ fontSize: '0.76rem' }}>
                    Still needed: {missing.map(m => m.label).join(', ')}
                </div>
            )}
        </div>
    );
};

/** Explainable AI match score with its component breakdown. */
export const MatchScore = ({ score = 0, details, compact = false }) => {
    const tone = score >= 80 ? '#16A34A' : score >= 60 ? '#D97706' : '#DC2626';

    if (compact) {
        return <span className="fw-bold" style={{ color: tone, fontSize: '0.88rem' }}>{score}%</span>;
    }

    const rows = [
        ['Skills', details?.skillsScore],
        ['Education', details?.educationScore],
        ['Experience', details?.experienceScore],
        ['Language', details?.languageScore],
        ['Location', details?.locationScore]
    ].filter(([, value]) => typeof value === 'number');

    return (
        <div>
            <div className="d-flex align-items-baseline gap-2 mb-2">
                <span className="fw-bold" style={{ color: tone, fontSize: '1.4rem' }}>{score}%</span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>overall match</span>
            </div>
            {rows.map(([label, value]) => (
                <div key={label} className="mb-1">
                    <div className="d-flex justify-content-between" style={{ fontSize: '0.72rem' }}>
                        <span className="text-muted">{label}</span>
                        <span className="fw-semibold text-dark">{value}%</span>
                    </div>
                    <div style={{ height: 4, background: '#F1F5F9', borderRadius: 999 }}>
                        <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: tone, borderRadius: 999 }} />
                    </div>
                </div>
            ))}
        </div>
    );
};
