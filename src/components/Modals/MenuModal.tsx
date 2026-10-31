import React, { useState } from 'react';
import {
  Play,
  Volume2,
  VolumeX,
  Music,
  Mic,
  MicOff,
  RotateCcw,
  LogOut,
  StopCircle,
  X,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface MenuModalProps {
  isOpen: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
  isOnline?: boolean;
  onResume: () => void;
  onQuitGame: () => void;
  onEndGame: () => void;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleVoice: () => void;
  onOpenSoundboard?: () => void;
  onRestart?: () => void;
  onResetPreferences?: () => void;
  onClose: () => void;
}

export const MenuModal: React.FC<MenuModalProps> = ({
  isOpen,
  soundEnabled,
  musicEnabled,
  voiceEnabled,
  isOnline = false,
  onResume,
  onQuitGame,
  onEndGame,
  onToggleSound,
  onToggleMusic,
  onToggleVoice,
  onOpenSoundboard,
  onRestart,
  onResetPreferences,
  onClose,
}) => {
  const [confirmAction, setConfirmAction] = useState<'quit' | 'end' | null>(null);

  if (!isOpen) return null;

  // Handle Cancel in confirmation
  const handleCancelConfirm = () => {
    setConfirmAction(null);
  };

  // -------------------------------------------------------------
  // CONFIRMATION DIALOG (QUIT OR END GAME)
  // -------------------------------------------------------------
  if (confirmAction !== null) {
    const isQuit = confirmAction === 'quit';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in select-none">
        <div className="relative w-full max-w-sm bg-[#161616]/95 border border-white/[0.15] p-6 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.9)] text-[#F5F5F5] backdrop-blur-2xl">
          {/* Header Icon */}
          <div className="text-center mb-4">
            <div
              className={`inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3 ${
                isQuit
                  ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
              }`}
            >
              {isQuit ? (
                <LogOut className="w-6 h-6" />
              ) : (
                <StopCircle className="w-6 h-6" />
              )}
            </div>
            <h3 className="text-lg font-black uppercase tracking-wider text-[#F5F5F5]">
              {isQuit ? 'Quit Current Match?' : 'End Game Permanently?'}
            </h3>
            <p className="text-xs text-[#A3A3A3] mt-2 leading-relaxed">
              {isQuit
                ? isOnline
                  ? 'You will exit this online match and return to the main menu. The other player will be notified.'
                  : 'You will exit this match and return to the main menu. Active bot and game timers will be stopped immediately.'
                : isOnline
                ? 'This will terminate the match for all players in the room. The game cannot be resumed.'
                : 'This will permanently terminate the current match and clear your active saved session. The game cannot be resumed.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 mt-5">
            <button
              type="button"
              onClick={() => {
                if (isQuit) {
                  onQuitGame();
                } else {
                  onEndGame();
                }
                setConfirmAction(null);
                onClose();
              }}
              className={`w-full py-3 px-4 flex items-center justify-center gap-2 font-black uppercase text-xs tracking-wider rounded-xl transition cursor-pointer shadow-lg ${
                isQuit
                  ? 'bg-amber-500 hover:bg-amber-400 text-black'
                  : 'bg-rose-600 hover:bg-rose-500 text-white'
              }`}
            >
              {isQuit ? <LogOut className="w-4 h-4" /> : <StopCircle className="w-4 h-4" />}
              {isQuit ? 'Yes, Quit Match' : 'Yes, End Game'}
            </button>

            <button
              type="button"
              onClick={handleCancelConfirm}
              className="w-full py-2.5 px-4 flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] text-[#F5F5F5] font-bold uppercase text-xs tracking-wider rounded-xl transition border border-white/[0.1] cursor-pointer"
            >
              Cancel (Resume Playing)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN IN-GAME MENU
  // -------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-sm bg-[#161616]/95 border border-white/[0.12] p-6 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-[#F5F5F5] backdrop-blur-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            onResume();
            onClose();
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition text-[#A3A3A3] hover:text-[#F5F5F5] border border-white/[0.08] cursor-pointer"
          aria-label="Close menu and resume"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#E9BC42]/15 border border-[#E9BC42]/30 text-[#E9BC42] mb-2">
            <span className="text-xl">🎲</span>
          </div>
          <h3 className="text-xl font-black uppercase tracking-wider text-[#F5F5F5]">
            Game Menu
          </h3>
          <p className="text-[11px] uppercase tracking-widest font-bold text-[#E9BC42]/80 mt-1">
            {isOnline ? 'Online Match in Progress' : 'Match Paused'}
          </p>
        </div>

        {/* 1. RESUME GAME (Top Primary Action) */}
        <button
          type="button"
          onClick={() => {
            onResume();
            onClose();
          }}
          className="w-full mb-4 py-3.5 px-4 flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#E9BC42] to-[#d8ab35] hover:from-[#f5c74e] hover:to-[#e0b43f] text-black font-black uppercase text-xs tracking-widest rounded-2xl transition shadow-[0_6px_20px_rgba(233,188,66,0.3)] cursor-pointer group"
        >
          <Play className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" />
          Resume Game
        </button>

        {/* 2. Audio Toggles */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Sound Effects */}
          <div className="flex items-center justify-between p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.08]">
            <span className="font-bold text-xs text-[#F5F5F5] flex items-center gap-2">
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#E9BC42]" />
              ) : (
                <VolumeX className="w-4 h-4 text-[#A3A3A3]" />
              )}
              Sound Effects
            </span>
            <button
              type="button"
              onClick={onToggleSound}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                soundEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42]'
                  : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
              }`}
            >
              {soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Theme Music */}
          <div className="flex items-center justify-between p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.08]">
            <span className="font-bold text-xs text-[#F5F5F5] flex items-center gap-2">
              <Music className={`w-4 h-4 ${musicEnabled ? 'text-[#E9BC42]' : 'text-[#A3A3A3]'}`} />
              Theme Music
            </span>
            <button
              type="button"
              onClick={onToggleMusic}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                musicEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42]'
                  : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
              }`}
            >
              {musicEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Voice Reactions */}
          <div className="flex items-center justify-between p-2.5 bg-white/[0.04] rounded-xl border border-white/[0.08]">
            <span className="font-bold text-xs text-[#F5F5F5] flex items-center gap-2">
              {voiceEnabled ? (
                <Mic className="w-4 h-4 text-[#E9BC42]" />
              ) : (
                <MicOff className="w-4 h-4 text-[#A3A3A3]" />
              )}
              Voice Reactions
            </span>
            <button
              type="button"
              onClick={onToggleVoice}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition cursor-pointer border ${
                voiceEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42]'
                  : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
              }`}
            >
              {voiceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Voice Reactions Soundboard launcher */}
        {onOpenSoundboard && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSoundboard();
            }}
            className="w-full mb-4 py-2.5 px-3 flex items-center justify-between bg-white/[0.04] hover:bg-white/[0.08] text-[#F5F5F5] rounded-xl border border-[#E9BC42]/30 transition group cursor-pointer text-xs"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#E9BC42] group-hover:rotate-12 transition-transform" />
              <span className="font-bold uppercase tracking-wider text-[11px]">Soundboard Reactions</span>
            </div>
            <span className="text-[10px] text-[#E9BC42] font-black uppercase">Open →</span>
          </button>
        )}

        {/* 3. Match Actions: Quit Game, End Game, Restart */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.08]">
          {/* Quit Match Button */}
          <button
            type="button"
            onClick={() => setConfirmAction('quit')}
            className="w-full py-2.5 px-4 flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 font-bold uppercase text-xs tracking-wider rounded-xl transition border border-amber-500/20 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Quit Game
          </button>

          {/* End Game Button */}
          <button
            type="button"
            onClick={() => setConfirmAction('end')}
            className="w-full py-2.5 px-4 flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 font-bold uppercase text-xs tracking-wider rounded-xl transition border border-rose-500/25 cursor-pointer"
          >
            <StopCircle className="w-4 h-4" />
            End Game
          </button>

          {/* Restart Match (Offline Only) */}
          {!isOnline && onRestart && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRestart();
              }}
              className="w-full py-2 px-3 flex items-center justify-center gap-1.5 text-[#A3A3A3] hover:text-[#F5F5F5] font-bold uppercase text-[10px] tracking-wider transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restart Match
            </button>
          )}

          {onResetPreferences && (
            <button
              type="button"
              onClick={onResetPreferences}
              className="w-full py-1.5 px-3 flex items-center justify-center gap-1 text-[#737373] hover:text-rose-400 font-bold uppercase text-[9px] tracking-wider transition cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Reset Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
