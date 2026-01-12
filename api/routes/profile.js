const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const db = require('../db');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id; // <- исправлено
    if (!userId) {
      return res.status(401).json({ message: 'Не авторизован' });
    }

    const [rows] = await db.execute(
      'SELECT id, username, role, avatar, created_at, email FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
