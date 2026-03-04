const authMiddleware = require('./authMiddleware');
const pool = require('../db');

const adminOnly = (req, res, next) => {
  authMiddleware(req, res, async () => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: 'Нет токена' });

      const [rows] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [userId]);
      if (!rows.length) return res.status(401).json({ message: 'Пользователь не найден' });
      if (rows[0].role !== 'admin') return res.status(403).json({ message: 'Доступ запрещен' });

      next();
    } catch (err) {
      return res.status(500).json({ message: 'Ошибка сервера' });
    }
  });
};

module.exports = adminOnly;
