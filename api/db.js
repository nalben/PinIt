const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'nalben',
  password: 'ebegin80',
  database: 'PinIt'
});

connection.connect(err => {
  if (err) console.error('Ошибка подключения к MySQL:', err);
  else console.log('Подключено к MySQL');
});

module.exports = connection;
