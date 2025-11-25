const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');
const authRoutes = require('./auth');

router.use('/cards', cardsRoutes);
router.use('/auth', authRoutes);

module.exports = router;
