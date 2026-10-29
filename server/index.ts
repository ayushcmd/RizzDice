import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socketHandler';
import { redisMultiplayer } from './redisClient';

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

// Basic health and presence inspection endpoint
app.get('/api/status', async (_req, res) => {
  try {
    const players = await redisMultiplayer.getOnlinePlayers();
    res.json({
      status: 'ok',
      serverTime: Date.now(),
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

export { app, server, io };
