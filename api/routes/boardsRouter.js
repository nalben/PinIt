const express = require('express');
const router = express.Router();
const boardsController = require('../controllers/boardsController');

router.get('/', boardsController.getMyBoards);
router.get('/recent', boardsController.getRecentBoards);
router.get('/invites/incoming', boardsController.getIncomingBoardInvites);
router.put('/invites/accept/:invite_id', boardsController.acceptBoardInvite);
router.put('/invites/reject/:invite_id', boardsController.rejectBoardInvite);

router.post('/', boardsController.createBoard);

router.patch('/:board_id/title', boardsController.renameBoard);
router.patch('/:board_id/description', boardsController.updateDescription);
router.get('/:board_id', boardsController.getBoardById);

router.delete('/:board_id', boardsController.deleteBoard);

// фиксируем заход на доску
router.post('/:board_id/visit', boardsController.visitBoard);

module.exports = router;
