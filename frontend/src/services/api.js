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
        // The employee's approved leave started while they were signed in: the
        // backend now rejects every request for the duration. End the client
        // session cleanly so they land on the login page, where the same
        // clear "access restored on your return date" message is shown.
        if (error.response?.status === 403
            && error.response?.data?.code === 'ON_LEAVE_ACCESS_BLOCKED'
            && !isAuthAttempt(error.config?.url)) {
            localStorage.removeItem('token');
            delete api.defaults.headers.common['Authorization'];
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

const SALARY_PERIOD_LABELS = {
    hourly: '/hour',
    daily: '/day',
    weekly: '/week',
    monthly: '/month',
    annual: '/year'
};

/**
 * Format a vacancy's one fixed salary consistently everywhere it is shown -
 * job details, candidate application, employer dashboard, search results.
 * A job always has exactly one required amount (never a range, never
 * "negotiable" - see Job.salary in the backend model), so this never needs
 * to handle a min/max shape.
 */
export const formatSalary = (salary) => {
    if (!salary || !salary.amount) return 'Not specified';
    const amount = Number(salary.amount).toLocaleString();
    const period = SALARY_PERIOD_LABELS[salary.period] || '/month';
    return `${salary.currency || 'ETB'} ${amount}${period}`;
};

/**
 * Open a file served by an authenticated, non-public route (a candidate's CV,
 * an employer's verification document, ...) in a new tab.
 *
 * These routes require the caller's Bearer token, which a plain `<a href>` or
 * `window.open(url)` never sends - the browser's own navigation request has no
 * Authorization header, so it always came back 401 and looked like the file
 * had simply vanished. Fetching it through the `api` instance (which does
 * attach the token) and handing the browser a local blob URL instead is what
 * actually renders the file.
 */
export const openAuthenticatedFile = async (path) => {
    const res = await api.get(path, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(
        new Blob([res.data], { type: res.headers['content-type'] || 'application/octet-stream' })
    );
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
};

export default api;
