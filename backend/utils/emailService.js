const nodemailer = require('nodemailer');

// =====================================================
// EXISTING WEB EMAIL SMTP
// Used for Admin / Doctor / Clinic password reset
// =====================================================

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
// PATIENT OTP SMTP
// Uses a SEPARATE Gmail account
// =====================================================

const createPatientOtpTransporter = () => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.PATIENT_SMTP_USERNAME,
            pass: process.env.PATIENT_SMTP_PASSWORD
        }
    });
};


// =====================================================
// SEND PATIENT OTP
// =====================================================

const sendOtpEmail = async (toEmail, otp) => {
    if (
        !process.env.PATIENT_SMTP_USERNAME ||
        !process.env.PATIENT_SMTP_PASSWORD
    ) {
        return {
            sent: false,
            message: 'Patient SMTP is not configured'
        };
    }

    const transporter = createPatientOtpTransporter();

    const mailOptions = {
        from: `ClinicSystem <${process.env.PATIENT_SMTP_USERNAME}>`,
        to: toEmail,
        subject: 'Your ClinicSystem Login OTP',
        text: `Hello,

Your ClinicSystem verification code is:

${otp}

This OTP will expire in 5 minutes.

If you did not request this code, you can safely ignore this email.

– ClinicSystem Team`
    };

    try {
        await transporter.sendMail(mailOptions);

        console.log(`Patient OTP email sent successfully to ${toEmail}`);

        return {
            sent: true,
            message: 'OTP email sent successfully'
        };
    } catch (err) {
        console.error('Patient OTP email error:', err.message);

        return {
            sent: false,
            message: err.message
        };
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