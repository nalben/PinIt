CREATE TABLE IF NOT EXISTS shop_product_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shop_category_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shop_product_categories_slug (shop_category_id, slug),
  KEY idx_shop_product_categories_parent (shop_category_id),
  CONSTRAINT fk_shop_product_categories_parent
    FOREIGN KEY (shop_category_id) REFERENCES shop_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @shop_migration_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_products' AND COLUMN_NAME = 'subcategory_id') = 0,
  'ALTER TABLE shop_products ADD COLUMN subcategory_id INT UNSIGNED NULL AFTER category_id',
  'SELECT 1'
);
PREPARE shop_migration_stmt FROM @shop_migration_sql;
EXECUTE shop_migration_stmt;
DEALLOCATE PREPARE shop_migration_stmt;

SET @shop_migration_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_products' AND COLUMN_NAME = 'publication_date') = 0,
  'ALTER TABLE shop_products ADD COLUMN publication_date DATE NULL',
  'SELECT 1'
);
PREPARE shop_migration_stmt FROM @shop_migration_sql;
EXECUTE shop_migration_stmt;
DEALLOCATE PREPARE shop_migration_stmt;

SET @shop_migration_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_products' AND COLUMN_NAME = 'sales_count') = 0,
  'ALTER TABLE shop_products ADD COLUMN sales_count INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE shop_migration_stmt FROM @shop_migration_sql;
EXECUTE shop_migration_stmt;
DEALLOCATE PREPARE shop_migration_stmt;

SET @shop_migration_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_products' AND INDEX_NAME = 'idx_shop_products_subcategory') = 0,
  'ALTER TABLE shop_products ADD KEY idx_shop_products_subcategory (subcategory_id)',
  'SELECT 1'
);
PREPARE shop_migration_stmt FROM @shop_migration_sql;
EXECUTE shop_migration_stmt;
DEALLOCATE PREPARE shop_migration_stmt;

SET @shop_migration_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_products' AND CONSTRAINT_NAME = 'fk_shop_products_subcategory') = 0,
  'ALTER TABLE shop_products ADD CONSTRAINT fk_shop_products_subcategory FOREIGN KEY (subcategory_id) REFERENCES shop_product_categories(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE shop_migration_stmt FROM @shop_migration_sql;
EXECUTE shop_migration_stmt;
DEALLOCATE PREPARE shop_migration_stmt;
