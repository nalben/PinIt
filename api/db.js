const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'nalben', //сервер
  // user: 'root', //локал
  password: 'ebegin80', //сервер
  // password: '', //локал
  database: 'PinIt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
