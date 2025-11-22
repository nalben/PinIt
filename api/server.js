const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к MySQL
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',       // укажи свой пароль MySQL
  database: 'PinIt'   // имя базы данных
});

// Подключаемся к базе
connection.connect(err => {
  if (err) {
    console.error('Ошибка подключения к MySQL:', err);
    return;
  }
  console.log('Подключено к MySQL');

  // Создание таблицы cards
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS cards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  connection.query(createTableQuery, (err) => {
    if (err) {
      console.error('Ошибка создания таблицы:', err);
    } else {
      console.log('Таблица cards готова');

      // Вставка тестовых данных (не добавлять дубликаты при повторном запуске)
      const insertQuery = `
        INSERT IGNORE INTO cards (id, title, description)
        VALUES
          (1, 'Первая карточка', 'Описание первой карточки'),
          (2, 'Вторая карточка', 'Описание второй карточки'),
          (3, 'Третья карточка', 'Описание третьей карточки')
      `;

      connection.query(insertQuery, (err) => {
        if (err) console.error('Ошибка вставки данных:', err);
        else console.log('Тестовые данные добавлены');

        // Вывод всех карточек в консоль
        connection.query('SELECT * FROM cards', (err, results) => {
          if (err) console.error('Ошибка выборки данных:', err);
          else console.log('Содержимое таблицы cards:', results);
        });
      });
    }
  });
});

// Корневой маршрут
app.get('/', (req, res) => {
  res.send('Backend работает локально!');
});

// Получение всех карточек через API
app.get('/cards', (req, res) => {
  connection.query('SELECT * FROM cards', (err, results) => {
    if (err) return res.status(500).send(err);
    res.send(results);
  });
});

// Запуск сервера
app.listen(3001, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
