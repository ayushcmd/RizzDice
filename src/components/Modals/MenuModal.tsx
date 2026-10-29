import React from 'react';
import { Volume2, VolumeX, Music, Mic, MicOff, RotateCcw, Home, X, Trash2, Sparkles } from 'lucide-react';

interface MenuModalProps {
  isOpen: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleVoice: () => void;
  onOpenSoundboard?: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onResetPreferences?: () => void;
  onClose: () => void;
}

export const MenuModal: React.FC<MenuModalProps> = ({
  isOpen,
  soundEnabled,
  musicEnabled,
  voiceEnabled,
  onToggleSound,
  onToggleMusic,
  onToggleVoice,
  onOpenSoundboard,
  onRestart,
  onMainMenu,
  onResetPreferences,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-sm bg-[#161616]/95 border border-white/[0.12] p-6 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] text-[#F5F5F5] backdrop-blur-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition text-[#A3A3A3] hover:text-[#F5F5F5] border border-white/[0.08] cursor-pointer"
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-[#E9BC42]/15 border border-[#E9BC42]/30 text-[#E9BC42] mb-3">
            <span className="text-xl">⚙️</span>
          </div>
          <h3 className="text-xl font-black uppercase tracking-wider text-[#F5F5F5]">
            Game Settings
          </h3>
          <p className="text-[11px] uppercase tracking-widest font-bold text-[#E9BC42]/80 mt-1">
            Rizz Dice • Audio & Controls
          </p>
        </div>

        {/* Audio Toggles */}
        <div className="flex flex-col gap-2.5 mb-5">
          {/* Sound Effects */}
          <div className="flex items-center justify-between p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.08]">
            <span className="font-bold text-sm text-[#F5F5F5] flex items-center gap-2.5">
              {soundEnabled ? (
                <Volume2 className="w-4.5 h-4.5 text-[#E9BC42]" />
              ) : (
                <VolumeX className="w-4.5 h-4.5 text-[#A3A3A3]" />
              )}
              Sound Effects
            </span>
            <button
              type="button"
              onClick={onToggleSound}
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition cursor-pointer border ${
                soundEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42] shadow-[0_0_12px_rgba(233,188,66,0.25)]'
                  : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
              }`}
            >
              {soundEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Theme Music */}
          <div className="flex items-center justify-between p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.08]">
            <span className="font-bold text-sm text-[#F5F5F5] flex items-center gap-2.5">
              <Music className={`w-4.5 h-4.5 ${musicEnabled ? 'text-[#E9BC42]' : 'text-[#A3A3A3]'}`} />
              Theme Music
            </span>
            <button
              type="button"
              onClick={onToggleMusic}
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition cursor-pointer border ${
                musicEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42] shadow-[0_0_12px_rgba(233,188,66,0.25)]'
                  : 'bg-white/[0.06] text-[#A3A3A3] border-white/[0.1]'
              }`}
            >
              {musicEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Voice Reactions */}
          <div className="flex items-center justify-between p-3.5 bg-white/[0.04] rounded-2xl border border-white/[0.08]">
            <span className="font-bold text-sm text-[#F5F5F5] flex items-center gap-2.5">
              {voiceEnabled ? (
                <Mic className="w-4.5 h-4.5 text-[#E9BC42]" />
              ) : (
                <MicOff className="w-4.5 h-4.5 text-[#A3A3A3]" />
              )}
              Voice Reactions
            </span>
            <button
              type="button"
              onClick={onToggleVoice}
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition cursor-pointer border ${
                voiceEnabled
                  ? 'bg-[#E9BC42] text-black border-[#E9BC42] shadow-[0_0_12px_rgba(233,188,66,0.25)]'
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
            className="w-full mb-5 py-3 px-4 flex items-center justify-between bg-white/[0.05] hover:bg-white/[0.09] text-[#F5F5F5] rounded-2xl border border-[#E9BC42]/30 transition group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-[#E9BC42] group-hover:rotate-12 transition-transform" />
              <div className="flex flex-col text-left">
                <span className="text-xs font-black uppercase tracking-wider">Voice Soundboard</span>
                <span className="text-[10px] text-[#A3A3A3]">Manual taunts & event config</span>
              </div>
            </div>
            <span className="text-xs text-[#E9BC42] font-black uppercase tracking-wider">Open →</span>
          </button>
        )}

        {/* Action Controls */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onRestart();
            }}
            className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-[#E9BC42] hover:bg-[#d8ab35] text-black font-black uppercase text-xs tracking-wider rounded-xl transition shadow-[0_4px_16px_rgba(233,188,66,0.2)] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Match
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onMainMenu();
            }}
            className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.12] text-[#F5F5F5] font-bold uppercase text-xs tracking-wider rounded-xl transition border border-white/[0.1] cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>

          {onResetPreferences && (
            <button
              type="button"
              onClick={onResetPreferences}
              className="w-full mt-1 py-2 px-3 flex items-center justify-center gap-1.5 text-[#A3A3A3] hover:text-rose-400 font-bold uppercase text-[10px] tracking-wider transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset All Saved Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
