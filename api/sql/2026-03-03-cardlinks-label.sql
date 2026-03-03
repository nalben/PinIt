-- 2026-03-03
-- Add link label + label visibility flag for card links.
-- Note: `cardlinks.style` already represents arrow vs line.

ALTER TABLE cardlinks
  ADD COLUMN label VARCHAR(70) NULL AFTER color,
  ADD COLUMN is_label_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER label;

