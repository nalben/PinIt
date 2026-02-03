const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');
const authRoutes = require('./auth');
const authMiddleware = require('../middleware/authMiddleware');
const profileRoutes = require('./profileRoutes');
const friendsRoutes = require('./friendsRoutes');
const boardsRoutes = require('./boards');

router.use('/boards', authMiddleware, boardsRoutes);

router.use('/cards', authMiddleware, cardsRoutes);

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

router.use('/friends', friendsRoutes);

module.exports = router;