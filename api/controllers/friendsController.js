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

    const existingRequest = await db.friends_requests.findOne({
      where: { user_id, friend_id, status: 'sent' }
    });

    if (existingRequest) {
      return res.status(400).json({ message: 'Запрос уже был отправлен' });
    }

    const newRequest = await db.friends_requests.create({
      user_id,
      friend_id,
      status: 'sent'
    });

    return res.status(201).json(newRequest);
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

    const request = await db.friends_requests.findByPk(request_id);

    if (!request || request.status !== 'sent' || request.friend_id !== user_id) {
      return res.status(404).json({ message: 'Запрос не найден или уже обработан' });
    }

    request.status = 'accepted';
    await request.save();

    await db.friends.create({
      user_id: request.user_id,
      friend_id: request.friend_id
    });

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

    const request = await db.friends_requests.findByPk(request_id);

    if (!request || request.status !== 'sent' || request.friend_id !== user_id) {
      return res.status(404).json({ message: 'Запрос не найден или уже обработан' });
    }

    request.status = 'rejected';
    await request.save();

    return res.status(200).json({ message: 'Запрос отклонен' });
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

    const friendCount = await db.friends.count({
      where: { [Op.or]: [{ user_id }, { friend_id: user_id }] }
    });

    return res.status(200).json({ friend_count: friendCount });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении количества друзей' });
  }
};

// Удаление друга
exports.removeFriend = async (req, res) => {
  try {
    const { friend_id } = req.params;
    const user_id = req.user.id;

    const deleted = await db.friends.destroy({
      where: {
        [Op.or]: [
          { user_id, friend_id },
          { user_id: friend_id, friend_id: user_id }
        ]
      }
    });

    if (!deleted) return res.status(404).json({ message: 'Друг не найден' });

    return res.status(200).json({ message: 'Друг удалён' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при удалении друга' });
  }
};

// Получение входящих запросов в друзья
exports.getFriendRequests = async (req, res) => {
  try {
    const { user_id } = req.params;
    const requests = await db.friends_requests.findAll({
      where: { friend_id: user_id, status: 'sent' },
      include: [
        { model: UserModel, as: 'user', attributes: ['id', 'username', 'nickname', 'avatar'] }
      ]
    });

    return res.status(200).json(requests);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при получении запросов на дружбу' });
  }
};
