import { COLOR_CONFIGS } from '../src/utils/boardData';
import {
  calculateTokenMovement,
  canTokenMove,
  chooseBotMove,
} from '../src/utils/botAI';
import { LudoEngine, createPlayerInstance } from '../server/ludoEngine';
import type { Token, PlayerColor } from '../src/types/ludo';
import type { MultiplayerRoom } from '../src/types/multiplayer';

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

console.log('=== RIZZ DICE DETERMINISTIC MOVEMENT TEST SUITE ===\n');

function makeToken(
  color: PlayerColor,
  playerIndex: number,
  isAlive: boolean,
  currBlock: number,
  numberOfSteps: number,
  currWinnerBlock = 0,
  hasCompleted = false
): Token {
  return {
    id: 0,
    color,
    playerIndex,
    isAlive,
    currBlock,
    numberOfSteps,
    currWinnerBlock,
    hasCompleted,
    yardSlot: 0,
  };
}

const colors: PlayerColor[] = ['red', 'green', 'yellow', 'blue'];

// ============================================================================
// 1. Perimeter Movement for All 4 Colors (Dice 1..6)
// ============================================================================
console.log('[1] Perimeter Movement for All 4 Colors (Dice 1..6)');

for (const color of colors) {
  const cfg = COLOR_CONFIGS[color];
  const spawnedToken = makeToken(color, 0, true, cfg.startPosition, 0);

  for (let dice = 1; dice <= 6; dice++) {
    const move = calculateTokenMovement(spawnedToken, dice);
    assert(move.isValid, `${color} can move from start with roll ${dice}`);
    assert(move.stepSequence.length === dice, `${color} roll ${dice} produces exactly ${dice} steps`);

    // Verify intermediate steps along perimeter
    for (let s = 0; s < dice; s++) {
      const expectedBlock = (cfg.startPosition + s + 1) % 52;
      assert(
        move.stepSequence[s].block === expectedBlock,
        `${color} step ${s + 1} with roll ${dice} is cell ${expectedBlock}`
      );
      assert(
        move.stepSequence[s].numberOfSteps === s + 1,
        `${color} step ${s + 1} numberOfSteps is ${s + 1}`
      );
      assert(
        move.stepSequence[s].isHomeCenter === false,
        `${color} step ${s + 1} is not home center`
      );
    }

    assert(move.finalBlock === (cfg.startPosition + dice) % 52, `${color} lands on cell ${(cfg.startPosition + dice) % 52}`);
    assert(move.finalSteps === dice, `${color} finalSteps is ${dice}`);
  }
}

// ============================================================================
// 2. Perimeter Wraparound (51 -> 0 -> 1)
// ============================================================================
console.log('\n[2] Perimeter Wraparound (51 -> 0)');

// Test wraparound for Red (starts 39, step 12 is 51, step 13 is 0, step 14 is 1)
const redPreWrap = makeToken('red', 0, true, 50, 11);
const redWrapMove = calculateTokenMovement(redPreWrap, 3);

assert(redWrapMove.isValid, 'Red can move across 51 -> 0 boundary');
assert(redWrapMove.stepSequence.length === 3, 'Red wraparound produces exactly 3 steps');
assert(redWrapMove.stepSequence[0].block === 51, 'Step 1 lands on cell 51');
assert(redWrapMove.stepSequence[1].block === 0, 'Step 2 wraps cleanly around to cell 0');
assert(redWrapMove.stepSequence[2].block === 1, 'Step 3 advances cleanly to cell 1');
assert(redWrapMove.finalBlock === 1, 'Final position after wraparound is cell 1');
assert(redWrapMove.finalSteps === 14, 'Final steps count is 14');

// Verify Green: at step 50 is cell 50, but if on perimeter at 51, wraps to 0
const greenStart = makeToken('green', 0, true, 0, 0);
const greenStep1 = calculateTokenMovement(greenStart, 1);
assert(greenStep1.stepSequence[0].block === 1, 'Green from 0 advances cleanly to 1');

// ============================================================================
// 3. Home-Lane Entry for Every Color
// ============================================================================
console.log('\n[3] Home-Lane Entry for Every Color');

