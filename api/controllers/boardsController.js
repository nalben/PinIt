const db = require('../db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const getUploadsRelativePath = rawPath => {
  if (typeof rawPath !== 'string') return null;

  const raw = rawPath.trim();
  if (!raw) return null;

  let pathname = raw.replace(/\\/g, '/');

  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return null;
    }
  } else {
    pathname = pathname.split('?')[0].split('#')[0];
  }

  if (pathname.startsWith('uploads/')) pathname = `/${pathname}`;
  if (!pathname.startsWith('/uploads/')) return null;

  const rel = pathname.slice('/uploads/'.length);
  const normalized = path.posix.normalize(rel);
  if (!normalized || normalized === '.' || normalized.startsWith('..')) return null;

  return normalized.replace(/^\//, '');
};

const safeUnlinkUpload = async uploadPath => {
  const rel = getUploadsRelativePath(uploadPath);
  if (!rel) return;

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const uploadsDirResolved = path.resolve(uploadsDir);
  const absolutePath = path.resolve(uploadsDir, rel);

  const uploadsPrefix = uploadsDirResolved.toLowerCase() + path.sep;
  const absLower = absolutePath.toLowerCase();
  if (absLower !== uploadsDirResolved.toLowerCase() && !absLower.startsWith(uploadsPrefix)) return;

  try {
    await fs.promises.unlink(absolutePath);
  } catch {
    // ignore
  }
};

const generateInviteToken = () => crypto.randomBytes(24).toString('hex');
const CARD_DETAIL_BLOCK_TYPES = new Set(['text', 'image', 'facts', 'checklist']);

const trimNullableString = value => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const normalizeCardDetailCaption = value => {
  const caption = trimNullableString(value);
  if (caption && caption.length > 70) return { ok: false };
  return { ok: true, value: caption };
};

const normalizeCardDetailItemContent = value => {
  const content = trimNullableString(value);
  if (!content || content.length > 200) return { ok: false };
  return { ok: true, value: content };
};

const normalizeCardDetailTextContent = value => {
  const content = trimNullableString(value);
  if (!content) return { ok: false };
  return { ok: true, value: content };
};

const getNextCardDetailBlockSortOrder = async (connection, cardId) => {
  const [rows] = await connection.execute(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
     FROM carddetail_blocks
     WHERE card_id = ?`,
    [cardId]
  );

  const nextSortOrder = Number(rows[0]?.max_sort_order) + 1;
  return Number.isFinite(nextSortOrder) && nextSortOrder > 0 ? nextSortOrder : 1;
};

const insertCardDetailBlock = async (connection, params) => {
  const { cardId, blockType, sortOrder, heading = null } = params;
  const [result] = await connection.execute(
    `INSERT INTO carddetail_blocks (card_id, block_type, sort_order, heading)
     VALUES (?, ?, ?, ?)`,
    [cardId, blockType, sortOrder, heading]
  );

  const blockId = Number(result?.insertId);
  if (!Number.isFinite(blockId) || blockId <= 0) {
    throw new Error('Failed to create card detail block');
  }

  return blockId;
};

const ensureCardDetailsDefaults = async (connection, params) => {
  const { cardId } = params;
  const [detailsRows] = await connection.execute(
    `SELECT card_id
     FROM carddetails
     WHERE card_id = ?
     LIMIT 1`,
    [cardId]
  );

  if (!detailsRows.length) {
    await connection.execute(`INSERT INTO carddetails (card_id) VALUES (?)`, [cardId]);
  }
};

const loadCardDetailsPayload = async (connection, cardId, boardId) => {
  const [detailsRows] = await connection.execute(
    `SELECT cd.card_id, c.board_id, c.title, c.image_path, cd.created_at, cd.updated_at
     FROM carddetails cd
     JOIN cards c ON c.id = cd.card_id
     WHERE cd.card_id = ? AND c.board_id = ?
     LIMIT 1`,
    [cardId, boardId]
  );

  if (!detailsRows.length) return null;

  const detailsRow = detailsRows[0];

  const [blockRows] = await connection.execute(
    `SELECT id, card_id, block_type, sort_order, heading, created_at
     FROM carddetail_blocks
     WHERE card_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [cardId]
  );

  const blockIds = blockRows.map(row => Number(row.id)).filter(id => Number.isFinite(id) && id > 0);
  const placeholders = blockIds.map(() => '?').join(', ');

  let textRows = [];
  let imageRows = [];
  let factRows = [];
  let checklistRows = [];

  if (blockIds.length) {
    [textRows] = await connection.execute(
      `SELECT block_id, content
       FROM carddetail_text_blocks
       WHERE block_id IN (${placeholders})`,
      blockIds
    );
    [imageRows] = await connection.execute(
      `SELECT block_id, image_path, caption
       FROM carddetail_image_blocks
       WHERE block_id IN (${placeholders})`,
      blockIds
    );
    [factRows] = await connection.execute(
      `SELECT id, block_id, content, sort_order
       FROM carddetail_fact_items
       WHERE block_id IN (${placeholders})
       ORDER BY sort_order ASC, id ASC`,
      blockIds
    );
    [checklistRows] = await connection.execute(
      `SELECT id, block_id, content, is_checked, sort_order
       FROM carddetail_checklist_items
       WHERE block_id IN (${placeholders})
       ORDER BY sort_order ASC, id ASC`,
      blockIds
    );
  }

  const textByBlockId = new Map(textRows.map(row => [Number(row.block_id), row]));
  const imageByBlockId = new Map(imageRows.map(row => [Number(row.block_id), row]));
  const factsByBlockId = new Map();
  const checklistByBlockId = new Map();

  for (const row of factRows) {
    const key = Number(row.block_id);
    const list = factsByBlockId.get(key) || [];
    list.push({
      id: Number(row.id),
      content: row.content,
      sort_order: Number(row.sort_order),
    });
    factsByBlockId.set(key, list);
  }

  for (const row of checklistRows) {
    const key = Number(row.block_id);
    const list = checklistByBlockId.get(key) || [];
    list.push({
      id: Number(row.id),
      content: row.content,
      is_checked: typeof row.is_checked === 'number' ? row.is_checked : Number(Boolean(row.is_checked)),
      sort_order: Number(row.sort_order),
    });
    checklistByBlockId.set(key, list);
  }

  const blocks = blockRows.map(row => {
    const blockId = Number(row.id);
    const base = {
      id: blockId,
      card_id: Number(row.card_id),
      block_type: row.block_type,
      sort_order: Number(row.sort_order),
      heading: row.heading ?? null,
      created_at: row.created_at,
    };

    if (row.block_type === 'text') {
      return {
        ...base,
        content: textByBlockId.get(blockId)?.content ?? '',
      };
    }

    if (row.block_type === 'image') {
      const imageRow = imageByBlockId.get(blockId);
      return {
        ...base,
        image_path: imageRow?.image_path ?? null,
        caption: imageRow?.caption ?? null,
      };
    }

    if (row.block_type === 'facts') {
      return {
        ...base,
        items: factsByBlockId.get(blockId) || [],
      };
    }

    return {
      ...base,
      items: checklistByBlockId.get(blockId) || [],
    };
  });

  return {
    card_id: Number(detailsRow.card_id),
    board_id: Number(detailsRow.board_id),
    title: detailsRow.title,
    image_path: detailsRow.image_path ?? null,
    created_at: detailsRow.created_at,
    updated_at: detailsRow.updated_at,
    blocks,
  };
};

const emitBoardsUpdatedToBoardUsers = async (req, boardId, payload, extraUserIds = []) => {
  try {
    const io = req.app.get('io');
    if (!io) return;

    const [boardRows] = await db.execute(
      `SELECT owner_id, is_public FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) return;

    const ownerId = Number(boardRows[0]?.owner_id);
    const [guestRows] = await db.execute(
      `SELECT user_id FROM boardguests WHERE board_id = ? AND role IN ('guest','editer')`,
      [boardId]
    );

    const ids = new Set();
    if (Number.isFinite(ownerId) && ownerId > 0) ids.add(ownerId);

    for (const r of guestRows || []) {
      const id = Number(r?.user_id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }

    for (const idRaw of extraUserIds || []) {
      const id = Number(idRaw);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }

    for (const id of ids) {
      io.to(`user:${id}`).emit('boards:updated', { board_id: Number(boardId), ...(payload || {}) });
    }
  } catch {
    // ignore
  }
};

/* Получить все доски текущего пользователя */
exports.getMyBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT id, title, description, image, created_at
       FROM boards
       WHERE owner_id = ?
       ORDER BY created_at DESC`,
      [user_id]
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения досок' });
  }
};


/* Получить все доски, где пользователь гость */
exports.getGuestBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT b.id, b.title, b.description, b.image, b.created_at,
              bg.role AS my_role,
              bv.last_visited_at
       FROM boardguests bg
       JOIN boards b ON b.id = bg.board_id
       LEFT JOIN board_visits bv ON bv.board_id = b.id AND bv.user_id = ?
        WHERE bg.user_id = ? AND bg.role IN ('guest','editer')
       ORDER BY COALESCE(bv.last_visited_at, b.created_at) DESC`,
      [user_id, user_id]
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения гостевых досок' });
  }
};

/* Доски друзей (где пользователь гость) */
exports.getFriendsBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT b.id, b.title, b.description, b.image, b.created_at,
              bg.role AS my_role,
              bv.last_visited_at,
              u.username AS owner_username, u.nickname AS owner_nickname, u.avatar AS owner_avatar
       FROM boardguests bg
       JOIN boards b ON b.id = bg.board_id
       JOIN users u ON u.id = b.owner_id
       LEFT JOIN board_visits bv ON bv.board_id = b.id AND bv.user_id = ?
        WHERE bg.user_id = ? AND bg.role IN ('guest','editer')
       ORDER BY COALESCE(bv.last_visited_at, b.created_at) DESC`,
      [user_id, user_id]
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения досок друзей' });
  }
};


