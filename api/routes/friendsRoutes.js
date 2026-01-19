// src/routes/friendsRoutes.js

const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');

router.post('/send', friendsController.sendFriendRequest);
router.put('/accept/:request_id', friendsController.acceptFriendRequest);
router.put('/reject/:request_id', friendsController.rejectFriendRequest);

module.exports = router;