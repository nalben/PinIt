const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.get('/', auth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    message: `Доступ к приватным данным разрешён для ${req.user.name}`,
    user: req.user
  });
});

module.exports = router;
