const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");
const UserModel = require("../models/UserModel");

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const IS_LOCAL = process.env.IS_LOCAL === "true";

const authController = {
  codes: {},

  // =====================================================
  // REGISTRATION — SEND CODE
  // =====================================================
  sendCode: async (req, res) => {
    try {
      const { email, username } = req.body;
      if (!email || !username)
        return res.status(400).json({ message: "Email и login обязательны" });

      if (await UserModel.findByEmail(email))
        return res.status(400).json({ message: "Email уже занят" });

      if (await UserModel.findByUsername(username))
        return res.status(400).json({ message: "login уже занят" });

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      authController.codes[email] = code;

      if (IS_LOCAL) {
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

        return res.json({ message: "Код отправлен (локальный режим)" });
      }

      const VPS_URL = "http://10.8.0.1:4000/";

      const payload = { to: email, code, type: "registration" };
      const result = await axios.post(VPS_URL, payload);

      if (result.data?.success) {
        return res.json({ message: "Код отправлен через VPS" });
      } else {
        return res.status(500).json({ message: "Ошибка VPS при отправке письма" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Ошибка при отправке письма" });
    }
  },

  // =====================================================
  // REGISTRATION — REGISTER
  // =====================================================
  register: async (req, res) => {
    try {
      const { username, email, password, code } = req.body;

      if (!authController.codes[email] || authController.codes[email] !== code) {
        return res.status(400).json({ message: "Неверный код подтверждения" });
      }

      if (await UserModel.findByUsername(username))
        return res.status(400).json({ message: "login уже занят" });

      if (await UserModel.findByEmail(email))
        return res.status(400).json({ message: "Email уже зарегистрирован" });

      const passwordHash = await bcrypt.hash(password, 10);
      await UserModel.create({ username, email, passwordHash });

      delete authController.codes[email];

      res.status(201).json({ message: "Пользователь создан" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  },

  // =====================================================
  // LOGIN
  // =====================================================
  login: async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await UserModel.findByUsername(username);
      if (!user)
        return res.status(400).json({ message: "Неверный логин или пароль" });

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch)
        return res.status(400).json({ message: "Неверный логин или пароль" });

      const token = jwt.sign(
        { id: user.id, username: user.username },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "7d" }
      );

      res.json({ token, username: user.username, id: user.id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  },

  // =====================================================
  // RESET PASSWORD — CHECK USER
  // =====================================================
  checkResetUser: async (req, res) => {
    try {
      const { username, email } = req.body;

      let user = null;
      if (username) user = await UserModel.findByUsername(username);
      if (email) user = await UserModel.findByEmail(email);

      if (!user)
        return res.status(404).json({ message: "Пользователь не найден" });

      res.json({
        email: user.email,
        maskedEmail: user.email.replace(/^(.).*(.)@/, "$1********$2@"),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  },

  // =====================================================
  // RESET PASSWORD — SEND RESET CODE
  // =====================================================
  sendResetCode: async (req, res) => {
    try {
      const { email } = req.body;
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      authController.codes[email] = code;

      if (IS_LOCAL) {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: EMAIL_USER, pass: EMAIL_PASS }
        });

        await transporter.sendMail({
          to: email,
          subject: "Восстановление пароля",
          html: `<p>Код для восстановления пароля: <strong>${code}</strong></p>`
        });

        return res.json({ message: "Код отправлен (локальный режим)" });
      }

      const VPS_URL = "http://10.8.0.1:4000/";
      const payload = { to: email, code, type: "reset" };
      const result = await axios.post(VPS_URL, payload);

      if (result.data?.success) {
        return res.json({ message: "Код отправлен через VPS" });
      } else {
        return res.status(500).json({ message: "Ошибка VPS при отправке письма" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Ошибка отправки кода" });
    }
  },

  // =====================================================
  // RESET PASSWORD — VERIFY CODE
  // =====================================================
  verifyResetCode: async (req, res) => {
    const { email, code } = req.body;

    if (!authController.codes[email] || authController.codes[email] !== code) {
      return res.status(400).json({ message: "Неверный код" });
    }

    res.json({ message: "Код подтверждён" });
  },

  // =====================================================
  // RESET PASSWORD — SET NEW PASSWORD
  // =====================================================
  setNewPassword: async (req, res) => {
    const { email, password } = req.body;

    const user = await UserModel.findByEmail(email);
    if (!user)
      return res.status(404).json({ message: "Пользователь не найден" });

    const hash = await bcrypt.hash(password, 10);
    await UserModel.updatePassword(user.id, hash);

    delete authController.codes[email];

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Пароль успешно изменён",
      token,
      username: user.username,
      id: user.id
    });
  }
};

module.exports = authController;
