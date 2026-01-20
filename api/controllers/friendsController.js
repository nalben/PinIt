// api/controllers/friendsController.js

const db = require('../db');
const UserModel = require('../models/UserModel');
const { Op } = require('sequelize');

// Отправка запроса в друзья
exports.sendFriendRequest = async (req, res) => {
  try {
    const { friend_id } = req.body;
    const user_id = req.user.id;

    if (user_id === friend_id) {
      return res.status(400).json({ message: 'Нельзя отправить запрос на самого себя' });
    }

    const [existing] = await db.execute(
      `SELECT * FROM friend_requests WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [user_id, friend_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Запрос уже был отправлен' });
    }

    const [result] = await db.execute(
      `INSERT INTO friend_requests (user_id, friend_id, status) VALUES (?, ?, 'sent')`,
      [user_id, friend_id]
    );

    return res.status(201).json({ id: result.insertId, user_id, friend_id, status: 'sent' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при отправке запроса' });
  }
};

// Принятие запроса в друзья
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [requests] = await db.execute(
      `SELECT * FROM friend_requests WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Запрос не найден или уже обработан' });
    }

    const request = requests[0];

    await db.execute(
      `INSERT INTO friends (user_id, friend_id) VALUES (?, ?)`,
      [request.user_id, request.friend_id]
    );

    await db.execute(
      `DELETE FROM friend_requests WHERE id = ?`,
      [request_id]
    );

    return res.status(200).json({ message: 'Запрос принят' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при принятии запроса' });
  }
};


// Отклонение запроса в друзья
exports.rejectFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [requests] = await db.execute(
      `SELECT * FROM friend_requests WHERE id = ? AND status = 'sent' AND friend_id = ?`,
      [request_id, user_id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Запрос не найден или уже обработан' });
    }

    await db.execute(
      `UPDATE friend_requests SET status = 'rejected' WHERE id = ?`,
      [request_id]
    );

    return res.status(200).json({ message: 'Запрос отклонён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при отклонении запроса' });
  }
};


// Получение списка друзей пользователя
exports.getFriends = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [friends] = await db.execute(
      `SELECT u.id, u.username, u.nickname, u.avatar, f.created_at
       FROM friends f
       JOIN users u 
         ON (u.id = f.user_id AND f.friend_id = ?) 
         OR (u.id = f.friend_id AND f.user_id = ?)
      `, 
      [user_id, user_id]
    );

    return res.status(200).json(friends);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении друзей' });
  }
};


// Получение количества друзей пользователя
exports.getFriendCount = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [result] = await db.execute(
      `SELECT COUNT(*) AS friend_count FROM friends WHERE user_id = ? OR friend_id = ?`,
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
      `DELETE FROM friends
       WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      [user_id, friend_id, friend_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Друг не найден' });
    }

    return res.status(200).json({ message: 'Друг удалён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при удалении друга' });
  }
};

// Удаление заявки на дружбу
exports.removeFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id;

    const [result] = await db.execute(
      `DELETE FROM friend_requests
       WHERE id = ? AND (user_id = ? OR friend_id = ?) AND status = 'sent'`,
      [request_id, user_id, user_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Запрос не найден' });
    }

    return res.status(200).json({ message: 'Запрос отменён' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Ошибка' });
  }
};

// Получение входящих запросов в друзья
exports.getFriendRequests = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [requests] = await db.execute(
      `SELECT fr.id, fr.user_id, fr.friend_id, fr.status, fr.created_at,
              u.username, u.nickname, u.avatar
       FROM friend_requests fr
       JOIN users u ON u.id = fr.user_id
       WHERE fr.friend_id = ? AND fr.status = 'sent'`,
      [user_id]
    );

    return res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении запросов на дружбу' });
  }
};

exports.getFriendStatus = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { other_user_id } = req.params;

    if (currentUserId === Number(other_user_id)) {
      return res.status(400).json({ message: "Нельзя проверять статус с самим собой" });
    }

    // Проверка дружбы
    const [friends] = await db.execute(
      `SELECT * FROM friends 
       WHERE (user_id = ? AND friend_id = ?) 
          OR (user_id = ? AND friend_id = ?)`,
      [currentUserId, other_user_id, other_user_id, currentUserId]
    );
    if (friends.length > 0) return res.status(200).json({ status: "friend" });

    // Исходящая заявка
    const [sent] = await db.execute(
      `SELECT * FROM friend_requests 
       WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [currentUserId, other_user_id]
    );
    if (sent.length > 0) return res.status(200).json({ status: "sent", requestId: sent[0].id });

    // Входящая заявка
    const [received] = await db.execute(
      `SELECT * FROM friend_requests 
       WHERE user_id = ? AND friend_id = ? AND status = 'sent'`,
      [other_user_id, currentUserId]
    );
    if (received.length > 0) return res.status(200).json({ status: "received", requestId: received[0].id });

    // Нет связи
    return res.status(200).json({ status: "none" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Ошибка при получении статуса дружбы" });
  }
};