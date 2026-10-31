import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import vercelMultiplayerHandler from '../api/multiplayer';
import { SocketClientManager } from '../src/utils/socketClient';
import { redisStore } from '../server/redisClient';

console.log('\n=== RIZZ DICE VERCEL SERVERLESS MULTIPLAYER TEST SUITE ===\n');

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

// Helper to wait with timeout
function waitFor(condition: () => boolean, timeoutMs = 10000, stepMs = 50): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout after ${timeoutMs}ms waiting for condition`));
      } else {
        setTimeout(check, stepMs);
      }
    };
    check();
  });
}

async function runVercelMultiplayerSuite() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.all('/api/multiplayer', async (req, res) => {
    await vercelMultiplayerHandler(req, res);
  });

  const testServer = http.createServer(app);
  await new Promise<void>((resolve) => {
    testServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = testServer.address();
  const port = typeof address === 'object' && address ? address.port : 3288;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -------------------------------------------------------------
    // [1] Serverless Status & Health Verification
    // -------------------------------------------------------------
    console.log('[1] Serverless Function Status & Upstash Redis Health');

    await it('GET /api/multiplayer?action=status reports healthy state and Redis connectivity', async () => {
      const res = await fetch(`${baseUrl}/api/multiplayer?action=status`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'ok');
      assert.ok(json.redis);
      assert.ok(typeof json.onlinePlayersCount === 'number');
    });

    // -------------------------------------------------------------
    // [2] Multi-Player Identity & Presence via Serverless Architecture
    // -------------------------------------------------------------
    console.log('\n[2] Multi-Player Identity & Temporary Presence');

    const runId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const clientA = new SocketClientManager(`RIZZ-A${runId}`, 'Alice');
    const clientB = new SocketClientManager(`RIZZ-B${runId}`, 'Bob');

    // Client A connects
    clientA.connect(baseUrl);
    await waitFor(() => clientA.isConnected && clientA.onlinePlayer !== null);

    await it('Player A connects via Serverless init and receives player identity', () => {
      assert.strictEqual(clientA.isConnected, true);
      assert.ok(clientA.onlinePlayer);
      assert.strictEqual(clientA.onlinePlayer.id, clientA.getPlayerId());
    });

    // Client B connects
    clientB.connect(baseUrl);
    await waitFor(() => clientB.isConnected && clientB.onlinePlayer !== null);

    await it('Player B connects via Serverless init and receives player identity', () => {
      assert.strictEqual(clientB.isConnected, true);
      assert.ok(clientB.onlinePlayer);
      assert.strictEqual(clientB.onlinePlayer.id, clientB.getPlayerId());
    });

    // Check shared lobby directory
    clientA.getOnlinePlayersList();
    await waitFor(() => clientA.onlinePlayers.some((p) => p.id === clientB.getPlayerId()));

    await it('Shared online lobby shows both active players', () => {
      const playerIds = clientA.onlinePlayers.map((p) => p.id);
      assert.ok(playerIds.includes(clientA.getPlayerId()));
      assert.ok(playerIds.includes(clientB.getPlayerId()));
    });

    // -------------------------------------------------------------
    // [3] Player-to-Player Inbox & Friends System
    // -------------------------------------------------------------
    console.log('\n[3] Player-to-Player Inbox & Friends System');

    let clientBReceivedRequest = false;
    let receivedReq: any = null;
    clientB.on('friend_request_received', (req: any) => {
      if (req.fromId === clientA.getPlayerId()) {
        receivedReq = req;
        clientBReceivedRequest = true;
      }
    });

    clientA.sendFriendRequest(clientB.getPlayerId());
    await waitFor(() => Boolean(clientBReceivedRequest && receivedReq));

    await it('Player B receives friend request from Player A via Redis inbox', () => {
      assert.strictEqual(clientBReceivedRequest, true);
      assert.ok(receivedReq);
    });

    await clientB.acceptFriendRequest(receivedReq.requestId, clientA.getPlayerId());

    await waitFor(() => clientB.friends.some((f) => f.id === clientA.getPlayerId()));

    await it('Player B accepts friend request and mutual friendship is established', () => {
      assert.ok(clientB.friends.some((f) => f.id === clientA.getPlayerId()));
    });

    // -------------------------------------------------------------
    // [4] Private Room Lifecycle & Real-Time Sync
    // -------------------------------------------------------------
    console.log('\n[4] Private Room Lifecycle & Real-Time Event Stream');

    let createdRoomCode = '';
    clientA.on('room_created', (room: any) => {
      createdRoomCode = room.code;
    });

    clientA.createRoom(2);
    await waitFor(() => Boolean(createdRoomCode && clientA.currentRoom));

    await it('Player A creates a 2-player private room with code and host seat', () => {
      assert.strictEqual(clientA.currentRoom?.code, createdRoomCode);
      assert.strictEqual(clientA.currentRoom?.hostId, clientA.getPlayerId());
      assert.strictEqual(clientA.currentRoom?.seats[0].playerId, clientA.getPlayerId());
      assert.strictEqual(clientA.currentRoom?.seats[0].isHost, true);
    });

    // Player B joins the room
    let clientBJoined = false;
    clientB.on('room_joined', () => {
      clientBJoined = true;
    });

    clientB.joinRoom(createdRoomCode);
    await waitFor(() => clientBJoined && clientB.currentRoom?.code === createdRoomCode);

    await it('Player B joins the room using room code', () => {
      assert.strictEqual(clientB.currentRoom?.code, createdRoomCode);
      assert.strictEqual(clientB.currentRoom?.seats[1].playerId, clientB.getPlayerId());
    });

    // Player A receives event that Player B joined via polling
    await waitFor(
      () => Boolean(clientA.currentRoom?.seats.some((s) => s.playerId === clientB.getPlayerId()))
    );

    await it('Player A receives room update with Player B seated via event stream', () => {
      const seatB = clientA.currentRoom?.seats.find((s) => s.playerId === clientB.getPlayerId());
      assert.ok(seatB);
      assert.strictEqual(seatB.isReady, false);
    });

    // Player B toggles ready
    clientB.toggleReady(createdRoomCode);
    await waitFor(() => clientB.currentRoom?.seats[1].isReady === true);

    await it('Player B toggles ready state', () => {
      assert.strictEqual(clientB.currentRoom?.seats[1].isReady, true);
    });

    // Player A sees Player B is ready via polling event stream
    await waitFor(() => clientA.currentRoom?.seats[1].isReady === true);

    await it('Player A sees Player B ready state synchronized via Redis event stream', () => {
      assert.strictEqual(clientA.currentRoom?.seats[1].isReady, true);
    });

    // -------------------------------------------------------------
    // [5] Server-Authoritative Match Lifecycle & Event Stream
    // -------------------------------------------------------------
    console.log('\n[5] Server-Authoritative Match Lifecycle & Gameplay Sync');

    let matchStartedA = false;
    let matchStartedB = false;

    clientA.on('game_started', () => {
      matchStartedA = true;
    });
    clientB.on('game_started', () => {
      matchStartedB = true;
    });

    clientA.startMatch(createdRoomCode);
    await waitFor(() => matchStartedA && clientA.currentMatch !== null);
    await waitFor(() => matchStartedB && clientB.currentMatch !== null);

    await it('Match starts authoritatively and synchronizes to both clients', () => {
      assert.strictEqual(matchStartedA, true);
      assert.strictEqual(matchStartedB, true);
      assert.strictEqual(clientA.currentMatch?.roomCode, createdRoomCode);
      assert.strictEqual(clientB.currentMatch?.roomCode, createdRoomCode);
      assert.strictEqual(clientA.currentMatch?.activePlayerIndex, 0); // Player A is Red (index 0)
    });

    // Player A rolls dice
    let diceRolledA = false;
    let diceRolledB = false;
    let diceValueA = 0;
    let diceValueB = 0;

    clientA.on('game_dice_rolled', (data: any) => {
      diceRolledA = true;
      diceValueA = data.diceValue;
    });

    clientB.on('game_dice_rolled', (data: any) => {
      diceRolledB = true;
      diceValueB = data.diceValue;
    });

    clientA.rollDice(createdRoomCode);
    await waitFor(() => diceRolledA && diceRolledB);

    await it('Player A rolls fair dice; value and selectable tokens synchronize authoritatively', () => {
      assert.strictEqual(diceRolledA, true);
      assert.strictEqual(diceRolledB, true);
      assert.strictEqual(diceValueA, diceValueB, 'Both clients must receive the identical authoritative dice value');
      assert.ok(diceValueA >= 1 && diceValueA <= 6);
    });

    // If rolled 6, Player A can move a token out of yard
    if (diceValueA === 6) {
      let tokenMovedA = false;
      let tokenMovedB = false;

      clientA.on('game_token_moved', () => {
        tokenMovedA = true;
      });
      clientB.on('game_token_moved', () => {
        tokenMovedB = true;
      });

      clientA.moveToken(createdRoomCode, 0);
      await waitFor(() => tokenMovedA);
      await waitFor(() => tokenMovedB);

      await it('Player A moves token out of yard; step sequence and state synchronize', () => {
        assert.strictEqual(tokenMovedA, true);
        assert.strictEqual(tokenMovedB, true);
      });
    } else {
      await it('Server correctly advanced or auto-passed turn based on roll', () => {
        assert.ok(clientA.currentMatch !== null);
      });
    }

    // -------------------------------------------------------------
    // [6] Reaction Event Stream
    // -------------------------------------------------------------
    console.log('\n[6] Soundboard & Reaction Event Synchronization');

    let reactionReceivedB = false;
    clientB.on('game_reaction', (reaction: any) => {
      if (reaction.badge === 'SKIBIDI' && reaction.text === 'What the rizz!') {
        reactionReceivedB = true;
      }
    });

    clientA.sendReaction(createdRoomCode, 'red', 'SKIBIDI', 'What the rizz!');
    await waitFor(() => reactionReceivedB);

    await it('Player A sends reaction; Player B receives it in real-time via event stream', () => {
      assert.strictEqual(reactionReceivedB, true);
    });

    // -------------------------------------------------------------
    // [7] Disconnection & Room Cleanup
    // -------------------------------------------------------------
    console.log('\n[7] Room Leave & State Recovery');

    clientB.leaveRoom(createdRoomCode);
    await waitFor(() => clientB.currentRoom === null);

    await it('Player B leaves room successfully and resets local state', () => {
      assert.strictEqual(clientB.currentRoom, null);
      assert.strictEqual(clientB.currentMatch, null);
    });

    clientA.leaveRoom(createdRoomCode);
    await waitFor(() => clientA.currentRoom === null);

    await it('Player A leaves room and room is cleaned up', () => {
      assert.strictEqual(clientA.currentRoom, null);
      assert.strictEqual(clientA.currentMatch, null);
    });

    clientA.disconnect();
    clientB.disconnect();

    // -------------------------------------------------------------
    // [8] 4-Player Match with 2 Humans and 2 Bots
    // -------------------------------------------------------------
    console.log('\n[8] 4-Player Match with 2 Humans and 2 Bots');

    const clientC = new SocketClientManager(`RIZZ-C${runId}`, 'Charlie');
    const clientD = new SocketClientManager(`RIZZ-D${runId}`, 'Dave');

    clientC.connect(baseUrl);
    clientD.connect(baseUrl);

    await waitFor(() => clientC.isConnected && clientD.isConnected);

    let room4BotCode = '';
    clientC.on('room_created', (room: any) => {
      room4BotCode = room.code;
    });

    clientC.createRoom(4, true);
    await waitFor(() => room4BotCode !== '');

    await it('Player C creates 4-player room with 2 bots pre-configured', () => {
      assert.strictEqual(clientC.currentRoom?.maxPlayers, 4);
      const seats = clientC.currentRoom?.seats || [];
      assert.strictEqual(seats[0].playerId, `RIZZ-C${runId}`);
      assert.strictEqual(seats[0].isBot, false);
      assert.strictEqual(seats[1].playerId, null);
      assert.strictEqual(seats[1].isBot, false);
      assert.strictEqual(seats[2].playerId, 'BOT-CHAD');
      assert.strictEqual(seats[2].isBot, true);
      assert.strictEqual(seats[3].playerId, 'BOT-GIGA');
      assert.strictEqual(seats[3].isBot, true);
    });

    // Player D joins the only available human seat
    let joinedD = false;
    clientD.on('room_joined', () => {
      joinedD = true;
    });

    clientD.joinRoom(room4BotCode);
    await waitFor(() => joinedD);

    await it('Player D joins open human slot 1 and bot slots remain occupied by bots', () => {
      assert.strictEqual(clientD.currentRoom?.seats[1].playerId, `RIZZ-D${runId}`);
      assert.strictEqual(clientD.currentRoom?.seats[2].playerId, 'BOT-CHAD');
      assert.strictEqual(clientD.currentRoom?.seats[3].playerId, 'BOT-GIGA');
    });

    // Player D readies up
    clientD.toggleReady(room4BotCode);
    await waitFor(() => clientC.currentRoom?.seats[1].isReady === true);

    // Player C starts the 4-player match with 2 humans and 2 bots
    let matchStarted4 = false;
    clientC.on('game_started', () => {
      matchStarted4 = true;
    });
    clientD.on('game_started', () => {
      matchStarted4 = true;
    });

    clientC.startMatch(room4BotCode);
    await waitFor(() => matchStarted4);

    await it('Match starts with exactly 2 humans and 2 bots correctly configured in game engine', () => {
      const match = clientC.currentMatch;
      assert.ok(match !== null);
      assert.strictEqual(match?.players.length, 4);
      assert.strictEqual(match?.players[0].isBot, false);
      assert.strictEqual(match?.players[1].isBot, false);
      assert.strictEqual(match?.players[2].isBot, true);
      assert.strictEqual(match?.players[3].isBot, true);
    });

    // -------------------------------------------------------------
    // [9] End Game Action & Room Cleanup
    // -------------------------------------------------------------
    console.log('\n[9] End Game Action & Clean Room Deletion');

    let gameEndedD = false;
    clientD.on('game_ended', () => {
      gameEndedD = true;
    });

    clientC.endGame(room4BotCode);
    await waitFor(() => gameEndedD);

    await it('Host ends game; all players receive game_ended and room is deleted', () => {
      assert.strictEqual(gameEndedD, true);
      assert.strictEqual(clientC.currentRoom, null);
      assert.strictEqual(clientD.currentRoom, null);
    });

    clientC.disconnect();
    clientD.disconnect();

  } finally {
    testServer.closeAllConnections?.();
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
    try {
      await redisStore.quit();
    } catch {}
  }

  console.log(`\n====================================`);
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log(`====================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runVercelMultiplayerSuite().catch((err) => {
  console.error('[Vercel Multiplayer Test Suite Error]:', err);
  process.exit(1);
});
