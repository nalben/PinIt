const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* ============================
   optionalAuth middleware
============================ */
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {}
  next();
};

/* ============================
   Multer config
============================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

/* ============================
   PUT /api/profile/me
============================ */
router.put('/me', upload.single('avatar'), async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Не авторизован' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const { nickname, status } = req.body;

    let newAvatarPath = null;

    if (req.file) {
      newAvatarPath = `/uploads/${req.file.filename}`;

      // получаем старый аватар
      const [oldRows] = await db.execute(
        'SELECT avatar FROM users WHERE id = ?',
        [userId]
      );

      const oldAvatar = oldRows[0]?.avatar;

      // удаляем старый файл
      if (oldAvatar) {
        const oldFilePath = path.join(__dirname, '..', oldAvatar);
        fs.unlink(oldFilePath, err => {
          if (err) {
            console.error('Ошибка удаления старого аватара:', err.message);
          }
        });
      }
    }

    // обновляем пользователя
    await db.execute(
      `
        UPDATE users 
        SET 
          nickname = ?, 
          status = ?, 
          avatar = COALESCE(?, avatar)
        WHERE id = ?
      `,
      [nickname, status, newAvatarPath, userId]
    );

    // возвращаем обновлённые данные
    const [rows] = await db.execute(
      'SELECT id, username, nickname, avatar, role, email, status FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      message: 'Профиль обновлён',
      user: rows[0]
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/* ============================
   GET /api/profile/me
============================ */
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Не авторизован' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const [rows] = await db.execute(
      'SELECT id, username, nickname, avatar, role, email FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      ...rows[0],
      isOwner: true
    });

  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/* ============================
   GET /api/profile/:username
============================ */
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      `
        SELECT id, username, nickname, role, avatar, created_at, email, status
        FROM users
        WHERE username = ?
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const isOwner = req.user?.id === rows[0].id;

    res.json({
      id: rows[0].id,
      username: rows[0].username,
      nickname: rows[0].nickname,
      avatar: rows[0].avatar,
      role: rows[0].role,
      created_at: rows[0].created_at,
      email: isOwner ? rows[0].email : undefined,
      status: rows[0].status,
      isOwner
    });

  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/* ============================
   GET /api/profile/:username/friends-count
============================ */
router.get('/:username/friends-count', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      `
        SELECT COUNT(*) AS friend_count
        FROM friends
        WHERE user_id = (
          SELECT id FROM users WHERE username = ?
        )
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({ friend_count: rows[0].friend_count });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
