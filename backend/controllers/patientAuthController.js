const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const { sendOtpEmail } = require("../utils/emailService");

const OTP_TTL_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const MAX_VERIFY_ATTEMPTS = 5;
const PURPOSE = "login";

const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "").slice(-10);

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// =====================================================
// REQUEST OTP
// =====================================================
// POST /api/patient/auth/request-otp
// Body: { phone }
// =====================================================

const requestOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone);

        if (phone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: "A valid 10-digit phone number is required"
            });
        }

        const email = req.body.email;
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "A valid email address is required"
            });
        }

        // Cooldown — don't let the same number spam OTP requests.
        const [recent] = await pool.execute(
            `
            SELECT created_at
            FROM otp_verifications
            WHERE phone = ? AND purpose = ?
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [phone, PURPOSE]
        );

        if (recent.length > 0) {
            const elapsedSeconds = (Date.now() - new Date(recent[0].created_at).getTime()) / 1000;
            if (elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
                return res.status(429).json({
                    success: false,
                    message: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds)}s before requesting another code`
                });
            }
        }

       const otp = generateOtp();
const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

// Send email first
const emailResult = await sendOtpEmail(email, otp);

if (!emailResult.sent) {
    console.error("OTP was not sent:", emailResult.message);

    return res.status(500).json({
        success: false,
        message: "Failed to send OTP email"
    });
}

// Save OTP only after email was successfully sent
await pool.execute(
    `
    INSERT INTO otp_verifications
    (phone, otp_code, purpose, expires_at, channel, email)
    VALUES (?, ?, ?, ?, 'email', ?)
    `,
    [phone, otp, PURPOSE, expiresAt, email]
);

        const response = {
            success: true,
            message: "OTP sent successfully to email",
            expires_in_seconds: OTP_TTL_MINUTES * 60
        };

        // Dev convenience only — never expose the code in production.
        if (process.env.NODE_ENV !== "production") {
            response.debug_otp = otp;
        }

        return res.status(200).json(response);

    } catch (error) {
        console.error("Request OTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to send OTP"
        });
    }
};

// =====================================================
// VERIFY OTP
// =====================================================
// POST /api/patient/auth/verify-otp
// Body: { phone, otp }
// =====================================================

const verifyOtp = async (req, res) => {
    try {
        const phone = normalizePhone(req.body.phone);
        const otp = String(req.body.otp || "").trim();

        if (phone.length !== 10 || !otp) {
            return res.status(400).json({
                success: false,
                message: "Phone and OTP are required"
            });
        }

        const [rows] = await pool.execute(
            `
            SELECT id, otp_code, attempts, expires_at, is_verified
            FROM otp_verifications
            WHERE phone = ? AND purpose = ?
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [phone, PURPOSE]
        );

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No OTP was requested for this number"
            });
        }

        const record = rows[0];

        if (record.is_verified) {
            return res.status(400).json({
                success: false,
                message: "This OTP has already been used. Please request a new one"
            });
        }

        if (new Date(record.expires_at).getTime() < Date.now()) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one"
            });
        }

        if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
            return res.status(429).json({
                success: false,
                message: "Too many incorrect attempts. Please request a new OTP"
            });
        }

        if (record.otp_code !== otp) {
            await pool.execute(
                `UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?`,
                [record.id]
            );

            return res.status(400).json({
                success: false,
                message: "Incorrect OTP"
            });
        }

        await pool.execute(
            `UPDATE otp_verifications SET is_verified = 1 WHERE id = ?`,
            [record.id]
        );

        // Any existing patient rows for this phone (one per clinic they've
        // visited) — handy for the app to prefill name on next booking.
        const [existingPatients] = await pool.execute(
            `
            SELECT patient_id, clinic_id, full_name, age, gender, place, address
            FROM patients
            WHERE phone = ?
            ORDER BY patient_id DESC
            LIMIT 1
            `,
            [phone]
        );

        const token = jwt.sign(
            {
                type: "patient",
                phone
            },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            token,
            phone,
            profile: existingPatients[0] || null
        });

    } catch (error) {
        console.error("Verify OTP error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to verify OTP"
        });
    }
};

module.exports = {
    requestOtp,
    verifyOtp
};