for (const color of colors) {
  const cfg = COLOR_CONFIGS[color];

  // Token exactly at endPosition (step 50)
  const atEndToken = makeToken(color, 0, true, cfg.endPosition, 50);
  assert(
    atEndToken.currBlock === cfg.endPosition,
    `${color} token at endPosition is cell ${cfg.endPosition}`
  );

  // Roll 3: should take steps 51, 52, 53 -> winnerBlocks[0], winnerBlocks[1], winnerBlocks[2]
  const entryMove = calculateTokenMovement(atEndToken, 3);
  assert(entryMove.isValid, `${color} enters home lane cleanly on roll 3`);
  assert(entryMove.stepSequence.length === 3, `${color} generates 3 home stretch steps`);
  assert(
    entryMove.stepSequence[0].block === cfg.winnerBlocks[0],
    `${color} step 51 enters own home lane cell ${cfg.winnerBlocks[0]}`
  );
  assert(
    entryMove.stepSequence[1].block === cfg.winnerBlocks[1],
    `${color} step 52 moves along home lane cell ${cfg.winnerBlocks[1]}`
  );
  assert(
    entryMove.stepSequence[2].block === cfg.winnerBlocks[2],
    `${color} step 53 moves along home lane cell ${cfg.winnerBlocks[2]}`
  );
  assert(entryMove.finalBlock === cfg.winnerBlocks[2], `${color} finalBlock is ${cfg.winnerBlocks[2]}`);
  assert(entryMove.finalSteps === 53, `${color} finalSteps is 53`);
  assert(entryMove.finalWinnerBlockIndex === 3, `${color} finalWinnerBlockIndex is 3`);

  // Ensure it never entered another player's home lane
  for (const otherColor of colors) {
    if (otherColor === color) continue;
    const otherCfg = COLOR_CONFIGS[otherColor];
    const visitedOther = entryMove.stepSequence.some((step) =>
      otherCfg.winnerBlocks.includes(step.block)
    );
    assert(!visitedOther, `${color} never enters ${otherColor}'s home stretch`);
  }

  // Token before endPosition (step 49) rolling 2
  const beforeEnd = makeToken(color, 0, true, (cfg.startPosition + 49) % 52, 49);
  const crossMove = calculateTokenMovement(beforeEnd, 2);
  assert(crossMove.isValid, `${color} can cross from perimeter into home stretch`);
  assert(crossMove.stepSequence[0].block === cfg.endPosition, `Cross step 1 reaches endPosition ${cfg.endPosition}`);
  assert(crossMove.stepSequence[1].block === cfg.winnerBlocks[0], `Cross step 2 enters home stretch ${cfg.winnerBlocks[0]}`);
}

// ============================================================================
// 4. Exact Finishing Rules (57 Steps)
// ============================================================================
console.log('\n[4] Exact Finishing Rules (Exact Step 57)');

for (const color of colors) {
  const cfg = COLOR_CONFIGS[color];

  // Case A: Token at step 56 (on winnerBlocks[5]), roll 1 -> finishes at 57
  const at56 = makeToken(color, 0, true, cfg.winnerBlocks[5], 56, 6);
  const finishFrom56 = calculateTokenMovement(at56, 1);
  assert(finishFrom56.isValid, `${color} at step 56 can move with dice 1`);
  assert(finishFrom56.stepSequence.length === 1, `${color} generates 1 finishing step`);
  assert(finishFrom56.finalBlock === 999, `${color} finishes at cell 999`);
  assert(finishFrom56.willFinish === true, `${color} willFinish is true`);
  assert(finishFrom56.finalSteps === 57, `${color} finalSteps is 57`);

  // Case B: Token at step 56, roll 2 -> ILLEGAL (overshoot 58 > 57)
  const illegalFrom56 = calculateTokenMovement(at56, 2);
  assert(!illegalFrom56.isValid, `${color} at step 56 + roll 2 is rejected as illegal overshoot`);
  assert(illegalFrom56.stepSequence.length === 0, `${color} overshoot returns 0 steps`);
  assert(!canTokenMove(at56, 2), `${color} canTokenMove returns false for overshoot roll 2`);

  // Case C: Token at step 55 (on winnerBlocks[4]), roll 2 -> finishes at 57
  const at55 = makeToken(color, 0, true, cfg.winnerBlocks[4], 55, 5);
  const finishFrom55 = calculateTokenMovement(at55, 2);
  assert(finishFrom55.isValid, `${color} at step 55 can move with dice 2`);
  assert(finishFrom55.stepSequence.length === 2, `${color} stepSequence has length 2`);
  assert(finishFrom55.stepSequence[0].block === cfg.winnerBlocks[5], `${color} step 1 is last home square ${cfg.winnerBlocks[5]}`);
  assert(finishFrom55.stepSequence[1].block === 999, `${color} step 2 is home center 999`);
  assert(finishFrom55.willFinish === true, `${color} willFinish is true on exact completion`);

  // Case D: Token at step 55, roll 3 -> ILLEGAL (55 + 3 = 58 > 57)
  const illegalFrom55 = calculateTokenMovement(at55, 3);
  assert(!illegalFrom55.isValid, `${color} at step 55 + roll 3 is rejected as illegal overshoot`);
  assert(!canTokenMove(at55, 3), `${color} canTokenMove returns false for overshoot roll 3`);
}

