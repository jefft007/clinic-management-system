const crypto = require('crypto');
const pool   = require('../config/database');
const { sendResetEmail } = require('../utils/emailService');

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const getPendingRequests = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT
                prr.id, prr.user_id, prr.status, prr.requested_at, prr.reviewed_at,
                u.full_name, u.email, r.role_name, c.clinic_name
             FROM password_reset_requests prr
             JOIN users  u ON u.user_id  = prr.user_id
             JOIN roles  r ON r.role_id  = u.role_id
             LEFT JOIN clinics c ON c.clinic_id = u.clinic_id
             ORDER BY CASE WHEN prr.status = 'pending' THEN 0 ELSE 1 END, prr.requested_at DESC`
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
            `SELECT prr.id, prr.user_id, prr.status, u.email, u.full_name
             FROM password_reset_requests prr
             JOIN users u ON u.user_id = prr.user_id
             WHERE prr.id = ? LIMIT 1`,
            [requestId]
        );

        if (!rows.length) return res.status(404).json({ success: false, message: 'Request not found' });
        const request = rows[0];
        if (request.status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been processed' });

        await pool.query(`UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0`, [request.user_id]);

        const rawToken    = crypto.randomBytes(48).toString('hex');
        const hashedToken = hashToken(rawToken);
        const expiresAt   = new Date(Date.now() + 60 * 60 * 1000);

        await pool.query(`INSERT INTO password_resets (user_id, token, expires_at, used) VALUES (?, ?, ?, 0)`, [request.user_id, hashedToken, expiresAt]);
        await pool.query(`UPDATE password_reset_requests SET status = 'approved', reviewed_at = NOW() WHERE id = ?`, [requestId]);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink   = `${frontendUrl}/reset-password?token=${rawToken}`;

        const { sent, message: emailMsg } = await sendResetEmail(request.email, resetLink);

        if (!sent) {
            await pool.query(`UPDATE password_reset_requests SET status = 'pending', reviewed_at = NULL WHERE id = ?`, [requestId]);
            return res.status(500).json({ success: false, message: `Reset link was generated but email failed: ${emailMsg}` });
        }
        return res.status(200).json({ success: true, message: `Reset link sent to ${request.email}` });

    } catch (error) {
        console.error('Approve request error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const rejectRequest = async (req, res) => {
    try {
        const requestId = parseInt(req.params.id, 10);
        const [rows] = await pool.query(`SELECT id, status FROM password_reset_requests WHERE id = ? LIMIT 1`, [requestId]);

        if (!rows.length) return res.status(404).json({ success: false, message: 'Request not found' });
        if (rows[0].status !== 'pending') return res.status(400).json({ success: false, message: 'This request has already been processed' });

        await pool.query(`UPDATE password_reset_requests SET status = 'rejected', reviewed_at = NOW() WHERE id = ?`, [requestId]);
        return res.status(200).json({ success: true, message: 'Request rejected' });

    } catch (error) {
        console.error('Reject request error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = { getPendingRequests, approveRequest, rejectRequest };