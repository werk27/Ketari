import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const BASE_URL = API_URL.replace(/\/api\/?$/, '');

const api = axios.create({
    baseURL: API_URL,
    // Without a timeout a stalled request hangs the sign-in button forever.
    timeout: Number(process.env.REACT_APP_API_TIMEOUT) || 30000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests if it exists
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.data instanceof FormData) {
            // Let the browser set the correct multipart/form-data boundary
            delete config.headers['Content-Type'];
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// An authentication attempt owns its own 401 ("wrong password"). Treating it as
// an expired session would clear state and hide the real message.
const isAuthAttempt = (url = '') => /\/auth\/(login|register|forgotpassword|resetpassword)/i.test(url);

/** Event name AuthContext listens to so React state follows a rejected token. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

// Handle response errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401 && !isAuthAttempt(error.config?.url)) {
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
            // Clearing storage alone left the UI looking signed in while every
            // request failed, so the session seemed to end at random and the
            // next sign-in attempt looked like a failure. Tell AuthContext too.
            window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        }
        return Promise.reject(error);
    }
);

/**
 * Turn any axios failure into a message a user can act on.
 * Server-supplied messages win; everything else is mapped by status/code so a
 * rate limit, an outage or a timeout is never reported as "Login failed".
 */
export const describeApiError = (error, fallback = 'Something went wrong. Please try again.') => {
    const data = error.response?.data;

    if (typeof data?.message === 'string' && data.message.trim()) {
        return data.message;
    }
    if (Array.isArray(data?.errors) && data.errors.length) {
        return data.errors.map(e => e.msg || e.message).filter(Boolean).join(', ') || fallback;
    }

    if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
        return 'The server took too long to respond. Please check your connection and try again.';
    }
    if (error.code === 'ERR_NETWORK' || !error.response) {
        return 'Cannot reach the server. Make sure the backend is running on ' + BASE_URL + ' and try again.';
    }

    switch (error.response.status) {
        case 429:
            return 'Too many attempts from this device. Please wait a few minutes and try again.';
        case 502:
        case 503:
        case 504:
            return 'The server is temporarily unavailable. Please try again in a moment.';
        case 500:
            return 'The server hit an unexpected error. Please try again, and contact support if it continues.';
        default:
            return fallback;
    }
};

export const getImageUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const cleanPath = path.replace(/^\/+/, '');
    // The backend saves path as 'uploads/profiles/filename.jpg'
    // We need to access it via BASE_URL/uploads/profiles/filename.jpg
    const url = `${BASE_URL}/${cleanPath}`;
    console.log('getImageUrl - Path:', path, 'Clean:', cleanPath, 'URL:', url);
    return url;
};

export default api;
