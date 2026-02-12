const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

const optionalAuth = require('../middleware/optionalAuth');
const profileController = require('../controllers/profileController');

/* ============================
   Multer
============================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
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
router.put('/me', upload.single('avatar'), profileController.updateMe);
router.get('/me', profileController.getMe);
router.post('/me/friend-code', profileController.generateFriendCode);
router.post('/me/friend-code/regenerate', profileController.regenerateFriendCode);
router.get('/by-friend-code/:code', optionalAuth, profileController.getByFriendCode);
router.get('/:username/friends-count', optionalAuth, profileController.getFriendsCount);
router.get('/:username/friends', optionalAuth, profileController.getFriendsByUsername);
router.get('/:username', optionalAuth, profileController.getByUsername);

module.exports = router;
