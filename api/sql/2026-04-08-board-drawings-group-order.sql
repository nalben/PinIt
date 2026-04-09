-- 2026-04-08
-- Extend persisted board drawings with layer order and lightweight grouping.

ALTER TABLE boarddrawings
  ADD COLUMN sort_order INT(10) UNSIGNED NOT NULL DEFAULT 0 AFTER path_d,
  ADD COLUMN group_key CHAR(36) NULL AFTER sort_order;

UPDATE boarddrawings
SET sort_order = id
WHERE sort_order = 0;

ALTER TABLE boarddrawings
  ADD KEY idx_boarddrawings_board_sort (board_id, sort_order, id),
  ADD KEY idx_boarddrawings_board_group (board_id, group_key);
