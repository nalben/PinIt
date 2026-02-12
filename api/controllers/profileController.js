const db = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/* ============================
   PUT /api/profile/me
============================ */
exports.updateMe = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Не авторизован' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const { nickname, status } = req.body;
    let newAvatarPath = null;

    if (req.file) {
      newAvatarPath = `/uploads/${req.file.filename}`;

      const absoluteAvatarPath = path.join(__dirname, '..', 'uploads', req.file.filename);
      const tmpPath = `${absoluteAvatarPath}.tmp`;

      try {
        // Lazy-require so the server doesn't crash on boot if `sharp` isn't installed on the host.
        // If sharp is missing, avatar will be stored as-is (no crop).
        // eslint-disable-next-line global-require, import/no-extraneous-dependencies
        const sharp = require('sharp');

        await sharp(absoluteAvatarPath)
          .rotate()
          .resize(512, 512, { fit: 'cover', position: 'center' })
          .toFile(tmpPath);

        await fs.promises.rename(tmpPath, absoluteAvatarPath);
      } catch (e) {
        try {
          await fs.promises.unlink(tmpPath);
        } catch {
          // ignore
        }
        console.warn('Failed to crop avatar (sharp missing or processing error):', e);
      }

      const [oldRows] = await db.execute(
        'SELECT avatar FROM users WHERE id = ?',
        [userId]
      );

      const oldAvatar = oldRows[0]?.avatar;
      if (oldAvatar) {
        const oldFilePath = path.join(__dirname, '..', oldAvatar.replace(/^\/+/, ''));
        fs.unlink(oldFilePath, () => {});
      }
    }

    await db.execute(
      `
        UPDATE users 
        SET nickname = ?, status = ?, avatar = COALESCE(?, avatar)
        WHERE id = ?
      `,
      [nickname, status, newAvatarPath, userId]
    );

    const [rows] = await db.execute(
      'SELECT id, username, nickname, avatar, role, email, status FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      message: 'Профиль обновлён',
      user: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* ============================
   GET /api/profile/me
============================ */
exports.getMe = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Не авторизован' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const [rows] = await db.execute(
      'SELECT id, username, nickname, avatar, role, email, friend_code FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      ...rows[0],
      isOwner: true,
    });
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* ============================
   POST /api/profile/me/friend-code
============================ */
exports.generateFriendCode = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const userId = decoded.id;

    const [rows] = await db.execute(
      'SELECT friend_code FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
    }

    if (rows[0].friend_code) {
      return res.json({ friend_code: rows[0].friend_code });
    }

    const generateCandidate = () => String(crypto.randomInt(0, 100000000)).padStart(8, '0');

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = generateCandidate();

      try {
        const [result] = await db.execute(
          'UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL',
          [candidate, userId]
        );

        if (result.affectedRows === 0) {
          const [updatedRows] = await db.execute(
            'SELECT friend_code FROM users WHERE id = ?',
            [userId]
          );
          return res.json({ friend_code: updatedRows[0]?.friend_code ?? null });
        }

        return res.json({ friend_code: candidate });
      } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) continue;
        console.error(err);
        return res.status(500).json({ message: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
      }
    }

    return res.status(500).json({ message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєРѕРґ' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
};

/* ============================
   POST /api/profile/me/friend-code/regenerate
============================ */
exports.regenerateFriendCode = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'РќРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const userId = decoded.id;

    const [rows] = await db.execute(
      'SELECT friend_code FROM users WHERE id = ?',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
    }

    const currentCode = rows[0].friend_code;
    const generateCandidate = () => String(crypto.randomInt(0, 100000000)).padStart(8, '0');

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = generateCandidate();
      if (candidate === currentCode) continue;

      try {
        await db.execute(
          'UPDATE users SET friend_code = ? WHERE id = ?',
          [candidate, userId]
        );
        return res.json({ friend_code: candidate });
      } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) continue;
        console.error(err);
        return res.status(500).json({ message: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
      }
    }

    return res.status(500).json({ message: 'РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РєРѕРґ' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
};

/* ============================
   GET /api/profile/:username
============================ */
exports.getByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      `
        SELECT id, username, nickname, role, avatar, created_at, email, status, friend_code
        FROM users
        WHERE username = ?
      `,
      [username]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const isOwner = req.user?.id === rows[0].id;

    res.json({
      id: rows[0].id,
      username: rows[0].username,
      nickname: rows[0].nickname,
      avatar: rows[0].avatar,
      role: rows[0].role,
      created_at: rows[0].created_at,
      email: isOwner ? rows[0].email : undefined,
      status: rows[0].status,
      friend_code: isOwner ? rows[0].friend_code : undefined,
      isOwner,
    });
  } catch {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* ============================
   GET /api/profile/by-friend-code/:code
============================ */
exports.getByFriendCode = async (req, res) => {
  try {
    const code = String(req.params?.code ?? '').trim();

    if (!/^\d{8}$/.test(code)) {
      return res.status(400).json({ message: 'Неверный код дружбы' });
    }

    const [rows] = await db.execute(
      `
        SELECT id, username, nickname, role, avatar, created_at, status
        FROM users
        WHERE friend_code = ?
      `,
      [code]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    return res.json({
      id: rows[0].id,
      username: rows[0].username,
      nickname: rows[0].nickname,
      avatar: rows[0].avatar,
      role: rows[0].role,
      created_at: rows[0].created_at,
      status: rows[0].status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
};

/* ============================
   GET /api/profile/:username/friends-count
============================ */
exports.getFriendsCount = async (req, res) => {
  try {
    const { username } = req.params;

    const [rows] = await db.execute(
      `
        SELECT COUNT(*) AS friend_count
        FROM friends
        WHERE user_id = (
          SELECT id FROM users WHERE username = ?
        )
      `,
      [username]
    );

    res.json({ friend_count: rows[0].friend_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
exports.getFriendsByUsername = async (req, res) => {
  try {
    const { username } = req.params;

    const [userRows] = await db.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (!userRows.length) return res.status(404).json({ message: 'Пользователь не найден' });

    const userId = userRows[0].id;

    const [friends] = await db.execute(
      `SELECT u.id, u.username, u.nickname, u.avatar, f.created_at
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ?`,
      [userId]
    );

    res.json(friends);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
