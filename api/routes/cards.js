const express = require('express');
const router = express.Router();
const cardsController = require('../controllers/cardsController');

router.get('/', cardsController.getCards);
router.post('/', cardsController.addCard);

module.exports = router;