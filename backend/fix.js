const fs = require('fs');

const authController = const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const pool    = require('../config/database');
const { generateToken }            = require('../utils/jwt');
const { sendResetEmail, notifyAdminOfResetRequest } = require('../utils/emailService');

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const identifier = (email || '').trim();

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Email/username and password are required' });
        }

        const [users] = await pool.query(
            \SELECT
                u.user_id,
                u.role_id,
                u.clinic_id,
                u.full_name,
                u.email,
                u.phone,
                u.password,
                u.designation,
                u.status,
                r.role_name,
                c.clinic_name
            FROM users u
            INNER JOIN roles r ON u.role_id = r.role_id
            LEFT JOIN clinics c ON u.clinic_id = c.clinic_id
            WHERE LOWER(u.email) = LOWER(?)
               OR LOWER(u.full_name) = LOWER(?)
            LIMIT 2\,
            [identifier, identifier]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid email/username or password' });
        }
        if (users.length > 1) {
            return res.status(409).json({ success: false, message: 'More than one account uses this username — please sign in with your email instead' });
        }

        const user = users[0];

        if (user.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'Your account is inactive' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email/username or password' });
        }

        const token = generateToken(user);
        delete user.password;

        return res.status(200).json({ success: true, message: 'Login successful', token, user });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const [users] = await pool.query(
            \SELECT user_id, role_id, full_name, email, status
             FROM users WHERE LOWER(email) = ? LIMIT 1\,
            [email]
        );

        if (!users.length || users[0].status !== 'Active') {
            return res.status(200).json({ success: true, message: 'If that email is registered, you will receive further instructions.' });
        }

        const user = users[0];

        if (user.role_id === 1) {
            const rawToken    = crypto.randomBytes(48).toString('hex');
            const hashedToken = hashToken(rawToken);
            const expiresAt   = new Date(Date.now() + 60 * 60 * 1000); 

            await pool.query(
                \UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0\,
                [user.user_id]
            );

            await pool.query(
                \INSERT INTO password_resets (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)\,
                [user.user_id, hashedToken, expiresAt]
            );

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const resetLink   = \\/reset-password?token=\\;

            const { sent, message: emailMsg } = await sendResetEmail(user.email, resetLink);
            if (!sent) console.error('Admin reset email failed:', emailMsg);

            return res.status(200).json({ success: true, message: 'A password reset link has been sent to your email address.' });
        }

        const [existing] = await pool.query(
            \SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending' LIMIT 1\,
            [user.user_id]
        );

        if (existing.length === 0) {
            await pool.query(
                \INSERT INTO password_reset_requests (user_id, status, requested_at) VALUES (?, 'pending', NOW())\,
                [user.user_id]
            );

            try {
                const [admins] = await pool.query(\SELECT email FROM users WHERE role_id = 1 AND status = 'Active' LIMIT 1\);
                if (admins.length) {
                    await notifyAdminOfResetRequest(admins[0].email, user.full_name, user.email);
                }
            } catch (notifyErr) {
                console.error('Admin notify error:', notifyErr);
            }
        }

        return res.status(200).json({ success: true, message: 'Your request has been submitted. The administrator will review it and send you a reset link shortly.' });

    } catch (error) {
        console.error('Forgot password error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) return res.status(400).json({ success: false, message: 'Token and new password are required' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const hashedToken = hashToken(token);
        const now         = new Date();

        const [rows] = await pool.query(
            \SELECT pr.id, pr.user_id FROM password_resets pr
             WHERE pr.token = ? AND pr.used = 0 AND pr.expires_at > ? LIMIT 1\,
            [hashedToken, now]
        );

        if (!rows.length) {
            return res.status(400).json({ success: false, message: 'This reset link is invalid or has expired. Please request a new one.' });
        }

        const { id: resetId, user_id } = rows[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(\UPDATE users SET password = ? WHERE user_id = ?\, [hashedPassword, user_id]);
        await pool.query(\UPDATE password_resets SET used = 1 WHERE id = ?\, [resetId]);

        return res.status(200).json({ success: true, message: 'Password updated successfully. You can now log in.' });

    } catch (error) {
        console.error('Reset password error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const validateResetToken = async (req, res) => {
    try {
        const token = (req.query.token || '').trim();
        if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

        const hashedToken = hashToken(token);
        const [rows] = await pool.query(
            \SELECT id FROM password_resets WHERE token = ? AND used = 0 AND expires_at > NOW() LIMIT 1\,
            [hashedToken]
        );

        if (!rows.length) return res.status(400).json({ success: false, valid: false, message: 'Invalid or expired token' });

        return res.status(200).json({ success: true, valid: true });

    } catch (error) {
        console.error('Validate token error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = { login, forgotPassword, resetPassword, validateResetToken };;

const passwordResetController = const crypto = require('crypto');
const pool   = require('../config/database');
const { sendResetEmail } = require('../utils/emailService');

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const getPendingRequests = async (req, res) => {
    try {
        const [rows] = await pool.query(
            \SELECT
                prr.id, prr.user_id, prr.status, prr.requested_at, prr.reviewed_at,
                u.full_name, u.email, r.role_name, c.clinic_name
             FROM password_reset_requests prr
             JOIN users  u ON u.user_id  = prr.user_id
             JOIN roles  r ON r.role_id  = u.role_id
             LEFT JOIN clinics c ON c.clinic_id = u.clinic_id
             ORDER BY CASE WHEN prr.status = 'pending' THEN 0 ELSE 1 END, prr.requested_at DESC\
        );
        return res.status(200).json({ success: true, requests: rows });
    } catch (error) {
        console.error('Get reset requests error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const approveRequest = async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const [rows] = await pool.query(
            \SELECT prr.id, prr.user_id, prr.status, u.email, u.full_name
             FROM password_reset_requests prr
             JOIN users u ON u.user_id = prr.user_id
             WHERE prr.id = ? LIMIT 1\,
            [requestId]
        );

        if (!rows.length) return res.status(404).json({ success: false, message: 'Request not found' });
        const request = rows[0];
        if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been processed' });

        await pool.query(\UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0\, [request.user_id]);

        const rawToken    = crypto.randomBytes(48).toString('hex');
        const hashedToken = hashToken(rawToken);
        const expiresAt   = new Date(Date.now() + 60 * 60 * 1000);

        await pool.query(\INSERT INTO password_resets (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)\, [request.user_id, hashedToken, expiresAt]);
        await pool.query(\UPDATE password_reset_requests SET status = 'approved', reviewed_at = NOW() WHERE id = ?\, [requestId]);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink   = \\/reset-password?token=\\;

        const { sent, message: emailMsg } = await sendResetEmail(request.email, resetLink);

        if (!sent) {
            await pool.query(\UPDATE password_reset_requests SET status = 'pending', reviewed_at = NULL WHERE id = ?\, [requestId]);
            return res.status(500).json({ success: false, message: \Reset link was generated but email failed: \\ });
        }
        return res.status(200).json({ success: true, message: \Reset link sent to \\ });

    } catch (error) {
        console.error('Approve request error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const rejectRequest = async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const [rows] = await pool.query(\SELECT id, status FROM password_reset_requests WHERE id = ? LIMIT 1\, [requestId]);

        if (!rows.length) return res.status(404).json({ success: false, message: 'Request not found' });
        if (rows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been processed' });

        await pool.query(\UPDATE password_reset_requests SET status = 'rejected', reviewed_at = NOW() WHERE id = ?\, [requestId]);
        return res.status(200).json({ success: true, message: 'Request rejected' });

    } catch (error) {
        console.error('Reject request error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = { getPendingRequests, approveRequest, rejectRequest };;

const emailService = const nodemailer = require('nodemailer');

const createTransporter = () => {
    return nodemailer.createTransport({
        host:   'smtp.gmail.com',
        port:   587,
        secure: false,
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
        text: \Hello,\\n\\nWe received a request to reset your ClinicSystem password.\\n\\nClick the link below to set a new password (valid for 1 hour):\\n\\n\\\n\\nIf you did not request this, you can safely ignore this email.\\n\\n– ClinicSystem Team\
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
        text: \Hello Admin,\\n\\n\ (\) has submitted a password reset request.\\n\\nPlease log in and go to Settings ? Password Reset Requests to review and approve it.\\n\\n– ClinicSystem (automated notification)\
    };
    try {
        await transporter.sendMail(mailOptions);
        return { sent: true, message: 'Admin notified' };
    } catch (err) {
        console.error('Admin notify error:', err);
        return { sent: false, message: err.message };
    }
};

module.exports = { sendResetEmail, notifyAdminOfResetRequest };;

fs.writeFileSync('controllers/authController.js', authController);
fs.writeFileSync('controllers/passwordResetController.js', passwordResetController);
fs.writeFileSync('utils/emailService.js', emailService);

console.log("Fixed files successfully!");
