const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/database');
const autoBackup = require('./services/autoBackup');

// ============================================
// ROUTE IMPORTS
// ============================================
// Core Routes
const authRoutes = require('./routes/auth');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const resumeRoutes = require('./routes/resumes');
const reportRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');
const candidateRoutes = require('./routes/candidates');
const interviewRoutes = require('./routes/interviews');
const publicRoutes = require('./routes/public');
const notificationRoutes = require('./routes/notifications');
const employerRoutes = require('./routes/employers');

// ============================================
// NEW HRM MODULE ROUTES
// ============================================
const configRoutes = require('./routes/config');
const employeeRoutes = require('./routes/employees');
const leaveRoutes = require('./routes/leaves');
const attendanceRoutes = require('./routes/attendance');
const trainingRoutes = require('./routes/training');
const complaintRoutes = require('./routes/complaints');
const delegationRoutes = require('./routes/delegations');
const requestRoutes = require('./routes/requests');

const app = express();

// Connect to database
connectDB();

// ============================================
// REQUIRED CONFIGURATION
// ============================================
// Without a signing secret every login would fail at the last step - after the
// password was already verified - with an unhelpful 500. Fail at boot instead.
if (!process.env.JWT_SECRET) {
    console.error('\n' + '='.repeat(70));
    console.error('FATAL: JWT_SECRET is not set - the server cannot sign login tokens.');
    console.error('='.repeat(70));
    console.error('Fix: copy backend/.env.example to backend/.env and set JWT_SECRET,');
    console.error('then restart the server.');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Allowed browser origins. Extra origins can be added through CORS_ORIGINS
// (comma separated). Outside production any localhost port is accepted, so a
// frontend that starts on 3001/3002 because 3000 was busy still reaches the API
// instead of failing every request - including login - as a CORS error.
const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    ...configuredOrigins
]);
const isLocalOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

app.use(cors({
    origin: (origin, callback) => {
        // Same-origin requests and tools such as curl send no Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (process.env.NODE_ENV !== 'production' && isLocalOrigin(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// RATE LIMITING
// ============================================
// The general limit protects against abuse only. It used to be 100 requests per
// 15 minutes for the whole API, which a single dashboard session exhausts in
// minutes - after that even a correct sign-in was rejected with a 429 that the
// UI could only report as "Login failed". Normal usage must never reach it.
const generalMax = Number(process.env.RATE_LIMIT_MAX) ||
    (process.env.NODE_ENV === 'production' ? 1000 : 5000);

// express-rate-limit answers with plain text by default; the frontend then had
// no `message` to show and fell back to "Login failed". Always answer in the
// same JSON shape as the rest of the API, and say when to retry.
const rateLimitResponse = (message) => (req, res, next, options) => {
    const resetTime = req.rateLimit?.resetTime;
    const seconds = resetTime
        ? Math.max(1, Math.ceil((new Date(resetTime).getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

    res.status(options.statusCode || 429).json({
        success: false,
        message: `${message} Please try again in ${Math.max(1, Math.ceil(seconds / 60))} minute(s).`
    });
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: generalMax,
    standardHeaders: true,
    legacyHeaders: false,
    // Health polling must never consume a user's request budget.
    skip: (req) => req.path === '/health',
    handler: rateLimitResponse('Too many requests from this device.')
});

// Sign-in throttle. Two properties keep it from blocking real users:
//  - only *failed* attempts are counted, so signing in repeatedly is free;
//  - the budget is per account per device, so one colleague mistyping a
//    password cannot lock out everyone else behind the same IP.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        return `${req.ip}|${email}`;
    },
    handler: rateLimitResponse('Too many failed sign-in attempts for this account.')
});

// Account creation and password-reset requests are abusive when they *succeed*,
// so unlike sign-in every request counts, and the budget is per device.
const accountLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.ACCOUNT_RATE_LIMIT_MAX) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitResponse('Too many account requests from this device.')
});

app.use('/api', apiLimiter);

// ============================================
// DATABASE READINESS GUARD
// ============================================
// If the connection drops after startup, Mongoose buffers queries for 10s and
// then throws, which surfaced as a generic "Login failed" after a long wait.
// Answering immediately with 503 makes the real cause visible.
app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (mongoose.connection.readyState === 1) return next();

    return res.status(503).json({
        success: false,
        message: 'The database is currently unreachable. Please check the server connection and try again in a moment.'
    });
});

