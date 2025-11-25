const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const UserModel = require('../models/UserModel');

const EMAIL_USER = process.env.EMAIL_USER; // твоя почта
const EMAIL_PASS = process.env.EMAIL_PASS; // пароль приложения или обычный пароль (Gmail требует app password)

const authController = {
  codes: {}, // временное хранилище кодов

  // Отправка кода подтверждения на почту
  sendCode: async (req, res) => {
  try {
    const { email, username } = req.body;
    if (!email || !username) return res.status(400).json({ message: 'Email и username обязательны' });

    if (await UserModel.findByEmail(email)) {
      return res.status(400).json({ message: 'Email уже зарегистрирован' });
    }
    if (await UserModel.findByUsername(username)) {
      return res.status(400).json({ message: 'Username уже занят' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    authController.codes = authController.codes || {};
    authController.codes[email] = code;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: EMAIL_USER, pass: EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"PinIt" <${EMAIL_USER}>`,
      to: email,
      subject: "Код подтверждения регистрации",
      html: `<p>Ваш код подтверждения: <strong>${code}</strong></p>`
    });

    res.json({ message: 'Код подтверждения отправлен на почту' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при отправке письма' });
  }
},


  // Регистрация с проверкой кода
  register: async (req, res) => {
    try {
      const { username, email, password, code } = req.body;

      // Проверка кода
      if (!authController.codes[email] || authController.codes[email] !== code) {
        return res.status(400).json({ message: 'Неверный код подтверждения' });
      }

      // Проверка занятости (дополнительно на всякий случай)
      if (await UserModel.findByUsername(username)) {
        return res.status(400).json({ message: 'Username уже занят' });
      }
      if (await UserModel.findByEmail(email)) {
        return res.status(400).json({ message: 'Email уже зарегистрирован' });
      }

      // Хэширование пароля
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = await UserModel.create({ username, email, passwordHash });

      // Удаляем код
      delete authController.codes[email];

      res.status(201).json({ message: 'Пользователь создан' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  },

  // Логин
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await UserModel.findByUsername(username);
      if (!user) return res.status(400).json({ message: 'Неверный логин или пароль' });

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return res.status(400).json({ message: 'Неверный логин или пароль' });

      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '7d' }
      );

      res.json({ token, username: user.username, id: user.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  }
};

module.exports = authController;
