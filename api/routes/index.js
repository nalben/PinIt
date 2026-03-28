const express = require('express');
const router = express.Router();

const authRoutes = require('./authRouter');
const profileRoutes = require('./profileRouter');
const friendsRoutes = require('./friendsRouter');
const boardsRoutes = require('./boardsRouter');
const adminRoutes = require('./adminRouter');
const converterRoutes = require('./converterRouter');

router.use('/boards', boardsRoutes);

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

router.use('/friends', friendsRoutes);
router.use('/admin', adminRoutes);
router.use('/converter', converterRoutes);

module.exports = router;
