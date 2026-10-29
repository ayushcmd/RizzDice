import React, { useEffect, useState } from 'react';
import { Sparkles, Check, X } from 'lucide-react';
import type { GameInvitation } from '../../types/multiplayer';

interface InvitationBannerProps {
  invitation: GameInvitation | null;
  onAccept: (roomCode: string) => void;
  onDecline: (inviteId: string, fromId: string) => void;
}

export const InvitationBanner: React.FC<InvitationBannerProps> = ({
  invitation,
  onAccept,
  onDecline,
}) => {
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    if (!invitation) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((invitation.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        onDecline(invitation.inviteId, invitation.fromId);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [invitation, onDecline]);

  if (!invitation) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="relative bg-[#161616]/95 border border-[#E9BC42]/60 rounded-2xl p-4 shadow-[0_15px_35px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex items-center justify-between gap-3 text-[#F5F5F5]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#E9BC42]/15 border border-[#E9BC42]/40 flex items-center justify-center shrink-0 text-[#E9BC42]">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-black uppercase tracking-wider text-[#E9BC42]">
              Game Invitation ({timeLeft}s)
            </span>
            <p className="text-xs truncate font-medium text-[#D4D4D4]">
              <strong className="text-white">{invitation.fromName}</strong> invited you to a{' '}
              {invitation.maxPlayers}-player match!
            </p>
            <span className="text-[10px] text-[#A3A3A3] font-mono">Room #{invitation.roomCode}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onAccept(invitation.roomCode)}
            className="p-2 bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-black rounded-xl transition cursor-pointer flex items-center gap-1 shadow"
            title="Accept"
          >
            <Check className="w-4 h-4 stroke-[3]" />
          </button>
          <button
            type="button"
            onClick={() => onDecline(invitation.inviteId, invitation.fromId)}
            className="p-2 bg-white/[0.08] hover:bg-white/[0.15] text-[#A3A3A3] hover:text-white rounded-xl transition cursor-pointer"
            title="Decline"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
