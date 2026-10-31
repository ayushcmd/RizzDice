import React, { useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Play,
  LogOut,
  Send,
  PlusCircle,
  KeyRound,
  Shield,
  Clock,
  Bot,
} from 'lucide-react';
import type { MultiplayerRoom, FriendRecord } from '../../types/multiplayer';
import { COLOR_CONFIGS } from '../../utils/boardData';

interface RoomPanelProps {
  currentRoom: MultiplayerRoom | null;
  myPlayerId: string;
  friends: FriendRecord[];
  onCreateRoom: (maxPlayers: 2 | 3 | 4, withBots?: boolean) => void;
  onJoinRoom: (roomCode: string) => void;
  onToggleReady: (roomCode: string) => void;
  onToggleBots?: (roomCode: string) => void;
  onLeaveRoom: (roomCode: string) => void;
  onStartMatch: (roomCode: string) => void;
  onInviteFriend: (friendId: string, roomCode: string) => void;
}

export const RoomPanel: React.FC<RoomPanelProps> = ({
  currentRoom,
  myPlayerId,
  friends,
  onCreateRoom,
  onJoinRoom,
  onToggleReady,
  onToggleBots,
  onLeaveRoom,
  onStartMatch,
  onInviteFriend,
}) => {
  const [selectedMaxPlayers, setSelectedMaxPlayers] = useState<2 | 3 | 4>(4);
  const [withBots, setWithBots] = useState(true);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleCopyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = roomCodeInput.trim().toUpperCase();
    if (clean.length >= 4) {
      onJoinRoom(clean);
      setRoomCodeInput('');
    }
  };

  // -------------------------------------------------------------
  // VIEW A: NO ROOM JOINED — CREATE OR JOIN ROOM
  // -------------------------------------------------------------
  if (!currentRoom) {
    return (
      <div className="flex flex-col h-full gap-5 text-[#F5F5F5]">
        {/* Create Room Section */}
        <div className="p-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-[#E9BC42]" />
            <span className="text-xs font-black uppercase tracking-wider text-[#F5F5F5]">
              Create Private Room
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 4].map((count) => {
              const isSelected = selectedMaxPlayers === count;
              return (
                <button
                  key={`create-count-${count}`}
                  type="button"
                  onClick={() => setSelectedMaxPlayers(count as 2 | 3 | 4)}
                  className={`py-2 rounded-xl flex flex-col items-center border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#E9BC42]/15 border-[#E9BC42] text-[#E9BC42] font-black'
                      : 'bg-black/30 border-white/[0.08] text-[#A3A3A3] hover:text-white'
                  }`}
                >
                  <span className="text-base font-black">{count}</span>
                  <span className="text-[9px] uppercase font-bold tracking-wider">Players</span>
                </button>
              );
            })}
          </div>

          {/* 4-Player Option: 2 Humans + 2 Bots Toggle */}
          {selectedMaxPlayers === 4 && (
            <div className="flex items-center justify-between p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#F5F5F5]">2 Humans + 2 Bots Mode</span>
                  <span className="text-[10px] text-[#A3A3A3]">Fill remaining 2 seats with bots</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWithBots(!withBots)}
                className={`px-3 py-1 rounded-lg text-xs font-black uppercase transition cursor-pointer border ${
                  withBots
                    ? 'bg-purple-600 text-white border-purple-400'
                    : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
                }`}
              >
                {withBots ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => onCreateRoom(selectedMaxPlayers, selectedMaxPlayers === 4 ? withBots : false)}
            className="w-full py-3 bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-black text-xs uppercase tracking-widest rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow"
          >
            <Users className="w-4 h-4" />
            Create {selectedMaxPlayers}-Player Room
            {selectedMaxPlayers === 4 && withBots ? ' (2H + 2B)' : ''}
          </button>
        </div>

        {/* Join Room by Code */}
        <div className="p-4 bg-white/[0.04] border border-white/[0.08] rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#E9BC42]" />
            <span className="text-xs font-black uppercase tracking-wider text-[#F5F5F5]">
              Join with Room Code
            </span>
          </div>

          <form onSubmit={handleJoinSubmit} className="flex gap-2">
            <input
              type="text"
              value={roomCodeInput}
              onChange={(e) => setRoomCodeInput(e.target.value)}
              placeholder="Enter 6-char Room Code..."
              maxLength={6}
              className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/[0.08] focus:border-[#E9BC42]/60 rounded-xl text-xs text-[#F5F5F5] placeholder-neutral-500 focus:outline-none uppercase font-mono tracking-widest transition"
            />
            <button
              type="submit"
              disabled={roomCodeInput.trim().length < 4}
              className="py-2.5 px-4 bg-white/[0.08] hover:bg-[#E9BC42] hover:text-black text-[#F5F5F5] font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: INSIDE ROOM LOBBY
  // -------------------------------------------------------------
  const isHost = currentRoom.hostId === myPlayerId;
  const mySeat = currentRoom.seats.find((s) => s.playerId === myPlayerId);
  const occupiedSeats = currentRoom.seats.filter((s) => s.playerId !== null);
  const humanOccupants = occupiedSeats.filter((s) => !s.isBot);
  const allOccupantsReady = occupiedSeats.every((s) => s.isReady);
  const hasBots = currentRoom.seats.some((s) => s.isBot);
  // Match can start if: host is present, at least 2 occupants, all occupants ready, and if 4-player with bots, both humans are ready
  const canStartMatch = isHost && occupiedSeats.length >= 2 && allOccupantsReady;

  return (
    <div className="flex flex-col h-full gap-4 text-[#F5F5F5]">
      {/* Room Header Banner */}
      <div className="p-3.5 bg-white/[0.04] border border-[#E9BC42]/40 rounded-2xl flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]">
            Room Code ({currentRoom.maxPlayers} Players{hasBots ? ' • 2H + 2B' : ''})
          </span>
          <span className="text-xl font-black font-mono tracking-widest text-[#E9BC42]">
            #{currentRoom.code}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isHost && currentRoom.maxPlayers === 4 && onToggleBots && (
            <button
              type="button"
              onClick={() => onToggleBots(currentRoom.code)}
              className={`py-1.5 px-2.5 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 border ${
                hasBots
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-white/[0.06] text-[#A3A3A3] hover:text-white border-white/[0.1]'
              }`}
              title="Toggle 2 Bots in 4-Player Room"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{hasBots ? '2 Bots: ON' : '+ 2 Bots'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyCode}
            className="py-1.5 px-3 bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
          >
            {copiedCode ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-[#A3A3A3]" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Seats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {currentRoom.seats.map((seat) => {
          const cfg = COLOR_CONFIGS[seat.color];
          const isOccupied = seat.playerId !== null;
          const isMe = seat.playerId === myPlayerId;

          return (
            <div
              key={`seat-${seat.slot}-${seat.color}`}
              className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                isOccupied
                  ? seat.isBot
                    ? 'bg-purple-950/20 border-purple-500/30'
                    : 'bg-black/50 border-white/[0.12]'
                  : 'bg-white/[0.02] border-dashed border-white/[0.10]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center p-1.5 shadow shrink-0"
                  style={{ backgroundColor: cfg.accentHex }}
                >
                  <img src={cfg.pawnImage} alt={cfg.name} className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black text-[#F5F5F5] truncate">
                      {isOccupied ? seat.playerName : 'Waiting for Player...'}
                    </span>
                    {isMe && (
                      <span className="text-[9px] font-black uppercase px-1 py-0.2 bg-[#E9BC42]/20 text-[#E9BC42] rounded">
                        YOU
                      </span>
                    )}
                    {seat.isHost && (
                      <span className="text-[9px] font-black uppercase px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" /> HOST
                      </span>
                    )}
                    {seat.isBot && (
                      <span className="text-[9px] font-black uppercase px-1 py-0.2 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded flex items-center gap-0.5">
                        <Bot className="w-2.5 h-2.5" /> BOT
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-[#737373]">
                    {isOccupied ? seat.playerId : `Color: ${cfg.name}`}
                  </span>
                </div>
              </div>

              {/* Status / Ready Badge */}
              <div className="shrink-0">
                {isOccupied ? (
                  seat.isReady ? (
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                      READY
                    </span>
                  ) : (
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> WAITING
                    </span>
                  )
                ) : (
                  <span className="text-[10px] uppercase font-bold text-[#525252]">OPEN</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col gap-2 mt-auto pt-2">
        {/* Host Quick Invite Friends Button */}
        {isHost && (
          <button
            type="button"
            onClick={() => setShowInviteModal(!showInviteModal)}
            className="py-2.5 px-4 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.10] text-xs font-bold text-[#F5F5F5] rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Send className="w-3.5 h-3.5 text-[#E9BC42]" />
            Invite Friends from List
          </button>
        )}

        {/* Friend Selector Drawer */}
        {showInviteModal && (
          <div className="p-3 bg-black/60 border border-white/[0.12] rounded-xl space-y-2 max-h-36 overflow-y-auto">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]">
              Available Friends:
            </span>
            {friends.filter((f) => f.isOnline && f.status === 'AVAILABLE').length === 0 ? (
              <p className="text-xs text-[#737373]">No available friends online right now.</p>
            ) : (
              friends
                .filter((f) => f.isOnline && f.status === 'AVAILABLE')
                .map((f) => (
                  <div
                    key={`invite-f-${f.id}`}
                    className="flex items-center justify-between p-2 bg-white/[0.03] rounded-lg"
                  >
                    <span className="text-xs text-white">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onInviteFriend(f.id, currentRoom.code);
                        setShowInviteModal(false);
                      }}
                      className="py-1 px-2.5 bg-[#E9BC42] text-black text-[10px] font-bold rounded-lg"
                    >
                      Invite
                    </button>
                  </div>
                ))
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Non-host Ready Toggle */}
          {!isHost && mySeat && (
            <button
              type="button"
              onClick={() => onToggleReady(currentRoom.code)}
              className={`flex-1 py-3 text-xs uppercase tracking-wider font-black rounded-xl transition cursor-pointer ${
                mySeat.isReady
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-[#E9BC42] text-black font-black'
              }`}
            >
              {mySeat.isReady ? 'Ready! (Click to Unready)' : "I'm Ready!"}
            </button>
          )}

          {/* Host Start Match Button */}
          {isHost && (
            <button
              type="button"
              onClick={() => onStartMatch(currentRoom.code)}
              disabled={!canStartMatch}
              className="flex-1 py-3 bg-[#E9BC42] hover:bg-[#d8ab33] disabled:opacity-40 disabled:pointer-events-none text-black font-black text-xs uppercase tracking-widest rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow"
            >
              <Play className="w-4 h-4 fill-current" />
              {occupiedSeats.length < 2
                ? 'Waiting for Players...'
                : hasBots && humanOccupants.length < 2
                ? 'Waiting for 2nd Human Player to Join...'
                : !allOccupantsReady
                ? 'Waiting for All Players to Ready Up...'
                : hasBots
                ? 'Start 2 Human + 2 Bot Match'
                : 'Start Online Match'}
            </button>
          )}

          {/* Leave Room Button */}
          <button
            type="button"
            onClick={() => onLeaveRoom(currentRoom.code)}
            className="py-3 px-4 bg-white/[0.06] hover:bg-red-500/20 text-[#A3A3A3] hover:text-red-300 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Leave Room"
          >
            <LogOut className="w-4 h-4" />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
};
