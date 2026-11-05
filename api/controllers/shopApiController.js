const fs = require('fs');
const path = require('path');
const db = require('../db');
const { UPLOADS_DIR } = require('../utils/runtimePaths');

const positiveId = value => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseActive = value => {
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  return null;
};

const normalizeSlug = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9а-яё]+/gi, '-')
  .replace(/^-+|-+$/g, '');

const parseDateOnly = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : null;
};

const isValidSalesCount = value => {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= 4294967295;
};

const loadProduct = async (id, activeOnly = false) => {
  const [rows] = await db.execute(
    `SELECT p.id, p.category_id, p.subcategory_id, p.title, p.description, p.price,
            DATE_FORMAT(p.publication_date, '%Y-%m-%d') AS publication_date,
            p.sales_count, p.is_active,
            p.created_at, p.updated_at, c.name AS category_name, pc.name AS subcategory_name
     FROM shop_products p
     LEFT JOIN shop_categories c ON c.id = p.category_id
     LEFT JOIN shop_product_categories pc ON pc.id = p.subcategory_id
     WHERE p.id = ? ${activeOnly ? 'AND p.is_active = 1' : ''}
     LIMIT 1`,
    [id]
  );
  if (!rows.length) return null;

  const [images] = await db.execute(
    `SELECT id, image_path, is_primary, sort_order
     FROM shop_product_images
     WHERE product_id = ?
     ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    [id]
  );

  return { ...rows[0], images };
};

const loadProductImages = async productIds => {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(', ');
  const [images] = await db.execute(
    `SELECT id, product_id, image_path, is_primary, sort_order
     FROM shop_product_images
     WHERE product_id IN (${placeholders})
     ORDER BY is_primary DESC, sort_order ASC, id ASC`,
    productIds
  );
  const imagesByProduct = new Map();
  for (const image of images) {
    const items = imagesByProduct.get(image.product_id) || [];
    items.push(image);
    imagesByProduct.set(image.product_id, items);
  }
  return imagesByProduct;
};

const removeUploadedFile = async filename => {
  if (!filename || path.basename(filename) !== filename) return;
  try {
    await fs.promises.unlink(path.join(UPLOADS_DIR, filename));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const getAllCategories = async (req, res) => {
  try {
    const [categories] = await db.execute(
      `SELECT id, name, slug, description, is_active, created_at, updated_at
       FROM shop_categories
       WHERE is_active = 1
       ORDER BY name ASC`
    );
    return res.json(categories);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось загрузить категории' });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const categoryId = req.query.category_id === undefined
      ? null
      : positiveId(req.query.category_id);
    const subcategoryId = req.query.subcategory_id === undefined
      ? null
      : positiveId(req.query.subcategory_id);
    if (req.query.category_id !== undefined && !categoryId) {
      return res.status(400).json({ message: 'Некорректный идентификатор категории' });
    }
    if (req.query.subcategory_id !== undefined && !subcategoryId) {
      return res.status(400).json({ message: 'Некорректный идентификатор подкатегории' });
    }

    const params = [];
    let categoryFilter = '';
    if (categoryId) {
      categoryFilter = 'AND p.category_id = ?';
      params.push(categoryId);
    }
    if (subcategoryId) {
      categoryFilter += ' AND p.subcategory_id = ?';
      params.push(subcategoryId);
    }

    const [products] = await db.execute(
      `SELECT p.id, p.category_id, p.subcategory_id, p.title, p.description, p.price,
              DATE_FORMAT(p.publication_date, '%Y-%m-%d') AS publication_date,
              p.sales_count, p.is_active,
              p.created_at, p.updated_at, c.name AS category_name, pc.name AS subcategory_name
       FROM shop_products p
       LEFT JOIN shop_categories c ON c.id = p.category_id
       LEFT JOIN shop_product_categories pc ON pc.id = p.subcategory_id
       WHERE p.is_active = 1 AND c.is_active = 1 ${categoryFilter}
       ORDER BY p.publication_date DESC, p.created_at DESC, p.id DESC`,
      params
    );
    const imagesByProduct = await loadProductImages(products.map(product => product.id));
    return res.json(products.map(product => ({
      ...product,
      images: imagesByProduct.get(product.id) || [],
    })));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось загрузить товары' });
  }
};

const getProductById = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор товара' });

    const product = await loadProduct(id, true);
    if (!product || Number(product.is_active) !== 1) {
      return res.status(404).json({ message: 'Товар не найден' });
    }
    return res.json(product);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось загрузить товар' });
  }
};

const getCurrentAccount = async (req, res) => {
  try {
    const userId = positiveId(req.user?.id);
    if (!userId) return res.status(401).json({ message: 'Не авторизован' });

    const [rows] = await db.execute(
      'SELECT id, username, nickname, role FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Аккаунт не найден' });

    const account = rows[0];
    return res.json({ ...account, isAdmin: account.role === 'admin' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось проверить аккаунт' });
  }
};

const getProductSubcategories = async (req, res) => {
  try {
    const categoryId = positiveId(req.params.id);
    if (!categoryId) return res.status(400).json({ message: 'Некорректный идентификатор раздела' });
    const [rows] = await db.execute(
      `SELECT id, shop_category_id, name, slug, created_at, updated_at
       FROM shop_product_categories
       WHERE shop_category_id = ?
       ORDER BY name ASC, id ASC`,
      [categoryId]
    );
    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось загрузить категории товаров' });
  }
};

const createProductSubcategory = async (req, res) => {
  try {
    const categoryId = positiveId(req.params.id);
    const name = String(req.body?.name || '').trim();
    const slug = normalizeSlug(req.body?.slug || name);
    if (!categoryId || !name || name.length > 255 || !slug || slug.length > 255) {
      return res.status(400).json({ message: 'Укажите название категории товаров' });
    }
    const [categories] = await db.execute(
      'SELECT id FROM shop_categories WHERE id = ? AND is_active = 1 LIMIT 1',
      [categoryId]
    );
    if (!categories.length) return res.status(404).json({ message: 'Раздел магазина не найден' });
    const [result] = await db.execute(
      'INSERT INTO shop_product_categories (shop_category_id, name, slug) VALUES (?, ?, ?)',
      [categoryId, name, slug]
    );
    const [rows] = await db.execute(
      'SELECT id, shop_category_id, name, slug, created_at, updated_at FROM shop_product_categories WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Такая категория товаров уже существует в этом разделе' });
    }
    return res.status(500).json({ message: 'Не удалось создать категорию товаров' });
  }
};

const updateProductSubcategory = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор категории товаров' });
    const updates = [];
    const values = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 255) return res.status(400).json({ message: 'Некорректное название категории товаров' });
      updates.push('name = ?');
      values.push(name);
    }
    if (req.body?.slug !== undefined) {
      const slug = normalizeSlug(req.body.slug);
      if (!slug || slug.length > 255) return res.status(400).json({ message: 'Некорректный код категории товаров' });
      updates.push('slug = ?');
      values.push(slug);
    }
    if (!updates.length) return res.status(400).json({ message: 'Нет полей для обновления' });
    values.push(id);
    const [result] = await db.execute(
      `UPDATE shop_product_categories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Категория товаров не найдена' });
    const [rows] = await db.execute(
      'SELECT id, shop_category_id, name, slug, created_at, updated_at FROM shop_product_categories WHERE id = ?',
      [id]
    );
    return res.json(rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Такая категория товаров уже существует в этом разделе' });
    }
    return res.status(500).json({ message: 'Не удалось обновить категорию товаров' });
  }
};

