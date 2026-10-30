import type { Player, Token, PlayerColor, PositionIndex, WinnerRecord } from '../src/types/ludo';
import type { MultiplayerRoom, OnlineMatchState } from '../src/types/multiplayer';
import { SAFE_SPOTS } from '../src/utils/boardData';
import { canTokenMove, calculateTokenMovement, type IntermediateStep } from '../src/utils/botAI';

export function createPlayerInstance(
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

  return {
    id,
    name,
    color,
    position,
    isBot,
    tokens,
    hasWon: false,
  };
}

export class LudoEngine {
  static createInitialMatch(room: MultiplayerRoom): OnlineMatchState {
    const players: Player[] = [];
    const count = room.maxPlayers;

    if (count === 2) {
      const redSeat = room.seats.find((s) => s.color === 'red') || room.seats[0];
      const yellowSeat = room.seats.find((s) => s.color === 'yellow') || room.seats[1];
      players.push(createPlayerInstance(0, redSeat.playerName || 'Rizzler', 'red', 1));
      players.push(createPlayerInstance(1, yellowSeat.playerName || 'Chad', 'yellow', 4));
    } else if (count === 3) {
      const redSeat = room.seats.find((s) => s.color === 'red') || room.seats[0];
      const greenSeat = room.seats.find((s) => s.color === 'green') || room.seats[1];
      const yellowSeat = room.seats.find((s) => s.color === 'yellow') || room.seats[2];
      players.push(createPlayerInstance(0, redSeat.playerName || 'Rizzler', 'red', 1));
      players.push(createPlayerInstance(1, greenSeat.playerName || 'Sigma', 'green', 2));
      players.push(createPlayerInstance(2, yellowSeat.playerName || 'Chad', 'yellow', 4));
    } else {
      const redSeat = room.seats.find((s) => s.color === 'red') || room.seats[0];
      const greenSeat = room.seats.find((s) => s.color === 'green') || room.seats[1];
      const yellowSeat = room.seats.find((s) => s.color === 'yellow') || room.seats[2];
      const blueSeat = room.seats.find((s) => s.color === 'blue') || room.seats[3];
      players.push(createPlayerInstance(0, redSeat.playerName || 'Rizzler', 'red', 1));
      players.push(createPlayerInstance(1, greenSeat.playerName || 'Sigma', 'green', 2));
      players.push(createPlayerInstance(2, yellowSeat.playerName || 'Chad', 'yellow', 4));
      players.push(createPlayerInstance(3, blueSeat.playerName || 'Giga', 'blue', 3));
    }

    return {
      roomCode: room.code,
      playerCount: count,
      players,
      activePlayerIndex: 0,
      diceValue: 6,
      canRoll: true,
      isRolling: false,
      selectableTokenIds: [],
      winners: [],
      consecutiveSixes: 0,
    };
  }

  static getNextActivePlayerIndex(players: Player[], currentIdx: number): number {
    const activePlayers = players.filter((p) => !p.hasWon);
    if (activePlayers.length <= 1) return currentIdx;

    let next = (currentIdx + 1) % players.length;
    while (players[next].hasWon) {
      next = (next + 1) % players.length;
    }
    return next;
  }

  /**
   * Server rolls a cryptographically fair dice (1-6)
   */
  static rollDice(match: OnlineMatchState, requestingPlayerIndex: number): {
    diceValue: number;
    consecutiveSixes: number;
    selectableTokenIds: number[];
    isThreeSixes: boolean;
    autoPassTurn: boolean;
  } {
    if (match.activePlayerIndex !== requestingPlayerIndex) {
      throw new Error('Not your turn to roll!');
    }
    if (!match.canRoll) {
      throw new Error('Already rolled! Select a token to move.');
    }

    const rolledValue = Math.floor(Math.random() * 6) + 1;
    let consecutiveSixes = match.consecutiveSixes || 0;

    if (rolledValue === 6) {
      consecutiveSixes++;
    } else {
      consecutiveSixes = 0;
    }

    match.diceValue = rolledValue;
    match.consecutiveSixes = consecutiveSixes;

    // Rule: 3 consecutive sixes forfeits the turn
    if (consecutiveSixes >= 3) {
      match.consecutiveSixes = 0;
      match.canRoll = true;
      match.selectableTokenIds = [];
      const nextIdx = this.getNextActivePlayerIndex(match.players, match.activePlayerIndex);
      match.activePlayerIndex = nextIdx;
      return {
        diceValue: rolledValue,
        consecutiveSixes: 0,
        selectableTokenIds: [],
        isThreeSixes: true,
        autoPassTurn: true,
      };
    }

    // Determine eligible tokens
    const currPlayer = match.players[match.activePlayerIndex];
    const eligibleTokens = currPlayer.tokens.filter((t) => canTokenMove(t, rolledValue));

    if (eligibleTokens.length === 0) {
      // No legal moves: pass turn to next player
      match.canRoll = true;
      match.selectableTokenIds = [];
      const nextIdx = this.getNextActivePlayerIndex(match.players, match.activePlayerIndex);
      match.activePlayerIndex = nextIdx;
      return {
        diceValue: rolledValue,
        consecutiveSixes,
        selectableTokenIds: [],
        isThreeSixes: false,
        autoPassTurn: true,
      };
    }

    match.canRoll = false;
    match.selectableTokenIds = eligibleTokens.map((t) => t.id);

    return {
      diceValue: rolledValue,
      consecutiveSixes,
      selectableTokenIds: match.selectableTokenIds,
      isThreeSixes: false,
      autoPassTurn: false,
    };
  }

