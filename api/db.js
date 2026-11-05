const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'nalben',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'PinIt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
