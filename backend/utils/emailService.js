const nodemailer = require('nodemailer');

const createTransporter = () => {
    return nodemailer.createTransport({
       host: 'smtp.gmail.com',
port: 465,
secure: true,
        auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD
        }
    });
};

const sendResetEmail = async (toEmail, resetLink) => {
    if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return { sent: false, message: 'SMTP is not configured in .env' };
    }
    const transporter = createTransporter();
    const mailOptions = {
        from:    process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
        to:      toEmail,
        subject: 'ClinicSystem – Password Reset Link',
        text: `Hello,\n\nWe received a request to reset your ClinicSystem password.\n\nClick the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.\n\n– ClinicSystem Team`
    };
    try {
        await transporter.sendMail(mailOptions);
        return { sent: true, message: 'Email sent successfully' };
    } catch (err) {
        console.error('Email send error:', err);
        return { sent: false, message: err.message };
    }
};

const notifyAdminOfResetRequest = async (adminEmail, requesterName, requesterEmail) => {
    if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return { sent: false, message: 'SMTP is not configured' };
    }
    if (!adminEmail) return { sent: false, message: 'Admin email not provided' };

    const transporter = createTransporter();
    const mailOptions = {
        from:    process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
        to:      adminEmail,
        subject: 'ClinicSystem – New Password Reset Request',
        text: `Hello Admin,\n\n${requesterName || requesterEmail} (${requesterEmail}) has submitted a password reset request.\n\nPlease log in and go to Settings → Password Reset Requests to review and approve it.\n\n– ClinicSystem (automated notification)`
    };
    try {
        await transporter.sendMail(mailOptions);
        return { sent: true, message: 'Admin notified' };
    } catch (err) {
        console.error('Admin notify error:', err);
        return { sent: false, message: err.message };
    }
};

const sendOtpEmail = async (toEmail, otp) => {
    if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return { sent: false, message: 'SMTP is not configured in .env' };
    }
    const transporter = createTransporter();
    const mailOptions = {
        from:    process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
        to:      toEmail,
        subject: 'Your login code',
        text: `Your verification code is ${otp}. It expires in 5 minutes.\n\nIf you did not request this, you can safely ignore this email.`
    };
    try {
        await transporter.sendMail(mailOptions);
        return { sent: true, message: 'Email sent successfully' };
    } catch (err) {
        console.error('OTP email send error:', err);
        return { sent: false, message: err.message };
    }
};

module.exports = { sendResetEmail, notifyAdminOfResetRequest, sendOtpEmail };