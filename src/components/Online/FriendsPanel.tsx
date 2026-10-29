import React, { useState } from 'react';
import { Copy, Check, UserPlus, UserX, Send, ShieldCheck, Clock } from 'lucide-react';
import type { FriendRecord, FriendRequest } from '../../types/multiplayer';

interface FriendsPanelProps {
  myPlayerId: string;
  friends: FriendRecord[];
  friendRequests: FriendRequest[];
  currentRoomCode?: string;
  onSearchAndAddFriend: (targetId: string) => void;
  onAcceptRequest: (requestId: string, fromId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onRemoveFriend: (friendId: string) => void;
  onInviteFriend: (friendId: string) => void;
}

export const FriendsPanel: React.FC<FriendsPanelProps> = ({
  myPlayerId,
  friends,
  friendRequests,
  currentRoomCode,
  onSearchAndAddFriend,
  onAcceptRequest,
  onRejectRequest,
  onRemoveFriend,
  onInviteFriend,
}) => {
  const [targetIdInput, setTargetIdInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleCopyId = () => {
    navigator.clipboard.writeText(myPlayerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = targetIdInput.trim().toUpperCase();
    if (!cleanId) return;

    if (cleanId === myPlayerId) {
      setFeedbackMsg('You cannot friend yourself.');
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }

    onSearchAndAddFriend(cleanId);
    setTargetIdInput('');
    setFeedbackMsg(`Friend request sent to ${cleanId}!`);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  return (
    <div className="flex flex-col h-full gap-4 text-[#F5F5F5]">
      {/* My Player ID Banner */}
      <div className="p-3.5 bg-white/[0.04] border border-[#E9BC42]/30 rounded-2xl flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#A3A3A3]">
            My Temporary Player ID
          </span>
          <span className="text-base font-black font-mono tracking-widest text-[#E9BC42]">
            {myPlayerId}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopyId}
          className="py-1.5 px-3 bg-white/[0.08] hover:bg-white/[0.15] text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-[#A3A3A3]" />
              <span>Copy ID</span>
            </>
          )}
        </button>
      </div>

      {/* Add Friend Form */}
      <form onSubmit={handleAddSubmit} className="flex gap-2">
        <input
          type="text"
          value={targetIdInput}
          onChange={(e) => setTargetIdInput(e.target.value)}
          placeholder="Enter Player ID (e.g. RIZZ-ABCD)..."
          maxLength={15}
          className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/[0.08] focus:border-[#E9BC42]/60 rounded-xl text-xs text-[#F5F5F5] placeholder-neutral-500 focus:outline-none uppercase font-mono tracking-wider transition"
        />
        <button
          type="submit"
          className="py-2.5 px-4 bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Add
        </button>
      </form>

      {feedbackMsg && (
        <span className="text-xs text-[#E9BC42] font-semibold animate-pulse px-1">
          {feedbackMsg}
        </span>
      )}

      {/* Pending Friend Requests */}
      {friendRequests.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#E9BC42] uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5" />
            Pending Requests ({friendRequests.length})
          </div>
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
            {friendRequests.map((req) => (
              <div
                key={req.requestId}
                className="flex items-center justify-between p-2.5 bg-[#E9BC42]/10 border border-[#E9BC42]/30 rounded-xl"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-white truncate">{req.fromName}</span>
                  <span className="text-[10px] font-mono text-[#A3A3A3]">{req.fromId}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAcceptRequest(req.requestId, req.fromId)}
                    className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition cursor-pointer"
                    title="Accept Request"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectRequest(req.requestId)}
                    className="p-1.5 bg-white/[0.08] hover:bg-white/[0.15] text-[#A3A3A3] hover:text-white rounded-lg text-xs transition cursor-pointer"
                    title="Decline Request"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[260px]">
        <div className="text-[11px] font-bold text-[#A3A3A3] uppercase tracking-wider">
          Friends ({friends.length})
        </div>
        {friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-[#737373] text-center">
            <ShieldCheck className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-xs">No friends added yet. Share your Player ID!</span>
          </div>
        ) : (
          friends.map((friend) => (
            <div
              key={friend.id}
              className="flex items-center justify-between p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-xl transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <div className="w-8 h-8 rounded-lg bg-[#E9BC42]/10 border border-[#E9BC42]/30 flex items-center justify-center text-xs font-black text-[#E9BC42]">
                    {friend.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161616] ${
                      friend.isOnline ? 'bg-emerald-500' : 'bg-neutral-600'
                    }`}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[#F5F5F5] truncate">{friend.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#737373]">{friend.id}</span>
                    <span className="text-[10px] text-[#A3A3A3]">
                      {friend.isOnline
                        ? friend.currentRoomCode
                          ? `In Room #${friend.currentRoomCode}`
                          : friend.status
                        : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {currentRoomCode && friend.isOnline && friend.status === 'AVAILABLE' && (
                  <button
                    type="button"
                    onClick={() => onInviteFriend(friend.id)}
                    className="p-1.5 bg-[#E9BC42]/15 hover:bg-[#E9BC42]/30 border border-[#E9BC42]/40 text-[#E9BC42] text-[10px] font-bold rounded-lg transition cursor-pointer flex items-center gap-1"
                    title="Invite to Game"
                  >
                    <Send className="w-3 h-3" />
                    Invite
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveFriend(friend.id)}
                  className="p-1.5 bg-white/[0.04] hover:bg-red-500/20 text-[#737373] hover:text-red-400 rounded-lg transition cursor-pointer"
                  title="Remove Friend"
                >
                  <UserX className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
