import dotenv from 'dotenv';
// Load .env.local first (user secrets), then fallback to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Redis, type RedisOptions } from 'ioredis';
import type {
  OnlinePlayer,
  PlayerPresenceStatus,
  FriendRequest,
  MultiplayerRoom,
  OnlineMatchState,
} from '../src/types/multiplayer';

export interface IRedisStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exOption?: 'EX', seconds?: number): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  sismember(key: string, member: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  ping(): Promise<string>;
  quit(): Promise<void>;
}

export interface RedisHealth {
  status: 'connected' | 'connecting' | 'degraded' | 'disconnected';
  isRealRedis: boolean;
  isMemoryFallback: boolean;
  maskedUrl: string;
  provider: string;
  pingMs?: number;
  lastError?: string | null;
}

/**
 * Safely masks credentials from Redis URL to prevent leaking in logs
 */
export function maskRedisUrl(rawUrl?: string): string {
  if (!rawUrl) return '(undefined)';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.startsWith('rediss://') ? 'rediss://***:***@hidden' : 'redis://***:***@hidden';
  }
}

// In-Memory Fallback Store (for local offline development/testing only)
export class MemoryRedisStore implements IRedisStorage {
  private kv = new Map<string, { value: string; expiresAt: number | null }>();
  private sets = new Map<string, { members: Set<string>; expiresAt: number | null }>();

  private cleanKey(key: string): boolean {
    const now = Date.now();
    const item = this.kv.get(key);
    if (item && item.expiresAt && item.expiresAt <= now) {
      this.kv.delete(key);
      return false;
    }
    const setItem = this.sets.get(key);
    if (setItem && setItem.expiresAt && setItem.expiresAt <= now) {
      this.sets.delete(key);
      return false;
    }
    return true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.cleanKey(key)) return null;
    const item = this.kv.get(key);
    return item ? item.value : null;
  }

  async set(key: string, value: string, exOption?: 'EX', seconds?: number): Promise<'OK'> {
    const expiresAt = exOption === 'EX' && seconds ? Date.now() + seconds * 1000 : null;
    this.kv.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.kv.delete(key)) count++;
      if (this.sets.delete(key)) count++;
    }
    return count;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    this.cleanKey(key);
    let s = this.sets.get(key);
    if (!s) {
      s = { members: new Set(), expiresAt: null };
      this.sets.set(key, s);
    }
    let added = 0;
    for (const m of members) {
      if (!s.members.has(m)) {
        s.members.add(m);
        added++;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    this.cleanKey(key);
    const s = this.sets.get(key);
    if (!s) return 0;
    let removed = 0;
    for (const m of members) {
      if (s.members.delete(m)) {
        removed++;
      }
    }
    return removed;
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.cleanKey(key)) return [];
    const s = this.sets.get(key);
    return s ? Array.from(s.members) : [];
  }

  async sismember(key: string, member: string): Promise<number> {
    if (!this.cleanKey(key)) return 0;
    const s = this.sets.get(key);
    return s && s.members.has(member) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const expiresAt = Date.now() + seconds * 1000;
    let found = 0;
    const item = this.kv.get(key);
    if (item) {
      item.expiresAt = expiresAt;
      found = 1;
    }
    const s = this.sets.get(key);
    if (s) {
      s.expiresAt = expiresAt;
      found = 1;
    }
    return found;
  }

  async keys(pattern: string): Promise<string[]> {
    const now = Date.now();
    const regexStr = '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    const regex = new RegExp(regexStr);
    const result: string[] = [];

    for (const [k, v] of this.kv.entries()) {
      if (v.expiresAt && v.expiresAt <= now) {
        this.kv.delete(k);
        continue;
      }
      if (regex.test(k)) result.push(k);
    }
    for (const [k, v] of this.sets.entries()) {
      if (v.expiresAt && v.expiresAt <= now) {
        this.sets.delete(k);
        continue;
      }
      if (regex.test(k) && !result.includes(k)) result.push(k);
    }
    return result;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<void> {
    this.kv.clear();
    this.sets.clear();
  }
}

