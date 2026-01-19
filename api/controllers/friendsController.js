// src/controllers/friendsController.js

const db = require('../db'); // Предполагаем, что у вас есть модель для работы с базой данных

exports.sendFriendRequest = async (req, res) => {
  try {
    const { friend_id } = req.body;
    const user_id = req.user.id; // Получаем ID пользователя из JWT-токена

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

exports.acceptFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id; // Получаем ID пользователя из JWT-токена

    const request = await db.friends_requests.findByPk(request_id);

    if (!request || request.status !== 'sent' || request.friend_id !== user_id) {
      return res.status(404).json({ message: 'Запрос не найден или уже обработан' });
    }

    request.status = 'accepted';
    await request.save();

    // Добавляем связи в таблицу friends
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

exports.rejectFriendRequest = async (req, res) => {
  try {
    const { request_id } = req.params;
    const user_id = req.user.id; // Получаем ID пользователя из JWT-токена

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