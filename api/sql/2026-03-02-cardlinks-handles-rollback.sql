-- Rollback: remove per-handle attachment points from `cardlinks`
-- Restores uniqueness to one link per (from_card_id,to_card_id,style).
-- Safe to run multiple times (guards with INFORMATION_SCHEMA checks).

SET @db := DATABASE();

-- Drop the extended unique key if present
SET @has_uq := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cardlinks' AND INDEX_NAME = 'uq_cardlinks_unique'
);

SET @sql_drop_uq := IF(@has_uq > 0,
  'ALTER TABLE cardlinks DROP INDEX uq_cardlinks_unique',
  'SELECT 1'
);
PREPARE stmt FROM @sql_drop_uq;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Drop handle columns if present
SET @has_from := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cardlinks' AND COLUMN_NAME = 'from_handle'
);
SET @has_to := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cardlinks' AND COLUMN_NAME = 'to_handle'
);

SET @sql_drop_from := IF(@has_from > 0,
  'ALTER TABLE cardlinks DROP COLUMN from_handle',
  'SELECT 1'
);
PREPARE stmt FROM @sql_drop_from;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql_drop_to := IF(@has_to > 0,
  'ALTER TABLE cardlinks DROP COLUMN to_handle',
  'SELECT 1'
);
PREPARE stmt FROM @sql_drop_to;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Recreate original unique key
ALTER TABLE cardlinks
  ADD UNIQUE KEY uq_cardlinks_unique (from_card_id, to_card_id, style);

