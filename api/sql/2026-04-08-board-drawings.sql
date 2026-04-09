-- 2026-04-08
-- Add persisted SVG-path board drawings for collaborative freehand annotations.

CREATE TABLE IF NOT EXISTS boarddrawings (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  board_id INT(10) UNSIGNED NOT NULL,
  user_id INT(10) UNSIGNED NOT NULL,
  color CHAR(7) NOT NULL,
  stroke_width DECIMAL(6,2) NOT NULL,
  path_d MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_boarddrawings_board_id (board_id),
  KEY idx_boarddrawings_user_id (user_id),
  CONSTRAINT fk_boarddrawings_board_id
    FOREIGN KEY (board_id) REFERENCES boards(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_boarddrawings_user_id
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
