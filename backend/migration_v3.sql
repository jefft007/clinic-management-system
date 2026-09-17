-- =========================================================
-- Migration v3: Manual Total-Tokens Override
-- Run this ONCE against your clinic_management database.
--
-- Adds doctor_availability.total_tokens — an explicit,
-- independently-stored capacity override for a specific
-- date+session. When NULL, capacity is still calculated as
-- (end_time - start_time) / average_consultation_minutes,
-- same as before. When set, it is used as-is, no matter what
-- average_consultation_minutes is — booking, the token grid,
-- and every "remaining tokens" count all read this value
-- directly, so there is no more lossy round-trip through
-- average_consultation_minutes to get a token count.
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'doctor_availability';
SET @columnname = 'total_tokens';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN total_tokens INT NULL DEFAULT NULL',
         ' COMMENT ''Manual token-capacity override for this date/session;',
         ' NULL = auto-calculated from (end_time-start_time)/average_consultation_minutes'''),
  'SELECT ''total_tokens column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v3 complete.' AS result;
