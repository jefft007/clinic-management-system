const nodemailer = require('nodemailer');

// =====================================================
// EXISTING WEB EMAIL SMTP
// Used for Admin / Doctor / Clinic password reset
// =====================================================

const createTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,   // STARTTLS — required by Render (port 465/SSL is blocked)
        auth: {
            user: process.env.SMTP_USERNAME,
            pass: process.env.SMTP_PASSWORD
        }
    });
};


// =====================================================
// PASSWORD RESET EMAIL
// =====================================================

const sendResetEmail = async (toEmail, resetLink) => {
    if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return {
            sent: false,
            message: 'SMTP is not configured in .env'
        };
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
        to: toEmail,
        subject: 'ClinicSystem – Password Reset Link',
        text: `Hello,

We received a request to reset your ClinicSystem password.

Click the link below to set a new password (valid for 1 hour):

${resetLink}

If you did not request this, you can safely ignore this email.

– ClinicSystem Team`
    };

    try {
        await transporter.sendMail(mailOptions);

        return {
            sent: true,
            message: 'Email sent successfully'
        };
    } catch (err) {
        console.error('Email send error:', err);

        return {
            sent: false,
            message: err.message
        };
    }
};


// =====================================================
// ADMIN PASSWORD RESET NOTIFICATION
// =====================================================

const notifyAdminOfResetRequest = async (
    adminEmail,
    requesterName,
    requesterEmail
) => {
    if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
        return {
            sent: false,
            message: 'SMTP is not configured'
        };
    }

    if (!adminEmail) {
        return {
            sent: false,
            message: 'Admin email not provided'
        };
    }

    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
        to: adminEmail,
        subject: 'ClinicSystem – New Password Reset Request',
        text: `Hello Admin,

${requesterName || requesterEmail} (${requesterEmail}) has submitted a password reset request.

Please log in and go to Settings → Password Reset Requests to review and approve it.

– ClinicSystem (automated notification)`
    };

    try {
        await transporter.sendMail(mailOptions);

        return {
            sent: true,
            message: 'Admin notified'
        };
    } catch (err) {
        console.error('Admin notify error:', err);

        return {
            sent: false,
            message: err.message
        };
    }
};


// =====================================================
// SEND PATIENT OTP  — Brevo transactional email API
// Uses BREVO_API_KEY and BREVO_SENDER_EMAIL env vars.
// Gmail SMTP is NOT used here; sendResetEmail() and
// notifyAdminOfResetRequest() above are unchanged.
// =====================================================

const sendOtpEmail = async (toEmail, otp) => {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
        return {
            sent: false,
            message: 'BREVO_API_KEY or BREVO_SENDER_EMAIL is not configured'
        };
    }

    const brevo = require('@getbrevo/brevo');
    const apiInstance = new brevo.TransactionalEmailsApi();
    apiInstance.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.sender = { email: process.env.BREVO_SENDER_EMAIL };
    sendSmtpEmail.to = [{ email: toEmail }];
    sendSmtpEmail.subject = 'Your ClinicSystem login code';
    sendSmtpEmail.textContent = `Your verification code is ${otp}. It expires in 5 minutes.`;

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`[OTP] Brevo email delivered to ${toEmail}`);
        return { sent: true, message: 'Email sent successfully' };
    } catch (err) {
        // Log only the error code/message, never the OTP or API key
        const detail = err?.response?.body?.message || err.message || 'Unknown error';
        console.error('[OTP] Brevo send error:', detail);
        return { sent: false, message: detail };
    }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    sendResetEmail,
    notifyAdminOfResetRequest,
    sendOtpEmail
};