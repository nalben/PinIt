-- Seed and reactivate the storefront sections. Safe to re-run.

INSERT INTO shop_categories (name, slug, description, is_active) VALUES
  ('Leather Work', 'leather-goods', 'Small-batch leather goods, shaped slowly and finished by hand.', 1),
  ('Warhammer Art', 'warhammer-art', 'Original illustrations, character studies and scenes of dark legend.', 1),
  ('Comics Art', 'comic-art', 'Character prints, original artwork and graphic studies.', 1),
  ('3D Printing', '3d-models', 'Miniatures, busts, sculptures and architectural models.', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = 1;
