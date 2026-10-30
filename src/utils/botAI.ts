import type { Player, Token } from '../types/ludo';
import { SAFE_SPOTS, COLOR_CONFIGS } from './boardData';

export interface IntermediateStep {
  block: number;
  numberOfSteps: number;
  currWinnerBlock: number;
  isHomeCenter: boolean;
}

export interface TokenMovementResult {
  isValid: boolean;
  isSpawning: boolean;
  stepSequence: IntermediateStep[];
  finalBlock: number;
  finalSteps: number;
  finalWinnerBlockIndex: number;
  willFinish: boolean;
}

/**
 * Unified authoritative movement calculation for Rizz Dice Ludo track.
 * Used identically by server engine, client animations, and Bot AI.
 */
export function calculateTokenMovement(token: Token, diceValue: number): TokenMovementResult {
  const config = COLOR_CONFIGS[token.color];

  // 1. Validate dice value (1..6)
  if (!Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) {
    return {
      isValid: false,
      isSpawning: false,
      stepSequence: [],
      finalBlock: token.currBlock,
      finalSteps: token.numberOfSteps,
      finalWinnerBlockIndex: token.currWinnerBlock,
      willFinish: false,
    };
  }

  // 2. Completed tokens cannot move again
  if (token.hasCompleted) {
    return {
      isValid: false,
      isSpawning: false,
      stepSequence: [],
      finalBlock: token.currBlock,
      finalSteps: token.numberOfSteps,
      finalWinnerBlockIndex: token.currWinnerBlock,
      willFinish: true,
    };
  }

  // 3. Token in yard / home base (isAlive === false)
  if (!token.isAlive) {
    if (diceValue === 6) {
      return {
        isValid: true,
        isSpawning: true,
        stepSequence: [],
        finalBlock: config.startPosition,
        finalSteps: 0,
        finalWinnerBlockIndex: 0,
        willFinish: false,
      };
    }
    return {
      isValid: false,
      isSpawning: false,
      stepSequence: [],
      finalBlock: token.currBlock,
      finalSteps: token.numberOfSteps,
      finalWinnerBlockIndex: token.currWinnerBlock,
      willFinish: false,
    };
  }

  // 4. Token on the board (isAlive === true)
  const targetSteps = token.numberOfSteps + diceValue;

  // Exact finishing rule: overshoot rejected!
  if (targetSteps > 57) {
    return {
      isValid: false,
      isSpawning: false,
      stepSequence: [],
      finalBlock: token.currBlock,
      finalSteps: token.numberOfSteps,
      finalWinnerBlockIndex: token.currWinnerBlock,
      willFinish: false,
    };
  }

  // Compute exact intermediate steps
  const sequence: IntermediateStep[] = [];
  for (let s = 1; s <= diceValue; s++) {
    const stepCount = token.numberOfSteps + s;

    if (stepCount === 57) {
      // Reached Home Center (Panta)
      sequence.push({
        block: 999,
        numberOfSteps: 57,
        currWinnerBlock: 6,
        isHomeCenter: true,
      });
    } else if (stepCount > 50) {
      // Inside home stretch (steps 51..56 correspond to winnerBlocks[0..5])
      const winnerIndex = stepCount - 51; // 0..5
      const block = config.winnerBlocks[winnerIndex];
      sequence.push({
        block,
        numberOfSteps: stepCount,
        currWinnerBlock: winnerIndex + 1, // 1..6
        isHomeCenter: false,
      });
    } else {
      // Perimeter track (steps 1..50)
      const block = (config.startPosition + stepCount) % 52;
      sequence.push({
        block,
        numberOfSteps: stepCount,
        currWinnerBlock: 0,
        isHomeCenter: false,
      });
    }
  }

  const finalStep = sequence[sequence.length - 1];

  return {
    isValid: true,
    isSpawning: false,
    stepSequence: sequence,
    finalBlock: finalStep.block,
    finalSteps: finalStep.numberOfSteps,
    finalWinnerBlockIndex: finalStep.currWinnerBlock,
    willFinish: finalStep.isHomeCenter,
  };
}

