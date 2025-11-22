const express = require('express');
const router = express.Router();

const cardsRoutes = require('./cards');

router.use('/cards', cardsRoutes);

module.exports = router;
