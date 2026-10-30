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

const LOCAL_STORAGE_PLAYER_ID_KEY = 'rizz_dice_player_id';
const LOCAL_STORAGE_PLAYER_NAME_KEY = 'rizz_dice_player_name';

function getOrCreatePlayerId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const existing = localStorage.getItem(LOCAL_STORAGE_PLAYER_ID_KEY);
      if (existing && existing.startsWith('RIZZ-')) return existing;

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'RIZZ-';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      localStorage.setItem(LOCAL_STORAGE_PLAYER_ID_KEY, code);
      return code;
    }
  } catch {}

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RIZZ-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export type SocketEventCallback = (...args: unknown[]) => void;

export class SocketClientManager {
  private playerId: string;
  private playerName: string = 'Rizzler';
  private listeners = new Map<string, Set<SocketEventCallback>>();
  private customUrl: string | null = null;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isDestroyed = false;
  private lastEventId = 0;
  private processedEventIds = new Set<number>();
  private processedInboxIds = new Set<number>();
  private lastLobbyFetchTime = 0;

  public isConnected = false;
  public onlinePlayer: OnlinePlayer | null = null;
  public totalOnlineCount = 0;
  public onlinePlayers: OnlinePlayer[] = [];
  public currentRoom: MultiplayerRoom | null = null;
  public currentMatch: OnlineMatchState | null = null;
  public friends: FriendRecord[] = [];
  public friendRequests: FriendRequest[] = [];
  public incomingInvitation: GameInvitation | null = null;

