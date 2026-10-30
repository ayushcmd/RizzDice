import type { IncomingMessage, ServerResponse } from 'node:http';
import { redisMultiplayer, redisStore } from '../server/redisClient';
import { LudoEngine } from '../server/ludoEngine';
import type {
  OnlinePlayer,
  PlayerPresenceStatus,
  FriendRecord,
  FriendRequest,
  MultiplayerRoom,
  RoomSeat,
  GameInvitation,
  OnlineMatchState,
} from '../src/types/multiplayer';
import type { PlayerColor } from '../src/types/ludo';

export interface VercelMultiplayerEvent {
  id: number;
  type: string;
  data: unknown;
  timestamp: number;
}

function generatePlayerId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RIZZ-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function parseBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function parseQuery(req: IncomingMessage & { query?: Record<string, string> }): Record<string, string> {
  const urlObj = new URL(req.url || '/', 'http://localhost');
  const params: Record<string, string> = {};
  for (const [k, v] of urlObj.searchParams.entries()) {
    params[k] = v;
  }
  if (req.query && typeof req.query === 'object') {
    Object.assign(params, req.query);
  }
  return params;
}

function sendJson(res: ServerResponse & { status?: (code: number) => ServerResponse; json?: (d: unknown) => void }, statusCode: number, data: unknown) {
  res.setHeader('Content-Type', 'application/json');
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }
  if (typeof res.json === 'function') {
    res.json(data);
  } else {
    res.end(JSON.stringify(data));
  }
}

