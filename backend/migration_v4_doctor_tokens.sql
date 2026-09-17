-- =========================================================
-- Migration v4: Per-Doctor Weekly On-Site/Online Token Split
--               + Per-Date On-Site/Online Overrides
-- Run this ONCE against your clinic_management database.
--
-- 1) doctor_session_token_settings — same idea as the existing
--    clinic_session_token_settings table, but scoped to a single
--    doctor instead of the whole clinic. This is now the FIRST
--    place the on-site/online split is looked up for a given
--    doctor + day-of-week + session (see getOnsiteTokenLimit in
--    utils/availabilityHelper.js). Falls back to the clinic-wide
--    table, then clinics.onsite_token_limit, then 50/50, exactly
--    as before, when no doctor-specific row exists.
--
-- 2) doctor_availability.onsite_tokens_override /
--    online_tokens_override — lets clinic staff bump on-site or
--    online tokens up (or down) for one specific date, without
--    touching the doctor's weekly repeating template. NULL means
--    "use whatever the weekly template says" (unchanged behaviour).
-- =========================================================

CREATE TABLE IF NOT EXISTS doctor_session_token_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NOT NULL,
    day_of_week TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
    session ENUM('Morning','Evening') NOT NULL,
    total_tokens INT NOT NULL DEFAULT 0,
    onsite_tokens INT NOT NULL DEFAULT 0,
    online_tokens INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_doctor_day_session (doctor_id, day_of_week, session),
    CONSTRAINT fk_dsts_doctor FOREIGN KEY (doctor_id)
        REFERENCES doctors(doctor_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- doctor_availability.onsite_tokens_override
-- ---------------------------------------------------------
SET @dbname = DATABASE();
SET @tablename = 'doctor_availability';
SET @columnname = 'onsite_tokens_override';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN onsite_tokens_override INT NULL DEFAULT NULL',
         ' COMMENT ''Manual on-site token-count override for this date/session;',
         ' NULL = use the doctor/clinic weekly split'''),
  'SELECT ''onsite_tokens_override column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- doctor_availability.online_tokens_override
-- ---------------------------------------------------------
SET @columnname = 'online_tokens_override';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN online_tokens_override INT NULL DEFAULT NULL',
         ' COMMENT ''Manual online token-count override for this date/session;',
         ' NULL = use the doctor/clinic weekly split'''),
  'SELECT ''online_tokens_override column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v4 complete.' AS result;
