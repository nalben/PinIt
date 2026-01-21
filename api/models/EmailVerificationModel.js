const pool = require('../db');

const EmailVerificationModel = {
  createOrUpdate: async (email, code, expiresAt) => {
    await pool.query(
      `INSERT INTO email_verifications (email, code, expires_at) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE code = ?, expires_at = ?`,
      [email, code, expiresAt, code, expiresAt]
    );
  },

  find: async (email) => {
    const [rows] = await pool.query(
      'SELECT * FROM email_verifications WHERE email = ?',
      [email]
    );
    return rows[0];
  },

  delete: async (email) => {
    await pool.query('DELETE FROM email_verifications WHERE email = ?', [email]);
  }
};

module.exports = EmailVerificationModel;
