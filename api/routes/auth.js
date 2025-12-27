const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/send-code', authController.sendCode);
router.post('/register', authController.register);
router.post('/login', authController.login);

router.post('/check-reset-user', authController.checkResetUser);
router.post('/send-reset-code', authController.sendResetCode);
router.post('/verify-reset-code', authController.verifyResetCode);
router.post('/set-new-password', authController.setNewPassword);

module.exports = router;
