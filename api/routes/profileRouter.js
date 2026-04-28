const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const profileController = require('../controllers/profileController');
const { UPLOADS_DIR } = require('../utils/runtimePaths');

/* ============================
   Multer
============================ */
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
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Только изображения'), false);
    }
    cb(null, true);
  },
});

/* ============================
   Routes
============================ */
router.put('/me', authMiddleware, upload.single('avatar'), profileController.updateMe);
router.get('/me', authMiddleware, profileController.getMe);
router.post('/me/friend-code', authMiddleware, profileController.generateFriendCode);
router.post('/me/friend-code/regenerate', authMiddleware, profileController.regenerateFriendCode);
router.get('/by-friend-code/:code', optionalAuth, profileController.getByFriendCode);
router.get('/:username/friends-count', optionalAuth, profileController.getFriendsCount);
router.get('/:username/friends', optionalAuth, profileController.getFriendsByUsername);
router.get('/:username', optionalAuth, profileController.getByUsername);

module.exports = router;
