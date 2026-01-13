const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

/**
 * Middleware для опциональной авторизации
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    // Игнорируем ошибки токена
  }
  next();
};

/**
 * МОЙ ПРОФИЛЬ
 * GET /api/profile/me
 * Требует авторизацию
 */
router.get('/me', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Не авторизован' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const [rows] = await db.execute(
      'SELECT id, username, avatar, role, email FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    res.json({
      ...rows[0],
      isOwner: true,
    });
  } catch (err) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * ПУБЛИЧНЫЙ ПРОФИЛЬ
 * GET /api/profile/:username
 * Доступен всем, email виден только владельцу
 */
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      'SELECT id, username, role, avatar, created_at, email FROM users WHERE username = ?',
      [username]
    );

    if (!rows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    const isOwner = req.user?.id === rows[0].id;

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
