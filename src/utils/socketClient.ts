import { io, Socket } from 'socket.io-client';
import type {
  OnlinePlayer,
  PlayerPresenceStatus,
  FriendRecord,
  FriendRequest,
  MultiplayerRoom,
  OnlineMatchState,
  GameInvitation,
} from '../types/multiplayer';
import type { PlayerColor } from '../types/ludo';
import type { IntermediateStep } from './botAI';

const LOCAL_STORAGE_PLAYER_ID_KEY = 'rizz_dice_player_id';
const LOCAL_STORAGE_PLAYER_NAME_KEY = 'rizz_dice_player_name';

function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
    if (existing && existing.startsWith('RIZZ-')) return existing;

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'RIZZ-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    localStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, code);
    return code;
  } catch {
    return 'RIZZ-GUEST';
  }
}

export type SocketEventCallback = (...args: unknown[]) => void;

class SocketClientManager {
  private socket: Socket | null = null;
  private playerId: string = getOrCreatePlayerId();
  private playerName: string = 'Rizzler';
  private listeners = new Map<string, Set<SocketEventCallback>>();

  public isConnected = false;
  public onlinePlayer: OnlinePlayer | null = null;
  public totalOnlineCount = 0;
  public onlinePlayers: OnlinePlayer[] = [];
  public currentRoom: MultiplayerRoom | null = null;
  public currentMatch: OnlineMatchState | null = null;
  public friends: FriendRecord[] = [];
  public friendRequests: FriendRequest[] = [];
  public incomingInvitation: GameInvitation | null = null;

  constructor() {
    try {
      const savedName = localStorage.getItem(LOCAL_STORAGE_PLAYER_NAME_KEY);
      if (savedName) this.playerName = savedName;
    } catch {}
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getPlayerName(): string {
    return this.playerName;
  }

  public setPlayerName(name: string) {
    this.playerName = name.trim().slice(0, 15);
    try {
      localStorage.setItem(LOCAL_STORAGE_PLAYER_NAME_KEY, this.playerName);
    } catch {}
    if (this.socket && this.socket.connected) {
      this.socket.emit('player:init', {
        playerId: this.playerId,
        playerName: this.playerName,
      });
    }
  }

  public connect(url?: string) {
    if (this.socket) {
      if (!this.socket.connected) this.socket.connect();
      return;
    }

    // Connect to same origin (Vite proxy forwards /socket.io to server) or explicit URL
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

    this.socket = io(targetUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.socket?.emit('player:init', {
        playerId: this.playerId,
        playerName: this.playerName,
      });
      this.emitInternal('connection_change', true);
    });

    this.socket.on('disconnect', () => {
      this.isConnected = false;
      this.emitInternal('connection_change', false);
    });

    this.socket.on('player:ready', (data: { player: OnlinePlayer }) => {
      this.onlinePlayer = data.player;
      this.emitInternal('player_ready', data.player);
      this.getFriends();
    });

    this.socket.on('lobby:players_updated', (data: { players: OnlinePlayer[]; totalOnline: number }) => {
      this.onlinePlayers = data.players;
      this.totalOnlineCount = data.totalOnline;
      this.emitInternal('lobby_updated', data);
    });

    this.socket.on('friends:list', (data: { friends: FriendRecord[]; requests: FriendRequest[] }) => {
      this.friends = data.friends;
      this.friendRequests = data.requests;
      this.emitInternal('friends_updated', data);
    });

    this.socket.on('friends:request_received', (data: { request: FriendRequest }) => {
      this.friendRequests.push(data.request);
      this.emitInternal('friend_request_received', data.request);
      this.emitInternal('friends_updated', {
        friends: this.friends,
        requests: this.friendRequests,
      });
    });

    this.socket.on('friends:request_accepted', () => {
      this.getFriends();
    });

    this.socket.on('friends:friend_removed', () => {
      this.getFriends();
    });

    this.socket.on('friends:search_result', (data: unknown) => {
      this.emitInternal('friends_search_result', data);
    });

    this.socket.on('invite:incoming', (data: { invitation: GameInvitation }) => {
      this.incomingInvitation = data.invitation;
      this.emitInternal('invite_incoming', data.invitation);
    });

    this.socket.on('invite:declined', (data: { inviteId: string }) => {
      this.emitInternal('invite_declined', data);
    });

    this.socket.on('room:created', (data: { room: MultiplayerRoom }) => {
      this.currentRoom = data.room;
      this.emitInternal('room_created', data.room);
      this.emitInternal('room_updated', data.room);
    });

    this.socket.on('room:joined', (data: { room: MultiplayerRoom }) => {
      this.currentRoom = data.room;
      this.emitInternal('room_joined', data.room);
      this.emitInternal('room_updated', data.room);
    });

    this.socket.on('room:updated', (data: { room: MultiplayerRoom }) => {
      this.currentRoom = data.room;
      this.emitInternal('room_updated', data.room);
    });

    this.socket.on('room:left', () => {
      this.currentRoom = null;
      this.currentMatch = null;
      this.emitInternal('room_left');
    });

    this.socket.on('room:closed', (data: { reason: string }) => {
      this.currentRoom = null;
      this.currentMatch = null;
      this.emitInternal('room_closed', data);
    });

    this.socket.on('room:error', (data: { message: string }) => {
      this.emitInternal('room_error', data.message);
    });

    this.socket.on('game:started', (data: { match: OnlineMatchState; room: MultiplayerRoom }) => {
      this.currentMatch = data.match;
      this.currentRoom = data.room;
      this.emitInternal('game_started', data);
    });

    this.socket.on('game:dice_rolled', (data: {
      diceValue: number;
      activePlayerIndex: number;
      consecutiveSixes: number;
      selectableTokenIds: number[];
      isThreeSixes: boolean;
      autoPassTurn: boolean;
      match: OnlineMatchState;
    }) => {
      this.currentMatch = data.match;
      this.emitInternal('game_dice_rolled', data);
    });

    this.socket.on('game:token_moved', (data: {
      tokenId: number;
      playerIndex: number;
      stepSequence: IntermediateStep[];
      isSpawning: boolean;
      capturedToken?: { color: PlayerColor; tokenId: number; yardSlot: number };
      playerWon?: boolean;
      isGameOver?: boolean;
      extraChance: boolean;
      nextPlayerIndex: number;
      match: OnlineMatchState;
    }) => {
      this.currentMatch = data.match;
      this.emitInternal('game_token_moved', data);
    });

    this.socket.on('game:sync', (data: { match: OnlineMatchState }) => {
      this.currentMatch = data.match;
      this.emitInternal('game_sync', data.match);
    });

    this.socket.on('game:reaction_received', (data: {
      roomCode: string;
      color: PlayerColor;
      badge: string;
      text: string;
    }) => {
      this.emitInternal('game_reaction', data);
    });

    this.socket.on('game:over', (data: { winners: unknown[]; match: OnlineMatchState }) => {
      this.currentMatch = data.match;
      this.emitInternal('game_over', data);
    });

    this.socket.on('game:error', (data: { message: string }) => {
      this.emitInternal('game_error', data.message);
    });

    this.socket.on('player:connection_changed', (data: {
      playerId: string;
      playerName: string;
      isConnected: boolean;
      gracePeriodSeconds?: number;
    }) => {
      this.emitInternal('player_connection_changed', data);
    });

    this.socket.on('player:forfeited', (data: { playerId: string; playerName: string }) => {
      this.emitInternal('player_forfeited', data);
    });
  }

