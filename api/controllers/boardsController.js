const db = require('../db');
const fs = require('fs');
const path = require('path');

const isUploadPath = p => typeof p === 'string' && p.startsWith('/uploads/');

const safeUnlinkUpload = async uploadPath => {
  if (!isUploadPath(uploadPath)) return;

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const filename = path.basename(uploadPath);
  const absolutePath = path.join(uploadsDir, filename);

  try {
    await fs.promises.unlink(absolutePath);
  } catch {
    // ignore
  }
};

/* Получить все доски текущего юзера */
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


/* Получить все доски, где юзер гость */
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
       WHERE bg.user_id = ?
       ORDER BY COALESCE(bv.last_visited_at, b.created_at) DESC`,
      [user_id, user_id]
    );

    return res.status(200).json(boards);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка получения гостевых досок' });
  }
};


/* Последние посещённые доски */
exports.getRecentBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT b.id, b.title, b.description, b.image, bv.last_visited_at
       FROM board_visits bv
       JOIN boards b ON b.id = bv.board_id
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ?
       WHERE bv.user_id = ?
         AND (b.owner_id = ? OR bg.user_id IS NOT NULL)
       ORDER BY bv.last_visited_at DESC
       LIMIT 10`,
      [user_id, user_id, user_id]
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

    return res.status(200).json({ description });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка обновления описания' });
  }
};


/* Изменить картинку */
exports.updateBoardImage = async (req, res) => {
  let newImage = null;

  try {
    const user_id = req.user.id;
    const { board_id } = req.params;

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
      `SELECT image
       FROM boards
       WHERE id = ? AND owner_id = ?`,
      [board_id, user_id]
    );

    if (!rows.length) {
      if (req.file) await safeUnlinkUpload(newImage);
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    const oldImage = rows[0]?.image ?? null;

    await db.execute(
      `UPDATE boards SET image = ?
       WHERE id = ? AND owner_id = ?`,
      [newImage, board_id, user_id]
    );

    if (oldImage && oldImage !== newImage) {
      safeUnlinkUpload(oldImage);
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
      `SELECT id, owner_id
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
      `SELECT 1 FROM boardguests WHERE board_id = ? AND user_id = ? LIMIT 1`,
      [boardId, invited_id]
    );

    if (guestRows.length) {
      return res.status(409).json({ message: 'Пользователь уже гость этой доски' });
    }

    const [existingInvites] = await db.execute(
      `SELECT id
       FROM board_invites
       WHERE board_id = ? AND invited_id = ? AND status = 'sent'
       LIMIT 1`,
      [boardId, invited_id]
    );

    if (existingInvites.length) {
      return res.status(409).json({ message: 'Приглашение уже отправлено', invite_id: existingInvites[0].id });
    }

    const [result] = await db.execute(
      `INSERT INTO board_invites (board_id, user_id, invited_id, status)
       VALUES (?, ?, ?, 'sent')`,
      [boardId, inviter_id, invited_id]
    );

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
      `SELECT owner_id FROM boards WHERE id = ? LIMIT 1`,
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

    const [result] = await db.execute(
      `DELETE FROM boardguests WHERE board_id = ? AND user_id = ?`,
      [boardId, guestId]
    );

    await db.execute(
      `DELETE FROM board_visits WHERE board_id = ? AND user_id = ?`,
      [boardId, guestId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Гость не найден' });
    }

    return res.status(200).json({ message: 'Гость удалён' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка удаления гостя' });
  }
};


/* Покинуть доску (для гостя) */
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
      `DELETE FROM boardguests WHERE board_id = ? AND user_id = ?`,
      [boardId, user_id]
    );

    await db.execute(
      `DELETE FROM board_visits WHERE board_id = ? AND user_id = ?`,
      [boardId, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Вы не гость этой доски' });
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

    await db.execute(
      `INSERT INTO board_visits (user_id, board_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_visited_at = CURRENT_TIMESTAMP`,
      [user_id, board_id]
    );

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
      `SELECT b.id, b.owner_id, b.title, b.description, b.image, b.created_at,
              CASE
                WHEN b.owner_id = ? THEN 'owner'
                WHEN bg.user_id IS NOT NULL THEN bg.role
                ELSE NULL
              END AS my_role
       FROM boards b
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ?
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
       LEFT JOIN boardguests bg ON bg.board_id = b.id AND bg.user_id = ?
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
       WHERE bg.board_id = ?
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


/* РџСЂРёРіР»Р°С€РµРЅРёСЏ РІ РґРѕСЃРєРё (РІС…РѕРґСЏС‰РёРµ) */
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
    return res.status(500).json({ message: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРёРіР»Р°С€РµРЅРёР№' });
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

    await connection.execute(
      `UPDATE board_invites
       SET status = 'accepted'
       WHERE id = ?`,
      [invite_id]
    );

    const [existing] = await connection.execute(
      `SELECT 1 FROM boardguests
       WHERE board_id = ? AND user_id = ?
       LIMIT 1`,
      [board_id, invited_id]
    );

    if (!existing.length) {
      await connection.execute(
        `INSERT INTO boardguests (board_id, user_id, role)
         VALUES (?, ?, 'guest')`,
        [board_id, invited_id]
      );
    }

    await connection.commit();
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
      `SELECT id FROM board_invites
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

    return res.status(200).json({ message: 'Приглашение отклонено' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка отклонения приглашения' });
  }
};
