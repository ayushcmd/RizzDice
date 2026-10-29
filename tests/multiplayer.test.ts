import assert from 'node:assert';
import { MemoryRedisStore, redisMultiplayer } from '../server/redisClient';
import { LudoEngine } from '../server/ludoEngine';
import type { MultiplayerRoom } from '../src/types/multiplayer';

console.log('\n=== RIZZ DICE MULTIPLAYER TEST SUITE ===\n');

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

async function runTests() {
  // -------------------------------------------------------------
  // [1] Memory & Redis Store Operations
  // -------------------------------------------------------------
  console.log('[1] Redis Storage & In-Memory Fallback');
  const memStore = new MemoryRedisStore();

  await it('sets and gets key with value', async () => {
    await memStore.set('test:key1', 'rizz_val');
    const val = await memStore.get('test:key1');
    assert.strictEqual(val, 'rizz_val');
  });

  await it('handles TTL expiry correctly', async () => {
    await memStore.set('test:expiring', 'bye', 'EX', 1); // 1 sec
    const val1 = await memStore.get('test:expiring');
    assert.strictEqual(val1, 'bye');
    await new Promise((r) => setTimeout(r, 1100));
    const val2 = await memStore.get('test:expiring');
    assert.strictEqual(val2, null);
  });

  await it('performs set operations (sadd, srem, sismember, smembers)', async () => {
    await memStore.sadd('set:players', 'RIZZ-1', 'RIZZ-2', 'RIZZ-3');
    const isMem = await memStore.sismember('set:players', 'RIZZ-2');
    assert.strictEqual(isMem, 1);

    await memStore.srem('set:players', 'RIZZ-2');
    const isMemAfter = await memStore.sismember('set:players', 'RIZZ-2');
    assert.strictEqual(isMemAfter, 0);

    const members = await memStore.smembers('set:players');
    assert.strictEqual(members.length, 2);
    assert.ok(members.includes('RIZZ-1'));
    assert.ok(members.includes('RIZZ-3'));
  });

  // -------------------------------------------------------------
  // [2] Temporary Presence & Friends System
  // -------------------------------------------------------------
  console.log('\n[2] Temporary Presence & Friends System');

  await it('registers online player presence and lists in lobby', async () => {
    await redisMultiplayer.registerPresence({
      id: 'RIZZ-TEST1',
      name: 'RizzlerPrime',
      status: 'AVAILABLE',
      connectedAt: Date.now(),
    });

    const presence = await redisMultiplayer.getPlayerPresence('RIZZ-TEST1');
    assert.ok(presence);
    assert.strictEqual(presence.name, 'RizzlerPrime');
    assert.strictEqual(presence.status, 'AVAILABLE');

    const onlineList = await redisMultiplayer.getOnlinePlayers();
    assert.ok(onlineList.some((p) => p.id === 'RIZZ-TEST1'));
  });

  await it('updates presence status to BUSY and IN_GAME', async () => {
    await redisMultiplayer.updatePlayerStatus('RIZZ-TEST1', 'BUSY', 'RZ1234');
    const presence = await redisMultiplayer.getPlayerPresence('RIZZ-TEST1');
    assert.strictEqual(presence?.status, 'BUSY');
    assert.strictEqual(presence?.currentRoomCode, 'RZ1234');
  });

  await it('handles mutual friendship and friend requests', async () => {
    // Send friend request from TEST1 to TEST2
    await redisMultiplayer.addFriendRequest({
      requestId: 'req_1001',
      fromId: 'RIZZ-TEST1',
      fromName: 'RizzlerPrime',
      toId: 'RIZZ-TEST2',
      timestamp: Date.now(),
    });

    const requests = await redisMultiplayer.getFriendRequests('RIZZ-TEST2');
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].fromId, 'RIZZ-TEST1');

    // Accept friend request
    await redisMultiplayer.addFriend('RIZZ-TEST1', 'RIZZ-TEST2');
    await redisMultiplayer.removeFriendRequest('req_1001', 'RIZZ-TEST2');

    const areFriends = await redisMultiplayer.areFriends('RIZZ-TEST1', 'RIZZ-TEST2');
    assert.strictEqual(areFriends, true);

    const reqsAfter = await redisMultiplayer.getFriendRequests('RIZZ-TEST2');
    assert.strictEqual(reqsAfter.length, 0);

    const friendsOf1 = await redisMultiplayer.getFriendIds('RIZZ-TEST1');
    assert.ok(friendsOf1.includes('RIZZ-TEST2'));

    // Remove friend
    await redisMultiplayer.removeFriend('RIZZ-TEST1', 'RIZZ-TEST2');
    const areFriendsAfter = await redisMultiplayer.areFriends('RIZZ-TEST1', 'RIZZ-TEST2');
    assert.strictEqual(areFriendsAfter, false);
  });

  // -------------------------------------------------------------
  // [3] Room Lifecycle & State Management
  // -------------------------------------------------------------
  console.log('\n[3] Room Lifecycle & State Management');

  const mockRoom: MultiplayerRoom = {
    code: 'RZ9999',
    hostId: 'RIZZ-HOST',
    maxPlayers: 4,
    seats: [
      {
        slot: 0,
        color: 'red',
        playerId: 'RIZZ-HOST',
        playerName: 'HostRizz',
        isReady: true,
        isHost: true,
        isConnected: true,
      },
      {
        slot: 1,
        color: 'green',
        playerId: 'RIZZ-P2',
        playerName: 'SigmaGreen',
        isReady: true,
        isHost: false,
        isConnected: true,
      },
      {
        slot: 2,
        color: 'yellow',
        playerId: 'RIZZ-P3',
        playerName: 'ChadYellow',
        isReady: true,
        isHost: false,
        isConnected: true,
      },
      {
        slot: 3,
        color: 'blue',
        playerId: 'RIZZ-P4',
        playerName: 'GigaBlue',
        isReady: true,
        isHost: false,
        isConnected: true,
      },
    ],
    status: 'WAITING',
    createdAt: Date.now(),
  };

  await it('persists room in Redis and reads back', async () => {
    await redisMultiplayer.saveRoom(mockRoom);
    const loaded = await redisMultiplayer.getRoom('RZ9999');
    assert.ok(loaded);
    assert.strictEqual(loaded.code, 'RZ9999');
    assert.strictEqual(loaded.seats.length, 4);
    assert.strictEqual(loaded.hostId, 'RIZZ-HOST');
  });

  // -------------------------------------------------------------
  // [4] Server-Authoritative Ludo Engine
  // -------------------------------------------------------------
  console.log('\n[4] Server-Authoritative Ludo Engine');

  const match = LudoEngine.createInitialMatch(mockRoom);

  await it('initializes authoritative match state correctly', () => {
    assert.strictEqual(match.roomCode, 'RZ9999');
    assert.strictEqual(match.playerCount, 4);
    assert.strictEqual(match.players.length, 4);
    assert.strictEqual(match.activePlayerIndex, 0); // Red starts
    assert.strictEqual(match.canRoll, true);
    assert.strictEqual(match.players[0].color, 'red');
    assert.strictEqual(match.players[1].color, 'green');
    assert.strictEqual(match.players[2].color, 'yellow');
    assert.strictEqual(match.players[3].color, 'blue');
  });

  await it('rejects roll from wrong player', () => {
    assert.throws(() => {
      LudoEngine.rollDice(match, 1); // Green attempts to roll on Red's turn
    }, /Not your turn/);
  });

  await it('rolls fair dice for active player and identifies legal moves', () => {
    const rollRes = LudoEngine.rollDice(match, 0);
    assert.ok(rollRes.diceValue >= 1 && rollRes.diceValue <= 6);
    if (rollRes.diceValue === 6) {
      assert.strictEqual(rollRes.selectableTokenIds.length, 4);
      assert.strictEqual(match.canRoll, false);
    } else {
      // With all tokens in base, rolling non-6 automatically passes turn to player 1 (Green)
      assert.strictEqual(rollRes.autoPassTurn, true);
      assert.strictEqual(match.activePlayerIndex, 1);
      assert.strictEqual(match.canRoll, true);
    }
  });

  await it('forfeits turn on 3 consecutive sixes', () => {
    match.activePlayerIndex = 0;
    match.canRoll = true;
    match.consecutiveSixes = 2; // already 2 sixes

    // Force a roll of 6 by mocking or inspecting logic
    const originalRandom = Math.random;
    Math.random = () => 0.999; // guarantees 6

    const res = LudoEngine.rollDice(match, 0);
    Math.random = originalRandom;

    assert.strictEqual(res.diceValue, 6);
    assert.strictEqual(res.isThreeSixes, true);
    assert.strictEqual(res.autoPassTurn, true);
    assert.strictEqual(match.consecutiveSixes, 0);
    assert.strictEqual(match.activePlayerIndex, 1); // passed to Green
  });

  await it('authoritatively spawns token out of yard on 6', () => {
    match.activePlayerIndex = 0;
    match.canRoll = false;
    match.diceValue = 6;
    match.selectableTokenIds = [0, 1, 2, 3];

    const moveRes = LudoEngine.moveToken(match, 0, 0);
    assert.strictEqual(moveRes.success, true);
    assert.strictEqual(moveRes.isSpawning, true);
    assert.strictEqual(moveRes.extraChance, true); // 6 gives bonus roll
    assert.strictEqual(moveRes.nextPlayerIndex, 0); // retains turn

    const movedToken = match.players[0].tokens[0];
    assert.strictEqual(movedToken.isAlive, true);
    assert.strictEqual(movedToken.currBlock, 39); // Red start position
    assert.strictEqual(movedToken.numberOfSteps, 0);
  });

  await it('advances token step-by-step and calculates path sequence', () => {
    match.activePlayerIndex = 0;
    match.canRoll = false;
    match.diceValue = 4;
    match.selectableTokenIds = [0];

    const moveRes = LudoEngine.moveToken(match, 0, 0);
    assert.strictEqual(moveRes.success, true);
    assert.strictEqual(moveRes.isSpawning, false);
    assert.strictEqual(moveRes.stepSequence.length, 4);

    const token = match.players[0].tokens[0];
    assert.strictEqual(token.currBlock, 43); // 39 + 4 = 43
    assert.strictEqual(token.numberOfSteps, 4);
    assert.strictEqual(moveRes.nextPlayerIndex, 1); // turn rotated to Green
  });

  await it('handles safe spots and protects tokens from capture', () => {
    // Red token placed on safe spot 0 (Cell 0 is Green start and a safe spot)
    const redToken = match.players[0].tokens[1];
    redToken.isAlive = true;
    redToken.currBlock = 0;
    redToken.numberOfSteps = 13;

    // Green player spawns token onto Cell 0
    match.activePlayerIndex = 1;
    match.canRoll = false;
    match.diceValue = 6;
    match.selectableTokenIds = [0];

    const spawnRes = LudoEngine.moveToken(match, 1, 0);
    assert.strictEqual(spawnRes.success, true);
    assert.strictEqual(spawnRes.isSpawning, true);

    // Red token was NOT captured because Cell 0 is a Safe Spot
    assert.strictEqual(redToken.isAlive, true);
    assert.strictEqual(redToken.currBlock, 0);
  });

  await it('authoritatively executes enemy capture on non-safe square', () => {
    // Green token at cell 45 (vulnerable)
    const greenToken = match.players[1].tokens[1];
    greenToken.isAlive = true;
    greenToken.currBlock = 45;
    greenToken.numberOfSteps = 45;

    // Red token moves from cell 43 with roll of 2 -> lands on 45!
    match.activePlayerIndex = 0;
    match.canRoll = false;
    match.diceValue = 2;
    match.selectableTokenIds = [0];

    const captureRes = LudoEngine.moveToken(match, 0, 0);
    assert.strictEqual(captureRes.success, true);
    assert.ok(captureRes.capturedToken);
    assert.strictEqual(captureRes.capturedToken.color, 'green');
    assert.strictEqual(captureRes.extraChance, true); // Capturing grants bonus roll!

    // Green token sent back to base yard
    assert.strictEqual(greenToken.isAlive, false);
    assert.strictEqual(greenToken.currBlock, -1);
    assert.strictEqual(greenToken.numberOfSteps, 0);
  });

  await it('recognizes home completion at step 57', () => {
    const redToken = match.players[0].tokens[0];
    redToken.numberOfSteps = 54;
    redToken.currBlock = 72;
    redToken.currWinnerBlock = 3;

    match.activePlayerIndex = 0;
    match.canRoll = false;
    match.diceValue = 3; // 54 + 3 = 57 Home!
    match.selectableTokenIds = [0];

    const homeRes = LudoEngine.moveToken(match, 0, 0);
    assert.strictEqual(homeRes.success, true);
    assert.strictEqual(redToken.hasCompleted, true);
    assert.strictEqual(redToken.currBlock, 999);
    assert.strictEqual(homeRes.extraChance, true); // Home entry grants extra chance
  });

  // Clean up
  await memStore.quit();
  await redisMultiplayer.removePresence('RIZZ-TEST1');
  await redisMultiplayer.deleteRoom('RZ9999');

  console.log('\n====================================');
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error('Test runner error:', e);
  process.exit(1);
});
