const express = require('express');
const router = express.Router();
const { getCards, addCard } = require('../controllers/cardsController');

router.get('/', getCards);
router.post('/', addCard);

module.exports = router;
