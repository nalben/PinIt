const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/send-code', authController.sendCode); // отправка кода на почту
router.post('/register', authController.register);   // регистрация с проверкой кода
router.post('/login', authController.login);         // логин

module.exports = router;
