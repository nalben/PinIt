const db = require('../db');

// Отправка запроса в друзья
exports.sendFriendRequest = async (req, res) => {
  try {
    const { friend_id } = req.body;
    const user_id = req.user.id;

    if (user_id === friend_id) {
      return res.status(400).json({ message: 'Нельзя отправить запрос на самого себя' });
    }

    const [friends] = await db.execute(
      `SELECT 1 FROM friends
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [user_id, friend_id, friend_id, user_id]
    );
    if (friends.length > 0) return res.status(400).json({ message: 'Вы уже друзья' });

    const [existing] = await db.execute(
      `SELECT 1 FROM friend_requests
       WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [user_id, friend_id]
    );
    if (existing.length > 0) return res.status(400).json({ message: 'Запрос уже был отправлен' });

    const [rejected] = await db.execute(
      `SELECT id FROM friend_requests
       WHERE user_id = ? AND friend_id = ? AND status = 'rejected'`,
      [friend_id, user_id]
    );
    if (rejected.length > 0) {
      await db.execute(`DELETE FROM friend_requests WHERE id = ?`, [rejected[0].id]);
    }

    const [result] = await db.execute(
      `INSERT INTO friend_requests (user_id, friend_id, status) VALUES (?, ?, 'sent')`,
      [user_id, friend_id]
    );

    const io = req.app.get('io');

    const [senderRows] = await db.execute(
      'SELECT id, username, nickname, avatar FROM users WHERE id = ?',
      [user_id]
    );
    const sender = senderRows[0];

    // уведомляем получателя
    io.to(`user:${friend_id}`).emit('friend_request:new', {
      id: result.insertId,
      user_id: sender.id,
      username: sender.username,
      nickname: sender.nickname,
      avatar: sender.avatar,
      created_at: new Date().toISOString(),
    });

    // уведомляем отправителя, чтобы обновить статус кнопки (если нужно)
    io.to(`user:${user_id}`).emit('friends:status', {
      userId: friend_id,
      status: 'sent',
      requestId: result.insertId
    });


    return res.status(201).json({
      id: result.insertId,
      user_id,
      friend_id,
      status: 'sent'
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при отправке запроса' });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [rows] = await db.execute(
      `SELECT * FROM friend_requests 
       WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    const request = rows[0];

    // создаём дружбу
    await db.execute(
      `INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)`,
      [request.user_id, request.friend_id, request.friend_id, request.user_id]
    );

    // удаляем заявку
    await db.execute(`DELETE FROM friend_requests WHERE id = ?`, [request_id]);

    const io = req.app.get('io');

    // убираем уведомление у обоих
    io.to(`user:${request.user_id}`).emit('friend_request:removed', {
      id: request_id
    });
    io.to(`user:${request.friend_id}`).emit('friend_request:removed', {
      id: request_id
    });

    // обновляем статус кнопок у обоих
    io.to(`user:${request.user_id}`).emit('friends:status', {
      userId: request.friend_id,
      status: 'friend'
    });
    io.to(`user:${request.friend_id}`).emit('friends:status', {
      userId: request.user_id,
      status: 'friend'
    });

    return res.status(200).json({ message: 'Запрос принят' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка при принятии запроса' });
  }
};

exports.rejectFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [rows] = await db.execute(
      `SELECT * FROM friend_requests 
       WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    const request = rows[0];

    // ❗ НЕ удаляем, а помечаем rejected
    await db.execute(
      `UPDATE friend_requests SET status = 'rejected' WHERE id = ?`,
      [request_id]
    );

    const io = req.app.get('io');

    // отправителю — rejected (блок кнопки)
    io.to(`user:${request.user_id}`).emit('friends:status', {
      userId: request.friend_id,
      status: 'rejected',
      requestId: request_id
    });

    // получателю — none (кнопка "добавить в друзья")
    io.to(`user:${request.friend_id}`).emit('friends:status', {
      userId: request.user_id,
      status: 'none',
      requestId: request_id
    });

    // убираем уведомление из dropdown
    io.to(`user:${request.friend_id}`).emit('friend_request:removed', {
      id: request_id
    });

    return res.status(200).json({ message: 'Запрос отклонён' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Ошибка при отклонении запроса' });
  }
};




exports.getFriends = async (req, res) => {
  try {
    const { user_id } = req.params;

const [friends] = await db.execute(
      `SELECT u.id, u.username, u.nickname, u.avatar, f.created_at
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = ?`,
      [user_id]
    );

    return res.status(200).json(friends);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении друзей' });
  }
};

exports.getFriendCount = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [result] = await db.execute(
    `SELECT COUNT(*) AS friend_count FROM friends WHERE user_id = ?`,
    [user_id, user_id]
  );


    return res.status(200).json({ friend_count: result[0].friend_count });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении количества друзей' });
  }
};



exports.removeFriend = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { friend_id } = req.params;

    const [result] = await db.execute(
      `DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [user_id, friend_id, friend_id, user_id]
    );

    if (result.affectedRows === 0) 
      return res.status(404).json({ message: 'Друг не найден' });

    const io = req.app.get('io');

    // уведомляем обоих пользователей, что дружба удалена
    io.to(`user:${user_id}`).emit('friends:status', { userId: friend_id, status: 'none' });
    io.to(`user:${friend_id}`).emit('friends:status', { userId: user_id, status: 'none' });

    return res.status(200).json({ message: 'Друг удалён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при удалении друга' });
  }
};


exports.removeFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [requests] = await db.execute(
      `SELECT friend_id, user_id FROM friend_requests WHERE id = ? AND (user_id = ? OR friend_id = ?) AND status = 'sent'`,
      [request_id, user_id, user_id]
    );

    if (requests.length === 0) return res.status(404).json({ message: 'Запрос не найден' });

    await db.execute(
      `DELETE FROM friend_requests WHERE id = ?`,
      [request_id]
    );

    const io = req.app.get('io');

    // уведомляем обоих пользователей, что заявка удалена
    io.to(`user:${requests[0].friend_id}`).emit('friend_request:removed', { id: request_id });
io.to(`user:${requests[0].user_id}`).emit('friend_request:removed', { id: request_id });


    // можно оставить обновление статуса дружбы, если нужно
    io.to(`user:${requests[0].friend_id}`).emit('friends:status', {
      userId: user_id,
      status: 'none',
      requestId: request_id
    });
    io.to(`user:${requests[0].user_id}`).emit('friends:status', {
      userId: requests[0].friend_id,
      status: 'none',
      requestId: request_id
    });

    return res.status(200).json({ message: 'Запрос отменён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка' });
  }
};



exports.getFriendRequests = async (req, res) => {
  try {
    const user_id = req.user.id;

    const [requests] = await db.execute(
      `SELECT fr.id, fr.created_at, u.id as user_id, u.username, u.nickname, u.avatar
       FROM friend_requests fr
       JOIN users u ON u.id = fr.user_id
       WHERE fr.friend_id = ? AND fr.status = 'sent'`,
      [user_id]
    );

    return res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка' });
  }
};

exports.getFriendStatus = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { other_user_id } = req.params;

    if (currentUserId === Number(other_user_id)) {
      return res.status(400).json({ message: "Нельзя проверять статус с самим собой" });
    }

    const [friends] = await db.execute(
      `SELECT 1 FROM friends 
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [currentUserId, other_user_id, other_user_id, currentUserId]
    );
    if (friends.length > 0) return res.status(200).json({ status: "friend" });

    const [sent] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [currentUserId, other_user_id]
    );
    if (sent.length > 0) return res.status(200).json({ status: "sent", requestId: sent[0].id });

    const [received] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [other_user_id, currentUserId]
    );
    if (received.length > 0) return res.status(200).json({ status: "received", requestId: received[0].id });

    const [rejected] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'rejected'`,
      [currentUserId, other_user_id]
    );
    if (rejected.length > 0) return res.status(200).json({ status: "rejected", requestId: rejected[0].id });

    return res.status(200).json({ status: "none" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ошибка при получении статуса дружбы" });
  }
};