// ----------------------------------------------------------------------
// Connection State Management
// ----------------------------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const rawRedisUrl = process.env.REDIS_URL || (isProduction ? '' : 'redis://localhost:6379');
const maskedUrl = maskRedisUrl(rawRedisUrl);

let rawClient: IRedisStorage;
let isRealRedis = false;
let connectionStatus: 'connected' | 'connecting' | 'degraded' | 'disconnected' = 'connecting';
let lastErrorMessage: string | null = null;
let activeRedisInstance: Redis | null = null;

if (!rawRedisUrl) {
  if (isProduction) {
    connectionStatus = 'disconnected';
    lastErrorMessage = 'REDIS_URL environment variable is missing in production.';
    console.error(`[Redis Error] ${lastErrorMessage}`);
    // Dummy failing storage in production when REDIS_URL is omitted
    rawClient = {
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      sadd: async () => 0,
      srem: async () => 0,
      smembers: async () => [],
      sismember: async () => 0,
      expire: async () => 0,
      keys: async () => [],
      ping: async () => { throw new Error('Redis not configured in production'); },
      quit: async () => {},
    };
  } else {
    console.warn('[Redis Dev] No REDIS_URL provided. Initializing in-memory fallback for local development.');
    connectionStatus = 'degraded';
    rawClient = new MemoryRedisStore();
  }
} else {
  const isTls = rawRedisUrl.startsWith('rediss://');
  const redisOptions: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 8000,
    retryStrategy: (times) => {
      if (times > 8) {
        if (isProduction) {
          connectionStatus = 'disconnected';
        }
        return null;
      }
      return Math.min(times * 250, 2000);
    },
    // TLS configuration for Upstash Redis (rediss://)
    ...(isTls
      ? {
          tls: {
            rejectUnauthorized: false, // ensures secure connection without client CA friction
          },
        }
      : {}),
  };

  try {
    const redisInstance = new Redis(rawRedisUrl, redisOptions);
    activeRedisInstance = redisInstance;

    redisInstance.on('ready', () => {
      isRealRedis = true;
      connectionStatus = 'connected';
      lastErrorMessage = null;
      console.log(`[Redis] Connected successfully to ${isTls ? 'Upstash Redis (TLS)' : 'Redis'} at ${maskedUrl}`);
    });

    redisInstance.on('error', (err) => {
      lastErrorMessage = err.message;
      if (isProduction) {
        connectionStatus = 'disconnected';
        console.error(`[Redis Error] Upstash connection issue: ${err.message}`);
      } else {
        if (!isRealRedis) {
          connectionStatus = 'degraded';
        }
        console.warn(`[Redis Dev Warning] ${err.message} (using fallback if unavailable)`);
      }
    });

    redisInstance.on('close', () => {
      if (connectionStatus === 'connected') {
        connectionStatus = isProduction ? 'disconnected' : 'degraded';
        console.warn('[Redis] Connection closed.');
      }
    });

    // Adapter wrapping ioredis with typed interface
    rawClient = {
      get: (key) => redisInstance.get(key),
      set: (key, val, ex, secs) => (ex && secs ? redisInstance.set(key, val, ex, secs) : redisInstance.set(key, val)),
      del: (...keys) => redisInstance.del(...keys),
      sadd: (key, ...members) => redisInstance.sadd(key, ...members),
      srem: (key, ...members) => redisInstance.srem(key, ...members),
      smembers: (key) => redisInstance.smembers(key),
      sismember: (key, member) => redisInstance.sismember(key, member),
      expire: (key, secs) => redisInstance.expire(key, secs),
      keys: (pattern) => redisInstance.keys(pattern),
      ping: () => redisInstance.ping(),
      quit: async () => {
        await redisInstance.quit().catch(() => {});
      },
    };

    // Attempt initial connection asynchronously
    redisInstance
      .connect()
      .then(() => {
        isRealRedis = true;
        connectionStatus = 'connected';
      })
      .catch((err) => {
        lastErrorMessage = err.message;
        if (isProduction) {
          connectionStatus = 'disconnected';
          console.error(`[Redis Production Failure] Unable to connect to Upstash Redis at ${maskedUrl}: ${err.message}`);
        } else {
          connectionStatus = 'degraded';
          console.warn(`[Redis Dev Fallback] Unable to connect to Redis (${err.message}). Using in-memory fallback store.`);
          rawClient = new MemoryRedisStore();
        }
      });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastErrorMessage = errorMsg;
    if (isProduction) {
      connectionStatus = 'disconnected';
      console.error(`[Redis Initialization Failure]: ${errorMsg}`);
    } else {
      connectionStatus = 'degraded';
      console.warn(`[Redis Initialization Warning]: ${errorMsg}. Using in-memory fallback.`);
      rawClient = new MemoryRedisStore();
    }
  }
}