/* Популярные открытые доски */
exports.getPopularPublicBoards = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const hasUser = Number.isFinite(user_id) && user_id > 0;

    const [boards] = await db.execute(
      hasUser
        ? `SELECT b.id, b.title, b.description, b.image, b.created_at,
                  u.username AS owner_username, u.nickname AS owner_nickname, u.avatar AS owner_avatar,
                  COUNT(bv.user_id) AS visits
           FROM boards b
           JOIN users u ON u.id = b.owner_id
           LEFT JOIN board_visits bv ON bv.board_id = b.id
           LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
           WHERE b.is_public = 1 AND bg_block.user_id IS NULL
           GROUP BY b.id, b.title, b.description, b.image, b.created_at,
                    u.username, u.nickname, u.avatar
           ORDER BY visits DESC, b.created_at DESC
           LIMIT 5`
        : `SELECT b.id, b.title, b.description, b.image, b.created_at,
                  u.username AS owner_username, u.nickname AS owner_nickname, u.avatar AS owner_avatar,
                  COUNT(bv.user_id) AS visits
           FROM boards b
           JOIN users u ON u.id = b.owner_id
           LEFT JOIN board_visits bv ON bv.board_id = b.id
           WHERE b.is_public = 1
           GROUP BY b.id, b.title, b.description, b.image, b.created_at,
                    u.username, u.nickname, u.avatar
           ORDER BY visits DESC, b.created_at DESC
           LIMIT 5`,
      hasUser ? [user_id] : []
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения популярных досок' });
  }
};

/* Public board by id (for guests) */
exports.getPublicBoardById = async (req, res) => {
  try {
    const boardId = Number(req.params.board_id);
    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректный board_id' });
    }

    const user_id = Number(req.user?.id);
    const hasUser = Number.isFinite(user_id) && user_id > 0;

    const [rows] = await db.execute(
      hasUser
        ? `SELECT b.id, b.owner_id, b.is_public, b.title, b.description, b.image, b.created_at,
                  u.username AS owner_username, u.nickname AS owner_nickname, u.avatar AS owner_avatar
           FROM boards b
           JOIN users u ON u.id = b.owner_id
           LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
           WHERE b.id = ? AND b.is_public = 1 AND bg_block.user_id IS NULL
           LIMIT 1`
        : `SELECT b.id, b.owner_id, b.is_public, b.title, b.description, b.image, b.created_at,
                  u.username AS owner_username, u.nickname AS owner_nickname, u.avatar AS owner_avatar
           FROM boards b
           JOIN users u ON u.id = b.owner_id
           WHERE b.id = ? AND b.is_public = 1
           LIMIT 1`,
      hasUser ? [user_id, boardId] : [boardId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    return res.status(200).json(rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения доски' });
  }
};

/* Последние посещённые доски */
exports.getRecentBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT b.id, b.owner_id, b.is_public, b.title, b.description, b.image, b.created_at,
              bv.last_visited_at,
              CASE
                WHEN b.owner_id = ? THEN 'owner'
                WHEN bg.user_id IS NOT NULL THEN bg.role
                ELSE NULL
              END AS my_role
       FROM board_visits bv
       JOIN boards b ON b.id = bv.board_id
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
       LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
       WHERE bv.user_id = ?
         AND bg_block.user_id IS NULL
         AND (b.owner_id = ? OR bg.user_id IS NOT NULL OR b.is_public = 1)
       ORDER BY bv.last_visited_at DESC
       LIMIT 10`,
      [user_id, user_id, user_id, user_id, user_id]
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения последних досок' });
  }
};



/* Создать доску */
exports.createBoard = async (req, res) => {
  try {
    const user_id = req.user.id;
    const title = String(req.body?.title ?? '').trim();
    const descriptionRaw = req.body?.description;
    const description =
      typeof descriptionRaw === 'string'
        ? (descriptionRaw.trim() || null)
        : descriptionRaw === null
          ? null
          : (String(descriptionRaw ?? '').trim() || null);

    const imageFromBody = typeof req.body?.image === 'string' ? req.body.image.trim() : null;
    const image = req.file ? `/uploads/${req.file.filename}` : (imageFromBody || null);

    if (!title) {
      if (req.file) await safeUnlinkUpload(image);
      return res.status(400).json({ message: 'Название обязательно' });
    }
    if (title.length > 20) {
      if (req.file) await safeUnlinkUpload(image);
      return res.status(400).json({ message: 'Название слишком длинное (max 20)' });
    }
    if (description && description.length > 80) {
      if (req.file) await safeUnlinkUpload(image);
      return res.status(400).json({ message: 'Описание слишком длинное (max 80)' });
    }
    if (image && image.length > 255) {
      if (req.file) await safeUnlinkUpload(image);
      return res.status(400).json({ message: 'Слишком длинный путь к картинке (max 255)' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO boards (owner_id, title, description, image)
         VALUES (?, ?, ?, ?)`,
        [user_id, title, description, image]
      );

      const boardId = result.insertId;

      await connection.execute(
        `INSERT INTO boardsettings (board_id, zoom, background_color, background_image)
         VALUES (?, ?, ?, ?)`,
        [boardId, 1.0, '#ffffff', null]
      );

      await connection.commit();

      return res.status(201).json({
        id: boardId,
        title,
        description,
        image,
      });
    } catch (err) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      if (req.file) await safeUnlinkUpload(image);
      throw err;
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка создания доски' });
  }
};


/* Удалить доску */
exports.deleteBoard = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [boardRows] = await connection.execute(
        `SELECT image FROM boards WHERE id = ? AND owner_id = ?`,
        [board_id, user_id]
      );

      if (!boardRows.length) {
        await connection.rollback();
        return res.status(404).json({ message: 'Доска не найдена' });
      }

      const boardImage = boardRows[0]?.image ?? null;

      await connection.execute(
        `DELETE cc
           FROM cardcomments cc
           JOIN cards c ON c.id = cc.card_id
          WHERE c.board_id = ?`,
        [board_id]
      );

      await connection.execute(
        `DELETE cd
           FROM carddetails cd
           JOIN cards c ON c.id = cd.card_id
          WHERE c.board_id = ?`,
        [board_id]
      );

      await connection.execute(`DELETE FROM cards WHERE board_id = ?`, [board_id]);
      await connection.execute(`DELETE FROM boardguests WHERE board_id = ?`, [board_id]);
      await connection.execute(`DELETE FROM board_invites WHERE board_id = ?`, [board_id]);
      await connection.execute(`DELETE FROM board_visits WHERE board_id = ?`, [board_id]);
      await connection.execute(`DELETE FROM activitylog WHERE board_id = ?`, [board_id]);
      await connection.execute(`DELETE FROM boardsettings WHERE board_id = ?`, [board_id]);

      const [result] = await connection.execute(
        `DELETE FROM boards WHERE id = ? AND owner_id = ?`,
        [board_id, user_id]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Доска не найдена' });
      }

      await connection.commit();

      if (boardImage) {
        safeUnlinkUpload(boardImage);
      }

      return res.status(200).json({ message: 'Доска удалена' });
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления доски' });
  }
};


/* Переименовать доску */
exports.renameBoard = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;
    const boardId = Number(board_id);
    const title = String(req.body?.title ?? '').trim();

    if (!title) {
      return res.status(400).json({ message: 'Название обязательно' });
    }
    if (title.length > 20) {
      return res.status(400).json({ message: 'Название слишком длинное (max 20)' });
    }

    const [result] = await db.execute(
      `UPDATE boards SET title = ?
       WHERE id = ? AND owner_id = ?`,
      [title, board_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    try {
      const [rows] = await db.execute(`SELECT is_public FROM boards WHERE id = ? LIMIT 1`, [board_id]);
      const isPublic = Number(rows?.[0]?.is_public) === 1 || rows?.[0]?.is_public === true;

      if (Number.isFinite(boardId) && boardId > 0) {
        const io = req.app.get('io');
        if (io && isPublic) {
          io.emit('boards:updated', { reason: 'meta_changed', board_id: boardId });
        }
        emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'meta_changed', board_id: boardId }, [user_id]);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ title });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка переименования' });
  }
};


/* Изменить описание */
exports.updateDescription = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;
    const boardId = Number(board_id);
    const descriptionRaw = req.body?.description;
    const description =
      typeof descriptionRaw === 'string'
        ? (descriptionRaw.trim() || null)
        : descriptionRaw === null
          ? null
          : (String(descriptionRaw ?? '').trim() || null);

    if (description && description.length > 80) {
      return res.status(400).json({ message: 'Описание слишком длинное (max 80)' });
    }

    const [result] = await db.execute(
      `UPDATE boards SET description = ?
       WHERE id = ? AND owner_id = ?`,
      [description, board_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    try {
      const [rows] = await db.execute(`SELECT is_public FROM boards WHERE id = ? LIMIT 1`, [board_id]);
      const isPublic = Number(rows?.[0]?.is_public) === 1 || rows?.[0]?.is_public === true;

      if (Number.isFinite(boardId) && boardId > 0) {
        const io = req.app.get('io');
        if (io && isPublic) {
          io.emit('boards:updated', { reason: 'meta_changed', board_id: boardId });
        }
        emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'meta_changed', board_id: boardId }, [user_id]);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ description });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления описания' });
  }
};

/* Сделать доску публичной/приватной */
exports.updateBoardPublic = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;
    const boardId = Number(board_id);
    const raw = req.body?.is_public;

    const isPublic =
      typeof raw === 'boolean'
        ? raw
        : typeof raw === 'number'
          ? raw === 1
          : typeof raw === 'string'
            ? raw === '1' || raw.toLowerCase() === 'true'
            : null;

    if (isPublic === null) {
      return res.status(400).json({ message: 'Некорректный параметр is_public' });
    }

    const value = isPublic ? 1 : 0;
    const [result] = await db.execute(
      `UPDATE boards SET is_public = ?
       WHERE id = ? AND owner_id = ?`,
      [value, board_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    try {
      if (Number.isFinite(boardId) && boardId > 0) {
        // Board public status affects global "public boards" listings, so notify all connected clients.
        const io = req.app.get('io');
        if (io) {
          io.emit('boards:updated', { reason: 'public_changed', board_id: boardId });
        }

        emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'public_changed', board_id: boardId }, [user_id]);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ is_public: value });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления публичности' });
  }
};

