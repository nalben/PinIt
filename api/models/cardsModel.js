const connection = require('../db');

function getAllCards(callback) {
  connection.query('SELECT * FROM cards', callback);
}

function createCard(title, description, callback) {
  connection.query(
    'INSERT INTO cards (title, description) VALUES (?, ?)',
    [title, description],
    callback
  );
}

module.exports = { getAllCards, createCard };
