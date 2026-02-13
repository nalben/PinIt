const express = require('express');
const router = express.Router();
const boardsController = require('../controllers/boardsController');
const multer = require('multer');
const path = require('path');

/* ============================
   Multer (board images)
============================ */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Только изображения'), false);
    }
    cb(null, true);
  },
});

const maybeUploadSingleImage = (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) return next();
  return upload.single('image')(req, res, next);
};

router.get('/', boardsController.getMyBoards);
router.get('/guest', boardsController.getGuestBoards);
router.get('/recent', boardsController.getRecentBoards);
router.get('/invites/incoming', boardsController.getIncomingBoardInvites);
router.put('/invites/accept/:invite_id', boardsController.acceptBoardInvite);
router.put('/invites/reject/:invite_id', boardsController.rejectBoardInvite);

router.post('/', maybeUploadSingleImage, boardsController.createBoard);

router.post('/:board_id/invites', boardsController.inviteToBoard);
router.delete('/:board_id/guests/:guest_id', boardsController.removeGuestFromBoard);
router.post('/:board_id/leave', boardsController.leaveBoard);

router.patch('/:board_id/title', boardsController.renameBoard);
router.patch('/:board_id/description', boardsController.updateDescription);
router.patch('/:board_id/image', maybeUploadSingleImage, boardsController.updateBoardImage);
router.get('/:board_id/full', boardsController.getBoardFull);
router.get('/:board_id', boardsController.getBoardById);

router.delete('/:board_id', boardsController.deleteBoard);

// фиксируем заход на доску
router.post('/:board_id/visit', boardsController.visitBoard);

module.exports = router;
