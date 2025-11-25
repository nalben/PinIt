const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');
const authRoutes = require('./auth');
const authMiddleware = require("./middleware/authMiddleware");


router.get("/cards", authMiddleware, cardsController.getCards);
router.use('/cards', cardsRoutes);
router.use('/auth', authRoutes);

module.exports = router;
