import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socketHandler';
import { redisMultiplayer, redisStore } from './redisClient';

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(express.json());

// Comprehensive health and presence inspection endpoint
app.get('/api/status', async (_req, res) => {
  try {
    const health = await redisMultiplayer.getHealth();
    const players = await redisMultiplayer.getOnlinePlayers();
    res.json({
      status: 'ok',
      serverTime: Date.now(),
      redis: health,
      onlinePlayersCount: players.length,
      onlinePlayers: players,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ status: 'error', message: errorMsg });
  }
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

setupSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`[RizzDice Server] Server listening on http://localhost:${PORT}`);
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  console.log(`[Server] Received ${signal}. Closing HTTP server and Redis connection...`);
  server.close(async () => {
    try {
      await redisStore.quit();
      console.log('[Server] Graceful shutdown complete.');
    } catch (e) {
      console.error('[Server] Error during Redis shutdown:', e);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, server, io };
