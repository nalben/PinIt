require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Роуты
const routes = require('./routes');
const profileRoutes = require('./routes/profileRoutes');
const privateRoutes = require('./routes/private');
const friendsRoutes = require('./routes/friendsRoutes');

const app = express();

// ============================
// Middleware
// ============================
app.use(cors());
app.use(express.json());

// ============================
// API роуты
// ============================
app.use('/api/profile', profileRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/', routes);

// ============================
// Статика фронтенда
// ============================
const frontendPath = path.join(__dirname, '../frontend/build');

// 1. Сначала отдаём реальные файлы (JS, CSS, картинки)
app.use(express.static(frontendPath));

// 2. Файлы из папки uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================
// React Router fallback
// ============================
// Любой не найденный путь отдаём index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ============================
// Запуск сервера
// ============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});
