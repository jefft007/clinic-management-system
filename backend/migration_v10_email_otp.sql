-- =========================================================
-- Migration v10: Email-delivered OTP
-- Run this ONCE against your clinic_management database.
--
-- Patients still log in with their phone number (appointments
-- are keyed by patients.phone, so that doesn't change) — this
-- just lets the OTP itself be delivered by email instead of SMS,
-- which is free via the Gmail SMTP already configured for
-- password resets, instead of costing money per SMS.
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'otp_verifications';

-- channel: which way this OTP was actually sent ('sms' or 'email')
SET @columnname = 'channel';
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT ''sms''',
         ' COMMENT ''How this OTP was delivered: sms or email'''),
  'SELECT ''channel column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- email: the address it was sent to, when channel = 'email'
SET @columnname = 'email';
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN email VARCHAR(150) NULL DEFAULT NULL'),
  'SELECT ''email column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v10 complete.' AS result;
