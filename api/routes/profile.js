const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../db');

/**
 * МОЙ ПРОФИЛЬ (только с JWT)
 * GET /api/profile
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.execute(
      'SELECT id, username, role, avatar, created_at, email FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({ ...rows[0], isOwner: true });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * ПУБЛИЧНЫЙ ПРОФИЛЬ (без JWT)
 * GET /api/profile/:username
 */
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      'SELECT id, username, role, avatar, created_at FROM users WHERE username = ?',
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      ...rows[0],
      isOwner: false,
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
