import { Server, Socket } from 'socket.io';
import { redisMultiplayer } from './redisClient';
import { LudoEngine } from './ludoEngine';
import type {
  OnlinePlayer,
  PlayerPresenceStatus,
  FriendRecord,
  FriendRequest,
  MultiplayerRoom,
  RoomSeat,
  GameInvitation,
} from '../src/types/multiplayer';
import type { PlayerColor } from '../src/types/ludo';

// In-memory mapping of active sockets to player IDs and room codes
const socketToPlayerMap = new Map<string, string>(); // socketId -> playerId
const playerToSocketMap = new Map<string, string>(); // playerId -> socketId
const disconnectTimers = new Map<string, NodeJS.Timeout>(); // playerId -> timer

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

export function setupSocketHandlers(io: Server) {
  // Broadcast helper for online lobby count & players
  async function broadcastLobbyUpdate() {
    try {
      const players = await redisMultiplayer.getOnlinePlayers();
      io.emit('lobby:players_updated', {
        players,
        totalOnline: players.length,
      });
    } catch (e) {
      console.error('[Socket] Failed to broadcast lobby update:', e);
    }
  }

  io.on('connection', (socket: Socket) => {
    // -------------------------------------------------------------
    // 1. PLAYER PRESENCE & INITIALIZATION
    // -------------------------------------------------------------
    socket.on('player:init', async (data: { playerId?: string; playerName: string }) => {
      let playerId = data.playerId;
      const playerName = (data.playerName || 'Player').trim().slice(0, 15);

      if (!playerId || !playerId.startsWith('RIZZ-')) {
        playerId = generatePlayerId();
      }

      socketToPlayerMap.set(socket.id, playerId);
      playerToSocketMap.set(playerId, socket.id);

      // Check if player had a pending disconnect timer (grace period reconnect)
      const existingTimer = disconnectTimers.get(playerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(playerId);
        console.log(`[Grace Period] Player ${playerId} successfully reconnected within grace period!`);
      }

      // Check if this player was inside an active room or match
      const existingPresence = await redisMultiplayer.getPlayerPresence(playerId);
      const roomCode = existingPresence?.currentRoomCode;

      const onlinePlayer: OnlinePlayer = {
        id: playerId,
        name: playerName,
        status: roomCode ? 'IN_GAME' : 'AVAILABLE',
        currentRoomCode: roomCode,
        connectedAt: existingPresence?.connectedAt || Date.now(),
      };

      await redisMultiplayer.registerPresence(onlinePlayer);
      socket.emit('player:ready', { player: onlinePlayer });
      await broadcastLobbyUpdate();

      if (roomCode) {
        const room = await redisMultiplayer.getRoom(roomCode);
        if (room) {
          socket.join(`room:${room.code}`);
          // Mark seat as connected
          const seat = room.seats.find((s) => s.playerId === playerId);
          if (seat) {
            seat.isConnected = true;
            seat.disconnectedAt = null;
            await redisMultiplayer.saveRoom(room);
          }

          if (room.status === 'IN_MATCH') {
            const match = await redisMultiplayer.getMatch(room.code);
            if (match) {
              match.disconnectedPlayerCountdown = null;
              await redisMultiplayer.saveMatch(room.code, match);
              io.to(`room:${room.code}`).emit('game:sync', { match });
              io.to(`room:${room.code}`).emit('room:player_reconnected', {
                playerId,
                playerName: onlinePlayer.name,
              });
            }
          } else {
            io.to(`room:${room.code}`).emit('room:updated', { room });
          }
        }
      }
    });

    socket.on('player:heartbeat', async () => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (playerId) {
        const presence = await redisMultiplayer.getPlayerPresence(playerId);
        if (presence) {
          await redisMultiplayer.registerPresence(presence);
        }
      }
    });

    socket.on('lobby:set_status', async (data: { status: PlayerPresenceStatus }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      await redisMultiplayer.updatePlayerStatus(playerId, data.status);
      await broadcastLobbyUpdate();
    });

    socket.on('lobby:get_players', async () => {
      const players = await redisMultiplayer.getOnlinePlayers();
      socket.emit('lobby:players_updated', {
        players,
        totalOnline: players.length,
      });
    });

    // -------------------------------------------------------------
    // 2. FRIENDS SYSTEM
    // -------------------------------------------------------------
    socket.on('friends:get', async () => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const friendIds = await redisMultiplayer.getFriendIds(playerId);
      const friends: FriendRecord[] = [];

      for (const fId of friendIds) {
        const presence = await redisMultiplayer.getPlayerPresence(fId);
        friends.push({
          id: fId,
          name: presence ? presence.name : fId,
          isOnline: Boolean(presence),
          status: presence ? presence.status : 'BUSY',
          currentRoomCode: presence?.currentRoomCode,
        });
      }

      const requests = await redisMultiplayer.getFriendRequests(playerId);
      socket.emit('friends:list', { friends, requests });
    });

    socket.on('friends:search', async (data: { targetId: string }) => {
      const targetId = (data.targetId || '').trim().toUpperCase();
      const presence = await redisMultiplayer.getPlayerPresence(targetId);

      if (presence) {
        socket.emit('friends:search_result', {
          found: true,
          player: presence,
        });
      } else {
        socket.emit('friends:search_result', {
          found: false,
          targetId,
          error: 'Player ID not found online',
        });
      }
    });

    socket.on('friends:send_request', async (data: { targetId: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const targetId = (data.targetId || '').trim().toUpperCase();
      if (targetId === playerId) {
        socket.emit('friends:error', { message: 'You cannot send a friend request to yourself.' });
        return;
      }

      const senderPresence = await redisMultiplayer.getPlayerPresence(playerId);
      if (!senderPresence) return;

      // Check if already friends
      const alreadyFriends = await redisMultiplayer.areFriends(playerId, targetId);
      if (alreadyFriends) {
        socket.emit('friends:error', { message: 'Already friends with this player.' });
        return;
      }

      const req: FriendRequest = {
        requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        fromId: playerId,
        fromName: senderPresence.name,
        toId: targetId,
        timestamp: Date.now(),
      };

      await redisMultiplayer.addFriendRequest(req);
      socket.emit('friends:request_sent', { targetId });

      // Notify target if online
      const targetSocketId = playerToSocketMap.get(targetId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('friends:request_received', { request: req });
      }
    });

    socket.on('friends:accept_request', async (data: { requestId: string; fromId: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      await redisMultiplayer.addFriend(playerId, data.fromId);
      await redisMultiplayer.removeFriendRequest(data.requestId, playerId);

      // Refresh friend lists
      socket.emit('friends:request_accepted', { friendId: data.fromId });
      const senderSocketId = playerToSocketMap.get(data.fromId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('friends:request_accepted', { friendId: playerId });
      }
    });

    socket.on('friends:reject_request', async (data: { requestId: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      await redisMultiplayer.removeFriendRequest(data.requestId, playerId);
      socket.emit('friends:request_rejected', { requestId: data.requestId });
    });

    socket.on('friends:remove_friend', async (data: { friendId: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      await redisMultiplayer.removeFriend(playerId, data.friendId);
      socket.emit('friends:friend_removed', { friendId: data.friendId });

      const otherSocketId = playerToSocketMap.get(data.friendId);
      if (otherSocketId) {
        io.to(otherSocketId).emit('friends:friend_removed', { friendId: playerId });
      }
    });

    // -------------------------------------------------------------
    // 3. GAME INVITATIONS
    // -------------------------------------------------------------
    socket.on('invite:send', async (data: { targetPlayerId: string; roomCode: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const senderPresence = await redisMultiplayer.getPlayerPresence(playerId);
      const room = await redisMultiplayer.getRoom(data.roomCode);

      if (!senderPresence || !room) {
        socket.emit('invite:error', { message: 'Invalid room or player.' });
        return;
      }

      const targetSocketId = playerToSocketMap.get(data.targetPlayerId);
      if (!targetSocketId) {
        socket.emit('invite:error', { message: 'Friend is currently offline.' });
        return;
      }

      const invitation: GameInvitation = {
        inviteId: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromId: playerId,
        fromName: senderPresence.name,
        roomCode: room.code,
        maxPlayers: room.maxPlayers,
        expiresAt: Date.now() + 60000, // 60 seconds
      };

      io.to(targetSocketId).emit('invite:incoming', { invitation });
      socket.emit('invite:sent', { targetPlayerId: data.targetPlayerId });
    });

    socket.on('invite:decline', (data: { inviteId: string; fromId: string }) => {
      const fromSocketId = playerToSocketMap.get(data.fromId);
      if (fromSocketId) {
        io.to(fromSocketId).emit('invite:declined', { inviteId: data.inviteId });
      }
    });

    // -------------------------------------------------------------
    // 4. PRIVATE ROOMS & LOBBY MANAGEMENT
    // -------------------------------------------------------------
    socket.on('room:create', async (data: { maxPlayers: 2 | 3 | 4 }) => {
      if (!redisMultiplayer.isReady()) {
        socket.emit('room:error', {
          message: 'Multiplayer service is currently connecting or unavailable. Please try again shortly.',
        });
        return;
      }

      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const player = await redisMultiplayer.getPlayerPresence(playerId);
      if (!player) return;

      const maxPlayers = data.maxPlayers || 4;
      const roomCode = generateRoomCode();

      // Configure seats based on player count
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
        isReady: idx === 0, // host is auto-ready
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

      socket.join(`room:${roomCode}`);
      socket.emit('room:created', { room });
      await broadcastLobbyUpdate();
    });

    socket.on('room:join', async (data: { roomCode: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const player = await redisMultiplayer.getPlayerPresence(playerId);
      if (!player) return;

      const roomCode = (data.roomCode || '').trim().toUpperCase();
      const room = await redisMultiplayer.getRoom(roomCode);

      if (!room) {
        socket.emit('room:error', { message: `Room #${roomCode} not found.` });
        return;
      }

      if (room.status !== 'WAITING') {
        socket.emit('room:error', { message: 'Match is already in progress or ended.' });
        return;
      }

      // Check if player is already seated in this room
      let existingSeat = room.seats.find((s) => s.playerId === playerId);
      if (!existingSeat) {
        // Find first empty seat
        const emptySeat = room.seats.find((s) => s.playerId === null);
        if (!emptySeat) {
          socket.emit('room:error', { message: 'Room is already full.' });
          return;
        }

        emptySeat.playerId = playerId;
        emptySeat.playerName = player.name;
        emptySeat.isReady = false;
        emptySeat.isConnected = true;
      } else {
        existingSeat.isConnected = true;
      }

      await redisMultiplayer.saveRoom(room);
      await redisMultiplayer.updatePlayerStatus(playerId, 'BUSY', roomCode);

      socket.join(`room:${roomCode}`);
      socket.emit('room:joined', { room });
      io.to(`room:${roomCode}`).emit('room:updated', { room });
      await broadcastLobbyUpdate();
    });

    socket.on('room:toggle_ready', async (data: { roomCode: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const room = await redisMultiplayer.getRoom(data.roomCode);
      if (!room) return;

      const seat = room.seats.find((s) => s.playerId === playerId);
      if (seat && !seat.isHost) {
        seat.isReady = !seat.isReady;
        await redisMultiplayer.saveRoom(room);
        io.to(`room:${room.code}`).emit('room:updated', { room });
      }
    });

    socket.on('room:leave', async (data: { roomCode: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const room = await redisMultiplayer.getRoom(data.roomCode);
      if (!room) return;

      socket.leave(`room:${room.code}`);
      await redisMultiplayer.updatePlayerStatus(playerId, 'AVAILABLE');

      if (room.hostId === playerId) {
        // Host left: close room or reassign
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
          io.to(`room:${room.code}`).emit('room:updated', { room });
        } else {
          // No one left, delete room
          await redisMultiplayer.deleteRoom(room.code);
          io.to(`room:${room.code}`).emit('room:closed', { reason: 'Host has closed the room.' });
        }
      } else {
        const seat = room.seats.find((s) => s.playerId === playerId);
        if (seat) {
          seat.playerId = null;
          seat.playerName = null;
          seat.isReady = false;
          seat.isConnected = false;
          await redisMultiplayer.saveRoom(room);
          io.to(`room:${room.code}`).emit('room:updated', { room });
        }
      }

      socket.emit('room:left');
      await broadcastLobbyUpdate();
    });

    // -------------------------------------------------------------
    // 5. START GAME & AUTHORITATIVE GAMEPLAY
    // -------------------------------------------------------------
    socket.on('room:start', async (data: { roomCode: string }) => {
      if (!redisMultiplayer.isReady()) {
        socket.emit('room:error', {
          message: 'Multiplayer service is currently connecting or unavailable. Please try again shortly.',
        });
        return;
      }

      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const room = await redisMultiplayer.getRoom(data.roomCode);
      if (!room || room.hostId !== playerId) {
        socket.emit('room:error', { message: 'Only room host can start the match.' });
        return;
      }

      // Check if all filled seats are ready
      const occupiedSeats = room.seats.filter((s) => s.playerId !== null);
      if (occupiedSeats.length < 2) {
        socket.emit('room:error', { message: 'At least 2 players must join before starting.' });
        return;
      }

      const notReady = occupiedSeats.filter((s) => !s.isReady);
      if (notReady.length > 0) {
        socket.emit('room:error', { message: 'All joined players must be Ready to start.' });
        return;
      }

      // Initialize authoritative match
      const matchState = LudoEngine.createInitialMatch(room);
      room.status = 'IN_MATCH';
      await redisMultiplayer.saveRoom(room);
      await redisMultiplayer.saveMatch(room.code, matchState);

      // Set players presence to IN_GAME
      for (const seat of occupiedSeats) {
        if (seat.playerId) {
          await redisMultiplayer.updatePlayerStatus(seat.playerId, 'IN_GAME', room.code);
        }
      }

      io.to(`room:${room.code}`).emit('game:started', { match: matchState, room });
      await broadcastLobbyUpdate();
    });

    socket.on('game:roll_dice', async (data: { roomCode: string }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const room = await redisMultiplayer.getRoom(data.roomCode);
      const match = await redisMultiplayer.getMatch(data.roomCode);
      if (!room || !match) return;

      const seatIndex = room.seats.findIndex((s) => s.playerId === playerId);
      if (seatIndex === -1 || match.activePlayerIndex !== seatIndex) {
        socket.emit('game:error', { message: 'Not your turn to roll.' });
        return;
      }

      try {
        const result = LudoEngine.rollDice(match, seatIndex);
        await redisMultiplayer.saveMatch(match.roomCode, match);
        await redisMultiplayer.touchRoom(match.roomCode);

        io.to(`room:${match.roomCode}`).emit('game:dice_rolled', {
          diceValue: result.diceValue,
          activePlayerIndex: seatIndex,
          consecutiveSixes: result.consecutiveSixes,
          selectableTokenIds: result.selectableTokenIds,
          isThreeSixes: result.isThreeSixes,
          autoPassTurn: result.autoPassTurn,
          match,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error rolling dice';
        socket.emit('game:error', { message: errorMsg });
      }
    });

    socket.on('game:move_token', async (data: { roomCode: string; tokenId: number }) => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      const room = await redisMultiplayer.getRoom(data.roomCode);
      const match = await redisMultiplayer.getMatch(data.roomCode);
      if (!room || !match) return;

      const seatIndex = room.seats.findIndex((s) => s.playerId === playerId);
      if (seatIndex === -1 || match.activePlayerIndex !== seatIndex) {
        socket.emit('game:error', { message: 'Not your turn to move.' });
        return;
      }

      try {
        const result = LudoEngine.moveToken(match, seatIndex, data.tokenId);
        await redisMultiplayer.saveMatch(match.roomCode, match);
        await redisMultiplayer.touchRoom(match.roomCode);

        io.to(`room:${match.roomCode}`).emit('game:token_moved', {
          tokenId: data.tokenId,
          playerIndex: seatIndex,
          stepSequence: result.stepSequence,
          isSpawning: result.isSpawning,
          capturedToken: result.capturedToken,
          playerWon: result.playerWon,
          isGameOver: result.isGameOver,
          extraChance: result.extraChance,
          nextPlayerIndex: result.nextPlayerIndex,
          match,
        });

        if (result.isGameOver) {
          room.status = 'FINISHED';
          await redisMultiplayer.saveRoom(room);
          io.to(`room:${room.code}`).emit('game:over', {
            winners: match.winners,
            match,
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Error moving token';
        socket.emit('game:error', { message: errorMsg });
      }
    });

    socket.on('game:reaction', (data: { roomCode: string; color: PlayerColor; badge: string; text: string }) => {
      io.to(`room:${data.roomCode}`).emit('game:reaction_received', data);
    });

    // -------------------------------------------------------------
    // 6. DISCONNECTION & 2-MINUTE RECOVERY GRACE PERIOD
    // -------------------------------------------------------------
    socket.on('disconnect', async () => {
      const playerId = socketToPlayerMap.get(socket.id);
      if (!playerId) return;

      socketToPlayerMap.delete(socket.id);
      playerToSocketMap.delete(playerId);

      const presence = await redisMultiplayer.getPlayerPresence(playerId);
      if (!presence) return;

      // Check if player was in an active room
      if (presence.currentRoomCode) {
        const room = await redisMultiplayer.getRoom(presence.currentRoomCode);
        if (room && room.status === 'IN_MATCH') {
          // In match: Start 120-second grace period!
          const seat = room.seats.find((s) => s.playerId === playerId);
          if (seat) {
            seat.isConnected = false;
            seat.disconnectedAt = Date.now();
            await redisMultiplayer.saveRoom(room);

            const match = await redisMultiplayer.getMatch(room.code);
            if (match) {
              match.disconnectedPlayerCountdown = {
                playerId,
                playerName: presence.name,
                secondsLeft: 120,
              };
              await redisMultiplayer.saveMatch(room.code, match);
            }

            io.to(`room:${room.code}`).emit('player:connection_changed', {
              playerId,
              playerName: presence.name,
              isConnected: false,
              gracePeriodSeconds: 120,
            });

            // Timer for 120 seconds
            const timer = setTimeout(async () => {
              disconnectTimers.delete(playerId);
              console.log(`[Grace Period Expired] Player ${playerId} did not reconnect within 120s.`);
              await redisMultiplayer.removePresence(playerId);

              // Notify room that player timed out and surrendered
              io.to(`room:${room.code}`).emit('player:forfeited', {
                playerId,
                playerName: presence.name,
              });

              await broadcastLobbyUpdate();
            }, 120000);

            disconnectTimers.set(playerId, timer);
            return;
          }
        } else if (room && room.status === 'WAITING') {
          // Waiting lobby: clean up seat
          const seat = room.seats.find((s) => s.playerId === playerId);
          if (seat) {
            if (seat.isHost) {
              await redisMultiplayer.deleteRoom(room.code);
              io.to(`room:${room.code}`).emit('room:closed', {
                reason: 'Host has disconnected.',
              });
            } else {
              seat.playerId = null;
              seat.playerName = null;
              seat.isReady = false;
              seat.isConnected = false;
              await redisMultiplayer.saveRoom(room);
              io.to(`room:${room.code}`).emit('room:updated', { room });
            }
          }
        }
      }

      await redisMultiplayer.removePresence(playerId);
      await broadcastLobbyUpdate();
    });
  });
}
