-- =========================================================
-- Migration v7: Append-Only "Extra Tokens" for a Date/Session
-- Run this ONCE against your clinic_management database.
--
-- doctor_availability.extra_onsite_tokens / extra_online_tokens
-- let clinic staff add MORE capacity to a specific date/session
-- from the Token Booking screen itself, without disturbing any
-- token number that already exists (booked or not).
--
-- Unlike onsite_tokens_override / online_tokens_override (which
-- REPLACE the whole day's split and can shift every token after
-- the change), these two columns are always ADDED ON TOP, at the
-- very end of that day's existing numbering. Example: a day's
-- last token today is #40 (online). Adding 5 on-site tokens gives
-- new on-site tokens #41-#45 — #1-#40 (on-site or online) keep
-- their exact existing numbers.
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'doctor_availability';

-- ---------------------------------------------------------
-- doctor_availability.extra_onsite_tokens
-- ---------------------------------------------------------
SET @columnname = 'extra_onsite_tokens';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN extra_onsite_tokens INT NOT NULL DEFAULT 0',
         ' COMMENT ''Extra on-site tokens appended after this date/session''''s',
         ' existing numbering — never shifts any existing token'''),
  'SELECT ''extra_onsite_tokens column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------
-- doctor_availability.extra_online_tokens
-- ---------------------------------------------------------
SET @columnname = 'extra_online_tokens';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN extra_online_tokens INT NOT NULL DEFAULT 0',
         ' COMMENT ''Extra online tokens appended after this date/session''''s',
         ' existing numbering — never shifts any existing token'''),
  'SELECT ''extra_online_tokens column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v7 complete.' AS result;
