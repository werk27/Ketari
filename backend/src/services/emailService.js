const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Send welcome email
exports.sendWelcomeEmail = async (userEmail, userName) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: userEmail,
        subject: 'Welcome to KETARI!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #2c3e8f;">Welcome to KETARI! 🎉</h1>
                <p>Dear <strong>${userName}</strong>,</p>
                <p>Thank you for joining KETARI - the intelligent job matching and recruitment automation platform for the Sidama Innovation and Technology Agency.</p>
                <p>Here's what you can do next:</p>
                <ul>
                    <li>📝 Complete your profile</li>
                    <li>📄 Upload your resume</li>
                    <li>🔍 Browse available jobs</li>
                    <li>📋 Apply for positions that match your skills</li>
                </ul>
                <p>Get started now: <a href="${process.env.FRONTEND_URL}/login" style="color: #2c3e8f;">Login to your account</a></p>
                <hr style="border: 1px solid #eee;">
                <p style="color: #888; font-size: 12px;">© ${new Date().getFullYear()} KETARI - Sidama Innovation and Technology Agency</p>
            </div>
        `
    };
    await transporter.sendMail(mailOptions);
};

// Send application confirmation email
exports.sendApplicationConfirmation = async (userEmail, userName, jobTitle, companyName) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
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
    await transporter.sendMail(mailOptions);
};

// Send interview invitation email
exports.sendInterviewInvitation = async (userEmail, userName, jobTitle, companyName, interviewDate, interviewLocation, notes) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
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
    await transporter.sendMail(mailOptions);
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
        from: process.env.EMAIL_USER,
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
    await transporter.sendMail(mailOptions);
};

// Send password reset email
exports.sendPasswordResetEmail = async (userEmail, userName, resetUrl) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
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
    await transporter.sendMail(mailOptions);
};