/**
 * Computes the exact array of intermediate squares a token traverses step-by-step
 */
export function getStepSequence(token: Token, diceValue: number): IntermediateStep[] {
  const result = calculateTokenMovement(token, diceValue);
  return result.stepSequence;
}

/**
 * Predicts the resulting block for a token given a dice roll
 */
export function calculateNextBlock(token: Token, diceValue: number): { nextBlock: number; willFinish: boolean } {
  const result = calculateTokenMovement(token, diceValue);
  if (!result.isValid) {
    return { nextBlock: token.currBlock, willFinish: false };
  }
  return { nextBlock: result.finalBlock, willFinish: result.willFinish };
}

/**
 * Checks whether a token can make a valid move with the given dice value
 */
export function canTokenMove(token: Token, diceValue: number): boolean {
  return calculateTokenMovement(token, diceValue).isValid;
}

/**
 * Heuristic AI ported from MainActivity.java (lines 1344-1483)
 */
export function chooseBotMove(
  botPlayer: Player,
  allPlayers: Player[],
  diceValue: number
): Token | null {
  const movableTokens = botPlayer.tokens.filter((t) => canTokenMove(t, diceValue));

  if (movableTokens.length === 0) return null;
  if (movableTokens.length === 1) return movableTokens[0];

  // 1. Check if any move can kill an enemy piece (Highest Priority)
  let bestKillToken: Token | null = null;
  let maxVictimSteps = -1;

  for (const token of movableTokens) {
    const { nextBlock, willFinish } = calculateNextBlock(token, diceValue);
    if (!willFinish && nextBlock !== -1 && !SAFE_SPOTS.has(nextBlock)) {
      for (const otherPlayer of allPlayers) {
        if (otherPlayer.id !== botPlayer.id && !otherPlayer.hasWon) {
          for (const enemyToken of otherPlayer.tokens) {
            if (enemyToken.isAlive && enemyToken.currBlock === nextBlock) {
              if (enemyToken.numberOfSteps > maxVictimSteps) {
                maxVictimSteps = enemyToken.numberOfSteps;
                bestKillToken = token;
              }
            }
          }
        }
      }
    }
  }

  if (bestKillToken) return bestKillToken;

  // 2. Check if any move reaches Home / Panta (Second Priority)
  const winningToken = movableTokens.find((t) => t.numberOfSteps + diceValue === 57);
  if (winningToken) return winningToken;

  // 3. Move into a Safe Spot (Third Priority)
  let bestSafeToken: Token | null = null;
  let maxSafeSteps = -1;
  for (const token of movableTokens) {
    const { nextBlock, willFinish } = calculateNextBlock(token, diceValue);
    if (!willFinish && SAFE_SPOTS.has(nextBlock)) {
      if (token.numberOfSteps > maxSafeSteps) {
        maxSafeSteps = token.numberOfSteps;
        bestSafeToken = token;
      }
    }
  }
  if (bestSafeToken) return bestSafeToken;

  // 4. Release token from base if rolled 6 and less than 2 tokens currently out
  if (diceValue === 6) {
    const aliveCount = botPlayer.tokens.filter((t) => t.isAlive && !t.hasCompleted).length;
    const baseToken = movableTokens.find((t) => !t.isAlive);
    if (baseToken && aliveCount < 2) {
      return baseToken;
    }
  }

  // 5. Move furthest advanced piece towards Home
  let furthestToken: Token = movableTokens[0];
  let maxSteps = -1;

  for (const token of movableTokens) {
    if (token.isAlive && token.numberOfSteps > maxSteps) {
      maxSteps = token.numberOfSteps;
      furthestToken = token;
    }
  }

  return furthestToken;
}
