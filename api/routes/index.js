const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');
const authRoutes = require('./auth');
const authMiddleware = require('../middleware/authMiddleware');
const profileRoutes = require('./profile');

router.use('/cards', authMiddleware, cardsRoutes);

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

module.exports = router;