// ============================================================================
// 5. Yard and Spawning Rules
// ============================================================================
console.log('\n[5] Yard and Spawning Rules');

for (const color of colors) {
  const cfg = COLOR_CONFIGS[color];
  const inYard = makeToken(color, 0, false, -1, 0);

  // Rolls 1 through 5 cannot spawn
  for (let r = 1; r <= 5; r++) {
    const yardMove = calculateTokenMovement(inYard, r);
    assert(!yardMove.isValid, `${color} in yard cannot spawn on roll ${r}`);
    assert(!yardMove.isSpawning, `${color} isSpawning is false for roll ${r}`);
    assert(!canTokenMove(inYard, r), `${color} canTokenMove is false in yard on roll ${r}`);
  }

  // Roll 6 can spawn
  const spawnMove = calculateTokenMovement(inYard, 6);
  assert(spawnMove.isValid, `${color} in yard can spawn on roll 6`);
  assert(spawnMove.isSpawning, `${color} isSpawning is true on roll 6`);
  assert(spawnMove.finalBlock === cfg.startPosition, `${color} spawned lands on start square ${cfg.startPosition}`);
  assert(spawnMove.finalSteps === 0, `${color} spawned token has 0 steps`);
  assert(spawnMove.stepSequence.length === 0, `${color} spawn stepSequence is empty (spawn does NOT advance 6 squares)`);
  assert(canTokenMove(inYard, 6), `${color} canTokenMove is true in yard on roll 6`);
}

// ============================================================================
// 6. Invalid States & Rejections
// ============================================================================
console.log('\n[6] Invalid States & Boundary Rejections');

// Completed token cannot move
const completedToken = makeToken('red', 0, true, 999, 57, 6, true);
assert(!canTokenMove(completedToken, 1), 'Completed token cannot move on 1');
assert(!canTokenMove(completedToken, 6), 'Completed token cannot move on 6');
assert(!calculateTokenMovement(completedToken, 1).isValid, 'calculateTokenMovement rejects completed token');

// Invalid dice values
const normalToken = makeToken('green', 0, true, 0, 0);
assert(!calculateTokenMovement(normalToken, 0).isValid, 'Dice 0 is rejected');
assert(!calculateTokenMovement(normalToken, 7).isValid, 'Dice 7 is rejected');
assert(!calculateTokenMovement(normalToken, -3).isValid, 'Negative dice is rejected');
assert(!calculateTokenMovement(normalToken, 3.5).isValid, 'Float dice is rejected');
assert(!calculateTokenMovement(normalToken, NaN).isValid, 'NaN dice is rejected');

// ============================================================================
// 7. Movement Invariant Across Entire Board (All 4 Colors, Steps 0..56)
// ============================================================================
console.log('\n[7] Complete Movement Invariant Verification (stepSequence.length === diceValue)');

let invariantViolations = 0;

for (const color of colors) {
  const cfg = COLOR_CONFIGS[color];

  for (let currentStep = 0; currentStep <= 56; currentStep++) {
    let currBlock: number;
    let currWinner = 0;

    if (currentStep === 0) {
      currBlock = cfg.startPosition;
    } else if (currentStep <= 50) {
      currBlock = (cfg.startPosition + currentStep) % 52;
    } else {
      const wIdx = currentStep - 51;
      currBlock = cfg.winnerBlocks[wIdx];
      currWinner = wIdx + 1;
    }

    const testTok = makeToken(color, 0, true, currBlock, currentStep, currWinner);

    for (let dice = 1; dice <= 6; dice++) {
      const move = calculateTokenMovement(testTok, dice);

      if (currentStep + dice > 57) {
        // Must be rejected
        if (move.isValid || move.stepSequence.length !== 0) {
          invariantViolations++;
        }
      } else {
        // Must be valid with exact length equal to dice
        if (!move.isValid || move.stepSequence.length !== dice) {
          invariantViolations++;
        }

        // Verify sequential continuity
        for (let i = 0; i < move.stepSequence.length; i++) {
          const step = move.stepSequence[i];
          const expectedStepNum = currentStep + i + 1;

          if (step.numberOfSteps !== expectedStepNum) {
            invariantViolations++;
          }

          if (expectedStepNum === 57) {
            if (step.block !== 999 || !step.isHomeCenter) invariantViolations++;
          } else if (expectedStepNum > 50) {
            const wIdx = expectedStepNum - 51;
            if (step.block !== cfg.winnerBlocks[wIdx]) invariantViolations++;
          } else {
            const expectedPerimeter = (cfg.startPosition + expectedStepNum) % 52;
            if (step.block !== expectedPerimeter) invariantViolations++;
          }
        }

        // Final state matches last intermediate step
        const lastStep = move.stepSequence[move.stepSequence.length - 1];
        if (
          move.finalBlock !== lastStep.block ||
          move.finalSteps !== lastStep.numberOfSteps ||
          move.finalWinnerBlockIndex !== lastStep.currWinnerBlock ||
          move.willFinish !== lastStep.isHomeCenter
        ) {
          invariantViolations++;
        }
      }
    }
  }
}

