-- =========================================================
-- Migration v2: Doctor Regular Schedule + Override Support
-- Run this ONCE against your clinic_management database.
-- =========================================================

-- 1. Add is_override column to doctor_availability
--    (using IGNORE to skip if already exists)
SET @dbname = DATABASE();
SET @tablename = 'doctor_availability';
SET @columnname = 'is_override';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN is_override TINYINT(1) NOT NULL DEFAULT 0',
         ' COMMENT ''1 = manually edited by clinic/doctor; will not be overwritten by lazy-load'''),
  'SELECT ''is_override column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Create the regular schedule template table
CREATE TABLE IF NOT EXISTS doctor_regular_schedule (
  schedule_id                  INT            NOT NULL AUTO_INCREMENT,
  doctor_id                    INT            NOT NULL,
  day_of_week                  TINYINT        NOT NULL COMMENT '0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat',
  session                      ENUM('Morning','Evening') NOT NULL,
  start_time                   TIME           NOT NULL,
  end_time                     TIME           NOT NULL,
  average_consultation_minutes INT            NOT NULL DEFAULT 10,
  created_at                   TIMESTAMP      NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (schedule_id),
  UNIQUE KEY uq_doctor_day_session (doctor_id, day_of_week, session),
  CONSTRAINT fk_drs_doctor
    FOREIGN KEY (doctor_id) REFERENCES doctors (doctor_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration v2 complete.' AS result;
