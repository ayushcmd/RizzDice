import type { Player, Token } from '../types/ludo';
import { SAFE_SPOTS, COLOR_CONFIGS } from './boardData';

/**
 * Predicts the resulting block for a token given a dice roll
 */
export function calculateNextBlock(token: Token, diceValue: number): { nextBlock: number; willFinish: boolean } {
  const config = COLOR_CONFIGS[token.color];
  const newSteps = token.numberOfSteps + diceValue;

  if (newSteps > 57) {
    return { nextBlock: token.currBlock, willFinish: false };
  }

  if (newSteps === 57) {
    return { nextBlock: 999, willFinish: true }; // Reached home center
  }

  if (!token.isAlive) {
    return { nextBlock: config.startPosition, willFinish: false };
  }

  let curr = token.currBlock;
  let winnerBlockIdx = token.currWinnerBlock;
  let inWinnerZone = token.currWinnerBlock > 0;

  for (let s = 0; s < diceValue; s++) {
    if (inWinnerZone) {
      curr = config.winnerBlocks[winnerBlockIdx];
      winnerBlockIdx++;
    } else {
      if (curr === config.endPosition) {
        inWinnerZone = true;
        curr = config.winnerBlocks[winnerBlockIdx];
        winnerBlockIdx++;
      } else {
        curr = curr >= 51 ? 0 : curr + 1;
      }
    }
  }

  return { nextBlock: curr, willFinish: false };
}

/**
 * Checks whether a token can make a valid move with the given dice value
 */
export function canTokenMove(token: Token, diceValue: number): boolean {
  if (token.hasCompleted) return false;

  if (!token.isAlive) {
    return diceValue === 6;
  }

  return token.numberOfSteps + diceValue <= 57;
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
