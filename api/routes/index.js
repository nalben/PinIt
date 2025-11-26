const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');
const authRoutes = require('./auth');
const authMiddleware = require('../middleware/authMiddleware');

// Все роуты /cards защищены authMiddleware
router.use('/cards', authMiddleware, cardsRoutes);

// Роуты для аутентификации
router.use('/auth', authRoutes);

module.exports = router;
