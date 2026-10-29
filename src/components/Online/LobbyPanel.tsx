import React, { useState } from 'react';
import { Users, UserPlus, Send, Radio } from 'lucide-react';
import type { OnlinePlayer, PlayerPresenceStatus } from '../../types/multiplayer';

interface LobbyPanelProps {
  onlinePlayers: OnlinePlayer[];
  totalOnline: number;
  myPlayerId: string;
  myStatus: PlayerPresenceStatus;
  currentRoomCode?: string;
  friendIds: Set<string>;
  onSendFriendRequest: (targetId: string) => void;
  onInvitePlayer: (targetId: string) => void;
  onStatusChange: (status: PlayerPresenceStatus) => void;
}

export const LobbyPanel: React.FC<LobbyPanelProps> = ({
  onlinePlayers,
  totalOnline,
  myPlayerId,
  myStatus,
  currentRoomCode,
  friendIds,
  onSendFriendRequest,
  onInvitePlayer,
  onStatusChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());

  const handleSendReq = (id: string) => {
    onSendFriendRequest(id);
    setSentRequests((prev) => new Set(prev).add(id));
  };

  const filteredPlayers = onlinePlayers.filter((p) => {
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col h-full gap-4 text-[#F5F5F5]">
      {/* Top Presence & Status Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-white/[0.04] border border-white/[0.08] rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase tracking-wider text-[#F5F5F5]">
              Live Lobby Presence
            </span>
            <span className="text-[11px] text-[#A3A3A3]">
              <strong className="text-emerald-400 font-bold">{totalOnline}</strong> real players
              currently online
            </span>
          </div>
        </div>

        {/* My Status Toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-white/[0.08]">
          <span className="text-[10px] uppercase font-bold text-[#A3A3A3] px-2">Status:</span>
          <button
            type="button"
            onClick={() => onStatusChange('AVAILABLE')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              myStatus === 'AVAILABLE'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            Available
          </button>
          <button
            type="button"
            onClick={() => onStatusChange('BUSY')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              myStatus === 'BUSY'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            Busy
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="w-full">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by player name or ID..."
          className="w-full px-3.5 py-2.5 bg-black/40 border border-white/[0.08] focus:border-[#E9BC42]/60 rounded-xl text-xs text-[#F5F5F5] placeholder-neutral-500 focus:outline-none transition"
        />
      </div>

      {/* Players List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[300px]">
        {filteredPlayers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-[#737373] text-center">
            <Users className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-xs">No online players found matching filter.</span>
          </div>
        ) : (
          filteredPlayers.map((player) => {
            const isMe = player.id === myPlayerId;
            const isFriend = friendIds.has(player.id);
            const reqSent = sentRequests.has(player.id);

            const statusBadge =
              player.status === 'AVAILABLE' ? (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Available
                </span>
              ) : player.status === 'IN_GAME' ? (
                <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                  In Match
                </span>
              ) : (
                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  Busy
                </span>
              );

            return (
              <div
                key={player.id}
                className="flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#E9BC42]/10 border border-[#E9BC42]/30 flex items-center justify-center text-xs font-black text-[#E9BC42] shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#F5F5F5] truncate">{player.name}</span>
                      {isMe && (
                        <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-[#E9BC42]/20 text-[#E9BC42] rounded">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-[#737373]">{player.id}</span>
                      {statusBadge}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isMe && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Invite to active room if host */}
                    {currentRoomCode && player.status === 'AVAILABLE' && (
                      <button
                        type="button"
                        onClick={() => onInvitePlayer(player.id)}
                        className="p-1.5 bg-[#E9BC42]/15 hover:bg-[#E9BC42]/30 border border-[#E9BC42]/40 text-[#E9BC42] text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                        title="Invite to Game"
                      >
                        <Send className="w-3 h-3" />
                        Invite
                      </button>
                    )}

                    {/* Friend button */}
                    {isFriend ? (
                      <span className="text-[10px] text-emerald-400 font-bold px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                        Friend
                      </span>
                    ) : reqSent ? (
                      <span className="text-[10px] text-[#A3A3A3] font-bold px-2 py-1 bg-white/[0.05] rounded-lg border border-white/[0.1]">
                        Sent
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendReq(player.id)}
                        className="p-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-[#A3A3A3] hover:text-[#F5F5F5] text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                        title="Add Friend"
                      >
                        <UserPlus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
