/**
 * Outgoing mail.
 *
 * Every send goes through `deliver`, which returns a result instead of
 * throwing. Mail is a side effect of an action that has already been recorded -
 * a hiring decision, a password reset - and SMTP is frequently not configured
 * in development, so a failure here must never roll back or break the caller.
 * Each of these actions also raises an in-app notification, which is what the
 * user actually depends on.
 *
 * nodemailer is loaded defensively for the same reason: this module previously
 * required it at the top level while the package was not installed, which is
 * why nothing imported it - doing so would have stopped the server booting.
 *
 * Configuration is entirely environment-driven (never hard-coded to one
 * provider):
 *   EMAIL_ENABLED   - master switch; 'false' disables mail even if the rest
 *                      of the variables below are present.
 *   EMAIL_HOST/PORT - generic SMTP transport (any provider). When set, this
 *                      is used instead of the "service" shorthand below.
 *   EMAIL_SERVICE   - nodemailer's named-service shorthand (e.g. 'gmail'),
 *                      used only when EMAIL_HOST is not set. Kept for
 *                      backward compatibility with the existing setup.
 *   EMAIL_USER/PASSWORD - SMTP auth, required either way.
 *   EMAIL_FROM      - the "from" address shown to recipients; falls back to
 *                      EMAIL_USER so existing deployments need no changes.
 * None of these are ever sent to the frontend.
 */
let nodemailer = null;
try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
} catch (error) {
    console.warn('Email disabled: the nodemailer package is not installed.');
}

const isConfigured = () => {
    if (String(process.env.EMAIL_ENABLED).toLowerCase() === 'false') return false;
    return Boolean(nodemailer && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
};

let cached = null;
const getTransporter = () => {
    if (!isConfigured()) return null;
    if (!cached) {
        const auth = { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD };
        cached = process.env.EMAIL_HOST
            ? nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: Number(process.env.EMAIL_PORT) || 587,
                // Port 465 is implicitly TLS-from-the-start; every other port
                // (587, 25, ...) upgrades via STARTTLS instead.
                secure: Number(process.env.EMAIL_PORT) === 465,
                auth
            })
            : nodemailer.createTransport({
                service: process.env.EMAIL_SERVICE || 'gmail',
                auth
            });
    }
    return cached;
};

const deliver = async (mailOptions, label) => {
    const transporter = getTransporter();
    if (!transporter) {
        console.log(`Email skipped (${label}): email delivery is not configured.`);
        return { sent: false, reason: 'not_configured' };
    }
    try {
        await transporter.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USER, ...mailOptions });
        return { sent: true };
    } catch (error) {
        console.error(`Email failed (${label}): ${error.message}`);
        return { sent: false, reason: error.message };
    }
};

/** Whether outgoing mail is currently configured - safe to expose (no secrets), used to decide the "send credentials" checkbox default. */
exports.isEmailEnabled = isConfigured;

const shell = (title, body) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #2c3e8f;">${title}</h1>
        ${body}
        <hr style="border: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
    </div>
