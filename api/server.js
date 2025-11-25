require('dotenv').config(); // ← подключает .env

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());

// Подключаем роуты
app.use('/', routes);

// Тестовый корень
app.get('/', (req, res) => {
  res.send('Backend работает на порту 3001');
});

// Запуск сервера
const PORT = process.env.PORT || 3001; // можно вынести в .env
app.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
