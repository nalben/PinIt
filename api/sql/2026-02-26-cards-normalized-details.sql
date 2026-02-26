-- 2026-02-26
-- MariaDB 10.4.x
--
-- WARNING:
-- This script DROPS existing cards-related tables and recreates them.
-- Use only if the tables are empty or you are OK with losing their data.

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing FK from activitylog -> cards (if present) to avoid DROP TABLE `cards` errors.
-- In current DB it is usually named `activitylog_ibfk_3`.
SET @activitylog_cards_fk := (
  SELECT kcu.CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE kcu
  WHERE
    kcu.TABLE_SCHEMA = DATABASE()
    AND kcu.TABLE_NAME = 'activitylog'
    AND kcu.REFERENCED_TABLE_NAME = 'cards'
  LIMIT 1
);
SET @sql_drop_activitylog_cards_fk := IF(
  @activitylog_cards_fk IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE activitylog DROP FOREIGN KEY ', @activitylog_cards_fk)
);
PREPARE stmt_drop_activitylog_cards_fk FROM @sql_drop_activitylog_cards_fk;
EXECUTE stmt_drop_activitylog_cards_fk;
DEALLOCATE PREPARE stmt_drop_activitylog_cards_fk;

DROP TABLE IF EXISTS carddetail_checklist_items;
DROP TABLE IF EXISTS carddetail_fact_items;
DROP TABLE IF EXISTS carddetail_image_blocks;
DROP TABLE IF EXISTS carddetail_text_blocks;
DROP TABLE IF EXISTS carddetail_blocks;
DROP TABLE IF EXISTS carddetails;
DROP TABLE IF EXISTS cardlinks;

-- Legacy names (if they exist from earlier iterations)
DROP TABLE IF EXISTS cardcomments;

DROP TABLE IF EXISTS cards;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE cards (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id INT(10) UNSIGNED NOT NULL,
  type ENUM('circle', 'rectangle', 'diamond') NOT NULL,
  title VARCHAR(70) NULL,
  image_path VARCHAR(255) NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cards_board_id (board_id),
  CONSTRAINT fk_cards_board_id
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Restore activitylog -> cards FK (use SET NULL to preserve history on card deletion)
SET @activitylog_has_card_id := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activitylog' AND COLUMN_NAME = 'card_id'
);
SET @sql_activitylog_card_id_nullable := IF(
  @activitylog_has_card_id = 0,
  'SELECT 1',
  'ALTER TABLE activitylog MODIFY COLUMN card_id INT(10) UNSIGNED NULL'
);
PREPARE stmt_activitylog_card_id_nullable FROM @sql_activitylog_card_id_nullable;
EXECUTE stmt_activitylog_card_id_nullable;
DEALLOCATE PREPARE stmt_activitylog_card_id_nullable;

SET @activitylog_cards_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.KEY_COLUMN_USAGE kcu
  WHERE
    kcu.TABLE_SCHEMA = DATABASE()
    AND kcu.TABLE_NAME = 'activitylog'
    AND kcu.CONSTRAINT_NAME = 'activitylog_ibfk_3'
);
SET @sql_add_activitylog_cards_fk := IF(
  @activitylog_has_card_id = 0 OR @activitylog_cards_fk_exists > 0,
  'SELECT 1',
  'ALTER TABLE activitylog ADD CONSTRAINT activitylog_ibfk_3 FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL ON UPDATE RESTRICT'
);
PREPARE stmt_add_activitylog_cards_fk FROM @sql_add_activitylog_cards_fk;
EXECUTE stmt_add_activitylog_cards_fk;
DEALLOCATE PREPARE stmt_add_activitylog_cards_fk;

-- 1 card -> 1 details panel (metadata table kept for future panel-level fields)
CREATE TABLE carddetails (
  card_id INT(10) UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id),
  CONSTRAINT fk_carddetails_card_id
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Normalized blocks: each panel consists of ordered blocks of a specific type
CREATE TABLE carddetail_blocks (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  card_id INT(10) UNSIGNED NOT NULL,
  block_type ENUM('text', 'image', 'facts', 'checklist') NOT NULL,
  sort_order INT(10) UNSIGNED NOT NULL,
  heading VARCHAR(50) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carddetail_blocks_card_order (card_id, sort_order),
  KEY idx_carddetail_blocks_card_id (card_id),
  CONSTRAINT fk_carddetail_blocks_card_id
    FOREIGN KEY (card_id) REFERENCES carddetails(card_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Text block payload
CREATE TABLE carddetail_text_blocks (
  block_id INT(10) UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (block_id),
  CONSTRAINT fk_carddetail_text_blocks_block_id
    FOREIGN KEY (block_id) REFERENCES carddetail_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Image block payload
CREATE TABLE carddetail_image_blocks (
  block_id INT(10) UNSIGNED NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  caption VARCHAR(70) NULL,
  PRIMARY KEY (block_id),
  CONSTRAINT fk_carddetail_image_blocks_block_id
    FOREIGN KEY (block_id) REFERENCES carddetail_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Facts list items (for block_type='facts')
CREATE TABLE carddetail_fact_items (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  block_id INT(10) UNSIGNED NOT NULL,
  content VARCHAR(200) NOT NULL,
  sort_order INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carddetail_fact_items_block_order (block_id, sort_order),
  KEY idx_carddetail_fact_items_block_id (block_id),
  CONSTRAINT fk_carddetail_fact_items_block_id
    FOREIGN KEY (block_id) REFERENCES carddetail_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Checklist items (for block_type='checklist')
CREATE TABLE carddetail_checklist_items (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  block_id INT(10) UNSIGNED NOT NULL,
  content VARCHAR(200) NOT NULL,
  is_checked TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_carddetail_checklist_items_block_order (block_id, sort_order),
  KEY idx_carddetail_checklist_items_block_id (block_id),
  CONSTRAINT fk_carddetail_checklist_items_block_id
    FOREIGN KEY (block_id) REFERENCES carddetail_blocks(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Comments under a card (content length <= 100 enforced by VARCHAR(100))
CREATE TABLE cardcomments (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  card_id INT(10) UNSIGNED NOT NULL,
  user_id INT(10) UNSIGNED NOT NULL,
  content VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cardcomments_card_id (card_id),
  KEY idx_cardcomments_user_id (user_id),
  CONSTRAINT fk_cardcomments_card_id
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cardcomments_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Directed links between cards (for drawing lines/arrows on the board)
CREATE TABLE cardlinks (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id INT(10) UNSIGNED NOT NULL,
  from_card_id INT(10) UNSIGNED NOT NULL,
  to_card_id INT(10) UNSIGNED NOT NULL,
  style ENUM('line', 'arrow') NOT NULL DEFAULT 'line',
  color CHAR(7) NOT NULL DEFAULT '#000000',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cardlinks_unique (from_card_id, to_card_id, style),
  KEY idx_cardlinks_board_id (board_id),
  KEY idx_cardlinks_from_card_id (from_card_id),
  KEY idx_cardlinks_to_card_id (to_card_id),
  CONSTRAINT fk_cardlinks_board_id
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cardlinks_from_card_id
    FOREIGN KEY (from_card_id) REFERENCES cards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cardlinks_to_card_id
    FOREIGN KEY (to_card_id) REFERENCES cards(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
