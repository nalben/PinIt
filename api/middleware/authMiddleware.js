const jwt = require("jsonwebtoken");
const { getAuthCookieOptions } = require("../utils/authCookieOptions");

const getTokenFromCookie = (cookieHeader) => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'pinit_token') {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
};

const syncAuthCookie = (req, res, headerToken, cookieToken) => {
  if (!headerToken || headerToken === cookieToken) return;
  res.cookie('pinit_token', headerToken, getAuthCookieOptions(req));
};

const authMiddleware = (req, res, next) => {
  const headerToken = req.headers.authorization?.split(' ')[1];
  const cookieToken = getTokenFromCookie(req.headers.cookie);
  const token = headerToken || cookieToken;
  
  if (!token) return res.status(401).json({ message: "Нет токена" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    syncAuthCookie(req, res, headerToken, cookieToken);
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(401).json({ message: "Неверный токен" });
  }
};

module.exports = authMiddleware;
