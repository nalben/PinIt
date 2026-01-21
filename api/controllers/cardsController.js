const Cards = require('../models/cardsModel');

async function getCards(req, res) {
  try {
    const cards = await Cards.getAllCards();
    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

async function addCard(req, res) {
  try {
    const { title, description } = req.body;
    const id = await Cards.createCard(title, description);
    res.status(201).json({ id, title, description });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

module.exports = {
  getCards,
  addCard
};
