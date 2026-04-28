const jwt = require('jsonwebtoken');

const AUTH_TOKEN_TTL_DAYS = 365;
const AUTH_TOKEN_EXPIRES_IN = `${AUTH_TOKEN_TTL_DAYS}d`;

const signAuthToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: AUTH_TOKEN_EXPIRES_IN }
  );

module.exports = {
  AUTH_TOKEN_TTL_DAYS,
  AUTH_TOKEN_EXPIRES_IN,
  signAuthToken,
};
