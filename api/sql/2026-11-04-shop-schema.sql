-- 2026-11-04
-- Создать таблицы для магазина (категории, товары, изображения)

CREATE TABLE IF NOT EXISTS shop_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  subcategory_id INT UNSIGNED DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  publication_date DATE DEFAULT NULL,
  sales_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shop_product_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_category_id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shop_product_categories_slug (shop_category_id, slug),
  KEY idx_shop_product_categories_parent (shop_category_id),
  CONSTRAINT fk_shop_product_categories_parent FOREIGN KEY (shop_category_id) REFERENCES shop_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shop_product_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  image_path VARCHAR(500) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE shop_products ADD CONSTRAINT fk_shop_products_category FOREIGN KEY (category_id) REFERENCES shop_categories(id) ON DELETE CASCADE;
ALTER TABLE shop_products ADD CONSTRAINT fk_shop_products_subcategory FOREIGN KEY (subcategory_id) REFERENCES shop_product_categories(id) ON DELETE SET NULL;
ALTER TABLE shop_product_images ADD CONSTRAINT fk_shop_product_images_product FOREIGN KEY (product_id) REFERENCES shop_products(id) ON DELETE CASCADE;