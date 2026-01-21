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
// Основные роуты
// ============================
app.use('/', routes);
app.use('/api/profile', profileRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================
// Запуск сервера
// ============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});