/* Войти в публичную доску как гость (если ещё нет доступа) */
exports.joinPublicBoardAsGuest = async (req, res) => {
  try {
    const user_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(
      `SELECT id, owner_id, is_public
       FROM boards
       WHERE id = ?
       LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const board = boardRows[0];
    const isPublic = Number(board?.is_public) === 1;
    if (!isPublic) {
      return res.status(403).json({ message: 'Доска не публичная' });
    }

    if (Number(board?.owner_id) === Number(user_id)) {
      return res.status(200).json({ board_id: boardId, my_role: 'owner' });
    }

    const [existing] = await db.execute(
      `SELECT role
       FROM boardguests
       WHERE board_id = ? AND user_id = ?
       LIMIT 1`,
      [boardId, user_id]
    );

    if (existing.length && String(existing[0]?.role) === 'blocked') {
      return res.status(403).json({ message: 'Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ' });
    }

    if (!existing.length) {
      await db.execute(
        `INSERT INTO boardguests (board_id, user_id, role)
         VALUES (?, ?, 'guest')`,
        [boardId, user_id]
      );
    }

    // Clear stale invites (including rejected) when the user joins the board via public flow.
    const [inviteRows] = await db.execute(
      `SELECT id
       FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
      [boardId, user_id]
    );

    if (Array.isArray(inviteRows) && inviteRows.length) {
      await db.execute(
        `DELETE FROM board_invites
         WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
        [boardId, user_id]
      );

      try {
        const io = req.app.get('io');
        if (io) {
          for (const r of inviteRows) {
            const id = Number(r?.id);
            if (Number.isFinite(id) && id > 0) {
              io.to(`user:${user_id}`).emit('board_invite:removed', { id });
            }
          }
        }
      } catch {
        // ignore
      }
    }

    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'join_public', board_id: boardId, user_id }, [user_id]);
    return res.status(200).json({ board_id: boardId, my_role: 'guest' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка входа в доску' });
  }
};


/* Изменить картинку */
exports.updateBoardImage = async (req, res) => {
  let newImage = null;

  try {
    const user_id = req.user.id;
    const { board_id } = req.params;
    const boardId = Number(board_id);

    if (req.file) {
      newImage = `/uploads/${req.file.filename}`;
    } else if (typeof req.body?.image === 'string') {
      newImage = req.body.image.trim() || null;
    } else if (req.body?.image === null) {
      newImage = null;
    } else {
      return res.status(400).json({ message: 'Картинка обязательна' });
    }

    if (newImage && newImage.length > 255) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(400).json({ message: 'Слишком длинный путь к картинке (max 255)' });
    }

    const [rows] = await db.execute(
      `SELECT image, is_public
       FROM boards
       WHERE id = ? AND owner_id = ?`,
      [board_id, user_id]
    );

    if (!rows.length) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const oldImage = rows[0]?.image ?? null;
    const isPublic = Number(rows[0]?.is_public) === 1 || rows[0]?.is_public === true;

    await db.execute(
      `UPDATE boards SET image = ?
       WHERE id = ? AND owner_id = ?`,
      [newImage, board_id, user_id]
    );

    const oldRel = getUploadsRelativePath(oldImage);
    const newRel = getUploadsRelativePath(newImage);
    if (oldRel && oldRel !== newRel) {
      await safeUnlinkUpload(oldImage);
    }

    try {
      if (Number.isFinite(boardId) && boardId > 0) {
        const io = req.app.get('io');
        if (io && isPublic) {
          io.emit('boards:updated', { reason: 'meta_changed', board_id: boardId });
        }
        emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'meta_changed', board_id: boardId }, [user_id]);
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ image: newImage });
  } catch (e) {
    if (req.file && newImage) {
      await safeUnlinkUpload(newImage);
    }
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления картинки' });
  }
};


/* Пригласить в доску по username/friend_code (только владелец) */
exports.inviteToBoard = async (req, res) => {
  try {
    const inviter_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId)) {
      return res.status(400).json({ message: 'Некорректный board_id' });
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const friend_code = typeof req.body?.friend_code === 'string' ? req.body.friend_code.trim() : '';

    if (!username && !friend_code) {
      return res.status(400).json({ message: 'Нужен username или friend_code' });
    }
    if (username && friend_code) {
      return res.status(400).json({ message: 'Укажи только одно: username или friend_code' });
    }

    const [boardRows] = await db.execute(
      `SELECT id, owner_id, title, description, image
       FROM boards
       WHERE id = ?
       LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const boardOwnerId = boardRows[0].owner_id;
    if (boardOwnerId !== inviter_id) {
      return res.status(403).json({ message: 'Только владелец может приглашать' });
    }

    let invited_id = null;

    if (username) {
      const [userRows] = await db.execute(
        `SELECT id FROM users WHERE username = ? LIMIT 1`,
        [username]
      );

      if (!userRows.length) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      invited_id = userRows[0].id;
    } else {
      if (!/^\d{8}$/.test(friend_code)) {
        return res.status(400).json({ message: 'Неверный friend_code' });
      }

      const [userRows] = await db.execute(
        `SELECT id FROM users WHERE friend_code = ? LIMIT 1`,
        [friend_code]
      );

      if (!userRows.length) {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      invited_id = userRows[0].id;
    }

    if (invited_id === inviter_id) {
      return res.status(400).json({ message: 'Нельзя пригласить себя' });
    }

    if (invited_id === boardOwnerId) {
      return res.status(400).json({ message: 'Пользователь уже владелец этой доски' });
    }

    const [guestRows] = await db.execute(
      `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? LIMIT 1`,
      [boardId, invited_id]
    );

    if (guestRows.length && String(guestRows[0]?.role || '') !== 'blocked') {
      return res.status(409).json({ message: 'Пользователь уже гость этой доски' });
    }

    const [existingInvites] = await db.execute(
      `SELECT id, status
       FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status IN ('sent', 'rejected')
       ORDER BY FIELD(status, 'sent', 'rejected')
       LIMIT 1`,
      [boardId, invited_id]
    );

    if (existingInvites.length) {
      const existing = existingInvites[0];
      if (existing.status === 'sent') {
        return res.status(409).json({ message: 'Приглашение уже отправлено', invite_id: existing.id, status: 'sent' });
      }
      if (existing.status === 'rejected') {
        return res.status(409).json({ message: 'Пользователь отклонил приглашение', invite_id: existing.id, status: 'rejected' });
      }
    }

    const [result] = await db.execute(
      `INSERT INTO board_invites (board_id, user_id, invited_id, status)
       VALUES (?, ?, ?, 'sent')`,
      [boardId, inviter_id, invited_id]
    );

    try {
      const io = req.app.get('io');
      const [inviterRows] = await db.execute(
        'SELECT id, username, nickname, avatar FROM users WHERE id = ? LIMIT 1',
        [inviter_id]
      );
      const inviter = inviterRows?.[0];

      io.to(`user:${invited_id}`).emit('board_invite:new', {
        id: result.insertId,
        board_id: boardId,
        title: boardRows[0]?.title ?? '',
        description: boardRows[0]?.description ?? null,
        image: boardRows[0]?.image ?? null,
        created_at: new Date().toISOString(),

        user_id: inviter?.id ?? inviter_id,
        username: inviter?.username ?? '',
        nickname: inviter?.nickname ?? null,
        avatar: inviter?.avatar ?? null,
      });
    } catch {
      // ignore
    }

    return res.status(201).json({
      id: result.insertId,
      board_id: boardId,
      invited_id,
      status: 'sent',
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка отправки приглашения' });
  }
};


/* Удалить гостя из доски (только владелец) */
exports.removeGuestFromBoard = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);
    const guestId = Number(req.params?.guest_id);

    if (!Number.isFinite(boardId) || !Number.isFinite(guestId)) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id, is_public FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    if (boardRows[0].owner_id !== owner_id) {
      return res.status(403).json({ message: 'Только владелец может удалять гостей' });
    }

    if (guestId === owner_id) {
      return res.status(400).json({ message: 'Нельзя удалить владельца' });
    }

    const isPublic = Number(boardRows[0]?.is_public) === 1 || boardRows[0]?.is_public === true;

    let affectedRows = 0;
    if (isPublic) {
      const [result] = await db.execute(
        `UPDATE boardguests
         SET role = 'blocked'
         WHERE board_id = ? AND user_id = ? AND role IN ('guest','editer')`,
        [boardId, guestId]
      );
      affectedRows = result.affectedRows ?? 0;
    } else {
      const [result] = await db.execute(
        `DELETE FROM boardguests
         WHERE board_id = ? AND user_id = ? AND role IN ('guest','editer')`,
        [boardId, guestId]
      );
      affectedRows = result.affectedRows ?? 0;
    }

    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Гость не найден' });
    }

    await db.execute(
      `DELETE FROM board_visits WHERE board_id = ? AND user_id = ?`,
      [boardId, guestId]
    );

    await db.execute(
      `DELETE FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status != 'rejected'`,
      [boardId, guestId]
    );

    try {
      emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'removed', board_id: boardId, user_id: guestId }, [guestId, owner_id]);
    } catch {
      // ignore
    }

    return res.status(200).json({ message: 'Гость удалён' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления гостя' });
  }
};


/* Покинуть доску (для гостя) */
/* Обновить роль гостя (только владелец) */
exports.updateGuestRole = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);
    const guestId = Number(req.params?.guest_id);
    const nextRole = String(req.body?.role || '').trim();

    if (!Number.isFinite(boardId) || !Number.isFinite(guestId)) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    if (nextRole !== 'guest' && nextRole !== 'editer') {
      return res.status(400).json({ message: 'Некорректная роль' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    if (boardRows[0].owner_id !== owner_id) {
      return res.status(403).json({ message: 'Только владелец может менять роли' });
    }

    if (guestId === owner_id) {
      return res.status(400).json({ message: 'Нельзя менять роль владельца' });
    }

    const [guestRows] = await db.execute(
      `SELECT 1 FROM boardguests WHERE board_id = ? AND user_id = ? AND role IN ('guest','editer') LIMIT 1`,
      [boardId, guestId]
    );

    if (!guestRows.length) {
      return res.status(404).json({ message: 'Гость не найден' });
    }

    await db.execute(
      `UPDATE boardguests SET role = ? WHERE board_id = ? AND user_id = ? AND role IN ('guest','editer')`,
      [nextRole, boardId, guestId]
    );

    try {
      emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'role', board_id: boardId, user_id: guestId }, [guestId, owner_id]);
    } catch {
      // ignore
    }

    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка изменения роли' });
  }
};

