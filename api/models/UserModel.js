// api/models/UserModel.js

const pool = require('../db');

const UserModel = {
  // ----------------------------------------------------
  // CREATE USER
  // ----------------------------------------------------
  create: async ({ username, email, passwordHash }) => {
    const [result] = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );
    return result.insertId;
  },

  // ----------------------------------------------------
  // FIND USER
  // ----------------------------------------------------
  findByUsername: async (username) => {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows[0];
  },

  findByEmail: async (email) => {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  },

  // ----------------------------------------------------
  // EMAIL VERIFICATION / RESET CODES
  // ----------------------------------------------------
  saveEmailCode: async (email, code, expires) => {
    return pool.query(
      `
      INSERT INTO email_verifications (email, code, expires_at)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        code = VALUES(code),
        expires_at = VALUES(expires_at)
      `,
      [email, code, expires]
    );
  },

  findEmailCode: async (email) => {
    const [rows] = await pool.query(
      'SELECT * FROM email_verifications WHERE email = ?',
      [email]
    );
    return rows[0];
  },

  deleteEmailCode: async (email) => {
    return pool.query(
      'DELETE FROM email_verifications WHERE email = ?',
      [email]
    );
  },

  // ----------------------------------------------------
  // PASSWORD UPDATE
  // ----------------------------------------------------
  updatePassword: async (userId, hash) => {
    return pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, userId]
    );
  },

  // Добавленные функции для работы с друзьями
  findFriendsByUserId: async (userId) => {
    const [rows] = await pool.query(
      `
      SELECT u.*
      FROM users u
      JOIN friends f ON u.id = f.friend_id AND f.user_id = ?
      `,
      [userId]
    );
    return rows;
  },

  sendFriendRequest: async ({ user_id, friend_id }) => {
    const [result] = await pool.query(
      'INSERT INTO friends_requests (user_id, friend_id) VALUES (?, ?)',
      [user_id, friend_id]
    );
    return result.insertId;
  },

  acceptFriendRequest: async (request_id) => {
    return pool.query(
      'UPDATE friends_requests SET status = \'accepted\' WHERE id = ?',
      [request_id]
    );
  },

  rejectFriendRequest: async (request_id) => {
    return pool.query(
      'UPDATE friends_requests SET status = \'rejected\' WHERE id = ?',
      [request_id]
    );
  }
};

module.exports = UserModel;