const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const shopRoutes = require('./routes/shopRouter');
const { UPLOADS_DIR } = require('./utils/runtimePaths');

const DEFAULT_PORT = 3002;
const DEFAULT_FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'build', 'desktop');
const DEFAULT_SHOP_DIST = fs.existsSync(path.join(DEFAULT_FRONTEND_DIST, 'index.html'))
  ? DEFAULT_FRONTEND_DIST
  : path.join(__dirname, 'static/shop');

const createApp = ({ frontendDist = DEFAULT_SHOP_DIST } = {}) => {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  app.use('/api/shop', shopRoutes);
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
      const storefrontPaths = ['/leather', '/warhammer', '/comics', '/3d-printing'];
      if (!storefrontPaths.some(path => req.path === path || req.path.startsWith(`${path}/`))) return next();
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

  // No real‑time features required for the shop
  return io;
};

const normalizePort = (value) => {
  const port = Number(value);
  if (!Number.isFinite(port) || port < 0) return DEFAULT_PORT;
  return port;
};

const startServer = async ({
  port = process.env.SHOP_PORT ?? DEFAULT_PORT,
  host = '0.0.0.0',
  frontendDist = process.env.SHOP_FRONTEND_DIST ?? DEFAULT_SHOP_DIST,
} = {}) => {
  const app = createApp({ frontendDist });
  const server = http.createServer(app);
  const io = createSocketServer(server);

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
      console.log(`Shop server listening at http://${host}:${port}`);
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