exports.leaveBoard = async (req, res) => {
  try {
    const user_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId)) {
      return res.status(400).json({ message: 'Некорректный board_id' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    if (boardRows[0].owner_id === user_id) {
      return res.status(400).json({ message: 'Владелец не может покинуть доску' });
    }

    const [result] = await db.execute(
      `DELETE FROM boardguests WHERE board_id = ? AND user_id = ? AND role IN ('guest','editer')`,
      [boardId, user_id]
    );

    await db.execute(
      `DELETE FROM board_visits WHERE board_id = ? AND user_id = ?`,
      [boardId, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Р’С‹ РЅРµ РіРѕСЃС‚СЊ СЌС‚РѕР№ РґРѕСЃРєРё' });
    }
    try {
      emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'left', board_id: boardId, user_id }, [user_id, boardRows[0]?.owner_id]);
    } catch {
      // ignore
    }

    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка выхода из доски' });
  }
};


/* Зафиксировать посещение доски */
exports.visitBoard = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;
    const boardId = Number(board_id);

    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    await db.execute(
      `INSERT INTO board_visits (user_id, board_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_visited_at = CURRENT_TIMESTAMP`,
      [user_id, boardId]
    );

    // Remove stale invites (including rejected) if the user is already entering the board.
    const [inviteRows] = await db.execute(
      `SELECT id
       FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
      [boardId, user_id]
    );

    if (Array.isArray(inviteRows) && inviteRows.length) {
      await db.execute(
        `DELETE FROM board_invites
         WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
        [boardId, user_id]
      );

      try {
        const io = req.app.get('io');
        if (io) {
          for (const r of inviteRows) {
            const id = Number(r?.id);
            if (Number.isFinite(id) && id > 0) {
              io.to(`user:${user_id}`).emit('board_invite:removed', { id });
            }
          }
        }
      } catch {
        // ignore
      }

      try {
        emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'invite_cleared', board_id: boardId, user_id }, [user_id]);
      } catch {
        // ignore
      }
    }

    return res.status(204).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка фиксации посещения' });
  }
};



exports.getBoardById = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;

    const [rows] = await db.execute(
      `SELECT b.id, b.owner_id, b.is_public, b.title, b.description, b.image, b.created_at,
              CASE
                WHEN b.owner_id = ? THEN 'owner'
                WHEN bg.user_id IS NOT NULL THEN bg.role
                ELSE NULL
              END AS my_role
       FROM boards b
        LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
        WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
        LIMIT 1`,
      [user_id, user_id, board_id, user_id]
    );

    if (rows.length === 0) {
    return res.status(404).json({ message: 'Доска не найдена' });
  }

    return res.status(200).json(rows[0]);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения доски' });
  }
};