// Export raw storage
export const redisStore = rawClient;

// High-level Temporary Redis Storage Helper API
const TTL_PRESENCE_SECONDS = 180; // 3 minutes without heartbeat
const TTL_FRIENDS_SECONDS = 86400 * 3; // 3 days
const TTL_ROOM_SECONDS = 7200; // 2 hours

export const redisMultiplayer = {
  isReady(): boolean {
    if (isProduction) {
      return connectionStatus === 'connected' && isRealRedis;
    }
    return connectionStatus === 'connected' || connectionStatus === 'degraded';
  },

  async getHealth(): Promise<RedisHealth> {
    let pingMs: number | undefined;
    if (isRealRedis && activeRedisInstance && connectionStatus === 'connected') {
      try {
        const start = Date.now();
        await activeRedisInstance.ping();
        pingMs = Date.now() - start;
      } catch {
        connectionStatus = isProduction ? 'disconnected' : 'degraded';
      }
    }

    const isTls = (rawRedisUrl || '').startsWith('rediss://');
    let provider = 'Memory Fallback Store (Local Dev)';
    if (isRealRedis) {
      provider = isTls ? 'Upstash Redis (TLS)' : 'Local Redis';
    }

    return {
      status: connectionStatus,
      isRealRedis,
      isMemoryFallback: !isRealRedis,
      maskedUrl,
      provider,
      pingMs,
      lastError: lastErrorMessage,
    };
  },

  // --- PRESENCE & LOBBY ---
  async registerPresence(player: OnlinePlayer): Promise<void> {
    const key = `rizz:presence:${player.id}`;
    await redisStore.set(key, JSON.stringify(player), 'EX', TTL_PRESENCE_SECONDS);
    await redisStore.sadd('rizz:online_players', player.id);
  },

  async updatePlayerStatus(
    playerId: string,
    status: PlayerPresenceStatus,
    currentRoomCode?: string
  ): Promise<void> {
    const key = `rizz:presence:${playerId}`;
    const raw = await redisStore.get(key);
    if (!raw) return;
    const player: OnlinePlayer = JSON.parse(raw);
    player.status = status;
    player.currentRoomCode = currentRoomCode;
    await redisStore.set(key, JSON.stringify(player), 'EX', TTL_PRESENCE_SECONDS);
  },

  async getPlayerPresence(playerId: string): Promise<OnlinePlayer | null> {
    const raw = await redisStore.get(`rizz:presence:${playerId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as OnlinePlayer;
    } catch {
      return null;
    }
  },

  async removePresence(playerId: string): Promise<void> {
    await redisStore.del(`rizz:presence:${playerId}`);
    await redisStore.srem('rizz:online_players', playerId);
  },

  async getOnlinePlayers(): Promise<OnlinePlayer[]> {
    const ids = await redisStore.smembers('rizz:online_players');
    if (ids.length === 0) return [];
    const players: OnlinePlayer[] = [];
    for (const id of ids) {
      const p = await this.getPlayerPresence(id);
      if (p) {
        players.push(p);
      } else {
        // Expired from presence key, clean up stale member from set
        await redisStore.srem('rizz:online_players', id);
      }
    }
    return players;
  },

  // --- FRIENDS SYSTEM ---
  async getFriendIds(playerId: string): Promise<string[]> {
    return redisStore.smembers(`rizz:friends:${playerId}`);
  },

  async addFriend(playerA: string, playerB: string): Promise<void> {
    await redisStore.sadd(`rizz:friends:${playerA}`, playerB);
    await redisStore.sadd(`rizz:friends:${playerB}`, playerA);
    await redisStore.expire(`rizz:friends:${playerA}`, TTL_FRIENDS_SECONDS);
    await redisStore.expire(`rizz:friends:${playerB}`, TTL_FRIENDS_SECONDS);
  },

  async removeFriend(playerA: string, playerB: string): Promise<void> {
    await redisStore.srem(`rizz:friends:${playerA}`, playerB);
    await redisStore.srem(`rizz:friends:${playerB}`, playerA);
  },

  async areFriends(playerA: string, playerB: string): Promise<boolean> {
    const res = await redisStore.sismember(`rizz:friends:${playerA}`, playerB);
    return res === 1;
  },

  async addFriendRequest(req: FriendRequest): Promise<void> {
    const key = `rizz:requests:${req.toId}`;
    await redisStore.set(`rizz:req:${req.requestId}`, JSON.stringify(req), 'EX', 86400);
    await redisStore.sadd(key, req.requestId);
  },

  async getFriendRequests(playerId: string): Promise<FriendRequest[]> {
    const reqIds = await redisStore.smembers(`rizz:requests:${playerId}`);
    const results: FriendRequest[] = [];
    for (const reqId of reqIds) {
      const raw = await redisStore.get(`rizz:req:${reqId}`);
      if (raw) {
        try {
          results.push(JSON.parse(raw));
        } catch {}
      } else {
        await redisStore.srem(`rizz:requests:${playerId}`, reqId);
      }
    }
    return results;
  },

  async removeFriendRequest(requestId: string, toId: string): Promise<void> {
    await redisStore.del(`rizz:req:${requestId}`);
    await redisStore.srem(`rizz:requests:${toId}`, requestId);
  },

  // --- ROOMS & MATCHES ---
  async saveRoom(room: MultiplayerRoom): Promise<void> {
    const key = `rizz:room:${room.code.toUpperCase()}`;
    await redisStore.set(key, JSON.stringify(room), 'EX', TTL_ROOM_SECONDS);
  },

  async getRoom(code: string): Promise<MultiplayerRoom | null> {
    const raw = await redisStore.get(`rizz:room:${code.toUpperCase()}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async deleteRoom(code: string): Promise<void> {
    await redisStore.del(`rizz:room:${code.toUpperCase()}`);
  },

  async touchRoom(code: string): Promise<void> {
    await redisStore.expire(`rizz:room:${code.toUpperCase()}`, TTL_ROOM_SECONDS);
  },

  async saveMatch(roomCode: string, match: OnlineMatchState): Promise<void> {
    const key = `rizz:match:${roomCode.toUpperCase()}`;
    await redisStore.set(key, JSON.stringify(match), 'EX', TTL_ROOM_SECONDS);
  },

  async getMatch(roomCode: string): Promise<OnlineMatchState | null> {
    const raw = await redisStore.get(`rizz:match:${roomCode.toUpperCase()}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async deleteMatch(roomCode: string): Promise<void> {
    await redisStore.del(`rizz:match:${roomCode.toUpperCase()}`);
  },

  async touchMatch(roomCode: string): Promise<void> {
    await redisStore.expire(`rizz:match:${roomCode.toUpperCase()}`, TTL_ROOM_SECONDS);
  },
};
