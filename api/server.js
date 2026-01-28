require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./routes');
const { verifyToken } = require('./socket/socket');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));

  try {
    const user = verifyToken(token);
    socket.user = user;
    next();
  } catch (e) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', socket => {
  const userId = socket.user.id;

  socket.join(`user:${userId}`);

  console.log(`Socket connected: user ${userId}`);

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: user ${userId}`);
  });
});

app.set('io', io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
});
