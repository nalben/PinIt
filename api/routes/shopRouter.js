const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopApiController');
const authMiddleware = require('../middleware/authMiddleware');
const adminOnly = require('../middleware/adminOnly');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('../utils/runtimePaths');

/* ======================================
   Multer for product images
   ====================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Только изображения'), false);
    }
    cb(null, true);
  },
});

const maybeUploadSingleImage = (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) return next();
  return upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: 'Некорректный файл (макс. 5MB)' });
    }
    return next();
  });
};

// Public routes (optional auth for per‑user filtering)
router.get('/session', authMiddleware, shopController.getCurrentAccount);
router.get('/categories', shopController.getAllCategories);
router.get('/categories/:id/subcategories', shopController.getProductSubcategories);
router.get('/products', shopController.getAllProducts);
router.get('/products/:id', shopController.getProductById);

// Admin routes (require admin role)
router.post('/categories', adminOnly, shopController.createCategory);
router.patch('/categories/:id', adminOnly, shopController.updateCategory);
router.delete('/categories/:id', adminOnly, shopController.deleteCategory);
router.post('/categories/:id/subcategories', adminOnly, shopController.createProductSubcategory);
router.patch('/subcategories/:id', adminOnly, shopController.updateProductSubcategory);
router.delete('/subcategories/:id', adminOnly, shopController.deleteProductSubcategory);

router.post('/products', adminOnly, maybeUploadSingleImage, shopController.createProduct);
router.patch('/products/:id', adminOnly, shopController.updateProduct);
router.patch('/products/:id/images/order', adminOnly, shopController.reorderProductImages);
router.delete('/products/:id', adminOnly, shopController.deleteProduct);
router.post('/products/:id/images', adminOnly, maybeUploadSingleImage, shopController.uploadProductImage);
router.delete('/products/:id/images/:image_id', adminOnly, shopController.deleteProductImage);

module.exports = router;