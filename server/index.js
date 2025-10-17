require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const { WebSocketServer } = require('ws');

const { initDB } = require('./db/sqlite');
const { handleWebSocket } = require('./ws/websockets');

const authRoutes = require('./auth/google');
const gameRoutes = require('./routes/games');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const CLIENT_DIST_PATH = path.join(__dirname, 'public', 'browser');



app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:8080', credentials: true }));
app.use(express.json());
app.use(passport.initialize());
app.set('trust proxy', true);


function safeUse(label, routePath, router) {
  try {
    app.use(routePath, router);


    const stack = router?.stack || router?.routes || [];
    stack.forEach((layer) => {
      const route = layer.route;
      if (route?.path) {
        const methods = Object.keys(route.methods || {}).join(', ').toUpperCase();
      }
    });
  } catch (err) {
    console.error(`❌ Failed to mount ${label} at ${routePath}`);
    console.error(err.stack || err);
    process.exit(1);
  }
}




safeUse('authRoutes', '/auth', authRoutes);
safeUse('gameRoutes', '/api/games', gameRoutes);


try {
  app.use(express.static(CLIENT_DIST_PATH));
} catch (err) {
  console.error(`❌ Failed to serve static files`);
  console.error(err.stack || err);
}const listEndpoints = require('express-list-endpoints');


const printRoutes = (label, router) => {

  const stack = router?.stack || [];
  for (const layer of stack) {
    const r = layer.route;
    if (r) {

    }
  }
};

printRoutes('authRoutes', authRoutes);
printRoutes('gameRoutes', gameRoutes);




try {
  app.get(/(.*)/, (req, res) => {
    const indexPath = path.join(CLIENT_DIST_PATH, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('❌ Error sending index.html:', err.stack || err);
        res.status(500).send('Internal Server Error');
      }
    });
  });
} catch (err) {
  console.error('❌ Error mounting fallback route');
  console.error(err.stack || err);
}


try {
  wss.on('connection', (ws, req) => {
    handleWebSocket(ws, req);
  });
} catch (err) {
  console.error('❌ WebSocket setup failed');
  console.error(err.stack || err);
}


try {
  initDB();

  const PORT = process.env.PORT || 8080; 
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Client served from: ${CLIENT_DIST_PATH}`);
  });
} catch (err) {
  console.error('❌ Failed to start server');
  console.error(err.stack || err);
  process.exit(1); 
}