  // --- ACTIONS ---

  public setStatus(status: PlayerPresenceStatus) {
    this.socket?.emit('lobby:set_status', { status });
  }

  public getOnlinePlayersList() {
    this.socket?.emit('lobby:get_players');
  }

  public getFriends() {
    this.socket?.emit('friends:get');
  }

  public searchPlayer(targetId: string) {
    this.socket?.emit('friends:search', { targetId });
  }

  public sendFriendRequest(targetId: string) {
    this.socket?.emit('friends:send_request', { targetId });
  }

  public acceptFriendRequest(requestId: string, fromId: string) {
    this.socket?.emit('friends:accept_request', { requestId, fromId });
  }

  public rejectFriendRequest(requestId: string) {
    this.socket?.emit('friends:reject_request', { requestId });
  }

  public removeFriend(friendId: string) {
    this.socket?.emit('friends:remove_friend', { friendId });
  }

  public sendGameInvitation(targetPlayerId: string, roomCode: string) {
    this.socket?.emit('invite:send', { targetPlayerId, roomCode });
  }

  public declineInvitation(inviteId: string, fromId: string) {
    if (this.incomingInvitation?.inviteId === inviteId) {
      this.incomingInvitation = null;
    }
    this.socket?.emit('invite:decline', { inviteId, fromId });
    this.emitInternal('invite_cleared');
  }

  public clearIncomingInvitation() {
    this.incomingInvitation = null;
    this.emitInternal('invite_cleared');
  }

  public createRoom(maxPlayers: 2 | 3 | 4) {
    this.socket?.emit('room:create', { maxPlayers });
  }

  public joinRoom(roomCode: string) {
    this.socket?.emit('room:join', { roomCode });
  }

  public toggleReady(roomCode: string) {
    this.socket?.emit('room:toggle_ready', { roomCode });
  }

  public leaveRoom(roomCode: string) {
    this.socket?.emit('room:leave', { roomCode });
  }

  public startMatch(roomCode: string) {
    this.socket?.emit('room:start', { roomCode });
  }

  public rollDice(roomCode: string) {
    this.socket?.emit('game:roll_dice', { roomCode });
  }

  public moveToken(roomCode: string, tokenId: number) {
    this.socket?.emit('game:move_token', { roomCode, tokenId });
  }

  public sendReaction(roomCode: string, color: PlayerColor, badge: string, text: string) {
    this.socket?.emit('game:reaction', { roomCode, color, badge, text });
  }

  // --- PUB/SUB ---

  public on(event: string, callback: SocketEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  public off(event: string, callback: SocketEventCallback) {
    this.listeners.get(event)?.delete(callback);
  }

  private emitInternal(event: string, ...args: unknown[]) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(...args);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }
}

export const socketClient = new SocketClientManager();
