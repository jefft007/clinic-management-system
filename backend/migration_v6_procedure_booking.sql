-- =========================================================
-- Migration v6: Multi-token ("procedure") booking
-- Run this ONCE against your clinic_management database.
--
-- Lets clinic staff book several tokens for the SAME patient in one
-- action (e.g. a procedure that spans multiple consultation slots).
-- All tokens created together share the same booking_group_id (a
-- UUID) so the Book Token / Appointments screens can highlight them
-- as one linked group, distinct from ordinary single-token bookings.
--
-- booking_group_id  — NULL for normal single-token bookings; a UUID
--                      shared by every token in a multi-token booking.
-- procedure_note     — optional free-text reason clinic staff can
--                      attach to a multi-token booking (e.g. "Dressing
--                      procedure", "Minor surgery follow-up").
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'appointments';

-- booking_group_id
SET @columnname = 'booking_group_id';
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN booking_group_id CHAR(36) NULL DEFAULT NULL',
         ' COMMENT ''Shared UUID linking every token in a multi-token (procedure) booking; NULL for ordinary single-token bookings'''),
  'SELECT ''booking_group_id column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- procedure_note
SET @columnname = 'procedure_note';
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN procedure_note VARCHAR(255) NULL DEFAULT NULL',
         ' COMMENT ''Optional reason/description for a multi-token (procedure) booking'''),
  'SELECT ''procedure_note column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for group lookups (fetching/cancelling every token in a group)
SET @indexname = 'idx_appointments_booking_group';
SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND INDEX_NAME    = @indexname) = 0,
  CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, ' (booking_group_id)'),
  'SELECT ''idx_appointments_booking_group index already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v6 complete.' AS result;
