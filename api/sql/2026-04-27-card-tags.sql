-- Add per-card tags for board cards.

CREATE TABLE IF NOT EXISTS cardtags (
  id INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  card_id INT(10) UNSIGNED NOT NULL,
  tag VARCHAR(24) NOT NULL,
  sort_order INT(10) UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cardtags_card_order (card_id, sort_order),
  UNIQUE KEY uq_cardtags_card_tag (card_id, tag),
  CONSTRAINT fk_cardtags_card
    FOREIGN KEY (card_id) REFERENCES cards(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