`;

/**
 * Invite a newly hired candidate to activate their employee account.
 *
 * Carries a one-time link, never a password: a password mailed in clear text
 * stays readable in the mailbox indefinitely.
 */
exports.sendEmployeeActivation = async ({ to, name, jobTitle, activationUrl }) =>
    deliver({
        to,
        subject: 'You have been hired - activate your employee account',
        html: shell('Congratulations 🎉', `
            <p>Dear <strong>${name}</strong>,</p>
            <p>You have been hired${jobTitle ? ` as <strong>${jobTitle}</strong>` : ''}.</p>
            <p>Activate your employee account to complete your profile and reach the employee portal:</p>
            <div style="text-align: center; margin: 25px 0;">
                <a href="${activationUrl}" style="background: #2c3e8f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Activate my account
                </a>
            </div>
            <p>This link expires in <strong>7 days</strong>. You will be asked to choose a password.</p>
            <p style="color:#888;font-size:12px;">If the button does not work, paste this into your browser:<br>${activationUrl}</p>
        `)
    }, 'employee activation');

/** Tell a candidate their application was unsuccessful. */
exports.sendApplicationRejected = async ({ to, name, jobTitle, reason }) =>
    deliver({
        to,
        subject: `Application update: ${jobTitle || 'your application'}`,
        html: shell('Application update', `
            <p>Dear <strong>${name}</strong>,</p>
            <p>Thank you for applying${jobTitle ? ` for <strong>${jobTitle}</strong>` : ''}. After careful
               consideration your application was not successful on this occasion.</p>
            ${reason ? `<p><strong>Feedback:</strong> ${reason}</p>` : ''}
            <p>Your profile stays on the platform, and you are welcome to apply for future vacancies.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/candidate/dashboard" style="color:#2c3e8f;">View your applications →</a></p>
        `)
    }, 'application rejected');

// Send welcome email
exports.sendWelcomeEmail = async (userEmail, userName) =>
    deliver({
        to: userEmail,
        subject: 'Welcome to KETARI!',
        html: shell('Welcome to KETARI! 🎉', `
            <p>Dear <strong>${userName}</strong>,</p>
            <p>Thank you for joining KETARI - the intelligent job matching and recruitment automation platform for the Sidama Innovation and Technology Agency.</p>
            <ul>
                <li>📝 Complete your profile</li>
                <li>📄 Upload your resume</li>
                <li>🔍 Browse available jobs</li>
                <li>📋 Apply for positions that match your skills</li>
            </ul>
            <p>Get started now: <a href="${process.env.FRONTEND_URL}/login" style="color: #2c3e8f;">Login to your account</a></p>
        `)
    }, 'welcome');

// Send application confirmation email
exports.sendApplicationConfirmation = async (userEmail, userName, jobTitle, companyName) => {
    const mailOptions = {
        to: userEmail,
        subject: `Application Confirmation: ${jobTitle}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e8f;">Application Submitted! ✅</h1>
                <p>Dear <strong>${userName}</strong>,</p>
                <p>Your application for <strong>${jobTitle}</strong> at <strong>${companyName || 'SITA'}</strong> has been successfully submitted.</p>
                <p>You will be notified when your application status changes.</p>
                <p><a href="${process.env.FRONTEND_URL}/candidate/dashboard" style="color: #2c3e8f;">Track your applications →</a></p>
                <hr style="border: 1px solid #eee;">
                <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
            </div>
        `
    };
    return deliver(mailOptions, 'legacy');
};

// Send interview invitation email
exports.sendInterviewInvitation = async (userEmail, userName, jobTitle, companyName, interviewDate, interviewLocation, notes) => {
    const mailOptions = {
        to: userEmail,
        subject: `Interview Invitation: ${jobTitle}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e8f;">Interview Invitation 🗓️</h1>
                <p>Dear <strong>${userName}</strong>,</p>
                <p>Congratulations! You have been shortlisted for an interview for the position of <strong>${jobTitle}</strong> at <strong>${companyName || 'SITA'}</strong>.</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p><strong>📅 Date:</strong> ${new Date(interviewDate).toLocaleDateString()}</p>
                    <p><strong>🕐 Time:</strong> ${new Date(interviewDate).toLocaleTimeString()}</p>
                    <p><strong>📍 Location:</strong> ${interviewLocation || 'To be confirmed'}</p>
                    ${notes ? `<p><strong>📝 Notes:</strong> ${notes}</p>` : ''}
                </div>
                <p>Please confirm your availability by replying to this email.</p>
                <p><a href="${process.env.FRONTEND_URL}/candidate/dashboard" style="color: #2c3e8f;">View application details →</a></p>
                <hr style="border: 1px solid #eee;">
                <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
            </div>
        `
    };
    return deliver(mailOptions, 'legacy');
};

// Send application status update email
exports.sendStatusUpdate = async (userEmail, userName, jobTitle, status, notes) => {
    const statusMessages = {
        pending: 'Your application is under review',
        reviewed: 'Your application has been reviewed',
        shortlisted: 'You have been shortlisted!',
        interviewed: 'Interview completed',
        offered: 'Congratulations! You have been offered the position!',
        rejected: 'We regret to inform you...'
    };

    const statusColors = {
        pending: '#f39c12',
        reviewed: '#3498db',
        shortlisted: '#27ae60',
        interviewed: '#2980b9',
        offered: '#27ae60',
        rejected: '#e74c3c'
    };

    const mailOptions = {
        to: userEmail,
        subject: `Application Status Update: ${jobTitle}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e8f;">Application Status Update 📋</h1>
                <p>Dear <strong>${userName}</strong>,</p>
                <p>Your application for <strong>${jobTitle}</strong> has been updated.</p>
                <div style="background: ${statusColors[status]}; color: white; padding: 10px 15px; border-radius: 8px; margin: 15px 0;">
                    <strong>New Status:</strong> ${status.charAt(0).toUpperCase() + status.slice(1)}
                </div>
                <p>${statusMessages[status] || 'Please check your dashboard for details.'}</p>
                ${notes ? `<p><strong>📝 Note from hr_expert:</strong> ${notes}</p>` : ''}
                <p><a href="${process.env.FRONTEND_URL}/candidate/dashboard" style="color: #2c3e8f;">View application →</a></p>
                <hr style="border: 1px solid #eee;">
                <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
            </div>
        `
    };
    return deliver(mailOptions, 'legacy');
};

// Send password reset email
exports.sendPasswordResetEmail = async (userEmail, userName, resetUrl) => {
    const mailOptions = {
        to: userEmail,
        subject: 'Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e8f;">Password Reset Request 🔐</h1>
                <p>Dear <strong>${userName}</strong>,</p>
                <p>We received a request to reset your password. Click the button below to set a new password:</p>
                <div style="text-align: center; margin: 25px 0;">
                    <a href="${resetUrl}" style="background: #2c3e8f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                        Reset Password
                    </a>
                </div>
                <p>This link will expire in <strong>10 minutes</strong>.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <hr style="border: 1px solid #eee;">
                <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
            </div>
        `
    };
    return deliver(mailOptions, 'legacy');
};

