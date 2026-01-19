const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');

router.post('/send', friendsController.sendFriendRequest);
router.put('/accept/:request_id', friendsController.acceptFriendRequest);
router.put('/reject/:request_id', friendsController.rejectFriendRequest);

router.get('/:user_id', friendsController.getFriends);
router.get('/friend-count/:user_id', friendsController.getFriendCount);
router.get('/friend-requests/:user_id', friendsController.getFriendRequests);

module.exports = router;
