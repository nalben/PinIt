const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
  }
  next();
};

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

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    res.json({
      ...rows[0],
      isOwner: true,
    });
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      'SELECT id, username, nickname, role, avatar, created_at, email FROM users WHERE username = ?',
      [username]
    );

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    const isOwner = req.user?.id === rows[0].id;

    res.json({
      id: rows[0].id,
      username: rows[0].username,
      nickname: rows[0].nickname,
      avatar: rows[0].avatar,
      role: rows[0].role,
      created_at: rows[0].created_at,
      email: isOwner ? rows[0].email : undefined,
      isOwner
    });
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.get('/:username/friends-count', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      'SELECT COUNT(*) AS friend_count FROM friends WHERE user_id = (SELECT id FROM users WHERE username = ?)',
      [username]
    );

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    res.json({
      friend_count: rows[0].friend_count
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;