  /**
   * Authoritatively validate and execute token move
   */
  static moveToken(
    match: OnlineMatchState,
    requestingPlayerIndex: number,
    tokenId: number
  ): {
    success: boolean;
    stepSequence: IntermediateStep[];
    isSpawning: boolean;
    capturedToken?: { color: PlayerColor; tokenId: number; yardSlot: number };
    playerWon?: boolean;
    isGameOver?: boolean;
    extraChance: boolean;
    nextPlayerIndex: number;
  } {
    if (match.activePlayerIndex !== requestingPlayerIndex) {
      throw new Error('Not your turn to move!');
    }
    if (match.canRoll) {
      throw new Error('Must roll the dice first!');
    }
    if (!match.selectableTokenIds.includes(tokenId)) {
      throw new Error('Illegal token move!');
    }

    const player = match.players[requestingPlayerIndex];
    const token = player.tokens.find((t) => t.id === tokenId);
    if (!token) throw new Error('Token not found');

    const rolledValue = match.diceValue;
    const movement = calculateTokenMovement(token, rolledValue);

    if (!movement.isValid) {
      throw new Error('Illegal token move!');
    }

    // Case 1: Spawning out of yard on six
    if (movement.isSpawning) {
      token.isAlive = true;
      token.currBlock = movement.finalBlock;
      token.numberOfSteps = movement.finalSteps;
      token.currWinnerBlock = movement.finalWinnerBlockIndex;

      match.canRoll = true;
      match.selectableTokenIds = [];
      // Rolling 6 gives an extra chance!
      return {
        success: true,
        stepSequence: [],
        isSpawning: true,
        extraChance: true,
        nextPlayerIndex: match.activePlayerIndex,
      };
    }

    // Case 2: Advancing along track / home stretch
    const sequence = movement.stepSequence;
    if (sequence.length === 0) {
      throw new Error('Cannot compute path for token');
    }

    const finalStep = sequence[sequence.length - 1];
    token.currBlock = finalStep.block;
    token.numberOfSteps = finalStep.numberOfSteps;
    token.currWinnerBlock = finalStep.currWinnerBlock;

    let extraChance = rolledValue === 6;
    let didCapture = false;
    let capturedDetails: { color: PlayerColor; tokenId: number; yardSlot: number } | undefined;

    // Check Home Center entry
    if (finalStep.isHomeCenter || token.numberOfSteps === 57) {
      token.hasCompleted = true;
      token.currBlock = 999;
      extraChance = true; // Completing a token grants a bonus roll
    } else if (!SAFE_SPOTS.has(token.currBlock)) {
      // Check capture on non-safe square
      for (const enemyPlayer of match.players) {
        if (enemyPlayer.id === player.id) continue;
        for (const enemyToken of enemyPlayer.tokens) {
          if (
            enemyToken.isAlive &&
            !enemyToken.hasCompleted &&
            enemyToken.currBlock === token.currBlock
          ) {
            // Captured! Send back to yard
            enemyToken.isAlive = false;
            enemyToken.currBlock = -1;
            enemyToken.numberOfSteps = 0;
            enemyToken.currWinnerBlock = 0;

            didCapture = true;
            extraChance = true; // Capturing grants a bonus roll
            capturedDetails = {
              color: enemyToken.color,
              tokenId: enemyToken.id,
              yardSlot: enemyToken.yardSlot,
            };
            break;
          }
        }
        if (didCapture) break;
      }
    }

    // Check player win condition (all 4 tokens completed)
    let playerJustWon = false;
    let gameOver = false;
    const allCompleted = player.tokens.every((t) => t.hasCompleted);
    if (allCompleted && !player.hasWon) {
      player.hasWon = true;
      playerJustWon = true;
      const rank = match.winners.length + 1;
      const winnerRec: WinnerRecord = {
        player,
        rank,
      };
      match.winners.push(winnerRec);

      const nonWinners = match.players.filter((p) => !p.hasWon);
      if (nonWinners.length <= 1) {
        gameOver = true;
      }
    }

    match.canRoll = true;
    match.selectableTokenIds = [];

    let nextIdx = match.activePlayerIndex;
    if (!extraChance || player.hasWon) {
      match.consecutiveSixes = 0;
      nextIdx = this.getNextActivePlayerIndex(match.players, match.activePlayerIndex);
      match.activePlayerIndex = nextIdx;
    }

    return {
      success: true,
      stepSequence: sequence,
      isSpawning: false,
      capturedToken: capturedDetails,
      playerWon: playerJustWon,
      isGameOver: gameOver,
      extraChance: extraChance && !player.hasWon,
      nextPlayerIndex: nextIdx,
    };
  }
}