/** Tell an organization's owner the outcome of a System Administrator verification review. */
exports.sendEmployerVerificationResult = async ({ to, name, organizationName, status, reason }) => {
    const outcomes = {
        active: {
            subject: `${organizationName} is now verified`,
            heading: 'Organization verified ✅',
            body: `<p>Congratulations - <strong>${organizationName}</strong> has been verified and is now active.
                   You can publish vacancies and invite HR staff.</p>`
        },
        rejected: {
            subject: `${organizationName} verification was not approved`,
            heading: 'Verification not approved',
            body: `<p><strong>${organizationName}</strong>'s verification application was not approved.</p>
                   ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                   <p>You may correct the noted issues and resubmit.</p>`
        },
        suspended: {
            subject: `${organizationName} has been suspended`,
            heading: 'Organization suspended',
            body: `<p><strong>${organizationName}</strong> has been suspended.</p>
                   ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}`
        }
    };
    const outcome = outcomes[status];
    if (!outcome) return { sent: false, reason: 'unsupported_status' };

    return deliver({
        to,
        subject: outcome.subject,
        html: shell(outcome.heading, `
            <p>Dear <strong>${name}</strong>,</p>
            ${outcome.body}
            <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/employer/verification" style="color:#2c3e8f;">View your organization →</a></p>
        `)
    }, 'employer verification result');
};

/**
 * Notify an organization member their login account is ready (created, or
 * given a new organizational role) and how to log in.
 *
 * Carries a link to choose their own password, never the Employer-set
 * temporary one: mailing a password in clear text leaves it sitting
 * readable in the mailbox indefinitely (the same reasoning already applied
 * to sendEmployeeActivation above). The employee's account and role already
 * exist by the time this is sent - this email is informational, never the
 * thing that grants access.
 */
exports.sendAccountCredentials = async ({ to, employeeName, organizationName, role, loginUrl, setPasswordUrl, isNewAccount }) =>
    deliver({
        to,
        subject: isNewAccount
            ? `Your ${organizationName} account is ready`
            : `Your role at ${organizationName} has been updated`,
        html: shell(isNewAccount ? 'Account ready 🎉' : 'Role updated', `
            <p>Dear <strong>${employeeName}</strong>,</p>
            <p>${isNewAccount
                ? `An account has been created for you at <strong>${organizationName}</strong>.`
                : `Your role at <strong>${organizationName}</strong> has changed.`}</p>
            <table style="width:100%; border-collapse: collapse; margin: 15px 0;">
                <tr><td style="padding:4px 0; color:#888;">Organization</td><td style="padding:4px 0;"><strong>${organizationName}</strong></td></tr>
                <tr><td style="padding:4px 0; color:#888;">Role</td><td style="padding:4px 0;"><strong>${role}</strong></td></tr>
                <tr><td style="padding:4px 0; color:#888;">Login email</td><td style="padding:4px 0;"><strong>${to}</strong></td></tr>
            </table>
            <div style="text-align: center; margin: 25px 0;">
                <a href="${setPasswordUrl}" style="background: #2c3e8f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Set up my password
                </a>
            </div>
            <p>This link expires in <strong>7 days</strong>. Use it to choose your own password before signing in for the first time.</p>
            <p>Once set, sign in any time at <a href="${loginUrl}" style="color:#2c3e8f;">${loginUrl}</a> with the email address above.</p>
            <p style="color:#888;font-size:12px;">If the button does not work, paste this into your browser:<br>${setPasswordUrl}</p>
        `)
    }, 'account credentials');

/**
 * Notify an existing organization member they have been made a Department
 * Head.
 *
 * Unlike sendAccountCredentials above, this never touches a password or
 * login token: a Department Head is always an already-active account (the
 * departments validator in configController only accepts an existing,
 * active member of the organization), so there is no credential to set up -
 * only a new responsibility to be informed about.
 */
exports.sendDepartmentHeadAssigned = async ({ to, name, organizationName, departmentName, loginUrl }) =>
    deliver({
        to,
        subject: `You are now the Department Head of ${departmentName}`,
        html: shell('New responsibility 🏢', `
            <p>Dear <strong>${name}</strong>,</p>
            <p>You have been assigned as the <strong>Department Head</strong> of
               <strong>${departmentName}</strong> at <strong>${organizationName}</strong>.</p>
            <p>As Department Head you may raise Job Requisitions on behalf of this department and
               review its staffing and recruitment status.</p>
            <p><a href="${loginUrl}" style="color:#2c3e8f;">Sign in to your account →</a></p>
        `)
    }, 'department head assigned');