  constructor(initialPlayerId?: string, initialPlayerName?: string) {
    this.playerId = initialPlayerId || getOrCreatePlayerId();
    if (initialPlayerName) {
      this.playerName = initialPlayerName;
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          const savedName = localStorage.getItem(LOCAL_STORAGE_PLAYER_NAME_KEY);
          if (savedName) this.playerName = savedName;
        }
      } catch {}
    }
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
    if (this.isConnected) {
      this.postAction('init', {
        playerId: this.playerId,
        playerName: this.playerName,
      }).then((res) => {
        if (res.success && res.player) {
          this.onlinePlayer = res.player;
          this.emitInternal('player_ready', res.player);
        }
      });
    }
  }

  private getApiUrl(): string {
    if (this.customUrl) {
      const trimmed = this.customUrl.replace(/\/$/, '');
      return trimmed.endsWith('/api/multiplayer') ? trimmed : `${trimmed}/api/multiplayer`;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/api/multiplayer`;
    }
    return 'http://localhost:3001/api/multiplayer';
  }

  public async postAction(action: string, payload: Record<string, unknown> = {}): Promise<Record<string, any>> {
    try {
      const url = `${this.getApiUrl()}?action=${encodeURIComponent(action)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return { success: false, error: errJson.error || `HTTP error ${res.status}` };
      }
      return await res.json();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network request failed';
      return { success: false, error: errorMsg };
    }
  }

  public connect(url?: string) {
    if (url) {
      this.customUrl = url;
    }
    this.isDestroyed = false;

    // Call init on Vercel Serverless Function
    this.postAction('init', {
      playerId: this.playerId,
      playerName: this.playerName,
    })
      .then((res) => {
        if (res.success && res.player) {
          this.isConnected = true;
          this.onlinePlayer = res.player;
          this.emitInternal('connection_change', true);
          this.emitInternal('player_ready', { player: res.player });

          if (res.currentRoom) {
            this.currentRoom = res.currentRoom;
            this.emitInternal('room_updated', res.currentRoom);
          }
          if (res.currentMatch) {
            this.currentMatch = res.currentMatch;
            this.emitInternal('game_sync', res.currentMatch);
          }

          this.getFriends();
          this.getOnlinePlayersList();
          this.startHeartbeat();
          this.scheduleNextPoll(100);
        } else {
          console.error('[Multiplayer Init Failed]:', res.error);
          this.scheduleReconnect();
        }
      })
      .catch((err) => {
        console.error('[Multiplayer Connect Error]:', err);
        this.scheduleReconnect();
      });
  }

  public disconnect() {
    this.isDestroyed = true;
    this.isConnected = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.emitInternal('connection_change', false);
  }

  private scheduleReconnect() {
    if (this.isDestroyed) return;
    this.isConnected = false;
    this.emitInternal('connection_change', false);
    setTimeout(() => {
      if (!this.isDestroyed && !this.isConnected) {
        this.connect();
      }
    }, 3000);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && !this.isDestroyed) {
        this.postAction('heartbeat', { playerId: this.playerId });
      }
    }, 15000);
  }

  private scheduleNextPoll(delayMs?: number) {
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.isDestroyed || !this.isConnected) return;

    let delay = delayMs;
    if (delay === undefined) {
      if (this.currentMatch) {
        delay = 500; // In match: fast response
      } else if (this.currentRoom) {
        delay = 800; // In waiting room: moderate
      } else {
        delay = 1500; // In lobby: responsive
      }
    }

    this.pollTimeout = setTimeout(() => {
      this.executePoll();
    }, delay);
  }

  private async executePoll() {
    if (this.isDestroyed || !this.isConnected) return;

    try {
      const roomCode = this.currentRoom?.code || '';
      const res = await this.postAction('poll', {
        playerId: this.playerId,
        roomCode,
        since: this.lastEventId,
      });

      if (res.success) {
        // 1. Process room events
        if (Array.isArray(res.events)) {
          for (const ev of res.events) {
            if (!this.processedEventIds.has(ev.id)) {
              this.processedEventIds.add(ev.id);
              if (ev.id > this.lastEventId) {
                this.lastEventId = ev.id;
              }
              this.handleServerEvent(ev.type, ev.data);
            }
          }
          // Cap processed set size
          if (this.processedEventIds.size > 200) {
            const arr = Array.from(this.processedEventIds);
            this.processedEventIds = new Set(arr.slice(arr.length - 100));
          }
        }

        // 2. Process player-specific inbox
        if (Array.isArray(res.inbox)) {
          for (const item of res.inbox) {
            if (!this.processedInboxIds.has(item.id)) {
              this.processedInboxIds.add(item.id);
              this.handleInboxItem(item.type, item.data);
            }
          }
          if (this.processedInboxIds.size > 100) {
            const arr = Array.from(this.processedInboxIds);
            this.processedInboxIds = new Set(arr.slice(arr.length - 50));
          }
        }

        // 3. Periodic lobby refresh if not in a room
        const now = Date.now();
        if (!this.currentRoom && now - this.lastLobbyFetchTime > 5000) {
          this.lastLobbyFetchTime = now;
          this.getOnlinePlayersList();
        }
      }
    } catch (e) {
      console.warn('[Multiplayer Poll Exception]:', e);
    } finally {
      this.scheduleNextPoll();
    }
  }

  private handleServerEvent(type: string, data: any) {
    switch (type) {
      case 'room:created':
        this.currentRoom = data.room;
        this.emitInternal('room_created', data.room);
        this.emitInternal('room_updated', data.room);
        break;

      case 'room:joined':
        this.currentRoom = data.room;
        this.emitInternal('room_joined', data.room);
        this.emitInternal('room_updated', data.room);
        break;

      case 'room:updated':
        this.currentRoom = data.room;
        this.emitInternal('room_updated', data.room);
        break;

      case 'room:closed':
        this.currentRoom = null;
        this.currentMatch = null;
        this.emitInternal('room_closed', data);
        break;

      case 'room:error':
        this.emitInternal('room_error', data.message);
        break;

      case 'game:started':
        this.currentMatch = data.match;
        this.currentRoom = data.room;
        this.emitInternal('game_started', data);
        break;

      case 'game:dice_rolled':
        this.currentMatch = data.match;
        this.emitInternal('game_dice_rolled', data);
        break;

      case 'game:token_moved':
        this.currentMatch = data.match;
        this.emitInternal('game_token_moved', data);
        break;

      case 'game:sync':
        this.currentMatch = data.match;
        this.emitInternal('game_sync', data.match);
        break;

      case 'game:reaction_received':
        this.emitInternal('game_reaction', data);
        break;

      case 'game:over':
        this.currentMatch = data.match;
        this.emitInternal('game_over', data);
        break;

      case 'player:connection_changed':
        this.emitInternal('player_connection_changed', data);
        break;

      case 'player:forfeited':
        this.emitInternal('player_forfeited', data);
        break;
    }
  }

  private handleInboxItem(type: string, data: any) {
    switch (type) {
      case 'friends:request_received':
        this.friendRequests.push(data.request);
        this.emitInternal('friend_request_received', data.request);
        this.emitInternal('friends_updated', {
          friends: this.friends,
          requests: this.friendRequests,
        });
        break;

      case 'friends:request_accepted':
      case 'friends:friend_removed':
        this.getFriends();
        break;

      case 'invite:incoming':
        this.incomingInvitation = data.invitation;
        this.emitInternal('invite_incoming', data.invitation);
        break;

      case 'invite:declined':
        this.emitInternal('invite_declined', data);
        break;
    }
  }

  // --- ACTIONS ---

  public setStatus(status: PlayerPresenceStatus) {
    this.postAction('set_status', { playerId: this.playerId, status });
  }

  public getOnlinePlayersList() {
    this.postAction('lobby').then((res) => {
      if (res.success && Array.isArray(res.players)) {
        this.onlinePlayers = res.players;
        this.totalOnlineCount = res.totalOnline || res.players.length;
        this.emitInternal('lobby_updated', {
          players: this.onlinePlayers,
          totalOnline: this.totalOnlineCount,
        });
      }
    });
  }

  public getFriends(): Promise<Record<string, any>> {
    return this.postAction('friends_get', { playerId: this.playerId }).then((res) => {
      if (res.success) {
        this.friends = res.friends || [];
        this.friendRequests = res.requests || [];
        this.emitInternal('friends_updated', {
          friends: this.friends,
          requests: this.friendRequests,
        });
      }
      return res;
    });
  }

  public searchPlayer(targetId: string): Promise<Record<string, any>> {
    return this.postAction('friends_search', { targetId }).then((res) => {
      if (res.success) {
        this.emitInternal('friends_search_result', { player: res.player });
      } else {
        this.emitInternal('friends_search_result', { player: null });
      }
      return res;
    });
  }

  public sendFriendRequest(targetId: string): Promise<Record<string, any>> {
    return this.postAction('friends_send_request', {
      playerId: this.playerId,
      targetId,
    });
  }

  public acceptFriendRequest(requestId: string, fromId: string): Promise<Record<string, any>> {
    return this.postAction('friends_accept_request', {
      playerId: this.playerId,
      requestId,
      fromId,
    }).then(async (res) => {
      if (res.success) {
        await this.getFriends();
        this.scheduleNextPoll(100);
      }
      return res;
    });
  }

  public rejectFriendRequest(requestId: string) {
    this.postAction('friends_reject_request', {
      playerId: this.playerId,
      requestId,
    }).then((res) => {
      if (res.success) {
        this.friendRequests = this.friendRequests.filter((r) => r.requestId !== requestId);
        this.emitInternal('friends_updated', {
          friends: this.friends,
          requests: this.friendRequests,
        });
      }
    });
  }

  public removeFriend(friendId: string) {
    this.postAction('friends_remove_friend', {
      playerId: this.playerId,
      friendId,
    }).then((res) => {
      if (res.success) {
        this.getFriends();
      }
    });
  }

  public sendGameInvitation(targetPlayerId: string, roomCode: string) {
    this.postAction('invite_send', {
      playerId: this.playerId,
      targetPlayerId,
      roomCode,
    });
  }

  public declineInvitation(inviteId: string, fromId: string) {
    if (this.incomingInvitation?.inviteId === inviteId) {
      this.incomingInvitation = null;
    }
    this.postAction('invite_decline', { inviteId, fromId });
    this.emitInternal('invite_cleared');
  }

  public clearIncomingInvitation() {
    this.incomingInvitation = null;
    this.emitInternal('invite_cleared');
  }

  public createRoom(maxPlayers: 2 | 3 | 4) {
    this.postAction('create_room', { playerId: this.playerId, maxPlayers }).then((res) => {
      if (res.success && res.room) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentRoom = res.room;
        this.emitInternal('room_created', res.room);
        this.emitInternal('room_updated', res.room);
        this.scheduleNextPoll(100);
      } else {
        this.emitInternal('room_error', res.error || 'Failed to create room.');
      }
    });
  }

  public joinRoom(roomCode: string) {
    this.postAction('join_room', { playerId: this.playerId, roomCode }).then((res) => {
      if (res.success && res.room) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentRoom = res.room;
        this.emitInternal('room_joined', res.room);
        this.emitInternal('room_updated', res.room);
        this.scheduleNextPoll(100);
      } else {
        this.emitInternal('room_error', res.error || 'Failed to join room.');
      }
    });
  }

  public toggleReady(roomCode: string) {
    this.postAction('toggle_ready', { playerId: this.playerId, roomCode }).then((res) => {
      if (res.success && res.room) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentRoom = res.room;
        this.emitInternal('room_updated', res.room);
      } else {
        this.emitInternal('room_error', res.error || 'Failed to toggle ready.');
      }
    });
  }

  public leaveRoom(roomCode: string) {
    this.postAction('leave_room', { playerId: this.playerId, roomCode });
    this.currentRoom = null;
    this.currentMatch = null;
    this.emitInternal('room_left');
    this.scheduleNextPoll(500);
  }

  public startMatch(roomCode: string) {
    this.postAction('start_match', { playerId: this.playerId, roomCode }).then((res) => {
      if (res.success && res.match) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentMatch = res.match;
        this.currentRoom = res.room;
        this.emitInternal('game_started', res);
        this.scheduleNextPoll(100);
      } else {
        this.emitInternal('room_error', res.error || 'Failed to start match.');
      }
    });
  }

  public rollDice(roomCode: string) {
    this.postAction('roll_dice', { playerId: this.playerId, roomCode }).then((res) => {
      if (res.success) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentMatch = res.match;
        this.emitInternal('game_dice_rolled', res);
        this.scheduleNextPoll(100);
      } else {
        this.emitInternal('game_error', res.error || 'Failed to roll dice.');
      }
    });
  }

  public moveToken(roomCode: string, tokenId: number) {
    this.postAction('move_token', { playerId: this.playerId, roomCode, tokenId }).then((res) => {
      if (res.success) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.currentMatch = res.match;
        this.emitInternal('game_token_moved', res);
        if (res.isGameOver) {
          this.emitInternal('game_over', { winners: res.match.winners, match: res.match });
        }
        this.scheduleNextPoll(100);
      } else {
        this.emitInternal('game_error', res.error || 'Failed to move token.');
      }
    });
  }

  public sendReaction(roomCode: string, color: PlayerColor, badge: string, text: string) {
    const payload = { roomCode, color, badge, text };
    this.postAction('reaction', payload).then((res) => {
      if (res.success) {
        if (res.eventId) {
          this.processedEventIds.add(res.eventId);
          this.lastEventId = Math.max(this.lastEventId, res.eventId);
        }
        this.emitInternal('game_reaction', payload);
      }
    });
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
