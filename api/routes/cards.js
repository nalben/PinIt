const express = require('express');
const router = express.Router();
const cardsController = require('../controllers/cardsController');

router.get('/', cardsController.getCards);  // /cards
router.post('/', cardsController.addCard);  // /cards

module.exports = router;