/* Получить все данные доски */
/* Participants list (owner + guests) */
exports.getBoardParticipants = async (req, res) => {
  try {
    const user_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(
      `SELECT b.id, b.owner_id,
              o.username AS owner_username, o.nickname AS owner_nickname, o.avatar AS owner_avatar,
              CASE
                WHEN b.owner_id = ? THEN 'owner'
                WHEN bg.user_id IS NOT NULL THEN bg.role
                ELSE NULL
              END AS my_role
       FROM boards b
       JOIN users o ON o.id = b.owner_id
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
       WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
       LIMIT 1`,
      [user_id, user_id, boardId, user_id]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const board = boardRows[0];

    const [guests] = await db.execute(
      `SELECT bg.user_id AS id, u.username, u.nickname, u.avatar, bg.role, bg.added_at
       FROM boardguests bg
       JOIN users u ON u.id = bg.user_id
       WHERE bg.board_id = ? AND bg.role IN ('guest','editer')
       ORDER BY bg.added_at ASC`,
      [boardId]
    );

    const participants = [
      {
        id: board.owner_id,
        username: board.owner_username,
        nickname: board.owner_nickname ?? null,
        avatar: board.owner_avatar ?? null,
        role: 'owner',
      },
      ...guests
        .filter((g) => g.id !== board.owner_id)
        .map((g) => ({
          id: g.id,
          username: g.username,
          nickname: g.nickname ?? null,
          avatar: g.avatar ?? null,
          role: g.role,
          added_at: g.added_at,
        })),
    ];

    return res.status(200).json({
      board_id: boardId,
      my_role: board.my_role,
      participants,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения участников' });
  }
};


exports.getBoardFull = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { board_id } = req.params;

    const [boardRows] = await db.execute(
      `SELECT b.id, b.owner_id, b.title, b.description, b.image, b.created_at,
              o.username AS owner_username, o.nickname AS owner_nickname, o.avatar AS owner_avatar,
              CASE
                WHEN b.owner_id = ? THEN 'owner'
                WHEN bg.user_id IS NOT NULL THEN bg.role
                ELSE NULL
              END AS my_role
       FROM boards b
       JOIN users o ON o.id = b.owner_id
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
        WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
        LIMIT 1`,
      [user_id, user_id, board_id, user_id]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const board = boardRows[0];

    const [settingsRows] = await db.execute(
      `SELECT zoom, background_color, background_image
       FROM boardsettings
       WHERE board_id = ?
       LIMIT 1`,
      [board_id]
    );

    const [guests] = await db.execute(
      `SELECT bg.user_id AS id, u.username, u.nickname, u.avatar, bg.role, bg.added_at
       FROM boardguests bg
       JOIN users u ON u.id = bg.user_id
       WHERE bg.board_id = ? AND bg.role IN ('guest','editer')
       ORDER BY bg.added_at ASC`,
      [board_id]
    );

    const [cardsRows] = await db.execute(
      `SELECT id, board_id, type, title, text, image_path, x, y, linked_card_ids, created_at
       FROM cards
       WHERE board_id = ?
       ORDER BY created_at ASC, id ASC`,
      [board_id]
    );

    let cards = cardsRows.map(card => ({ ...card, details: [], comments: [] }));

    if (cardsRows.length) {
      const cardIds = cardsRows.map(c => c.id);
      const placeholders = cardIds.map(() => '?').join(',');

      const [detailsRows] = await db.execute(
        `SELECT id, card_id, content_type, content
         FROM carddetails
         WHERE card_id IN (${placeholders})
         ORDER BY id ASC`,
        cardIds
      );

      const [commentsRows] = await db.execute(
        `SELECT cc.id, cc.card_id, cc.user_id, cc.content, cc.created_at,
                u.username, u.nickname, u.avatar
         FROM cardcomments cc
         JOIN users u ON u.id = cc.user_id
         WHERE cc.card_id IN (${placeholders})
         ORDER BY cc.created_at ASC, cc.id ASC`,
        cardIds
      );

      const detailsByCardId = new Map();
      for (const row of detailsRows) {
        const key = row.card_id;
        const list = detailsByCardId.get(key) || [];
        list.push(row);
        detailsByCardId.set(key, list);
      }

      const commentsByCardId = new Map();
      for (const row of commentsRows) {
        const key = row.card_id;
        const list = commentsByCardId.get(key) || [];
        list.push(row);
        commentsByCardId.set(key, list);
      }

      cards = cardsRows.map(card => ({
        ...card,
        details: detailsByCardId.get(card.id) || [],
        comments: commentsByCardId.get(card.id) || [],
      }));
    }

    return res.status(200).json({
      board: {
        id: board.id,
        owner_id: board.owner_id,
        title: board.title,
        description: board.description,
        image: board.image,
        created_at: board.created_at,
        owner: {
          id: board.owner_id,
          username: board.owner_username,
          nickname: board.owner_nickname,
          avatar: board.owner_avatar,
        },
      },
      my_role: board.my_role,
      settings: settingsRows[0] || null,
      guests,
      cards,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения данных доски' });
  }
};


/* Приглашения в доски (входящие) */
exports.getIncomingBoardInvites = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [invites] = await db.execute(
      `SELECT bi.id, bi.created_at,
              b.id as board_id, b.title, b.description, b.image,
              u.id as user_id, u.username, u.nickname, u.avatar
       FROM board_invites bi
       JOIN boards b ON b.id = bi.board_id
       JOIN users u ON u.id = bi.user_id
       WHERE bi.invited_id = ? AND bi.status = 'sent'
       ORDER BY bi.created_at DESC`,
      [user_id]
    );

    return res.status(200).json(invites);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения приглашений' });
  }
};


exports.acceptBoardInvite = async (req, res) => {
  const invited_id = req.user.id;
  const { invite_id } = req.params;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT board_id FROM board_invites
       WHERE id = ? AND invited_id = ? AND status = 'sent'`,
      [invite_id, invited_id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Приглашение не найдено' });
    }

    const board_id = rows[0].board_id;

    const [existing] = await connection.execute(
      `SELECT role FROM boardguests
       WHERE board_id = ? AND user_id = ?
       LIMIT 1`,
      [board_id, invited_id]
    );

    if (existing.length && String(existing[0]?.role) === 'blocked') {
      await connection.execute(
        `UPDATE boardguests
         SET role = 'guest'
         WHERE board_id = ? AND user_id = ? AND role = 'blocked'`,
        [board_id, invited_id]
      );
    }

    if (!existing.length) {
      await connection.execute(
        `INSERT INTO boardguests (board_id, user_id, role)
         VALUES (?, ?, 'guest')`,
        [board_id, invited_id]
      );
    }

    await connection.execute(
      `DELETE FROM board_invites
       WHERE id = ? AND invited_id = ?`,
      [invite_id, invited_id]
    );

    await connection.commit();
    try {
      const io = req.app.get('io');
      emitBoardsUpdatedToBoardUsers(req, Number(board_id), { reason: 'invite_accepted', board_id: Number(board_id), user_id: invited_id }, [invited_id]);
      io.to(`user:${invited_id}`).emit('board_invite:removed', { id: Number(invite_id) });
    } catch {
      // ignore
    }
    return res.status(200).json({ message: 'Приглашение принято' });
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error(e);
    return res.status(500).json({ message: 'Ошибка принятия приглашения' });
  } finally {
    connection.release();
  }
};


exports.rejectBoardInvite = async (req, res) => {
  try {
    const invited_id = req.user.id;
    const { invite_id } = req.params;

    const [rows] = await db.execute(
      `SELECT id, board_id, user_id FROM board_invites
       WHERE id = ? AND invited_id = ? AND status = 'sent'`,
      [invite_id, invited_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Приглашение не найдено' });
    }

    await db.execute(
      `UPDATE board_invites
       SET status = 'rejected'
       WHERE id = ?`,
      [invite_id]
    );

    try {
      const io = req.app.get('io');
      io.to(`user:${invited_id}`).emit('board_invite:removed', { id: Number(invite_id) });
      emitBoardsUpdatedToBoardUsers(req, Number(rows[0].board_id), { reason: 'invite_rejected', board_id: Number(rows[0].board_id), user_id: invited_id }, [
        Number(rows[0].user_id),
        invited_id,
      ]);
    } catch {
      // ignore
    }

    return res.status(200).json({ message: 'Приглашение отклонено' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка отклонения приглашения' });
  }
};


exports.getOutgoingBoardInvites = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId)) {
      return res.status(400).json({ message: 'Invalid board_id' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Board not found' });
    }

    if (Number(boardRows[0].owner_id) !== owner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const [invites] = await db.execute(
      `SELECT id, invited_id, status, created_at
       FROM board_invites
       WHERE board_id = ? AND status IN ('sent', 'rejected')
       ORDER BY created_at DESC`,
      [boardId]
    );

    return res.status(200).json(Array.isArray(invites) ? invites : []);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.cancelBoardInvite = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);
    const inviteId = Number(req.params?.invite_id);

    if (!Number.isFinite(boardId) || !Number.isFinite(inviteId)) {
      return res.status(400).json({ message: 'Invalid params' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Board not found' });
    }

    if (Number(boardRows[0].owner_id) !== owner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const [rows] = await db.execute(
      `SELECT invited_id, status
       FROM board_invites
       WHERE id = ? AND board_id = ?
       LIMIT 1`,
      [inviteId, boardId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (rows[0].status !== 'sent') {
      return res.status(409).json({ message: 'Invite is not active' });
    }

    await db.execute(
      `DELETE FROM board_invites
       WHERE id = ?`,
      [inviteId]
    );

    try {
      const io = req.app.get('io');
      io.to(`user:${Number(rows[0].invited_id)}`).emit('board_invite:removed', { id: inviteId });
    } catch {
      // ignore
    }

    return res.status(200).json({ message: 'OK' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.getBoardInviteLink = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId)) {
      return res.status(400).json({ message: 'Invalid board_id' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Board not found' });
    }

    if (Number(boardRows[0].owner_id) !== owner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const [rows] = await db.execute(
      `SELECT token, updated_at
       FROM board_invite_links
       WHERE board_id = ?
       LIMIT 1`,
      [boardId]
    );

    if (rows.length) {
      return res.status(200).json({ token: rows[0].token, updated_at: rows[0].updated_at });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = generateInviteToken();
      try {
        await db.execute(
          `INSERT INTO board_invite_links (board_id, token, created_by)
           VALUES (?, ?, ?)`,
          [boardId, token, owner_id]
        );
        return res.status(201).json({ token });
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') continue;
        throw e;
      }
    }

    return res.status(500).json({ message: 'Token generation failed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.regenerateBoardInviteLink = async (req, res) => {
  try {
    const owner_id = req.user.id;
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(boardId)) {
      return res.status(400).json({ message: 'Invalid board_id' });
    }

    const [boardRows] = await db.execute(
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
      [boardId]
    );

    if (!boardRows.length) {
      return res.status(404).json({ message: 'Board not found' });
    }

    if (Number(boardRows[0].owner_id) !== owner_id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const [existing] = await db.execute(
      `SELECT 1 FROM board_invite_links WHERE board_id = ? LIMIT 1`,
      [boardId]
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = generateInviteToken();
      try {
        if (existing.length) {
          await db.execute(
            `UPDATE board_invite_links
             SET token = ?, created_by = ?
             WHERE board_id = ?`,
            [token, owner_id, boardId]
          );
        } else {
          await db.execute(
            `INSERT INTO board_invite_links (board_id, token, created_by)
             VALUES (?, ?, ?)`,
            [boardId, token, owner_id]
          );
        }

        return res.status(200).json({ token });
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') continue;
        throw e;
      }
    }

    return res.status(500).json({ message: 'Token generation failed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.acceptBoardInviteLink = async (req, res) => {
  const user_id = req.user.id;
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

  if (!token) {
    return res.status(400).json({ message: 'token required' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    let clearedInviteIds = [];

    const [rows] = await connection.execute(
      `SELECT bil.board_id, b.owner_id
       FROM board_invite_links bil
       JOIN boards b ON b.id = bil.board_id
       WHERE bil.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Invite link not found' });
    }

    const board_id = Number(rows[0].board_id);
    const owner_id = Number(rows[0].owner_id);

    if (owner_id !== user_id) {
      const [existing] = await connection.execute(
        `SELECT role FROM boardguests
         WHERE board_id = ? AND user_id = ?
         LIMIT 1`,
        [board_id, user_id]
      );

      if (existing.length && String(existing[0]?.role) === 'blocked') {
        await connection.execute(
          `UPDATE boardguests
           SET role = 'guest'
           WHERE board_id = ? AND user_id = ? AND role = 'blocked'`,
          [board_id, user_id]
        );
      }

       if (!existing.length) {
         await connection.execute(
           `INSERT INTO boardguests (board_id, user_id, role)
            VALUES (?, ?, 'guest')`,
           [board_id, user_id]
         );
       }
    }

    // Clear stale invites (including rejected) when the user joins the board via invite-link flow.
    const [inviteRows] = await connection.execute(
      `SELECT id
       FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
      [board_id, user_id]
    );

    if (Array.isArray(inviteRows) && inviteRows.length) {
      clearedInviteIds = inviteRows
        .map((r) => Number(r?.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      await connection.execute(
        `DELETE FROM board_invites
         WHERE board_id = ? AND invited_id = ? AND status IN ('sent','rejected')`,
        [board_id, user_id]
      );
    }

    await connection.commit();

    try {
      emitBoardsUpdatedToBoardUsers(req, board_id, { reason: 'invite_link_accepted', board_id, user_id }, [user_id, owner_id]);
      if (clearedInviteIds.length) {
        const io = req.app.get('io');
        if (io) {
          for (const id of clearedInviteIds) {
            io.to(`user:${user_id}`).emit('board_invite:removed', { id });
          }
        }
      }
    } catch {
      // ignore
    }

    return res.status(200).json({ board_id });
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      // ignore
    }
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    connection.release();
  }
};

exports.resolveBoardInviteLink = async (req, res) => {
  const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    return res.status(400).json({ message: 'token required' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT bil.board_id
       FROM board_invite_links bil
       JOIN boards b ON b.id = bil.board_id
       WHERE bil.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Invite link not found' });
    }

    const board_id = Number(rows[0].board_id);
    if (!Number.isFinite(board_id) || board_id <= 0) {
      return res.status(404).json({ message: 'Invite link not found' });
    }

    return res.status(200).json({ board_id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.previewBoardInviteLink = async (req, res) => {
  const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    return res.status(400).json({ message: 'token required' });
  }

  try {
    const [rows] = await db.execute(
      `SELECT b.id, b.title, b.description, b.image, b.created_at, b.is_public
       FROM board_invite_links bil
       JOIN boards b ON b.id = bil.board_id
       WHERE bil.token = ?
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Invite link not found' });
    }

    const row = rows[0];
    const board_id = Number(row.id);
    if (!Number.isFinite(board_id) || board_id <= 0) {
      return res.status(404).json({ message: 'Invite link not found' });
    }

    return res.status(200).json({
      id: board_id,
      board_id,
      title: row.title,
      description: row.description ?? null,
      image: row.image ?? null,
      created_at: row.created_at,
      is_public: row.is_public,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
};


exports.createCard = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(user_id) || user_id <= 0 || !Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const rawType = String(req.body?.type || '').trim();
    const rawTitle = String(req.body?.title || '').trim();
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);

    const allowedTypes = new Set(['rectangle', 'circle', 'diamond']);
    if (!allowedTypes.has(rawType)) {
      return res.status(400).json({ message: 'Некорректный тип' });
    }

    if (!rawTitle || rawTitle.length > 50) {
      return res.status(400).json({ message: 'Некорректный заголовок' });
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ message: 'Некорректные координаты' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `INSERT INTO cards (board_id, type, title, x, y)
         VALUES (?, ?, ?, ?, ?)`,
        [boardId, rawType, rawTitle, x, y]
      );

      const id = Number(result?.insertId);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error('Failed to create card');
      }

      await connection.execute(`INSERT INTO carddetails (card_id) VALUES (?)`, [id]);

      await connection.commit();

      emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_created', card_id: id }, [user_id]);

      return res.status(201).json({
        id,
        board_id: boardId,
        type: rawType,
        title: rawTitle,
        x,
        y,
      });
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка создания записи' });
  }
};


exports.getBoardCards = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(user_id) || user_id <= 0 || !Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [accessRows] = await db.execute(
      `SELECT 1
       FROM boards b
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
       WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
       LIMIT 1`,
      [user_id, boardId, user_id]
    );

    if (!accessRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const [rows] = await db.execute(
      `SELECT id, board_id, type, title, image_path, is_locked, x, y, created_at
       FROM cards
       WHERE board_id = ?
       ORDER BY created_at ASC, id ASC`,
      [boardId]
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения записей' });
  }
};


exports.getCardDetails = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [accessRows] = await db.execute(
      `SELECT 1
       FROM boards b
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
       WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
       LIMIT 1`,
      [user_id, boardId, user_id]
    );

    if (!accessRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const connection = await db.getConnection();
    try {
      const [cardRows] = await connection.execute(
        `SELECT title, image_path
         FROM cards
         WHERE id = ? AND board_id = ?
         LIMIT 1`,
        [cardId, boardId]
      );

      if (!cardRows.length) {
        return res.status(404).json({ message: 'Запись не найдена' });
      }

      await ensureCardDetailsDefaults(connection, {
        cardId,
        cardTitle: cardRows[0]?.title ?? null,
      });

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      if (!payload) {
        return res.status(404).json({ message: 'Запись не найдена' });
      }

      return res.status(200).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения карточки' });
  }
};

