require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

// Роуты API
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
// API маршруты
// ============================
app.use('/api', routes);
app.use('/api/profile', profileRoutes);
app.use('/api/private', privateRoutes);
app.use('/api/friends', friendsRoutes);

// ============================
// Путь к сборке фронтенда
// ============================
const frontendPath = path.join(__dirname, '../frontend/build');

// Статика фронтенда
app.use(express.static(frontendPath));

// ============================
// Fallback для SPA
// ============================
// Все остальные GET-запросы отдаем index.html
app.get('/*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ============================
// Запуск сервера
// ============================
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});


