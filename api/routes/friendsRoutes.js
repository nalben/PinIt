const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/send', authMiddleware, friendsController.sendFriendRequest);
router.put('/accept/:request_id', authMiddleware, friendsController.acceptFriendRequest);
router.put('/reject/:request_id', authMiddleware, friendsController.rejectFriendRequest);
router.delete('/remove-request/:request_id', authMiddleware, friendsController.removeFriendRequest);
router.delete('/:friend_id', authMiddleware, friendsController.removeFriend);
router.get('/status/:other_user_id', authMiddleware, friendsController.getFriendStatus);
router.get('/requests/incoming', authMiddleware, friendsController.getFriendRequests);
router.get('/count/:user_id', authMiddleware, friendsController.getFriendCount);

// этот последний
router.get('/:user_id', authMiddleware, friendsController.getFriends);

module.exports = router;