exports.getPublicBoardCards = async (req, res) => {
  try {
    const boardId = Number(req.params?.board_id);
    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const userId = req.user?.id ? Number(req.user.id) : null;

    if (Number.isFinite(userId) && userId && userId > 0) {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards b
         LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
         WHERE b.id = ? AND b.is_public = 1 AND bg_block.user_id IS NULL
         LIMIT 1`,
        [userId, boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    } else {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards
         WHERE id = ? AND is_public = 1
         LIMIT 1`,
        [boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    }

    const [rows] = await db.execute(
      `SELECT id, board_id, type, title, image_path, is_locked, x, y, created_at
       FROM cards
       WHERE board_id = ?
       ORDER BY created_at ASC, id ASC`,
      [boardId]
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения записей' });
  }
};

exports.getPublicCardDetails = async (req, res) => {
  try {
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (!Number.isFinite(boardId) || boardId <= 0 || !Number.isFinite(cardId) || cardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const userId = req.user?.id ? Number(req.user.id) : null;

    if (Number.isFinite(userId) && userId && userId > 0) {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards b
         LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
         WHERE b.id = ? AND b.is_public = 1 AND bg_block.user_id IS NULL
         LIMIT 1`,
        [userId, boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    } else {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards
         WHERE id = ? AND is_public = 1
         LIMIT 1`,
        [boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    }

    const connection = await db.getConnection();
    try {
      const [cardRows] = await connection.execute(
        `SELECT title, image_path
         FROM cards
         WHERE id = ? AND board_id = ?
         LIMIT 1`,
        [cardId, boardId]
      );

      if (!cardRows.length) {
        return res.status(404).json({ message: 'Запись не найдена' });
      }

      await ensureCardDetailsDefaults(connection, {
        cardId,
        cardTitle: cardRows[0]?.title ?? null,
      });

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      if (!payload) {
        return res.status(404).json({ message: 'Запись не найдена' });
      }

      return res.status(200).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения карточки' });
  }
};

exports.createCardDetailsBlock = async (req, res) => {
  let newImage = null;

  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);
    const blockType = String(req.body?.type || '').trim();

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    if (!CARD_DETAIL_BLOCK_TYPES.has(blockType)) {
      if (req.file) await safeUnlinkUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Некорректный тип блока' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      if (req.file) await safeUnlinkUpload(`/uploads/${req.file.filename}`);
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);
    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      if (req.file) await safeUnlinkUpload(`/uploads/${req.file.filename}`);
      return res.status(403).json({ message: 'Нет доступа' });
    }

    if (blockType === 'image') {
      if (!req.file) {
        return res.status(400).json({ message: 'Картинка обязательна' });
      }
      newImage = `/uploads/${req.file.filename}`;
      if (newImage.length > 255) {
        await safeUnlinkUpload(newImage);
        return res.status(400).json({ message: 'Слишком длинный путь к картинке (max 255)' });
      }
    }

    if (blockType === 'text') {
      const textResult = normalizeCardDetailTextContent(req.body?.content);
      if (!textResult.ok) {
        return res.status(400).json({ message: 'Пустой текст нельзя сохранить' });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const [cardRows] = await connection.execute(
        `SELECT title, image_path
         FROM cards
         WHERE id = ? AND board_id = ?
         LIMIT 1`,
        [cardId, boardId]
      );

      if (!cardRows.length) {
        await connection.rollback();
        if (newImage) await safeUnlinkUpload(newImage);
        return res.status(404).json({ message: 'Запись не найдена' });
      }

      await ensureCardDetailsDefaults(connection, {
        cardId,
        cardTitle: cardRows[0]?.title ?? null,
      });

      const nextSortOrder = await getNextCardDetailBlockSortOrder(connection, cardId);
      const blockId = await insertCardDetailBlock(connection, {
        cardId,
        blockType,
        sortOrder: nextSortOrder,
      });

      if (blockType === 'image') {
        await connection.execute(
          `INSERT INTO carddetail_image_blocks (block_id, image_path, caption)
           VALUES (?, ?, ?)`,
          [blockId, newImage, null]
        );
      } else if (blockType === 'text') {
        await connection.execute(
          `INSERT INTO carddetail_text_blocks (block_id, content)
           VALUES (?, ?)`,
          [blockId, String(req.body?.content).trim()]
        );
      }

      await connection.commit();

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      return res.status(201).json(payload);
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    if (newImage) await safeUnlinkUpload(newImage);
    console.error(e);
    return res.status(500).json({ message: 'Ошибка создания блока' });
  }
};
exports.updateCardDetailsBlock = async (req, res) => {
  let newImage = null;

  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);
    const blockId = Number(req.params?.block_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0 ||
      !Number.isFinite(blockId) ||
      blockId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);
    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const connection = await db.getConnection();
    try {
      const [blockRows] = await connection.execute(
        `SELECT b.id, b.block_type
         FROM carddetail_blocks b
         JOIN cards c ON c.id = b.card_id
         WHERE b.id = ? AND b.card_id = ? AND c.board_id = ?
         LIMIT 1`,
        [blockId, cardId, boardId]
      );

      if (!blockRows.length) {
        return res.status(404).json({ message: 'Блок не найден' });
      }

      const blockType = String(blockRows[0]?.block_type || '');

      if (blockType === 'text') {
        const textResult = normalizeCardDetailTextContent(req.body?.content);
        if (!textResult.ok) {
          return res.status(400).json({ message: 'Пустой текст нельзя сохранить' });
        }

        await connection.execute(
          `UPDATE carddetail_text_blocks
           SET content = ?
           WHERE block_id = ?`,
          [textResult.value, blockId]
        );
      } else if (blockType === 'image') {
        const hasCaption = Object.prototype.hasOwnProperty.call(req.body || {}, 'caption');
        const hasImageRemove = req.body?.image === null;
        const hasImageUpload = Boolean(req.file);
        const updates = [];
        const params = [];

        if (hasCaption) {
          const captionResult = normalizeCardDetailCaption(req.body?.caption);
          if (!captionResult.ok) {
            return res.status(400).json({ message: 'Некорректная подпись' });
          }
          updates.push('caption = ?');
          params.push(captionResult.value);
        }

        if (hasImageUpload || hasImageRemove) {
          const [imageRows] = await connection.execute(
            `SELECT image_path
             FROM carddetail_image_blocks
             WHERE block_id = ?
             LIMIT 1`,
            [blockId]
          );

          const oldImage = imageRows[0]?.image_path ?? null;
          newImage = hasImageUpload && req.file ? `/uploads/${req.file.filename}` : null;

          if (newImage && newImage.length > 255) {
            await safeUnlinkUpload(newImage);
            return res.status(400).json({ message: 'Слишком длинный путь к картинке (max 255)' });
          }

          updates.push('image_path = ?');
          params.push(hasImageRemove ? null : newImage);

          const oldRel = getUploadsRelativePath(oldImage);
          const nextRel = getUploadsRelativePath(hasImageRemove ? null : newImage);
          if (oldRel && oldRel !== nextRel) {
            await safeUnlinkUpload(oldImage);
          }
        }

        if (!updates.length) {
          return res.status(400).json({ message: 'Нет полей для обновления' });
        }

        params.push(blockId);
        await connection.execute(
          `UPDATE carddetail_image_blocks
           SET ${updates.join(', ')}
           WHERE block_id = ?`,
          params
        );
      } else {
        return res.status(400).json({ message: 'Этот блок пока не поддерживает PATCH' });
      }

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      return res.status(200).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    if (newImage) await safeUnlinkUpload(newImage);
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления блока' });
  }
};

exports.deleteCardDetailsBlock = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);
    const blockId = Number(req.params?.block_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0 ||
      !Number.isFinite(blockId) ||
      blockId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);
    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const connection = await db.getConnection();
    try {
      const [blockRows] = await connection.execute(
        `SELECT ib.image_path
         FROM carddetail_blocks b
         JOIN cards c ON c.id = b.card_id
         LEFT JOIN carddetail_image_blocks ib ON ib.block_id = b.id
         WHERE b.id = ? AND b.card_id = ? AND c.board_id = ?
         LIMIT 1`,
        [blockId, cardId, boardId]
      );

      if (!blockRows.length) {
        return res.status(404).json({ message: 'Блок не найден' });
      }

      const imagePath = blockRows[0]?.image_path ?? null;
      await connection.execute(`DELETE FROM carddetail_blocks WHERE id = ? AND card_id = ?`, [blockId, cardId]);
      if (imagePath) {
        await safeUnlinkUpload(imagePath);
      }

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      return res.status(200).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления блока' });
  }
};
exports.createCardDetailsBlockItem = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);
    const blockId = Number(req.params?.block_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0 ||
      !Number.isFinite(blockId) ||
      blockId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const itemResult = normalizeCardDetailItemContent(req.body?.content);
    if (!itemResult.ok) {
      return res.status(400).json({ message: 'Некорректный текст элемента' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);
    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const connection = await db.getConnection();
    try {
      const [blockRows] = await connection.execute(
        `SELECT block_type
         FROM carddetail_blocks b
         JOIN cards c ON c.id = b.card_id
         WHERE b.id = ? AND b.card_id = ? AND c.board_id = ?
         LIMIT 1`,
        [blockId, cardId, boardId]
      );

      if (!blockRows.length) {
        return res.status(404).json({ message: 'Блок не найден' });
      }

      const blockType = String(blockRows[0]?.block_type || '');
      if (blockType !== 'facts' && blockType !== 'checklist') {
        return res.status(400).json({ message: 'Некорректный тип блока для элементов' });
      }

      const tableName = blockType === 'facts' ? 'carddetail_fact_items' : 'carddetail_checklist_items';
      const [sortRows] = await connection.execute(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
         FROM ${tableName}
         WHERE block_id = ?`,
        [blockId]
      );
      const nextSortOrder = Number(sortRows[0]?.max_sort_order) + 1;

      if (blockType === 'facts') {
        await connection.execute(
          `INSERT INTO carddetail_fact_items (block_id, content, sort_order)
           VALUES (?, ?, ?)`,
          [blockId, itemResult.value, nextSortOrder]
        );
      } else {
        await connection.execute(
          `INSERT INTO carddetail_checklist_items (block_id, content, is_checked, sort_order)
           VALUES (?, ?, 0, ?)`,
          [blockId, itemResult.value, nextSortOrder]
        );
      }

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      return res.status(201).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка создания элемента' });
  }
};

exports.updateCardDetailsBlockItem = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);
    const blockId = Number(req.params?.block_id);
    const itemId = Number(req.params?.item_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0 ||
      !Number.isFinite(blockId) ||
      blockId <= 0 ||
      !Number.isFinite(itemId) ||
      itemId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);
    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const connection = await db.getConnection();
    try {
      const [blockRows] = await connection.execute(
        `SELECT block_type
         FROM carddetail_blocks b
         JOIN cards c ON c.id = b.card_id
         WHERE b.id = ? AND b.card_id = ? AND c.board_id = ?
         LIMIT 1`,
        [blockId, cardId, boardId]
      );

      if (!blockRows.length) {
        return res.status(404).json({ message: 'Блок не найден' });
      }

      const blockType = String(blockRows[0]?.block_type || '');
      if (blockType !== 'facts' && blockType !== 'checklist') {
        return res.status(400).json({ message: 'Некорректный тип блока для элемента' });
      }

      const itemResult = Object.prototype.hasOwnProperty.call(req.body || {}, 'content')
        ? normalizeCardDetailItemContent(req.body?.content)
        : null;

      if (itemResult && !itemResult.ok) {
        return res.status(400).json({ message: 'Некорректный текст элемента' });
      }

      if (blockType === 'facts') {
        if (!itemResult) {
          return res.status(400).json({ message: 'Нет полей для обновления' });
        }

        await connection.execute(
          `UPDATE carddetail_fact_items
           SET content = ?
           WHERE id = ? AND block_id = ?`,
          [itemResult.value, itemId, blockId]
        );
      } else {
        const updates = [];
        const params = [];

        if (itemResult) {
          updates.push('content = ?');
          params.push(itemResult.value);
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_checked')) {
          updates.push('is_checked = ?');
          params.push(Boolean(req.body?.is_checked) ? 1 : 0);
        }

        if (!updates.length) {
          return res.status(400).json({ message: 'Нет полей для обновления' });
        }

        params.push(itemId, blockId);
        await connection.execute(
          `UPDATE carddetail_checklist_items
           SET ${updates.join(', ')}
           WHERE id = ? AND block_id = ?`,
          params
        );
      }

      const payload = await loadCardDetailsPayload(connection, cardId, boardId);
      return res.status(200).json(payload);
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления элемента' });
  }
};
exports.getBoardLinks = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);

    if (!Number.isFinite(user_id) || user_id <= 0 || !Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [accessRows] = await db.execute(
      `SELECT 1
       FROM boards b
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ? AND bg.role IN ('guest','editer')
       WHERE b.id = ? AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
       LIMIT 1`,
      [user_id, boardId, user_id]
    );

    if (!accessRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const [rows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE board_id = ?
       ORDER BY created_at ASC, id ASC`,
      [boardId]
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения связей' });
  }
};

exports.getPublicBoardLinks = async (req, res) => {
  try {
    const boardId = Number(req.params?.board_id);
    if (!Number.isFinite(boardId) || boardId <= 0) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const userId = req.user?.id ? Number(req.user.id) : null;

    if (Number.isFinite(userId) && userId && userId > 0) {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards b
         LEFT JOIN boardguests bg_block ON bg_block.board_id = b.id AND bg_block.user_id = ? AND bg_block.role = 'blocked'
         WHERE b.id = ? AND b.is_public = 1 AND bg_block.user_id IS NULL
         LIMIT 1`,
        [userId, boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    } else {
      const [boardRows] = await db.execute(
        `SELECT 1
         FROM boards
         WHERE id = ? AND is_public = 1
         LIMIT 1`,
        [boardId]
      );
      if (!boardRows.length) {
        return res.status(404).json({ message: 'Доска не найдена' });
      }
    }

    const [rows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE board_id = ?
       ORDER BY created_at ASC, id ASC`,
      [boardId]
    );

    return res.status(200).json(rows);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения связей' });
  }
};

exports.createCardLink = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);

    const fromCardId = Number(req.body?.from_card_id);
    const toCardId = Number(req.body?.to_card_id);
    const styleRaw = String(req.body?.style || 'line');
    const style = styleRaw === 'arrow' ? 'arrow' : 'line';
    const color = typeof req.body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color) ? req.body.color : '#000000';
    const labelRaw = req.body?.label;
    const label =
      labelRaw === null ? null : typeof labelRaw === 'string' ? labelRaw.trim().slice(0, 70) : null;
    const is_label_visible = req.body?.is_label_visible === undefined ? 1 : Boolean(req.body?.is_label_visible) ? 1 : 0;

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(fromCardId) ||
      fromCardId <= 0 ||
      !Number.isFinite(toCardId) ||
      toCardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    if (fromCardId === toCardId) {
      return res.status(400).json({ message: 'Нельзя связать карточку с самой собой' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(
      `SELECT id FROM cards WHERE board_id = ? AND id IN (?, ?)`,
      [boardId, fromCardId, toCardId]
    );
    if (!Array.isArray(cardRows) || cardRows.length !== 2) {
      return res.status(404).json({ message: 'Карточки не найдены' });
    }

    // Enforce "single attachment point": one link per (from,to,style)
    await db.execute(`DELETE FROM cardlinks WHERE board_id = ? AND from_card_id = ? AND to_card_id = ? AND style = ?`, [
      boardId,
      fromCardId,
      toCardId,
      style,
    ]);
    await db.execute(
      `INSERT INTO cardlinks (board_id, from_card_id, to_card_id, style, color, label, is_label_visible)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [boardId, fromCardId, toCardId, style, color, label, is_label_visible]
    );

    const [rows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE board_id = ? AND from_card_id = ? AND to_card_id = ? AND style = ?
       LIMIT 1`,
      [boardId, fromCardId, toCardId, style]
    );

    if (!rows.length) {
      return res.status(500).json({ message: 'Ошибка создания связи' });
    }

    const link = rows[0];
    emitBoardsUpdatedToBoardUsers(req, boardId, {
      reason: 'link_created',
      link_id: Number(link.id),
      from_card_id: Number(link.from_card_id),
      to_card_id: Number(link.to_card_id),
      style: link.style,
      color: link.color,
      label: link.label ?? null,
      is_label_visible: Number(link.is_label_visible) ? 1 : 0,
    }, [user_id]);

    return res.status(200).json(link);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка создания связи' });
  }
};

exports.updateCardLink = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const linkId = Number(req.params?.link_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(linkId) ||
      linkId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [existingRows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE id = ? AND board_id = ?
       LIMIT 1`,
      [linkId, boardId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Связь не найдена' });
    }

    const existing = existingRows[0];

    const nextStyleRaw = req.body?.style;
    const nextStyle =
      nextStyleRaw === undefined ? existing.style : String(nextStyleRaw) === 'arrow' ? 'arrow' : 'line';

    const labelRaw = req.body?.label;
    const nextLabel =
      labelRaw === undefined
        ? existing.label ?? null
        : labelRaw === null
          ? null
          : typeof labelRaw === 'string'
            ? labelRaw.trim().slice(0, 70)
            : existing.label ?? null;

    const visibleRaw = req.body?.is_label_visible;
    const nextIsLabelVisible =
      visibleRaw === undefined ? (Number(existing.is_label_visible) ? 1 : 0) : Boolean(visibleRaw) ? 1 : 0;

    const hasAnyChange =
      String(existing.style) !== String(nextStyle) ||
      String(existing.label ?? '') !== String(nextLabel ?? '') ||
      Number(existing.is_label_visible) !== Number(nextIsLabelVisible);

    if (!hasAnyChange) {
      return res.status(200).json(existing);
    }

    if (String(existing.style) !== String(nextStyle)) {
      await db.execute(
        `DELETE FROM cardlinks
         WHERE board_id = ? AND from_card_id = ? AND to_card_id = ? AND style = ? AND id <> ?`,
        [boardId, Number(existing.from_card_id), Number(existing.to_card_id), nextStyle, linkId]
      );
    }

    await db.execute(
      `UPDATE cardlinks
       SET style = ?, label = ?, is_label_visible = ?
       WHERE id = ? AND board_id = ?`,
      [nextStyle, nextLabel, nextIsLabelVisible, linkId, boardId]
    );

    const [rows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE id = ? AND board_id = ?
       LIMIT 1`,
      [linkId, boardId]
    );

    if (!rows.length) {
      return res.status(500).json({ message: 'Ошибка обновления связи' });
    }

    const link = rows[0];
    emitBoardsUpdatedToBoardUsers(req, boardId, {
      reason: 'link_updated',
      link_id: Number(link.id),
      from_card_id: Number(link.from_card_id),
      to_card_id: Number(link.to_card_id),
      style: link.style,
      color: link.color,
      label: link.label ?? null,
      is_label_visible: Number(link.is_label_visible) ? 1 : 0,
    }, [user_id]);

    return res.status(200).json(link);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления связи' });
  }
};

exports.flipCardLinkDirection = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const linkId = Number(req.params?.link_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(linkId) ||
      linkId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [existingRows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE id = ? AND board_id = ?
       LIMIT 1`,
      [linkId, boardId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Связь не найдена' });
    }

    const existing = existingRows[0];
    const nextFrom = Number(existing.to_card_id);
    const nextTo = Number(existing.from_card_id);

    if (!Number.isFinite(nextFrom) || !Number.isFinite(nextTo) || nextFrom <= 0 || nextTo <= 0) {
      return res.status(500).json({ message: 'Ошибка обновления связи' });
    }

    await db.execute(
      `DELETE FROM cardlinks
       WHERE board_id = ? AND from_card_id = ? AND to_card_id = ? AND style = ? AND id <> ?`,
      [boardId, nextFrom, nextTo, String(existing.style), linkId]
    );

    await db.execute(
      `UPDATE cardlinks
       SET from_card_id = ?, to_card_id = ?
       WHERE id = ? AND board_id = ?`,
      [nextFrom, nextTo, linkId, boardId]
    );

    const [rows] = await db.execute(
      `SELECT id, board_id, from_card_id, to_card_id, style, color, label, is_label_visible, created_at
       FROM cardlinks
       WHERE id = ? AND board_id = ?
       LIMIT 1`,
      [linkId, boardId]
    );

    if (!rows.length) {
      return res.status(500).json({ message: 'Ошибка обновления связи' });
    }

    const link = rows[0];
    emitBoardsUpdatedToBoardUsers(req, boardId, {
      reason: 'link_updated',
      link_id: Number(link.id),
      from_card_id: Number(link.from_card_id),
      to_card_id: Number(link.to_card_id),
      style: link.style,
      color: link.color,
      label: link.label ?? null,
      is_label_visible: Number(link.is_label_visible) ? 1 : 0,
    }, [user_id]);

    return res.status(200).json(link);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления связи' });
  }
};

exports.deleteCardLink = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const linkId = Number(req.params?.link_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(linkId) ||
      linkId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [rows] = await db.execute(`SELECT id FROM cardlinks WHERE id = ? AND board_id = ? LIMIT 1`, [linkId, boardId]);
    if (!rows.length) {
      return res.status(404).json({ message: 'Связь не найдена' });
    }

    await db.execute(`DELETE FROM cardlinks WHERE id = ? AND board_id = ?`, [linkId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'link_deleted', link_id: linkId }, [user_id]);
    return res.status(200).json({ id: linkId, board_id: boardId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления связи' });
  }
};


exports.updateCardLock = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const is_locked = Boolean(req.body?.is_locked);

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(`SELECT 1 FROM cards WHERE id = ? AND board_id = ? LIMIT 1`, [cardId, boardId]);
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    await db.execute(`UPDATE cards SET is_locked = ? WHERE id = ? AND board_id = ?`, [is_locked ? 1 : 0, cardId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_updated', card_id: cardId, is_locked: is_locked ? 1 : 0 }, [user_id]);
    return res.status(200).json({ id: cardId, board_id: boardId, is_locked: is_locked ? 1 : 0 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления' });
  }
};


exports.updateCardImage = async (req, res) => {
  let newImage = null;

  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    if (req.file) {
      newImage = `/uploads/${req.file.filename}`;
    } else if (req.body?.image === null) {
      newImage = null;
    } else {
      return res.status(400).json({ message: 'Картинка обязательна' });
    }

    if (newImage && newImage.length > 255) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(400).json({ message: 'Слишком длинный путь к картинке (max 255)' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(
      `SELECT title, image_path FROM cards WHERE id = ? AND board_id = ? LIMIT 1`,
      [cardId, boardId]
    );

    if (!cardRows.length) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    const oldImage = cardRows[0]?.image_path ?? null;

    await db.execute(`UPDATE cards SET image_path = ? WHERE id = ? AND board_id = ?`, [newImage, cardId, boardId]);

    const connection = await db.getConnection();
    try {
      await ensureCardDetailsDefaults(connection, {
        cardId,
        cardTitle: cardRows[0]?.title ?? null,
      });
    } finally {
      connection.release();
    }

    const oldRel = getUploadsRelativePath(oldImage);
    const newRel = getUploadsRelativePath(newImage);
    if (oldRel && oldRel !== newRel) {
      await safeUnlinkUpload(oldImage);
    }

    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_updated', card_id: cardId, image_path: newImage }, [user_id]);
    return res.status(200).json({ id: cardId, board_id: boardId, image_path: newImage });
  } catch (e) {
    if (req.file && newImage) {
      await safeUnlinkUpload(newImage);
    }
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления картинки' });
  }
};

exports.updateCard = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const body = req.body || {};

    const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title');
    const hasType = Object.prototype.hasOwnProperty.call(body, 'type');
    const hasLocked = Object.prototype.hasOwnProperty.call(body, 'is_locked');
    const hasX = Object.prototype.hasOwnProperty.call(body, 'x');
    const hasY = Object.prototype.hasOwnProperty.call(body, 'y');

    if (!hasTitle && !hasType && !hasLocked && !hasX && !hasY) {
      return res.status(400).json({ message: 'Нет полей для обновления' });
    }

    let rawTitle = null;
    if (hasTitle) {
      rawTitle = String(body?.title || '').trim();
      if (!rawTitle || rawTitle.length > 50) {
        return res.status(400).json({ message: 'Некорректный заголовок' });
      }
    }

    let rawType = null;
    if (hasType) {
      rawType = String(body?.type || '').trim();
      const allowedTypes = new Set(['rectangle', 'circle', 'diamond']);
      if (!allowedTypes.has(rawType)) {
        return res.status(400).json({ message: 'Некорректный тип' });
      }
    }

    const is_locked = hasLocked ? Boolean(body?.is_locked) : null;

    let x = null;
    let y = null;
    if (hasX || hasY) {
      x = Number(body?.x);
      y = Number(body?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return res.status(400).json({ message: 'Некорректные координаты' });
      }
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(`SELECT 1 FROM cards WHERE id = ? AND board_id = ? LIMIT 1`, [cardId, boardId]);
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    const set = [];
    const params = [];

    if (rawTitle !== null) {
      set.push('title = ?');
      params.push(rawTitle);
    }

    if (rawType !== null) {
      set.push('type = ?');
      params.push(rawType);
    }

    if (is_locked !== null) {
      set.push('is_locked = ?');
      params.push(is_locked ? 1 : 0);
    }

    if (x !== null && y !== null) {
      set.push('x = ?');
      set.push('y = ?');
      params.push(x);
      params.push(y);
    }

    if (!set.length) {
      return res.status(400).json({ message: 'Нет полей для обновления' });
    }

    params.push(cardId, boardId);
    await db.execute(`UPDATE cards SET ${set.join(', ')} WHERE id = ? AND board_id = ?`, params);

    const payload = { id: cardId, board_id: boardId };
    const socketPatch = { reason: 'card_updated', card_id: cardId };
    if (rawTitle !== null) {
      payload.title = rawTitle;
      socketPatch.title = rawTitle;
    }
    if (rawType !== null) {
      payload.type = rawType;
      socketPatch.type = rawType;
    }
    if (is_locked !== null) {
      const lockedValue = is_locked ? 1 : 0;
      payload.is_locked = lockedValue;
      socketPatch.is_locked = lockedValue;
    }
    if (x !== null && y !== null) {
      payload.x = x;
      payload.y = y;
      socketPatch.x = x;
      socketPatch.y = y;
    }

    emitBoardsUpdatedToBoardUsers(req, boardId, socketPatch, [user_id]);
    return res.status(200).json(payload);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления' });
  }
};


exports.updateCardType = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const rawType = String(req.body?.type || '').trim();
    const allowedTypes = new Set(['rectangle', 'circle', 'diamond']);
    if (!allowedTypes.has(rawType)) {
      return res.status(400).json({ message: 'Некорректный тип' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(`SELECT 1 FROM cards WHERE id = ? AND board_id = ? LIMIT 1`, [cardId, boardId]);
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    await db.execute(`UPDATE cards SET type = ? WHERE id = ? AND board_id = ?`, [rawType, cardId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_updated', card_id: cardId, type: rawType }, [user_id]);
    return res.status(200).json({ id: cardId, board_id: boardId, type: rawType });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления' });
  }
};


exports.updateCardTitle = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const rawTitle = String(req.body?.title || '').trim();
    if (!rawTitle || rawTitle.length > 50) {
      return res.status(400).json({ message: 'Некорректный заголовок' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(`SELECT 1 FROM cards WHERE id = ? AND board_id = ? LIMIT 1`, [cardId, boardId]);
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    await db.execute(`UPDATE cards SET title = ? WHERE id = ? AND board_id = ?`, [rawTitle, cardId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_updated', card_id: cardId, title: rawTitle }, [user_id]);
    return res.status(200).json({ id: cardId, board_id: boardId, title: rawTitle });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления' });
  }
};

exports.updateCardPosition = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ message: 'Некорректные координаты' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(`SELECT 1 FROM cards WHERE id = ? AND board_id = ? LIMIT 1`, [cardId, boardId]);
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    await db.execute(`UPDATE cards SET x = ?, y = ? WHERE id = ? AND board_id = ?`, [x, y, cardId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_moved', card_id: cardId, x, y }, [user_id]);
    return res.status(200).json({ id: cardId, board_id: boardId, x, y });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления' });
  }
};

exports.deleteCard = async (req, res) => {
  try {
    const user_id = Number(req.user?.id);
    const boardId = Number(req.params?.board_id);
    const cardId = Number(req.params?.card_id);

    if (
      !Number.isFinite(user_id) ||
      user_id <= 0 ||
      !Number.isFinite(boardId) ||
      boardId <= 0 ||
      !Number.isFinite(cardId) ||
      cardId <= 0
    ) {
      return res.status(400).json({ message: 'Некорректные параметры' });
    }

    const [boardRows] = await db.execute(`SELECT owner_id FROM boards WHERE id = ? LIMIT 1`, [boardId]);
    if (!boardRows.length) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const owner_id = Number(boardRows[0]?.owner_id);

    let canEdit = owner_id === user_id;
    if (!canEdit) {
      const [guestRows] = await db.execute(
        `SELECT role FROM boardguests WHERE board_id = ? AND user_id = ? AND role = 'editer' LIMIT 1`,
        [boardId, user_id]
      );
      canEdit = Boolean(guestRows.length);
    }

    if (!canEdit) {
      return res.status(403).json({ message: 'Нет доступа' });
    }

    const [cardRows] = await db.execute(
      `SELECT image_path FROM cards WHERE id = ? AND board_id = ? LIMIT 1`,
      [cardId, boardId]
    );
    if (!cardRows.length) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }

    const imagePath = cardRows[0]?.image_path ?? null;

    await db.execute(`DELETE FROM cards WHERE id = ? AND board_id = ?`, [cardId, boardId]);
    emitBoardsUpdatedToBoardUsers(req, boardId, { reason: 'card_deleted', card_id: cardId }, [user_id]);

    await safeUnlinkUpload(imagePath);
    return res.status(200).json({ id: cardId, board_id: boardId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления' });
  }
};


