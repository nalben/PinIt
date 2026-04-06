-- 2026-04-06
-- Add per-card background color and per-user favorite card colors.

SET @cards_has_color := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards' AND COLUMN_NAME = 'color'
);
SET @sql_add_cards_color := IF(
  @cards_has_color > 0,
  'SELECT 1',
  'ALTER TABLE cards ADD COLUMN color CHAR(7) NULL AFTER image_path'
);
PREPARE stmt_add_cards_color FROM @sql_add_cards_color;
EXECUTE stmt_add_cards_color;
DEALLOCATE PREPARE stmt_add_cards_color;

CREATE TABLE IF NOT EXISTS user_card_color_favorites (
  user_id INT(10) UNSIGNED NOT NULL,
  color CHAR(7) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, color),
  KEY idx_user_card_color_favorites_user_id (user_id),
  CONSTRAINT fk_user_card_color_favorites_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
