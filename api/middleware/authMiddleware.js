const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Нет токена" });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = decoded; // id, username
    next();
  } catch (err) {
    return res.status(401).json({ message: "Неверный токен" });
  }
};

module.exports = authMiddleware;
