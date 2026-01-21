const pool = require('../db');

async function getAllCards() {
  const [rows] = await pool.query('SELECT * FROM cards');
  return rows;
}

async function createCard(title, description) {
  const [result] = await pool.query(
    'INSERT INTO cards (title, description) VALUES (?, ?)',
    [title, description]
  );
  return result.insertId;
}

module.exports = {
  getAllCards,
  createCard
};
