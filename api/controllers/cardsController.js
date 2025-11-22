const Cards = require('../models/cardsModel');

function getCards(req, res) {
  Cards.getAllCards((err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
}

function addCard(req, res) {
  const { title, description } = req.body;
  Cards.createCard(title, description, (err, result) => {
    if (err) return res.status(500).send(err);
    res.json({ id: result.insertId, title, description });
  });
}

module.exports = { getCards, addCard };
