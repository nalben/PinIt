const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../db');

/**
 * МОЙ ПРОФИЛЬ
 * GET /api/profile/me
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.execute(
      'SELECT id, username, avatar, role, email FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      id: rows[0].id,
      username: rows[0].username,
      avatar: rows[0].avatar,
      role: rows[0].role,
      email: rows[0].email,
      isOwner: true,
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});
/**
 * ПУБЛИЧНЫЙ ПРОФИЛЬ (включая текущего пользователя)
 * GET /api/profile/:username
 */
router.get('/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      'SELECT id, username, role, avatar, created_at, email FROM users WHERE username = ?',
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const isOwner = req.user.id === rows[0].id;

    res.json({
      id: rows[0].id,
      username: rows[0].username,
      avatar: rows[0].avatar,
      role: rows[0].role,
      created_at: rows[0].created_at,
      email: isOwner ? rows[0].email : undefined,
      isOwner
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
