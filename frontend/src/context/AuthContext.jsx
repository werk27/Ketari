import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import api, { describeApiError, SESSION_EXPIRED_EVENT } from '../services/api';
import { toast } from 'react-toastify';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [organization, setOrganization] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    // Only a stored token means there is a session to restore. Starting at
    // `false` for anonymous visitors stops the route guard from flashing a
    // spinner before it redirects to the login page.
    const [loading, setLoading] = useState(() => !!localStorage.getItem('token'));

    // The token whose profile is already in state. Signing in or registering
    // fills user/organization straight from the auth response, so this stops the
    // effect below from firing a second /auth/me request and swapping the user
    // object again - that swap was what dropped every dashboard back into its
    // own loading state right after a successful login.
    const hydratedToken = useRef(null);

    useEffect(() => {
        if (!token) {
            hydratedToken.current = null;
            delete api.defaults.headers.common['Authorization'];
            setLoading(false);
            return;
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

        if (hydratedToken.current === token) return;

        setLoading(true);
        loadUser(token);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    /** Drop every trace of the session on the client. */
    const clearSession = () => {
        hydratedToken.current = null;
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        setUser(null);
        setOrganization(null);
        setToken(null);
        setLoading(false);
    };

    // Any request can discover that the token is no longer accepted. Without
    // this listener the context kept a stale user while the API refused every
    // call, and the session appeared to end at random.
    useEffect(() => {
        const handleSessionExpired = () => clearSession();
        window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
        return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadUser = async (activeToken, attempt = 0) => {
        try {
            const response = await api.get('/auth/me');
            hydratedToken.current = activeToken || localStorage.getItem('token');
            setUser(response.data.user);
            setOrganization(response.data.organization || null);
            setLoading(false);
        } catch (error) {
            const status = error.response?.status;
            const tokenRejected = status === 401 || status === 403;

            // Only a rejected token really ends a session. A timeout, an offline
            // backend, a rate limit or a database outage used to sign the user
            // out as well, which is why signing in seemed to "fail" so often.
            if (!tokenRejected && attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                return loadUser(activeToken, attempt + 1);
            }

            if (tokenRejected) {
                clearSession();
                return;
            }

            // Keep the token so the session survives a temporary outage.
            console.error('Could not restore session:', error);
            setLoading(false);
        }
    };

    /** Adopt a session from a login/register response, with no extra round trip. */
    const applySession = (newToken, authUser, org) => {
        localStorage.setItem('token', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        hydratedToken.current = newToken;
        setUser(authUser);
        setOrganization(org || null);
        setLoading(false);
        setToken(newToken);
    };

    const login = async (email, password) => {
        try {
            const response = await api.post('/auth/login', {
                // Autofill and copy/paste often add whitespace or capitals, which
                // the API rejects as an invalid email before it ever checks the
                // credentials. Normalize here as well as on the server.
                email: (email || '').trim().toLowerCase(),
                password
            });

            const { token, user } = response.data;
            applySession(token, user, response.data.organization);
            // No success toast: the redirect to the role's dashboard already
            // confirms the sign-in.
            return { success: true, user };
        } catch (error) {
            const message = describeApiError(error, 'Login failed. Please try again.');
            toast.error(message);
            return { success: false, message };
        }
    };

    const register = async (userData) => {
        try {
            const response = await api.post('/auth/register', {
                ...userData,
                email: (userData?.email || '').trim().toLowerCase()
            });
            const { token, user } = response.data;
            applySession(token, user, response.data.organization);
            // No success toast: the redirect to the new account's dashboard
            // already confirms the sign-up.
            return { success: true, user };
        } catch (error) {
            const message = describeApiError(error, 'Registration failed. Please try again.');
            toast.error(message);
            return { success: false, message };
        }
    };

    const logout = () => {
        clearSession();
        // No toast: returning to the public/login view already confirms sign-out.
    };

    const updateProfile = async (data) => {
        try {
            const response = await api.put('/auth/updateprofile', data);
            setUser(response.data.user);
            toast.success('Profile updated successfully!');
            return { success: true };
        } catch (error) {
            const message = error.response?.data?.message || 'Failed to update profile.';
            toast.error(message);
            return { success: false, message };
        }
    };

    const value = {
        user,
        organization,
        loading,
        login,
        register,
        logout,
        updateProfile,
        // Exposed so a flow that already holds a fresh session - employee
        // activation - can adopt it without a second sign-in round trip.
        applySession,
        reloadUser: loadUser,
        isAuthenticated: !!user,
        isCandidate: user?.role === 'candidate',
        isHRExpert: user?.role === 'hr_expert',
        isHRManager: user?.role === 'hr_manager',
        isEmployer: user?.role === 'employer',
        isAdmin: user?.role === 'admin',
        // Capability check mirroring the backend permission matrix.
        can: (capability) => (user?.capabilities || []).includes(capability)
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};