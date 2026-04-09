const express = require('express');
const router = express.Router();
const boardsController = require('../controllers/boardsController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
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
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
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
  return upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: 'Некорректный файл (макс. 5MB)' });
    }
    return next();
  });
};

// Public routes (optional auth for per-user filtering)
router.get('/public/popular', optionalAuth, boardsController.getPopularPublicBoards);
router.get('/public/:board_id', optionalAuth, boardsController.getPublicBoardById);
router.get('/public/:board_id/cards', optionalAuth, boardsController.getPublicBoardCards);
router.get('/public/:board_id/cards/:card_id/details', optionalAuth, boardsController.getPublicCardDetails);
router.get('/public/:board_id/links', optionalAuth, boardsController.getPublicBoardLinks);
router.get('/public/:board_id/drawings', optionalAuth, boardsController.getPublicBoardDrawings);
router.get('/invite-link/resolve', boardsController.resolveBoardInviteLink);
router.get('/invite-link/preview', boardsController.previewBoardInviteLink);

// All routes below require auth
router.use(authMiddleware);

router.get('/', boardsController.getMyBoards);
router.get('/guest', boardsController.getGuestBoards);
router.get('/friends', boardsController.getFriendsBoards);
  router.get('/recent', boardsController.getRecentBoards);
  router.get('/invites/incoming', boardsController.getIncomingBoardInvites);
  router.put('/invites/accept/:invite_id', boardsController.acceptBoardInvite);
  router.put('/invites/reject/:invite_id', boardsController.rejectBoardInvite);
  router.post('/invite-link/accept', boardsController.acceptBoardInviteLink);
 
  router.post('/', maybeUploadSingleImage, boardsController.createBoard);
 
  router.post('/:board_id/invites', boardsController.inviteToBoard);
  router.get('/:board_id/invites/outgoing', boardsController.getOutgoingBoardInvites);
  router.delete('/:board_id/invites/:invite_id', boardsController.cancelBoardInvite);
  router.get('/:board_id/invite-link', boardsController.getBoardInviteLink);
  router.post('/:board_id/invite-link/regenerate', boardsController.regenerateBoardInviteLink);
  router.delete('/:board_id/guests/:guest_id', boardsController.removeGuestFromBoard);
  router.patch('/:board_id/guests/:guest_id/role', boardsController.updateGuestRole);
  router.post('/:board_id/leave', boardsController.leaveBoard);
  router.post('/:board_id/join-public', boardsController.joinPublicBoardAsGuest);

router.patch('/:board_id/title', boardsController.renameBoard);
router.patch('/:board_id/description', boardsController.updateDescription);
router.patch('/:board_id/public', boardsController.updateBoardPublic);
router.patch('/:board_id/image', maybeUploadSingleImage, boardsController.updateBoardImage);
router.post('/:board_id/cards', boardsController.createCard);
router.get('/:board_id/cards', boardsController.getBoardCards);
router.get('/:board_id/cards/favorite-colors', boardsController.getFavoriteCardColors);
router.post('/:board_id/cards/favorite-colors', boardsController.addFavoriteCardColor);
router.delete('/:board_id/cards/favorite-colors/:color', boardsController.deleteFavoriteCardColor);
router.get('/:board_id/cards/:card_id/details', boardsController.getCardDetails);
router.post('/:board_id/cards/:card_id/details/blocks', maybeUploadSingleImage, boardsController.createCardDetailsBlock);
router.patch('/:board_id/cards/:card_id/details/blocks/:block_id', maybeUploadSingleImage, boardsController.updateCardDetailsBlock);
router.delete('/:board_id/cards/:card_id/details/blocks/:block_id', boardsController.deleteCardDetailsBlock);
router.post('/:board_id/cards/:card_id/details/blocks/:block_id/items', boardsController.createCardDetailsBlockItem);
router.patch('/:board_id/cards/:card_id/details/blocks/:block_id/items/:item_id', boardsController.updateCardDetailsBlockItem);
router.delete('/:board_id/cards/:card_id/details/blocks/:block_id/items/:item_id', boardsController.deleteCardDetailsBlockItem);
router.patch('/:board_id/cards/:card_id', boardsController.updateCard);
router.patch('/:board_id/cards/:card_id/lock', boardsController.updateCardLock);
router.patch('/:board_id/cards/:card_id/image', maybeUploadSingleImage, boardsController.updateCardImage);
router.patch('/:board_id/cards/:card_id/type', boardsController.updateCardType);
router.patch('/:board_id/cards/:card_id/title', boardsController.updateCardTitle);
router.patch('/:board_id/cards/:card_id/position', boardsController.updateCardPosition);
router.delete('/:board_id/cards/:card_id', boardsController.deleteCard);
router.get('/:board_id/links', boardsController.getBoardLinks);
router.post('/:board_id/links', boardsController.createCardLink);
router.patch('/:board_id/links/:link_id', boardsController.updateCardLink);
router.patch('/:board_id/links/:link_id/flip', boardsController.flipCardLinkDirection);
router.delete('/:board_id/links/:link_id', boardsController.deleteCardLink);
router.get('/:board_id/drawings', boardsController.getBoardDrawings);
router.post('/:board_id/drawings', boardsController.createBoardDrawing);
router.patch('/:board_id/drawings/bulk', boardsController.bulkUpdateBoardDrawings);
router.patch('/:board_id/drawings/:drawing_id', boardsController.updateBoardDrawing);
router.delete('/:board_id/drawings/:drawing_id', boardsController.deleteBoardDrawing);
router.get('/:board_id/participants', boardsController.getBoardParticipants);
router.get('/:board_id/full', boardsController.getBoardFull);
router.get('/:board_id', boardsController.getBoardById);

router.delete('/:board_id', boardsController.deleteBoard);

// фиксируем заход на доску
router.post('/:board_id/visit', boardsController.visitBoard);

module.exports = router;