const deleteProductSubcategory = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор категории товаров' });
    const [result] = await db.execute('DELETE FROM shop_product_categories WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Категория товаров не найдена' });
    return res.json({ id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось удалить категорию товаров' });
  }
};

const createCategory = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const slug = String(req.body?.slug || '').trim();
    const description = req.body?.description == null ? null : String(req.body.description).trim();
    if (!name || !slug || name.length > 255 || slug.length > 255) {
      return res.status(400).json({ message: 'Укажите название и slug категории (до 255 символов)' });
    }

    const [result] = await db.execute(
      'INSERT INTO shop_categories (name, slug, description) VALUES (?, ?, ?)',
      [name, slug, description || null]
    );
    const [rows] = await db.execute(
      'SELECT id, name, slug, description, is_active, created_at, updated_at FROM shop_categories WHERE id = ?',
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Категория с таким slug уже существует' });
    }
    return res.status(500).json({ message: 'Не удалось создать категорию' });
  }
};

const updateCategory = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор категории' });
    const [existingRows] = await db.execute(
      'SELECT id FROM shop_categories WHERE id = ? LIMIT 1',
      [id]
    );
    if (!existingRows.length) return res.status(404).json({ message: 'Категория не найдена' });

    const updates = [];
    const values = [];
    for (const field of ['name', 'slug', 'description']) {
      if (req.body?.[field] === undefined) continue;
      const value = req.body[field] === null ? null : String(req.body[field]).trim();
      if (field !== 'description' && (!value || value.length > 255)) {
        return res.status(400).json({ message: 'Некорректное название или slug категории' });
      }
      updates.push(`${field} = ?`);
      values.push(value || null);
    }
    if (req.body?.is_active !== undefined) {
      const active = parseActive(req.body.is_active);
      if (active === null) return res.status(400).json({ message: 'Некорректный статус категории' });
      updates.push('is_active = ?');
      values.push(active);
    }
    if (!updates.length) return res.status(400).json({ message: 'Нет полей для обновления' });

    values.push(id);
    await db.execute(
      `UPDATE shop_categories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    const [rows] = await db.execute(
      'SELECT id, name, slug, description, is_active, created_at, updated_at FROM shop_categories WHERE id = ?',
      [id]
    );
    return res.json(rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Категория с таким slug уже существует' });
    }
    return res.status(500).json({ message: 'Не удалось обновить категорию' });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор категории' });

    const [products] = await db.execute(
      'SELECT id FROM shop_products WHERE category_id = ?',
      [id]
    );
    const imagesByProduct = await loadProductImages(products.map(product => product.id));
    const filenames = Array.from(imagesByProduct.values()).flat().map(image => image.image_path);
    const [result] = await db.execute('DELETE FROM shop_categories WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Категория не найдена' });

    for (const filename of filenames) await removeUploadedFile(filename);
    return res.json({ id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось удалить категорию' });
  }
};

const createProduct = async (req, res) => {
  let imageSaved = false;
  try {
    const categoryId = positiveId(req.body?.category_id);
    const subcategoryId = req.body?.subcategory_id == null || req.body?.subcategory_id === ''
      ? null
      : positiveId(req.body.subcategory_id);
    const title = String(req.body?.title || '').trim();
    const description = req.body?.description == null ? null : String(req.body.description).trim();
    const price = Number(req.body?.price);
    const publicationDate = req.body?.publication_date === undefined
      ? new Date().toISOString().slice(0, 10)
      : parseDateOnly(req.body.publication_date);
    const salesCount = req.body?.sales_count === undefined ? 0 : Number(req.body.sales_count);
    const active = req.body?.is_active === undefined ? 1 : parseActive(req.body.is_active);
    if (
      !categoryId
      || (req.body?.subcategory_id != null && req.body.subcategory_id !== '' && !subcategoryId)
      || !title
      || title.length > 255
      || !Number.isFinite(price)
      || price < 0
      || !publicationDate
      || !isValidSalesCount(salesCount)
      || active === null
    ) {
      if (req.file) await removeUploadedFile(req.file.filename);
      return res.status(400).json({ message: 'Проверьте раздел, категорию, название, дату публикации, цену и количество продаж' });
    }

    const connection = await db.getConnection();
    let productId;
    try {
      await connection.beginTransaction();
      const [categoryRows] = await connection.execute(
        'SELECT id, slug FROM shop_categories WHERE id = ? AND is_active = 1 LIMIT 1',
        [categoryId]
      );
      if (!categoryRows.length) {
        await connection.rollback();
        if (req.file) await removeUploadedFile(req.file.filename);
        return res.status(400).json({ message: 'Категория не найдена' });
      }
      if (!description && ['leather-goods', '3d-models'].includes(categoryRows[0].slug)) {
        await connection.rollback();
        if (req.file) await removeUploadedFile(req.file.filename);
        return res.status(400).json({ message: 'Для кожаных изделий и 3D-моделей укажите описание' });
      }
      if (subcategoryId) {
        const [subcategoryRows] = await connection.execute(
          'SELECT id FROM shop_product_categories WHERE id = ? AND shop_category_id = ? LIMIT 1',
          [subcategoryId, categoryId]
        );
        if (!subcategoryRows.length) {
          await connection.rollback();
          if (req.file) await removeUploadedFile(req.file.filename);
          return res.status(400).json({ message: 'Категория товара не относится к выбранному разделу' });
        }
      }
      const [result] = await connection.execute(
        `INSERT INTO shop_products
          (category_id, subcategory_id, title, description, price, publication_date, sales_count, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [categoryId, subcategoryId, title, description || null, price, publicationDate, salesCount, active]
      );
      productId = result.insertId;
      if (req.file) {
        await connection.execute(
          'INSERT INTO shop_product_images (product_id, image_path, is_primary, sort_order) VALUES (?, ?, 1, 0)',
          [productId, req.file.filename]
        );
      }
      await connection.commit();
      imageSaved = Boolean(req.file);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const product = await loadProduct(productId);
    return res.status(201).json(product);
  } catch (error) {
    if (req.file && !imageSaved) {
      try {
        await removeUploadedFile(req.file.filename);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    console.error(error);
    return res.status(500).json({ message: 'Не удалось создать товар' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор товара' });
    const [existingRows] = await db.execute(
      'SELECT id, category_id, subcategory_id, description FROM shop_products WHERE id = ? LIMIT 1',
      [id]
    );
    if (!existingRows.length) return res.status(404).json({ message: 'Товар не найден' });

    const updates = [];
    const values = [];
    const categoryId = req.body?.category_id === undefined
      ? Number(existingRows[0].category_id)
      : positiveId(req.body.category_id);
    let subcategoryId = req.body?.subcategory_id === undefined
      ? existingRows[0].subcategory_id
      : (req.body.subcategory_id == null || req.body.subcategory_id === '' ? null : positiveId(req.body.subcategory_id));
    if (!categoryId) return res.status(400).json({ message: 'Некорректный раздел магазина' });
    const [categoryRows] = await db.execute(
      'SELECT slug FROM shop_categories WHERE id = ? AND is_active = 1 LIMIT 1',
      [categoryId]
    );
    if (!categoryRows.length) return res.status(400).json({ message: 'Категория не найдена' });
    if (req.body?.category_id !== undefined) {
      updates.push('category_id = ?');
      values.push(categoryId);
    }
    if (req.body?.subcategory_id !== undefined || req.body?.category_id !== undefined) {
      if (req.body?.subcategory_id !== undefined && req.body.subcategory_id != null && req.body.subcategory_id !== '' && !subcategoryId) {
        return res.status(400).json({ message: 'Некорректная категория товара' });
      }
      if (subcategoryId) {
        const [subcategoryRows] = await db.execute(
          'SELECT id FROM shop_product_categories WHERE id = ? AND shop_category_id = ? LIMIT 1',
          [subcategoryId, categoryId]
        );
        if (!subcategoryRows.length) return res.status(400).json({ message: 'Категория товара не относится к выбранному разделу' });
      }
      if (req.body?.category_id !== undefined && req.body?.subcategory_id === undefined) {
        subcategoryId = null;
      }
      updates.push('subcategory_id = ?');
      values.push(subcategoryId);
    }
    if (req.body?.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title || title.length > 255) return res.status(400).json({ message: 'Некорректное название товара' });
      updates.push('title = ?');
      values.push(title);
    }
    const description = req.body?.description === undefined
      ? existingRows[0].description
      : (req.body.description == null ? null : String(req.body.description).trim() || null);
    if (!description && ['leather-goods', '3d-models'].includes(categoryRows[0].slug)) {
      return res.status(400).json({ message: 'Для кожаных изделий и 3D-моделей укажите описание' });
    }
    if (req.body?.description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (req.body?.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Некорректная цена' });
      updates.push('price = ?');
      values.push(price);
    }
    if (req.body?.publication_date !== undefined) {
      const publicationDate = parseDateOnly(req.body.publication_date);
      if (!publicationDate) return res.status(400).json({ message: 'Некорректная дата публикации' });
      updates.push('publication_date = ?');
      values.push(publicationDate);
    }
    if (req.body?.sales_count !== undefined) {
      const salesCount = Number(req.body.sales_count);
      if (!isValidSalesCount(salesCount)) return res.status(400).json({ message: 'Некорректное количество продаж' });
      updates.push('sales_count = ?');
      values.push(salesCount);
    }
    if (req.body?.is_active !== undefined) {
      const active = parseActive(req.body.is_active);
      if (active === null) return res.status(400).json({ message: 'Некорректный статус товара' });
      updates.push('is_active = ?');
      values.push(active);
    }
    if (!updates.length) return res.status(400).json({ message: 'Нет полей для обновления' });

    values.push(id);
    await db.execute(
      `UPDATE shop_products SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return res.json(await loadProduct(id));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось обновить товар' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Некорректный идентификатор товара' });

    const [images] = await db.execute(
      'SELECT image_path FROM shop_product_images WHERE product_id = ?',
      [id]
    );
    const [result] = await db.execute('DELETE FROM shop_products WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Товар не найден' });
    for (const image of images) await removeUploadedFile(image.image_path);
    return res.json({ id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось удалить товар' });
  }
};

const uploadProductImage = async (req, res) => {
  try {
    const productId = positiveId(req.params.id);
    if (!productId) {
      if (req.file) await removeUploadedFile(req.file.filename);
      return res.status(400).json({ message: 'Некорректный идентификатор товара' });
    }
    if (!req.file) return res.status(400).json({ message: 'Выберите изображение' });

    const [products] = await db.execute('SELECT id FROM shop_products WHERE id = ? LIMIT 1', [productId]);
    if (!products.length) {
      await removeUploadedFile(req.file.filename);
      return res.status(404).json({ message: 'Товар не найден' });
    }

    const [countRows] = await db.execute(
      'SELECT COUNT(*) AS image_count FROM shop_product_images WHERE product_id = ?',
      [productId]
    );
    const [result] = await db.execute(
      `INSERT INTO shop_product_images (product_id, image_path, is_primary, sort_order)
       VALUES (?, ?, ?, ?)`,
      [productId, req.file.filename, countRows[0].image_count ? 0 : 1, countRows[0].image_count]
    );
    return res.status(201).json({
      id: result.insertId,
      product_id: productId,
      image_path: req.file.filename,
      is_primary: countRows[0].image_count ? 0 : 1,
      sort_order: countRows[0].image_count,
    });
  } catch (error) {
    if (req.file) {
      try {
        await removeUploadedFile(req.file.filename);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    console.error(error);
    return res.status(500).json({ message: 'Не удалось загрузить изображение товара' });
  }
};

const deleteProductImage = async (req, res) => {
  try {
    const productId = positiveId(req.params.id);
    const imageId = positiveId(req.params.image_id);
    if (!productId || !imageId) {
      return res.status(400).json({ message: 'Некорректный идентификатор изображения' });
    }

    const [images] = await db.execute(
      `SELECT id, image_path, is_primary
       FROM shop_product_images
       WHERE id = ? AND product_id = ?
       LIMIT 1`,
      [imageId, productId]
    );
    if (!images.length) return res.status(404).json({ message: 'Изображение не найдено' });

    await db.execute('DELETE FROM shop_product_images WHERE id = ?', [imageId]);
    const [remainingImages] = await db.execute(
      `SELECT id FROM shop_product_images
       WHERE product_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [productId]
    );
    for (let index = 0; index < remainingImages.length; index += 1) {
      await db.execute(
        'UPDATE shop_product_images SET sort_order = ?, is_primary = ? WHERE id = ?',
        [index, index === 0 ? 1 : 0, remainingImages[index].id]
      );
    }
    await removeUploadedFile(images[0].image_path);
    return res.json({ id: imageId, product_id: productId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Не удалось удалить изображение товара' });
  }
};

const reorderProductImages = async (req, res) => {
  const productId = positiveId(req.params.id);
  const imageIds = req.body?.image_ids;
  if (!productId || !Array.isArray(imageIds) || imageIds.some(id => !positiveId(id))) {
    return res.status(400).json({ message: 'Некорректный порядок изображений' });
  }
  const normalizedIds = imageIds.map(Number);
  if (new Set(normalizedIds).size !== normalizedIds.length || normalizedIds.length > 30) {
    return res.status(400).json({ message: 'Некорректный порядок изображений' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [products] = await connection.execute(
      'SELECT id FROM shop_products WHERE id = ? LIMIT 1',
      [productId]
    );
    if (!products.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Товар не найден' });
    }

    const [images] = await connection.execute(
      'SELECT id FROM shop_product_images WHERE product_id = ? ORDER BY id ASC FOR UPDATE',
      [productId]
    );
    const currentIds = images.map(image => Number(image.id));
    if (
      currentIds.length !== normalizedIds.length
      || currentIds.some(id => !normalizedIds.includes(id))
    ) {
      await connection.rollback();
      return res.status(400).json({ message: 'Список изображений изменился. Обновите товар и повторите попытку.' });
    }

    for (let index = 0; index < normalizedIds.length; index += 1) {
      await connection.execute(
        'UPDATE shop_product_images SET sort_order = ?, is_primary = ? WHERE id = ? AND product_id = ?',
        [index, index === 0 ? 1 : 0, normalizedIds[index], productId]
      );
    }
    await connection.commit();
    return res.json({ product_id: productId, image_ids: normalizedIds });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    return res.status(500).json({ message: 'Не удалось сохранить порядок изображений' });
  } finally {
    connection.release();
  }
};

module.exports = {
  getAllCategories,
  getAllProducts,
  getProductById,
  getCurrentAccount,
  createCategory,
  updateCategory,
  deleteCategory,
  getProductSubcategories,
  createProductSubcategory,
  updateProductSubcategory,
  deleteProductSubcategory,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
};
