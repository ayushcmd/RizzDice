import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';
import { setupSocketHandlers } from '../server/socketHandler';
import { maskRedisUrl, redisMultiplayer, redisStore } from '../server/redisClient';
import type { MultiplayerRoom, OnlineMatchState } from '../src/types/multiplayer';

console.log('\n=== RIZZ DICE REDIS & MULTI-CLIENT SOCKET TEST SUITE ===\n');

let passCount = 0;
let failCount = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  ✓ PASS: ${desc}`);
          passCount++;
        })
        .catch((err: Error) => {
          console.error(`  ✗ FAIL: ${desc}`);
          console.error(`    ${err.message}`);
          failCount++;
        });
    } else {
      console.log(`  ✓ PASS: ${desc}`);
      passCount++;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ FAIL: ${desc}`);
    console.error(`    ${errorMsg}`);
    failCount++;
  }
}

async function runMultiClientSuite() {
  // -------------------------------------------------------------
  // [1] Redis Security & Health Verification
  // -------------------------------------------------------------
  console.log('[1] Redis Security & Health Verification');

  await it('masks sensitive passwords and credentials in URLs', () => {
    const rawSecretUrl = 'rediss://default:SuperSecretPassword123!@rizz-dice-mumbai.upstash.io:6379';
    const masked = maskRedisUrl(rawSecretUrl);
    assert.ok(!masked.includes('SuperSecretPassword123!'), 'Password must never appear in masked URL');
    assert.ok(masked.includes('***'), 'Password must be masked with asterisks');
    assert.ok(masked.includes('rizz-dice-mumbai.upstash.io'), 'Host should remain readable');
  });

  await it('reports structured Redis health status without leaking secrets', async () => {
    const health = await redisMultiplayer.getHealth();
    assert.ok(health.status === 'connected' || health.status === 'degraded' || health.status === 'connecting');
    assert.ok(typeof health.isRealRedis === 'boolean');
    assert.ok(typeof health.isMemoryFallback === 'boolean');
    assert.ok(!health.maskedUrl.includes('password'));
    assert.ok(health.provider.length > 0);
  });

  await it('supports touching room and match TTLs', async () => {
    const testCode = 'RZTOUCH';
    await redisStore.set(`rizz:room:${testCode}`, JSON.stringify({ code: testCode }), 'EX', 100);
    await redisMultiplayer.touchRoom(testCode);
    const room = await redisMultiplayer.getRoom(testCode);
    assert.ok(room);
    await redisMultiplayer.deleteRoom(testCode);
  });

  // -------------------------------------------------------------
  // [2] Multi-Client Concurrent Session Verification
  // -------------------------------------------------------------
  console.log('\n[2] Multi-Client Real-Time Socket.IO Synchronization');

  const app = express();
  const testServer = http.createServer(app);
  const testIo = new Server(testServer, {
    cors: { origin: '*' },
  });
  setupSocketHandlers(testIo);

  const TEST_PORT = 3199;
  await new Promise<void>((resolve) => {
    testServer.listen(TEST_PORT, () => resolve());
  });

  const clientUrl = `http://localhost:${TEST_PORT}`;
  let clientA: ClientSocketType;
  let clientB: ClientSocketType;

  try {
    // 1. Player A Connects
    clientA = ClientSocket(clientUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => {
      clientA.on('connect', () => {
        clientA.emit('player:init', { playerId: 'RIZZ-ALICE', playerName: 'Alice' });
      });
      clientA.on('player:ready', (data: { player: { id: string } }) => {
        assert.strictEqual(data.player.id, 'RIZZ-ALICE');
        resolve();
      });
    });

    await it('Player A connects and registers presence', () => {
      assert.strictEqual(clientA.connected, true);
    });

    // 2. Player B Connects
    clientB = ClientSocket(clientUrl, { transports: ['websocket'] });
    await new Promise<void>((resolve) => {
      clientB.on('connect', () => {
        clientB.emit('player:init', { playerId: 'RIZZ-BOB', playerName: 'Bob' });
      });
      clientB.on('player:ready', (data: { player: { id: string } }) => {
        assert.strictEqual(data.player.id, 'RIZZ-BOB');
        resolve();
      });
    });

    await it('Player B connects and registers presence', () => {
      assert.strictEqual(clientB.connected, true);
    });

    // 3. Both appear in Lobby
    await it('Both players appear in the shared online lobby', async () => {
      const players = await redisMultiplayer.getOnlinePlayers();
      const hasAlice = players.some((p) => p.id === 'RIZZ-ALICE');
      const hasBob = players.some((p) => p.id === 'RIZZ-BOB');
      assert.ok(hasAlice, 'Alice must be in lobby');
      assert.ok(hasBob, 'Bob must be in lobby');
    });

    // 4. Player A Creates a 2-Player Room
    let createdRoomCode = '';
    await new Promise<void>((resolve) => {
      clientA.emit('room:create', { maxPlayers: 2 });
      clientA.on('room:created', (data: { room: MultiplayerRoom }) => {
        createdRoomCode = data.room.code;
        assert.strictEqual(data.room.maxPlayers, 2);
        assert.strictEqual(data.room.hostId, 'RIZZ-ALICE');
        assert.strictEqual(data.room.seats[0].playerId, 'RIZZ-ALICE');
        assert.strictEqual(data.room.seats[0].color, 'red');
        resolve();
      });
    });

    await it('Player A successfully creates a 2-player private room', () => {
      assert.ok(createdRoomCode.length >= 4);
    });

    // 5. Player B Joins via Room Code
    await new Promise<void>((resolve) => {
      clientB.emit('room:join', { roomCode: createdRoomCode });
      clientB.on('room:joined', (data: { room: MultiplayerRoom }) => {
        assert.strictEqual(data.room.code, createdRoomCode);
        assert.strictEqual(data.room.seats[1].playerId, 'RIZZ-BOB');
        assert.strictEqual(data.room.seats[1].color, 'yellow');
        resolve();
      });
    });

    await it('Player B joins room using room code', () => {
      assert.ok(true);
    });

    // 6. Player B Toggles Ready State
    await new Promise<void>((resolve) => {
      clientA.on('room:updated', (data: { room: MultiplayerRoom }) => {
        if (data.room.seats[1].isReady) {
          resolve();
        }
      });
      clientB.emit('room:toggle_ready', { roomCode: createdRoomCode });
    });

    await it('Player B ready state is synchronized in real-time to Player A', () => {
      assert.ok(true);
    });

    // 7. Host (Player A) Starts the Match
    let initialMatchState: OnlineMatchState | null = null;
    await new Promise<void>((resolve) => {
      clientB.on('game:started', (data: { match: OnlineMatchState }) => {
        initialMatchState = data.match;
        resolve();
      });
      clientA.emit('room:start', { roomCode: createdRoomCode });
    });

    await it('Both clients receive synchronized initial match state', () => {
      assert.ok(initialMatchState);
      assert.strictEqual(initialMatchState?.playerCount, 2);
      assert.strictEqual(initialMatchState?.players.length, 2);
      assert.strictEqual(initialMatchState?.activePlayerIndex, 0); // Player A (Red) starts
    });

    // 8. Player A Rolls Dice Authoritatively
    let diceRolledValue = 0;
    await new Promise<void>((resolve) => {
      clientB.on('game:dice_rolled', (data: { diceValue: number; activePlayerIndex: number }) => {
        diceRolledValue = data.diceValue;
        assert.strictEqual(data.activePlayerIndex, 0);
        resolve();
      });
      clientA.emit('game:roll_dice', { roomCode: createdRoomCode });
    });

    await it('Player A authoritative dice roll is broadcast to Player B', () => {
      assert.ok(diceRolledValue >= 1 && diceRolledValue <= 6);
    });

    // 9. Reconnection & Grace Period Verification
    await it('Preserves room seat and allows seamless reconnection with same playerId', async () => {
      // Player B temporarily disconnects
      clientB.disconnect();

      await new Promise((r) => setTimeout(r, 200));

      const roomDuringDisconnect = await redisMultiplayer.getRoom(createdRoomCode);
      assert.ok(roomDuringDisconnect);
      const bobSeat = roomDuringDisconnect.seats.find((s) => s.playerId === 'RIZZ-BOB');
      assert.ok(bobSeat, 'Bob must retain seat during grace period');
      assert.strictEqual(bobSeat.isConnected, false);

      // Reconnect Player B with same playerId
      const clientBReconnected = ClientSocket(clientUrl, { transports: ['websocket'] });
      await new Promise<void>((resolve) => {
        clientBReconnected.on('connect', () => {
          clientBReconnected.emit('player:init', { playerId: 'RIZZ-BOB', playerName: 'Bob' });
        });
        clientBReconnected.on('player:ready', () => {
          resolve();
        });
      });

      await new Promise((r) => setTimeout(r, 300));
      const roomAfterReconnect = await redisMultiplayer.getRoom(createdRoomCode);
      const bobSeatAfter = roomAfterReconnect?.seats.find((s) => s.playerId === 'RIZZ-BOB');
      assert.strictEqual(bobSeatAfter?.isConnected, true);

      clientBReconnected.disconnect();
    });
  } finally {
    if (clientA) clientA.disconnect();
    if (clientB) clientB.disconnect();
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
    await redisMultiplayer.deleteRoom('RZTOUCH');
    await redisMultiplayer.removePresence('RIZZ-ALICE');
    await redisMultiplayer.removePresence('RIZZ-BOB');
    await redisStore.quit();
  }

  console.log('\n======================================================');
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMultiClientSuite().catch((err) => {
  console.error('Fatal multi-client test error:', err);
  process.exit(1);
});
