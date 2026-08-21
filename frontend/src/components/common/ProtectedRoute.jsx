import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/** Landing page for each role, used when a user reaches a route they may not open. */
export const roleHomePath = (role) => {
    switch (role) {
        case 'admin': return '/admin';
        case 'employer': return '/employer/dashboard';
        case 'hr_manager': return '/hr-manager/dashboard';
        case 'hr_expert': return '/hr-expert/dashboard';
        case 'employee': return '/employee/dashboard';
        case 'candidate': return '/candidate/dashboard';
        default: return '/';
    }
};

/**
 * Route guard.
 *
 * Roles are matched exactly. An earlier version expanded `hr_expert` into
 * `['hr_expert', 'hr_manager']`, which silently granted HR Managers access to
 * HR Expert-only screens and broke the required separation of duties.
 *
 * This is a convenience layer only - the backend independently enforces the
 * same rules, so hiding a route is never the sole protection.
 */
const ProtectedRoute = ({ children, allowedRoles, requiredCapability }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to={roleHomePath(user.role)} replace />;
    }

    if (requiredCapability) {
        const capabilities = user.capabilities || [];
        if (!capabilities.includes(requiredCapability)) {
            return <Navigate to={roleHomePath(user.role)} replace />;
        }
    }

    return children;
};

export default ProtectedRoute;
