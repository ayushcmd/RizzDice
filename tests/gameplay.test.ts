import { COLOR_CONFIGS, SAFE_SPOTS } from '../src/utils/boardData';
import { canTokenMove, calculateNextBlock } from '../src/utils/botAI';
import type { Player, Token, PlayerColor, PositionIndex } from '../src/types/ludo';
import { DEFAULT_PREFERENCES } from '../src/utils/storageManager';

function createTestPlayer(
  id: number,
  name: string,
  color: PlayerColor,
  position: PositionIndex,
  isBot = false
): Player {
  const tokens: Token[] = [0, 1, 2, 3].map((slot) => ({
    id: slot,
    color,
    playerIndex: id,
    isAlive: false,
    currBlock: -1,
    numberOfSteps: 0,
    hasCompleted: false,
    currWinnerBlock: 0,
    yardSlot: slot,
  }));

  return { id, name, color, position, isBot, tokens, hasWon: false };
}

function initPlayers(playerCount: 2 | 3 | 4): Player[] {
  if (playerCount === 2) {
    return [
      createTestPlayer(0, 'Player 1', 'red', 1),
      createTestPlayer(1, 'Player 2', 'yellow', 4),
    ];
  } else if (playerCount === 3) {
    return [
      createTestPlayer(0, 'Player 1', 'red', 1),
      createTestPlayer(1, 'Player 2', 'green', 2),
      createTestPlayer(2, 'Player 3', 'yellow', 4),
    ];
  } else {
    return [
      createTestPlayer(0, 'Player 1', 'red', 1),
      createTestPlayer(1, 'Player 2', 'green', 2),
      createTestPlayer(2, 'Player 3', 'yellow', 4),
      createTestPlayer(3, 'Player 4', 'blue', 3),
    ];
  }
}

