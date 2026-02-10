const db = require('../db');

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


/* Последние посещённые доски */
exports.getRecentBoards = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [boards] = await db.execute(
      `SELECT b.id, b.title, b.description, b.image, bv.last_visited_at
       FROM board_visits bv
       JOIN boards b ON b.id = bv.board_id
       WHERE bv.user_id = ?
       ORDER BY bv.last_visited_at DESC
       LIMIT 10`,
      [user_id]
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
    const { title, description = null } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Название обязательно' });
    }

    const [result] = await db.execute(
      `INSERT INTO boards (owner_id, title, description)
       VALUES (?, ?, ?)`,
      [user_id, title, description]
    );

    return res.status(201).json({
      id: result.insertId,
      title,
      description
    });
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

    const [result] = await db.execute(
      `DELETE FROM boards WHERE id = ? AND owner_id = ?`,
      [board_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Доска не найдена' });
    }

    return res.status(200).json({ message: 'Доска удалена' });
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
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Название обязательно' });
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
    const { description } = req.body;

    const [result] = await db.execute(
      `UPDATE boards SET description = ?
       WHERE id = ? AND owner_id = ?`,
      [description ?? null, board_id, user_id]
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
      `SELECT id, title, description, image, created_at
       FROM boards
       WHERE id = ? AND owner_id = ?`,
      [board_id, user_id]
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
      `SELECT 1 FROM Boardguests
       WHERE board_id = ? AND user_id = ?
       LIMIT 1`,
      [board_id, invited_id]
    );

    if (!existing.length) {
      await connection.execute(
        `INSERT INTO Boardguests (board_id, user_id, role)
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