// ============================================
// STATIC FILES FOR UPLOADS
// ============================================
// Resolved from the shared paths module so the folder Express serves is always
// the same folder multer writes to.
const { UPLOADS_ROOT, ensureUploadDirectories } = require('./config/paths');
console.log('📁 Serving static files from:', UPLOADS_ROOT);
app.use('/uploads', express.static(UPLOADS_ROOT));

// ============================================
// API ROUTES
// ============================================
// Core Routes
// The stricter throttles cover only the credential endpoints, so an expired
// token on /api/auth/me can never use up a user's sign-in budget.
app.use('/api/auth/login', loginLimiter);
app.use(['/api/auth/register', '/api/auth/forgotpassword'], accountLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/employers', employerRoutes);     // Employer / Organization Module

// ============================================
// HRM MODULE ROUTES
// ============================================
app.use('/api/config', configRoutes);           // Configuration Module
app.use('/api/employees', employeeRoutes);      // Employee Module
app.use('/api/leaves', leaveRoutes);            // Leave Module
app.use('/api/attendance', attendanceRoutes);   // Attendance Module
app.use('/api/training', trainingRoutes);       // Training Module
app.use('/api/complaints', complaintRoutes);    // Complaint Module
app.use('/api/delegations', delegationRoutes);  // Delegation Module
app.use('/api/requests', requestRoutes);        // Employee Request Module

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
    const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbConnected = mongoose.connection.readyState === 1;

    res.status(dbConnected ? 200 : 503).json({
        status: dbConnected ? 'OK' : 'DEGRADED',
        message: dbConnected ? 'Server is running' : 'Server is running but the database is unreachable',
        database: dbStates[mongoose.connection.readyState] || 'unknown',
        modules: {
            core: ['auth', 'jobs', 'applications', 'resumes', 'reports', 'upload', 'admin'],
            hrm: ['config', 'employees', 'leaves', 'attendance', 'training', 'complaints', 'delegations']
        }
    });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
    // A body express could not parse is bad client input, not a server crash.
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'The request body could not be read. Please try again.'
        });
    }

    // A blocked browser origin is a configuration problem, not a crash. Report it
    // clearly so it is not mistaken for "the server is down".
    if (err.message && err.message.includes('is not allowed by CORS')) {
        return res.status(403).json({
            success: false,
            message: `${err.message}. Add it to CORS_ORIGINS in backend/.env.`
        });
    }

    // A malformed ObjectId in a URL or body is bad client input, not a server
    // fault - report it as 400 instead of a misleading 500.
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path || 'identifier'} provided`
        });
    }

    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: Object.values(err.errors || {}).map(e => e.message).join(', ') || 'Validation failed'
        });
    }

    console.error('❌ Error:', err.stack);
    res.status(500).json({
        success: false,
        message: err.message || 'Something went wrong!'
    });
});

// ============================================
// CREATE UPLOADS DIRECTORIES
// ============================================
ensureUploadDirectories();

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📡 API URL: http://localhost:${PORT}/api`);
    console.log(`📁 Uploads directory: ${UPLOADS_ROOT}`);
    
    console.log(`\n📋 Core Modules:`);
    console.log(`   ✅ Authentication: /api/auth`);
    console.log(`   ✅ Jobs: /api/jobs`);
    console.log(`   ✅ Applications: /api/applications`);
    console.log(`   ✅ Resumes: /api/resumes`);
    console.log(`   ✅ Reports: /api/reports`);
    console.log(`   ✅ Upload: /api/upload`);
    console.log(`   ✅ Admin: /api/admin`);
    
    console.log(`\n📋 HRM Modules:`);
    console.log(`   ✅ Configuration: /api/config`);
    console.log(`   ✅ Employees: /api/employees`);
    console.log(`   ✅ Leave Management: /api/leaves`);
    console.log(`   ✅ Attendance: /api/attendance`);
    console.log(`   ✅ Training: /api/training`);
    console.log(`   ✅ Complaints: /api/complaints`);
    console.log(`   ✅ Delegations: /api/delegations`);

    autoBackup.start();
});

module.exports = app;