assert(
  invariantViolations === 0,
  `Complete invariant holds across all colors, positions, and dice rolls (0 violations)`
);

// ============================================================================
// 8. Mode Consistency: Server LudoEngine Authoritative Movement
// ============================================================================
console.log('\n[8] Mode Consistency: Server LudoEngine Authoritative Movement');

const mockRoom: MultiplayerRoom = {
  code: 'MOV123',
  hostId: 'RIZZ-1',
  maxPlayers: 4,
  seats: [
    { slot: 0, color: 'red', playerId: 'RIZZ-1', playerName: 'P1', isReady: true, isHost: true, isConnected: true },
    { slot: 1, color: 'green', playerId: 'RIZZ-2', playerName: 'P2', isReady: true, isHost: false, isConnected: true },
    { slot: 2, color: 'yellow', playerId: 'RIZZ-3', playerName: 'P3', isReady: true, isHost: false, isConnected: true },
    { slot: 3, color: 'blue', playerId: 'RIZZ-4', playerName: 'P4', isReady: true, isHost: false, isConnected: true },
  ],
  status: 'IN_MATCH',
  createdAt: Date.now(),
};

const matchState = LudoEngine.createInitialMatch(mockRoom);
matchState.activePlayerIndex = 0; // Red's turn
matchState.diceValue = 6;
matchState.canRoll = false;
matchState.selectableTokenIds = [0];

// Spawn Red Token 0
const spawnResult = LudoEngine.moveToken(matchState, 0, 0);
assert(spawnResult.success, 'Server LudoEngine spawns token on 6');
assert(spawnResult.isSpawning, 'Server LudoEngine reports isSpawning = true');
assert(matchState.players[0].tokens[0].isAlive, 'Server updates token to isAlive = true');
assert(matchState.players[0].tokens[0].currBlock === 39, 'Server positions Red on start block 39');
assert(matchState.players[0].tokens[0].numberOfSteps === 0, 'Server resets numberOfSteps to 0');
assert(spawnResult.extraChance, 'Spawning grants bonus chance');

// Advance Red Token 0 by 3
matchState.diceValue = 3;
matchState.canRoll = false;
matchState.selectableTokenIds = [0];
const moveResult = LudoEngine.moveToken(matchState, 0, 0);

assert(moveResult.success, 'Server LudoEngine advances token with dice 3');
assert(moveResult.stepSequence.length === 3, 'Server returns exact 3-step sequence');
assert(moveResult.stepSequence[0].block === 40, 'Step 1 is cell 40');
assert(moveResult.stepSequence[1].block === 41, 'Step 2 is cell 41');
assert(moveResult.stepSequence[2].block === 42, 'Step 3 is cell 42');
assert(matchState.players[0].tokens[0].currBlock === 42, 'Server token final block is 42');
assert(matchState.players[0].tokens[0].numberOfSteps === 3, 'Server token final steps is 3');

// Wrong player turn rejected by server
try {
  LudoEngine.moveToken(matchState, 1, 0); // Player 1 trying to move during Player 0's turn
  assert(false, 'Server must reject move from non-active player');
} catch {
  assert(true, 'Server correctly rejects move from non-active player');
}

// ============================================================================
// 9. Bot AI Evaluation Consistency
// ============================================================================
console.log('\n[9] Bot AI Evaluation Consistency');

const botPlayer = createPlayerInstance(1, 'SigmaBot', 'green', 2, true);
// Spawn green token on board
botPlayer.tokens[0].isAlive = true;
botPlayer.tokens[0].currBlock = 0;
botPlayer.tokens[0].numberOfSteps = 0;

const enemyPlayer = createPlayerInstance(0, 'RizzlerEnemy', 'red', 1, false);
enemyPlayer.tokens[0].isAlive = true;
enemyPlayer.tokens[0].currBlock = 4; // Non-safe block
enemyPlayer.tokens[0].numberOfSteps = 17;

// Green rolls 4 -> can capture enemy on block 4!
const chosenBotToken = chooseBotMove(botPlayer, [enemyPlayer, botPlayer], 4);
assert(chosenBotToken !== null, 'Bot selects a valid token');
assert(chosenBotToken?.id === 0, 'Bot chooses kill move to capture enemy token');

console.log(`\n============================`);
console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`============================\n`);

if (failed > 0) {
  process.exit(1);
}
