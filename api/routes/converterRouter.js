const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const authMiddleware = require('../middleware/authMiddleware');
const converterController = require('../controllers/converterController');
const { CONVERTER_TMP_DIR } = require('../utils/converterStorage');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(CONVERTER_TMP_DIR, { recursive: true });
    cb(null, CONVERTER_TMP_DIR);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname || '')}`);
  },
});

const upload = multer({
  storage,
});

const uploadFiles = (req, res, next) => upload.array('files')(req, res, (err) => {
  if (err) {
    return res.status(400).json({ message: 'Invalid file upload' });
  }
  return next();
});

router.use(authMiddleware);

router.get('/files', converterController.listFiles);
router.post('/files', uploadFiles, converterController.uploadFiles);
router.get('/files/:file_id/download', converterController.downloadFile);
router.delete('/files/:file_id', converterController.deleteFile);

module.exports = router;
