require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Роуты
const routes = require('./routes');
const profileRoutes = require('./routes/profileRoutes');
const privateRoutes = require('./routes/private');
const friendsRoutes = require('./routes/friendsRoutes');
const frontendPath = path.join(__dirname, '../frontend/build');
const app = express();

// ============================
// Middleware
// ============================
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(frontendPath));

// ============================
// Основные роуты API
// ============================
app.use('/', routes);
app.use('/api/profile', profileRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/friends', friendsRoutes);

// ============================
// Статика фронтенда
// ============================
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Фallback для React Router
app.use((req, res, next) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});
// ============================
// Запуск сервера
// ============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});
