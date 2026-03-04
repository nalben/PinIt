const express = require('express');
const adminOnly = require('../middleware/adminOnly');

const router = express.Router();

router.get('/check', adminOnly, (req, res) => res.status(204).end());

module.exports = router;
