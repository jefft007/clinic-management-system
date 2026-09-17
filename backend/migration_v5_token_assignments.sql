-- =========================================================
-- Migration v5: Pick specific token NUMBERS for On-Site vs
--               Online (not just counts) on the weekly template
-- Run this ONCE against your clinic_management database.
--
-- doctor_session_token_settings.token_assignments — a JSON array,
-- one entry per token position in chronological order for that
-- day+session (position 1 = the first token of the session, etc).
-- Each entry is either "onsite" or "online". Example for an
-- 8-token session where staff picked #1,#2,#4,#7 as On-Site:
--   ["onsite","onsite","online","onsite","online","online","onsite","online"]
--
-- NULL means "no specific picks saved yet — fall back to the old
-- count-based split (first N tokens On-Site, rest Online)", so
-- clinics that saved settings before this migration keep working
-- exactly as before until they open Booking Settings and save again.
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'doctor_session_token_settings';
SET @columnname = 'token_assignments';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN token_assignments JSON NULL DEFAULT NULL',
         ' COMMENT ''Per-position onsite/online pick list; NULL = use the count-based split'''),
  'SELECT ''token_assignments column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v5 complete.' AS result;
