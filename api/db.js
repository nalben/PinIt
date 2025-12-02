require('dotenv').config();
const mysql = require('mysql2/promise');
const isLocal = process.env.IS_LOCAL === 'true';

const pool = mysql.createPool({
  host: 'localhost',
  user: isLocal ? 'root' : 'nalben',
  password: isLocal ? '' : 'ebegin80',
  database: 'PinIt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
