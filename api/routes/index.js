const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cardsRouter');
const authRoutes = require('./authRouter');
const authMiddleware = require('../middleware/authMiddleware');
const profileRoutes = require('./profileRouter');
const friendsRoutes = require('./friendsRouter');
const boardsRoutes = require('./boardsRouter');

router.use('/boards', authMiddleware, boardsRoutes);

router.use('/cards', authMiddleware, cardsRoutes);

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

router.use('/friends', friendsRoutes);

module.exports = router;
