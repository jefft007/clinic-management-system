-- ============================================================
-- Migration: Forgot Password feature
-- Run once against your clinic_management database
-- ============================================================

-- Table 1: stores pending reset requests from Clinic / Doctor roles
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    status        ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    requested_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at   DATETIME     DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Table 2: stores the actual one-time reset tokens (for ALL roles)
CREATE TABLE IF NOT EXISTS password_resets (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT           NOT NULL,
    token         VARCHAR(255)  NOT NULL UNIQUE,
    expires_at    DATETIME      NOT NULL,
    used          TINYINT(1)    NOT NULL DEFAULT 0,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