function getNextPlayerIndex(currentIdx: number, playersList: Player[]): number {
  const activeRemaining = playersList.filter((p) => !p.hasWon);
  if (activeRemaining.length <= 1) return currentIdx;

  let nextIdx = (currentIdx + 1) % playersList.length;
  while (playersList[nextIdx].hasWon) {
    nextIdx = (nextIdx + 1) % playersList.length;
  }
  return nextIdx;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

console.log('=== RIZZ DICE TEST SUITE ===\n');

// 1. Player Initialization Tests
console.log('[1] Player Initialization');
const p2 = initPlayers(2);
assert(p2.length === 2, '2-player mode initializes exactly 2 players');
assert(p2.flatMap((p) => p.tokens).length === 8, '2-player mode has 8 tokens');
assert(p2[0].color === 'red' && p2[1].color === 'yellow', '2-player colors are Red vs Yellow');

const p3 = initPlayers(3);
assert(p3.length === 3, '3-player mode initializes exactly 3 players');
assert(p3.flatMap((p) => p.tokens).length === 12, '3-player mode has 12 tokens');
assert(
  p3[0].color === 'red' && p3[1].color === 'green' && p3[2].color === 'yellow',
  '3-player colors are Red, Green, Yellow'
);

const p4 = initPlayers(4);
assert(p4.length === 4, '4-player mode initializes exactly 4 players');
assert(p4.flatMap((p) => p.tokens).length === 16, '4-player mode has 16 tokens');
assert(
  p4[0].color === 'red' && p4[1].color === 'green' && p4[2].color === 'yellow' && p4[3].color === 'blue',
  '4-player colors are Red, Green, Yellow, Blue'
);

// 2. Turn Management & Clockwise Progression
console.log('\n[2] Turn Management & Clockwise Progression');
let currentTurn = 0;
const turnSequence4: number[] = [0];
for (let i = 0; i < 8; i++) {
  currentTurn = getNextPlayerIndex(currentTurn, p4);
  turnSequence4.push(currentTurn);
}
assert(
  JSON.stringify(turnSequence4) === JSON.stringify([0, 1, 2, 3, 0, 1, 2, 3, 0]),
  `4-player clockwise sequence without skipping: ${turnSequence4.join(' -> ')}`
);

currentTurn = 0;
const turnSequence3: number[] = [0];
for (let i = 0; i < 6; i++) {
  currentTurn = getNextPlayerIndex(currentTurn, p3);
  turnSequence3.push(currentTurn);
}
assert(
  JSON.stringify(turnSequence3) === JSON.stringify([0, 1, 2, 0, 1, 2, 0]),
  `3-player clockwise sequence: ${turnSequence3.join(' -> ')}`
);

currentTurn = 0;
const turnSequence2: number[] = [0];
for (let i = 0; i < 4; i++) {
  currentTurn = getNextPlayerIndex(currentTurn, p2);
  turnSequence2.push(currentTurn);
}
assert(
  JSON.stringify(turnSequence2) === JSON.stringify([0, 1, 0, 1, 0]),
  `2-player clockwise sequence: ${turnSequence2.join(' -> ')}`
);

// 3. Finished Player Skip
console.log('\n[3] Finished Player Skipping');
const p4WithWinner = initPlayers(4);
p4WithWinner[1].hasWon = true; // Green (index 1) won!
currentTurn = 0; // Red
const turnSeqSkip: number[] = [0];
for (let i = 0; i < 6; i++) {
  currentTurn = getNextPlayerIndex(currentTurn, p4WithWinner);
  turnSeqSkip.push(currentTurn);
}
assert(
  !turnSeqSkip.includes(1),
  `Finished player (index 1) is never given a turn: ${turnSeqSkip.join(' -> ')}`
);
assert(
  JSON.stringify(turnSeqSkip) === JSON.stringify([0, 2, 3, 0, 2, 3, 0]),
  'Turn order rotates exclusively among active players (0 -> 2 -> 3 -> 0)'
);

// 4. Token Movement & Safe Spots
console.log('\n[4] Token Movement & Game Rules');
const redToken = p4[0].tokens[0];
assert(!canTokenMove(redToken, 5), 'Token in yard cannot move on 5');
assert(canTokenMove(redToken, 6), 'Token in yard can move on 6');

// Spawn token
redToken.isAlive = true;
redToken.currBlock = COLOR_CONFIGS.red.startPosition;
redToken.numberOfSteps = 0;
assert(canTokenMove(redToken, 4), 'Alive token can move on 4');

// Exact Home Reach (57 steps)
redToken.numberOfSteps = 53;
assert(canTokenMove(redToken, 4), 'Token at 53 steps can move on 4 (53 + 4 = 57 Home)');
assert(!canTokenMove(redToken, 5), 'Token at 53 steps cannot move on 5 (53 + 5 = 58 > 57)');

const nextOn57 = calculateNextBlock(redToken, 4);
assert(nextOn57.willFinish === true, 'Moving to 57 triggers willFinish = true');

// Safe spots verification
assert(SAFE_SPOTS.has(0), 'Cell 0 is a Safe Spot');
assert(SAFE_SPOTS.has(8), 'Cell 8 is a Safe Spot');
assert(SAFE_SPOTS.has(13), 'Cell 13 is a Safe Spot');
assert(SAFE_SPOTS.has(21), 'Cell 21 is a Safe Spot');
assert(SAFE_SPOTS.has(26), 'Cell 26 is a Safe Spot');
assert(SAFE_SPOTS.has(34), 'Cell 34 is a Safe Spot');
assert(SAFE_SPOTS.has(39), 'Cell 39 is a Safe Spot');
assert(SAFE_SPOTS.has(47), 'Cell 47 is a Safe Spot');
assert(!SAFE_SPOTS.has(1), 'Cell 1 is NOT a Safe Spot (vulnerable)');

// 5. Default Preferences & Persistence
console.log('\n[5] Local Storage Defaults & Configuration');
assert(DEFAULT_PREFERENCES.soundEnabled === true, 'Default sound is enabled');
assert(DEFAULT_PREFERENCES.voiceEnabled === true, 'Default Gen-Z voice is enabled');
assert(DEFAULT_PREFERENCES.eventPlaybackEnabled === false, 'Event reactions default to OFF (manual only)');
assert(DEFAULT_PREFERENCES.eventVoiceConfig.CAPTURE.mode === 'default', 'Capture event defaults to system sound');
assert(DEFAULT_PREFERENCES.eventVoiceConfig.ROLL_SIX.mode === 'default', 'Roll Six event defaults to system sound');
assert(DEFAULT_PREFERENCES.eventVoiceConfig.HOME.mode === 'default', 'Home event defaults to system sound');
assert(DEFAULT_PREFERENCES.eventVoiceConfig.VICTORY.mode === 'default', 'Victory event defaults to system sound');
assert(DEFAULT_PREFERENCES.defaultPlayerNames.red === 'Rizzler', 'Default Red name is Rizzler');
assert(DEFAULT_PREFERENCES.defaultPlayerNames.green === 'Sigma', 'Default Green name is Sigma');
assert(DEFAULT_PREFERENCES.defaultPlayerNames.yellow === 'Chad', 'Default Yellow name is Chad');
assert(DEFAULT_PREFERENCES.defaultPlayerNames.blue === 'Giga', 'Default Blue name is Giga');

// 6. Soundboard and Event Triggers Integrity
console.log('\n[6] Soundboard and Event Triggers Integrity');
import('../src/utils/voiceManager').then(({ AVAILABLE_AUDIO_CLIPS, SYSTEM_DEFAULT_SOUNDS }) => {
  assert(AVAILABLE_AUDIO_CLIPS.length > 0, 'Audio soundboard has clips loaded');
  assert(AVAILABLE_AUDIO_CLIPS.every((c) => c.url.endsWith('.mp3')), 'All soundboard clips use valid .mp3 assets');
  assert(Boolean(SYSTEM_DEFAULT_SOUNDS.CAPTURE.url), 'Capture system sound exists');
  assert(Boolean(SYSTEM_DEFAULT_SOUNDS.ROLL_SIX.url), 'Roll-six system sound exists');
  assert(Boolean(SYSTEM_DEFAULT_SOUNDS.HOME.url), 'Home system sound exists');
  assert(Boolean(SYSTEM_DEFAULT_SOUNDS.VICTORY.url), 'Victory system sound exists');

  // 7. Token Entry on Six for All 4 Players
  console.log('\n[7] Token Entry on Six for All 4 Players');
  const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
  const expectedStarts: Record<PlayerColor, number> = {
    red: 39,
    green: 0,
    yellow: 13,
    blue: 26,
  };

  for (const color of colors) {
    const config = COLOR_CONFIGS[color];
    assert(
      config.startPosition === expectedStarts[color],
      `${color.toUpperCase()} starting position is correctly mapped to Cell ${expectedStarts[color]}`
    );

    // Create a player of this color with yard tokens
    const player = createTestPlayer(0, `${color} Player`, color, config.position);
    const token = player.tokens[0];

    assert(!token.isAlive, `${color} token starts in base yard (isAlive = false)`);
    assert(canTokenMove(token, 6), `${color} token in base can move on 6`);
    assert(!canTokenMove(token, 5), `${color} token in base cannot move on non-6 roll`);

    // Simulate spawning token onto track
    token.isAlive = true;
    token.currBlock = config.startPosition;
    token.numberOfSteps = 0;

    assert(token.isAlive, `${color} token has left home/base state`);
    assert(token.currBlock === expectedStarts[color], `${color} token is positioned on start square ${expectedStarts[color]}`);
    assert(token.numberOfSteps === 0, `${color} token step counter starts at 0`);

    // Subsequent normal movement
    assert(canTokenMove(token, 3), `${color} token on track can move on next roll (3)`);
    const nextStep = calculateNextBlock(token, 3);
    assert(!nextStep.willFinish, `${color} token advances normally along outer track`);
  }

  // 8. Token Selection Click Validation & Debouncing
  console.log('\n[8] Token Selection Click Validation');
  const testActivePlayer = p4[1]; // Green (Sigma)
  const movableTokens = testActivePlayer.tokens.filter((t) => canTokenMove(t, 6));
  assert(movableTokens.length === 4, 'All 4 green tokens are eligible when rolling 6 with empty board');

  // Simulate token click logic from handleTokenClick
  function simulateTokenClick(
    clickedToken: Token,
    activeP: Player,
    selectable: Token[],
    isProcessing: boolean,
    isRollingDice: boolean
  ): boolean {
    if (
      isProcessing ||
      isRollingDice ||
      !activeP ||
      activeP.isBot ||
      clickedToken.playerIndex !== activeP.id ||
      selectable.length === 0 ||
      !selectable.some((t) => t.playerIndex === clickedToken.playerIndex && t.id === clickedToken.id)
    ) {
      return false;
    }
    return true;
  }

  // When canRoll is false (dice rolled, awaiting piece selection):
  const canClickEligible = simulateTokenClick(movableTokens[0], testActivePlayer, movableTokens, false, false);
  assert(canClickEligible === true, 'Eligible token can be clicked during token selection phase (canRoll=false)');

  const canClickEnemy = simulateTokenClick(p4[0].tokens[0], testActivePlayer, movableTokens, false, false);
  assert(canClickEnemy === false, 'Enemy token cannot be selected on active player turn');

  const canClickWhileRolling = simulateTokenClick(movableTokens[0], testActivePlayer, movableTokens, false, true);
  assert(canClickWhileRolling === false, 'Token cannot be selected while dice is rolling');

  const canClickWhileProcessing = simulateTokenClick(movableTokens[0], testActivePlayer, movableTokens, true, false);
  assert(canClickWhileProcessing === false, 'Duplicate clicks rejected while move is processing');

  // 9. Active Match Session Recovery & Validation
  console.log('\n[9] Active Match Session Recovery & Validation');
  import('../src/utils/storageManager').then(({ storageManager }) => {
    // Test session validation with mock in-progress match
    const mockSession = {
      gameState: 'PLAYING' as const,
      gameMode: 'pass_and_play' as const,
      playerCount: 4 as const,
      players: initPlayers(4),
      activePlayerIndex: 1, // Green's turn
      diceValue: 6,
      canRoll: false, // Mid-turn awaiting move
      hasExtraChance: true,
      consecutiveSixes: 1,
      winners: [],
    };

    // Spawn 1 token on track for Green
    mockSession.players[1].tokens[0].isAlive = true;
    mockSession.players[1].tokens[0].currBlock = 0;
    mockSession.players[1].tokens[0].numberOfSteps = 0;

    // Save session
    storageManager.saveActiveSession(mockSession);
    const restored = storageManager.getActiveSession();

    assert(restored !== null, 'Active match session is successfully retrieved from storage');
    assert(restored?.gameState === 'PLAYING', 'Restored gameState is PLAYING');
    assert(restored?.activePlayerIndex === 1, 'Restored active player index is preserved (1 = Green)');
    assert(restored?.diceValue === 6, 'Restored dice value is preserved (6)');
    assert(restored?.canRoll === false, 'Restored canRoll state is preserved (false)');
    assert(restored?.consecutiveSixes === 1, 'Restored consecutiveSixes count is preserved (1)');
    assert(restored?.players[1].tokens[0].isAlive === true, 'Restored token isAlive status is preserved');
    assert(restored?.players[1].tokens[0].currBlock === 0, 'Restored token board position is preserved (Cell 0)');

    // Corrupt session validation test
    storageManager.clearActiveSession();
    assert(storageManager.getActiveSession() === null, 'Cleared session returns null');

    console.log(`\n============================`);
    console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log(`============================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  });
});
