-- =========================================================
-- Migration v9: Patient phone-OTP login
-- Run this ONCE against your clinic_management database.
--
-- Adds otp_verifications, used by the patient mobile app to
-- log in with phone + OTP instead of email/password. Patients
-- stay one row per clinic (unchanged) — this table just proves
-- "this phone number is who it says it is" so the app can issue
-- a JWT keyed on phone, and pull appointments across every
-- clinic that phone has booked with.
-- =========================================================

CREATE TABLE IF NOT EXISTS otp_verifications (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    phone         VARCHAR(20)  NOT NULL,
    otp_code      VARCHAR(10)  NOT NULL,
    purpose       VARCHAR(30)  NOT NULL DEFAULT 'login',
    is_verified   TINYINT(1)   NOT NULL DEFAULT 0,
    attempts      INT          NOT NULL DEFAULT 0,
    expires_at    DATETIME     NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_otp_phone_purpose (phone, purpose, created_at)
);

SELECT 'Migration v9 complete.' AS result;
