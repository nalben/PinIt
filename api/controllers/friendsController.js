const db = require('../db');

// Отправка запроса в друзья
exports.sendFriendRequest = async (req, res) => {
  try {
    const { friend_id } = req.body;
    const user_id = req.user.id;

    if (user_id === friend_id) {
      return res.status(400).json({ message: 'Нельзя отправить запрос на самого себя' });
    }

    // Уже друзья
    const [friends] = await db.execute(
      `SELECT 1 FROM friends
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [user_id, friend_id, friend_id, user_id]
    );
    if (friends.length > 0) return res.status(400).json({ message: 'Вы уже друзья' });

    // Уже есть исходящая заявка
    const [existing] = await db.execute(
      `SELECT 1 FROM friend_requests
       WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [user_id, friend_id]
    );
    if (existing.length > 0) return res.status(400).json({ message: 'Запрос уже был отправлен' });

    // ❗ Он меня отклонил ранее
    const [rejected] = await db.execute(
      `SELECT id FROM friend_requests
       WHERE user_id = ? AND friend_id = ? AND status = 'rejected'`,
      [friend_id, user_id]
    );
    if (rejected.length > 0) {
      await db.execute(`DELETE FROM friend_requests WHERE id = ?`, [rejected[0].id]);
    }

    // Создаём новую заявку
    const [result] = await db.execute(
      `INSERT INTO friend_requests (user_id, friend_id, status) VALUES (?, ?, 'sent')`,
      [user_id, friend_id]
    );

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

// Принятие запроса
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    // 1. Получаем сам запрос
    const [requests] = await db.execute(
      `SELECT * FROM friend_requests WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    const request = requests[0]; // теперь request определён

    // 2. Создаём двустороннюю запись в friends
    await db.execute(
      `INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)`,
      [request.user_id, request.friend_id, request.friend_id, request.user_id]
    );

    // 3. Удаляем заявку
    await db.execute(`DELETE FROM friend_requests WHERE id = ?`, [request_id]);

    return res.status(200).json({ message: 'Запрос принят' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при принятии запроса' });
  }
};


// Отклонение запроса
exports.rejectFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [requests] = await db.execute(
      `SELECT * FROM friend_requests WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );
    if (requests.length === 0) return res.status(404).json({ message: 'Запрос не найден' });

    await db.execute(`UPDATE friend_requests SET status = 'rejected' WHERE id = ?`, [request_id]);

    return res.status(200).json({ message: 'Запрос отклонён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при отклонении запроса' });
  }
};

// Список друзей
exports.getFriends = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [friends] = await db.execute(
    `SELECT u.id, u.username, u.nickname, u.avatar, f.created_at
    FROM friends f
    JOIN users u ON u.id = CASE
        WHEN f.user_id = ? THEN f.friend_id
        ELSE f.user_id
    END
    WHERE f.user_id = ? OR f.friend_id = ?`,
    [user_id, user_id, user_id]
  );

    return res.status(200).json(friends);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении друзей' });
  }
};

// Кол-во друзей
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



// Удаление друга
exports.removeFriend = async (req, res) => {
  try {
    const user_id = req.user.id;
    const { friend_id } = req.params;

    const [result] = await db.execute(
      `DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [user_id, friend_id, friend_id, user_id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Друг не найден' });

    return res.status(200).json({ message: 'Друг удалён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при удалении друга' });
  }
};

// Удаление исходящей заявки
exports.removeFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [result] = await db.execute(
      `DELETE FROM friend_requests
       WHERE id = ? AND (user_id = ? OR friend_id = ?) AND status = 'sent'`,
      [request_id, user_id, user_id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Запрос не найден' });

    return res.status(200).json({ message: 'Запрос отменён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка' });
  }
};

// Входящие заявки
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

// Статус дружбы
exports.getFriendStatus = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { other_user_id } = req.params;

    if (currentUserId === Number(other_user_id)) {
      return res.status(400).json({ message: "Нельзя проверять статус с самим собой" });
    }

    // Уже друзья
    const [friends] = await db.execute(
      `SELECT 1 FROM friends 
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [currentUserId, other_user_id, other_user_id, currentUserId]
    );
    if (friends.length > 0) return res.status(200).json({ status: "friend" });

    // Исходящая заявка
    const [sent] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [currentUserId, other_user_id]
    );
    if (sent.length > 0) return res.status(200).json({ status: "sent", requestId: sent[0].id });

    // Входящая заявка
// Входящая заявка
    const [received] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [other_user_id, currentUserId]  // <- здесь важно поменять порядок
    );
    if (received.length > 0) return res.status(200).json({ status: "received", requestId: received[0].id });

    // Отклонённая заявка
    const [rejected] = await db.execute(
      `SELECT id FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'rejected'`,
      [currentUserId, other_user_id]  // <- здесь тоже порядок важен
    );
    if (rejected.length > 0) return res.status(200).json({ status: "rejected", requestId: rejected[0].id });

    return res.status(200).json({ status: "none" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Ошибка при получении статуса дружбы" });
  }
};
