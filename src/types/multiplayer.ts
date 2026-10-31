import type { Player, PlayerColor, WinnerRecord } from './ludo.js';

export type PlayerPresenceStatus = 'AVAILABLE' | 'BUSY' | 'IN_GAME';

export interface OnlinePlayer {
  id: string; // e.g. RIZZ-4912
  name: string;
  status: PlayerPresenceStatus;
  currentRoomCode?: string;
  connectedAt: number;
}

export interface FriendRecord {
  id: string;
  name: string;
  isOnline: boolean;
  status: PlayerPresenceStatus;
  currentRoomCode?: string;
}

export interface FriendRequest {
  requestId: string;
  fromId: string;
  fromName: string;
  toId: string;
  timestamp: number;
}

export interface RoomSeat {
  slot: number; // 0, 1, 2, 3
  color: PlayerColor;
  playerId: string | null;
  playerName: string | null;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
  disconnectedAt?: number | null;
  isBot?: boolean;
}

export interface MultiplayerRoom {
  code: string; // 6-character room code (e.g. 'RZ8291')
  hostId: string;
  maxPlayers: 2 | 3 | 4;
  seats: RoomSeat[];
  status: 'WAITING' | 'IN_MATCH' | 'FINISHED';
  createdAt: number;
}

export interface GameInvitation {
  inviteId: string;
  fromId: string;
  fromName: string;
  roomCode: string;
  maxPlayers: 2 | 3 | 4;
  expiresAt: number;
}

export interface StepPoint {
  cell: number;
  stepIndex: number;
  isFinish?: boolean;
}

export interface OnlineMatchState {
  roomCode: string;
  playerCount: 2 | 3 | 4;
  players: Player[];
  activePlayerIndex: number;
  diceValue: number;
  canRoll: boolean;
  isRolling: boolean;
  selectableTokenIds: number[];
  winners: WinnerRecord[];
  consecutiveSixes: number;
  lastActionMessage?: string;
  disconnectedPlayerCountdown?: {
    playerId: string;
    playerName: string;
    secondsLeft: number;
  } | null;
}