export default async function handler(
  req: IncomingMessage & { query?: Record<string, string>; body?: unknown },
  res: ServerResponse & { status?: (code: number) => ServerResponse; json?: (d: unknown) => void }
) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const query = parseQuery(req);
  const body = req.method === 'POST' ? await parseBody(req) : {};
  const action = (query.action || body.action || '') as string;

  try {
    // -------------------------------------------------------------
    // 0. HEALTH / STATUS
    // -------------------------------------------------------------
    if (action === 'status' || (!action && req.method === 'GET' && req.url?.endsWith('/status'))) {
      const health = await redisMultiplayer.getHealth();
      const players = await redisMultiplayer.getOnlinePlayers();
      sendJson(res, 200, {
        status: 'ok',
        serverTime: Date.now(),
        redis: health,
        onlinePlayersCount: players.length,
        onlinePlayers: players,
      });
      return;
    }

    // -------------------------------------------------------------
    // 1. PLAYER INITIALIZATION & PRESENCE
    // -------------------------------------------------------------
    if (action === 'init') {
      let playerId = (body.playerId as string) || '';
      const playerName = ((body.playerName as string) || 'Player').trim().slice(0, 15);

      if (!playerId || !playerId.startsWith('RIZZ-')) {
        playerId = generatePlayerId();
      }

      const existingPresence = await redisMultiplayer.getPlayerPresence(playerId);
      let roomCode = existingPresence?.currentRoomCode;

      if (!roomCode) {
        // Fallback: scan active rooms for a reserved seat
        const roomKeys = await redisStore.keys('rizz:room:*');
        for (const rKey of roomKeys) {
          const raw = await redisStore.get(rKey);
          if (raw) {
            try {
              const r: MultiplayerRoom = JSON.parse(raw);
              if (r.seats.some((s) => s.playerId === playerId)) {
                roomCode = r.code;
                break;
              }
            } catch {}
          }
        }
      }

      let currentRoom: MultiplayerRoom | null = null;
      let currentMatch: OnlineMatchState | null = null;

      if (roomCode) {
        currentRoom = await redisMultiplayer.getRoom(roomCode);
        if (currentRoom) {
          const seat = currentRoom.seats.find((s) => s.playerId === playerId);
          if (seat) {
            seat.isConnected = true;
            seat.disconnectedAt = null;
            await redisMultiplayer.saveRoom(currentRoom);
          }
          if (currentRoom.status === 'IN_MATCH') {
            currentMatch = await redisMultiplayer.getMatch(roomCode);
            if (currentMatch) {
              currentMatch.disconnectedPlayerCountdown = null;
              await redisMultiplayer.saveMatch(roomCode, currentMatch);
            }
          }
        }
      }

      const onlinePlayer: OnlinePlayer = {
        id: playerId,
        name: playerName,
        status: roomCode ? 'IN_GAME' : 'AVAILABLE',
        currentRoomCode: roomCode,
        connectedAt: existingPresence?.connectedAt || Date.now(),
      };

      await redisMultiplayer.registerPresence(onlinePlayer);

      sendJson(res, 200, {
        success: true,
        player: onlinePlayer,
        currentRoom,
        currentMatch,
      });
      return;
    }

    // Heartbeat
    if (action === 'heartbeat') {
      const playerId = (body.playerId || query.playerId) as string;
      if (playerId) {
        const presence = await redisMultiplayer.getPlayerPresence(playerId);
        if (presence) {
          await redisMultiplayer.registerPresence(presence);
        }
      }
      sendJson(res, 200, { success: true });
      return;
    }

    // Set Status
    if (action === 'set_status') {
      const playerId = body.playerId as string;
      const status = body.status as PlayerPresenceStatus;
      if (playerId && status) {
        await redisMultiplayer.updatePlayerStatus(playerId, status);
      }
      sendJson(res, 200, { success: true });
      return;
    }

    // Lobby Directory
    if (action === 'lobby') {
      const players = await redisMultiplayer.getOnlinePlayers();
      sendJson(res, 200, {
        success: true,
        players,
        totalOnline: players.length,
      });
      return;
    }

    // -------------------------------------------------------------
    // 2. FRIENDS SYSTEM
    // -------------------------------------------------------------
    if (action === 'friends_get') {
      const playerId = (body.playerId || query.playerId) as string;
      if (!playerId) {
        sendJson(res, 400, { error: 'Missing playerId' });
        return;
      }
      const friendIds = await redisMultiplayer.getFriendIds(playerId);
      const friends: FriendRecord[] = [];
      for (const fId of friendIds) {
        const presence = await redisMultiplayer.getPlayerPresence(fId);
        friends.push({
          id: fId,
          name: presence?.name || 'Friend',
          isOnline: Boolean(presence),
          status: presence?.status || 'AVAILABLE',
          currentRoomCode: presence?.currentRoomCode,
        });
      }
      const requests = await redisMultiplayer.getFriendRequests(playerId);
      sendJson(res, 200, { success: true, friends, requests });
      return;
    }

    if (action === 'friends_search') {
      const targetId = (body.targetId || query.targetId) as string;
      const presence = await redisMultiplayer.getPlayerPresence(targetId.trim().toUpperCase());
      sendJson(res, 200, {
        success: true,
        player: presence || null,
      });
      return;
    }

    if (action === 'friends_send_request') {
      const playerId = body.playerId as string;
      const targetId = (body.targetId as string)?.trim()?.toUpperCase();
      const senderPresence = await redisMultiplayer.getPlayerPresence(playerId);
      const targetPresence = await redisMultiplayer.getPlayerPresence(targetId);

      if (!senderPresence || !targetPresence) {
        sendJson(res, 400, { error: 'Player not found or offline.' });
        return;
      }

      const reqRecord: FriendRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromId: playerId,
        fromName: senderPresence.name,
        toId: targetId,
        timestamp: Date.now(),
      };

      await redisMultiplayer.addFriendRequest(reqRecord);
      await redisMultiplayer.pushPlayerInbox(targetId, 'friends:request_received', { request: reqRecord });

      sendJson(res, 200, { success: true, request: reqRecord });
      return;
    }

    if (action === 'friends_accept_request') {
      const playerId = body.playerId as string;
      const requestId = body.requestId as string;
      const fromId = body.fromId as string;

      await redisMultiplayer.removeFriendRequest(requestId, playerId);
      await redisMultiplayer.addFriend(playerId, fromId);
      await redisMultiplayer.pushPlayerInbox(fromId, 'friends:request_accepted', { friendId: playerId });

      sendJson(res, 200, { success: true });
      return;
    }

    if (action === 'friends_reject_request') {
      const playerId = body.playerId as string;
      const requestId = body.requestId as string;
      await redisMultiplayer.removeFriendRequest(requestId, playerId);
      sendJson(res, 200, { success: true });
      return;
    }

    if (action === 'friends_remove_friend') {
      const playerId = body.playerId as string;
      const friendId = body.friendId as string;
      await redisMultiplayer.removeFriend(playerId, friendId);
      await redisMultiplayer.pushPlayerInbox(friendId, 'friends:friend_removed', { friendId: playerId });
      sendJson(res, 200, { success: true });
      return;
    }

    // -------------------------------------------------------------
    // 3. GAME INVITATIONS
    // -------------------------------------------------------------
    if (action === 'invite_send') {
      const playerId = body.playerId as string;
      const targetPlayerId = body.targetPlayerId as string;
      const roomCode = (body.roomCode as string)?.toUpperCase();

      const senderPresence = await redisMultiplayer.getPlayerPresence(playerId);
      const room = await redisMultiplayer.getRoom(roomCode);

      if (!senderPresence || !room) {
        sendJson(res, 400, { error: 'Invalid room or player.' });
        return;
      }

      const invitation: GameInvitation = {
        inviteId: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromId: playerId,
        fromName: senderPresence.name,
        roomCode: room.code,
        maxPlayers: room.maxPlayers,
        expiresAt: Date.now() + 60000,
      };

      await redisMultiplayer.pushPlayerInbox(targetPlayerId, 'invite:incoming', { invitation });
      sendJson(res, 200, { success: true, invitation });
      return;
    }

    if (action === 'invite_decline') {
      const inviteId = body.inviteId as string;
      const fromId = body.fromId as string;
      if (fromId) {
        await redisMultiplayer.pushPlayerInbox(fromId, 'invite:declined', { inviteId });
      }
      sendJson(res, 200, { success: true });
      return;
    }

    // -------------------------------------------------------------
    // 4. PRIVATE ROOMS
    // -------------------------------------------------------------
    if (action === 'create_room') {
      const playerId = body.playerId as string;
      const player = await redisMultiplayer.getPlayerPresence(playerId);
      if (!player) {
        sendJson(res, 400, { error: 'Player presence not found. Please refresh.' });
        return;
      }

      const maxPlayers = ((body.maxPlayers as number) || 4) as 2 | 3 | 4;
      const roomCode = generateRoomCode();

      const colorsForCount: Record<number, PlayerColor[]> = {
        2: ['red', 'yellow'],
        3: ['red', 'green', 'yellow'],
        4: ['red', 'green', 'yellow', 'blue'],
      };

      const assignedColors = colorsForCount[maxPlayers];
      const seats: RoomSeat[] = assignedColors.map((color, idx) => ({
        slot: idx,
        color,
        playerId: idx === 0 ? playerId : null,
        playerName: idx === 0 ? player.name : null,
        isReady: idx === 0,
        isHost: idx === 0,
        isConnected: true,
      }));

      const room: MultiplayerRoom = {
        code: roomCode,
        hostId: playerId,
        maxPlayers,
        seats,
        status: 'WAITING',
        createdAt: Date.now(),
      };

      await redisMultiplayer.saveRoom(room);
      await redisMultiplayer.updatePlayerStatus(playerId, 'BUSY', roomCode);
      await redisMultiplayer.pushRoomEvent(roomCode, 'room:created', { room });
      const eventId = await redisMultiplayer.pushRoomEvent(roomCode, 'room:updated', { room });

      sendJson(res, 200, { success: true, eventId, room });
      return;
    }

    if (action === 'join_room') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();

      const player = await redisMultiplayer.getPlayerPresence(playerId);
      const room = await redisMultiplayer.getRoom(roomCode);

      if (!room) {
        sendJson(res, 404, { error: 'Room not found with code: ' + roomCode });
        return;
      }

      if (room.status !== 'WAITING') {
        sendJson(res, 400, { error: 'Match has already started in this room.' });
        return;
      }

      // Check if already in room
      const existingSeat = room.seats.find((s) => s.playerId === playerId);
      if (existingSeat) {
        existingSeat.isConnected = true;
        await redisMultiplayer.saveRoom(room);
        sendJson(res, 200, { success: true, room });
        return;
      }

      const emptySeat = room.seats.find((s) => s.playerId === null);
      if (!emptySeat) {
        sendJson(res, 400, { error: 'Room is already full.' });
        return;
      }

      emptySeat.playerId = playerId;
      emptySeat.playerName = player?.name || 'Player';
      emptySeat.isReady = false;
      emptySeat.isHost = false;
      emptySeat.isConnected = true;

      await redisMultiplayer.saveRoom(room);
      await redisMultiplayer.updatePlayerStatus(playerId, 'BUSY', room.code);

      await redisMultiplayer.pushRoomEvent(room.code, 'room:joined', { room });
      const eventId = await redisMultiplayer.pushRoomEvent(room.code, 'room:updated', { room });

      sendJson(res, 200, { success: true, eventId, room });
      return;
    }

    if (action === 'toggle_ready') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();
      const room = await redisMultiplayer.getRoom(roomCode);

      if (!room) {
        sendJson(res, 404, { error: 'Room not found.' });
        return;
      }

      const seat = room.seats.find((s) => s.playerId === playerId);
      if (!seat) {
        sendJson(res, 400, { error: 'Not in this room.' });
        return;
      }

      if (seat.isHost) {
        sendJson(res, 200, { success: true, room });
        return;
      }

      seat.isReady = !seat.isReady;
      await redisMultiplayer.saveRoom(room);
      const eventId = await redisMultiplayer.pushRoomEvent(room.code, 'room:updated', { room });

      sendJson(res, 200, { success: true, eventId, room });
      return;
    }

    if (action === 'leave_room') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();
      const room = await redisMultiplayer.getRoom(roomCode);

      if (room) {
        const isHost = room.hostId === playerId;
        if (isHost) {
          const otherPlayerSeat = room.seats.find((s) => s.playerId && s.playerId !== playerId);
          if (otherPlayerSeat && otherPlayerSeat.playerId) {
            room.hostId = otherPlayerSeat.playerId;
            otherPlayerSeat.isHost = true;
            otherPlayerSeat.isReady = true;

            const hostSeat = room.seats.find((s) => s.playerId === playerId);
            if (hostSeat) {
              hostSeat.playerId = null;
              hostSeat.playerName = null;
              hostSeat.isReady = false;
              hostSeat.isHost = false;
            }
            await redisMultiplayer.saveRoom(room);
            await redisMultiplayer.pushRoomEvent(room.code, 'room:updated', { room });
          } else {
            await redisMultiplayer.deleteRoom(room.code);
            await redisMultiplayer.pushRoomEvent(room.code, 'room:closed', { reason: 'Host has closed the room.' });
          }
        } else {
          const seat = room.seats.find((s) => s.playerId === playerId);
          if (seat) {
            seat.playerId = null;
            seat.playerName = null;
            seat.isReady = false;
            seat.isConnected = false;
            await redisMultiplayer.saveRoom(room);
            await redisMultiplayer.pushRoomEvent(room.code, 'room:updated', { room });
          }
        }
      }

      await redisMultiplayer.updatePlayerStatus(playerId, 'AVAILABLE');
      sendJson(res, 200, { success: true });
      return;
    }

    // -------------------------------------------------------------
    // 5. START MATCH & AUTHORITATIVE GAMEPLAY
    // -------------------------------------------------------------
    if (action === 'start_match') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();
      const room = await redisMultiplayer.getRoom(roomCode);

      if (!room || room.hostId !== playerId) {
        sendJson(res, 403, { error: 'Only room host can start the match.' });
        return;
      }

      const occupiedSeats = room.seats.filter((s) => s.playerId !== null);
      if (occupiedSeats.length < 2) {
        sendJson(res, 400, { error: 'At least 2 players must join before starting.' });
        return;
      }

      const notReady = occupiedSeats.filter((s) => !s.isReady);
      if (notReady.length > 0) {
        sendJson(res, 400, { error: 'All joined players must be Ready to start.' });
        return;
      }

      const matchState = LudoEngine.createInitialMatch(room);
      room.status = 'IN_MATCH';

      await redisMultiplayer.saveRoom(room);
      await redisMultiplayer.saveMatch(room.code, matchState);

      for (const seat of occupiedSeats) {
        if (seat.playerId) {
          await redisMultiplayer.updatePlayerStatus(seat.playerId, 'IN_GAME', room.code);
        }
      }

      const eventId = await redisMultiplayer.pushRoomEvent(room.code, 'game:started', { match: matchState, room });

      sendJson(res, 200, { success: true, eventId, match: matchState, room });
      return;
    }

    if (action === 'roll_dice') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();

      const room = await redisMultiplayer.getRoom(roomCode);
      const match = await redisMultiplayer.getMatch(roomCode);

      if (!room || !match) {
        sendJson(res, 404, { error: 'Active match not found.' });
        return;
      }

      const seatIndex = room.seats.findIndex((s) => s.playerId === playerId);
      if (seatIndex === -1 || match.activePlayerIndex !== seatIndex) {
        sendJson(res, 403, { error: 'Not your turn to roll.' });
        return;
      }

      try {
        const result = LudoEngine.rollDice(match, seatIndex);
        await redisMultiplayer.saveMatch(match.roomCode, match);
        await redisMultiplayer.touchRoom(match.roomCode);

        const payload = {
          diceValue: result.diceValue,
          activePlayerIndex: seatIndex,
          consecutiveSixes: result.consecutiveSixes,
          selectableTokenIds: result.selectableTokenIds,
          isThreeSixes: result.isThreeSixes,
          autoPassTurn: result.autoPassTurn,
          match,
        };

        const eventId = await redisMultiplayer.pushRoomEvent(match.roomCode, 'game:dice_rolled', payload);

        sendJson(res, 200, { success: true, eventId, ...payload });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error rolling dice';
        sendJson(res, 400, { error: msg });
      }
      return;
    }

    if (action === 'move_token') {
      const playerId = body.playerId as string;
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();
      const tokenId = typeof body.tokenId === 'number' ? body.tokenId : parseInt(String(body.tokenId), 10);

      const room = await redisMultiplayer.getRoom(roomCode);
      const match = await redisMultiplayer.getMatch(roomCode);

      if (!room || !match) {
        sendJson(res, 404, { error: 'Active match not found.' });
        return;
      }

      const seatIndex = room.seats.findIndex((s) => s.playerId === playerId);
      if (seatIndex === -1 || match.activePlayerIndex !== seatIndex) {
        sendJson(res, 403, { error: 'Not your turn to move.' });
        return;
      }

      try {
        const result = LudoEngine.moveToken(match, seatIndex, tokenId);
        await redisMultiplayer.saveMatch(match.roomCode, match);
        await redisMultiplayer.touchRoom(match.roomCode);

        const payload = {
          tokenId,
          playerIndex: seatIndex,
          stepSequence: result.stepSequence,
          isSpawning: result.isSpawning,
          capturedToken: result.capturedToken,
          playerWon: result.playerWon,
          isGameOver: result.isGameOver,
          extraChance: result.extraChance,
          nextPlayerIndex: result.nextPlayerIndex,
          match,
        };

        const eventId = await redisMultiplayer.pushRoomEvent(match.roomCode, 'game:token_moved', payload);

        if (result.isGameOver) {
          room.status = 'FINISHED';
          await redisMultiplayer.saveRoom(room);
          await redisMultiplayer.pushRoomEvent(match.roomCode, 'game:over', {
            winners: match.winners,
            match,
          });
        }

        sendJson(res, 200, { success: true, eventId, ...payload });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error moving token';
        sendJson(res, 400, { error: msg });
      }
      return;
    }

    if (action === 'reaction') {
      const roomCode = ((body.roomCode as string) || '').trim().toUpperCase();
      const payload = {
        roomCode,
        color: body.color,
        badge: body.badge,
        text: body.text,
      };
      const eventId = await redisMultiplayer.pushRoomEvent(roomCode, 'game:reaction_received', payload);
      sendJson(res, 200, { success: true, eventId });
      return;
    }

    if (action === 'get_match' || action === 'sync') {
      const roomCode = ((query.roomCode || body.roomCode || '') as string).trim().toUpperCase();
      const room = await redisMultiplayer.getRoom(roomCode);
      const match = await redisMultiplayer.getMatch(roomCode);
      sendJson(res, 200, { success: true, room, match });
      return;
    }

    // -------------------------------------------------------------
    // 6. EVENT LOG POLLING & SYNC
    // -------------------------------------------------------------
    if (action === 'poll') {
      const roomCode = ((query.roomCode || body.roomCode || '') as string).trim().toUpperCase();
      const since = parseInt((query.since || body.since || '0') as string, 10);
      const playerId = (query.playerId || body.playerId || '') as string;

      let events: VercelMultiplayerEvent[] = [];
      let lastEventId = since;

      if (roomCode) {
        events = (await redisMultiplayer.getRoomEventsSince(roomCode, since)) as VercelMultiplayerEvent[];
        if (events.length > 0) {
          lastEventId = events[events.length - 1].id;
        }
      }

      // Check player-specific inbox (invites, direct friend notifications)
      let inbox: Array<{ id: number; type: string; data: unknown }> = [];
      if (playerId) {
        inbox = (await redisMultiplayer.getPlayerInbox(playerId, true)) as Array<{ id: number; type: string; data: unknown }>;
      }

      sendJson(res, 200, {
        success: true,
        events,
        inbox,
        lastEventId,
      });
      return;
    }

    sendJson(res, 400, { error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Serverless handler error';
    console.error('[Vercel Multiplayer Error]:', err);
    sendJson(res, 500, { error: errorMsg });
  }
}
