-- =========================================================
-- Migration v8: Order-stable "Extra Tokens" log
-- Run this ONCE against your clinic_management database.
--
-- BUG THIS FIXES: extra_onsite_tokens / extra_online_tokens
-- (migration_v7) are plain running counts with no memory of WHICH
-- pool was topped up first. getTokenMap always numbered every
-- on-site extra before every online extra, no matter the real add
-- order. So: add 2 online tokens (they become day-numbers #41-#42)
-- then later add 2 on-site tokens -> the on-site ones grab #41-#42
-- and the online extras silently get pushed to #43-#44, even
-- though nothing should ever renumber an extra token once it
-- exists. Any booking already made on that online token then
-- stopped matching its tile (looked available on the grid, or a
-- different booking appeared to occupy it).
--
-- doctor_availability.extra_token_log — a JSON array recording
-- each "add extra tokens" action IN THE ORDER IT HAPPENED, e.g.
--   [{"pool":"walk_in","count":2},{"pool":"online","count":3}]
-- getTokenMap replays this list in order, so a batch always keeps
-- the day-numbers it was given, however many more batches (in
-- either pool) get added afterward.
--
-- extra_onsite_tokens / extra_online_tokens are kept as-is (still
-- used as the quick running totals for day-offset math); this log
-- is the additional source of truth for exact numbering order.
-- NULL means "no log yet" — getTokenMap falls back to treating the
-- existing extra_onsite_tokens/extra_online_tokens counts as one
-- legacy on-site-then-online batch, so numbers already shown to
-- staff before this migration do not shift.
-- =========================================================

SET @dbname = DATABASE();
SET @tablename = 'doctor_availability';
SET @columnname = 'extra_token_log';

SET @query = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME   = @tablename
     AND COLUMN_NAME  = @columnname) = 0,
  CONCAT('ALTER TABLE ', @tablename,
         ' ADD COLUMN extra_token_log JSON NULL DEFAULT NULL',
         ' COMMENT ''Ordered list of {pool,count} extra-token add actions; NULL = legacy (treat as one on-site-then-online batch)'''),
  'SELECT ''extra_token_log column already exists'' AS note'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration v8 complete.' AS result;
