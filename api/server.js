const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const routes = require('./routes');
const { verifyToken } = require('./socket/socket');
const { UPLOADS_DIR } = require('./utils/runtimePaths');

const DEFAULT_PORT = 3001;

const createApp = ({ frontendDist = null } = {}) => {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  app.use('/api', routes);
  app.use('/uploads', express.static(UPLOADS_DIR));

  if (frontendDist) {
    const resolvedFrontendDist = path.resolve(frontendDist);
    const indexPath = path.join(resolvedFrontendDist, 'index.html');

    if (!fs.existsSync(indexPath)) {
      throw new Error(`Frontend build not found: ${indexPath}`);
    }

    app.use(express.static(resolvedFrontendDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      if (req.path === '/uploads' || req.path.startsWith('/uploads/')) return next();
      return res.sendFile(indexPath);
    });
  }

  return app;
};

const createSocketServer = (server) => {
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

  return io;
};

const normalizePort = (value) => {
  const port = Number(value);
  if (!Number.isFinite(port) || port < 0) return DEFAULT_PORT;
  return port;
};

const startServer = async ({
  port = process.env.PORT ?? DEFAULT_PORT,
  host = '0.0.0.0',
  frontendDist = process.env.PINIT_FRONTEND_DIST ?? null,
} = {}) => {
  const app = createApp({ frontendDist });
  const server = http.createServer(app);
  const io = createSocketServer(server);

  app.set('io', io);

  const normalizedPort = normalizePort(port);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(normalizedPort, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === 'object' && address
    ? address.port
    : normalizedPort;

  return {
    app,
    io,
    server,
    host,
    port: actualPort,
    frontendDist: frontendDist ? path.resolve(frontendDist) : null,
  };
};

if (require.main === module) {
  startServer()
    .then(({ host, port }) => {
      console.log(`PinIt API server listening at http://${host}:${port}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  createApp,
  startServer,
};
