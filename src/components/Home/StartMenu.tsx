import React, { useState } from 'react';
import { Users, Bot, Volume2, VolumeX, Music, Mic, MicOff, Play, Sparkles, RotateCcw, Sliders } from 'lucide-react';
import type { GameMode, PlayerColor, StoredSession } from '../../types/ludo';
import { COLOR_CONFIGS } from '../../utils/boardData';
import { sounds } from '../../utils/soundManager';

interface StartMenuProps {
  onStartGame: (
    mode: GameMode,
    playerCount: 2 | 3 | 4,
    botCount: number,
    playerNames: string[]
  ) => void;
  onResumeSession?: (session: StoredSession) => void;
  onOpenSoundboard?: () => void;
  activeSession: StoredSession | null;
  initialPlayerCount?: 2 | 3 | 4;
  initialMode?: GameMode;
  initialPlayerNames?: Record<PlayerColor, string>;
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
  onToggleSound: () => void;
  onToggleMusic: () => void;
  onToggleVoice: () => void;
}

export const StartMenu: React.FC<StartMenuProps> = ({
  onStartGame,
  onResumeSession,
  onOpenSoundboard,
  activeSession,
  initialPlayerCount = 4,
  initialMode = 'pass_and_play',
  initialPlayerNames,
  soundEnabled,
  musicEnabled,
  voiceEnabled,
  onToggleSound,
  onToggleMusic,
  onToggleVoice,
}) => {
  const [selectedTab, setSelectedTab] = useState<GameMode>(initialMode);
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(initialPlayerCount);

  // Player names per slot
  const [playerNames, setPlayerNames] = useState<Record<PlayerColor, string>>({
    red: initialPlayerNames?.red || 'Rizzler',
    green: initialPlayerNames?.green || 'Sigma',
    yellow: initialPlayerNames?.yellow || 'Chad',
    blue: initialPlayerNames?.blue || 'Giga',
  });

  const handleNameChange = (color: PlayerColor, name: string) => {
    setPlayerNames((prev) => ({
      ...prev,
      [color]: name.slice(0, 15),
    }));
  };

  const handleStart = () => {
    sounds.play('gamestartsound');

    let resolvedNames: string[] = [];
    let botCount = 0;

    if (selectedTab === 'pass_and_play') {
      if (playerCount === 2) {
        resolvedNames = [playerNames.red || 'Rizzler', playerNames.yellow || 'Chad'];
      } else if (playerCount === 3) {
        resolvedNames = [
          playerNames.red || 'Rizzler',
          playerNames.green || 'Sigma',
          playerNames.yellow || 'Chad',
        ];
      } else {
        resolvedNames = [
          playerNames.red || 'Rizzler',
          playerNames.green || 'Sigma',
          playerNames.yellow || 'Chad',
          playerNames.blue || 'Giga',
        ];
      }
      onStartGame('pass_and_play', playerCount, 0, resolvedNames);
    } else {
      // vs Computer
      if (playerCount === 2) {
        botCount = 1;
        resolvedNames = [playerNames.red || 'You', playerNames.yellow || 'Bot Sigma'];
      } else if (playerCount === 3) {
        botCount = 2;
        resolvedNames = [
          playerNames.red || 'You',
          playerNames.green || 'Bot 1',
          playerNames.yellow || 'Bot 2',
        ];
      } else {
        botCount = 3;
        resolvedNames = [
          playerNames.red || 'You',
          playerNames.green || 'Bot Sigma',
          playerNames.yellow || 'Bot Chad',
          playerNames.blue || 'Bot Giga',
        ];
      }
      onStartGame('vs_computer', playerCount, botCount, resolvedNames);
    }
  };

  // Determine active color slots based on player count
  const activeColorSlots: PlayerColor[] =
    playerCount === 2
      ? ['red', 'yellow']
      : playerCount === 3
      ? ['red', 'green', 'yellow']
      : ['red', 'green', 'yellow', 'blue'];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 bg-[#111111] text-[#F5F5F5] select-none">
      {/* Background subtle radial glow */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#191919] via-[#111111] to-[#0a0a0a]" />

      <div className="relative w-full max-w-lg bg-[#191919]/90 border border-white/[0.12] rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.7)] backdrop-blur-2xl flex flex-col items-center z-10">
        {/* Top Sound & Voice Controls */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              soundEnabled
                ? 'bg-[#E9BC42]/15 border-[#E9BC42]/40 text-[#E9BC42]'
                : 'bg-white/[0.04] border-white/[0.10] text-[#A3A3A3]'
            }`}
            title="Toggle Sound Effects"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleMusic}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              musicEnabled
                ? 'bg-[#E9BC42]/15 border-[#E9BC42]/40 text-[#E9BC42]'
                : 'bg-white/[0.04] border-white/[0.10] text-[#A3A3A3]'
            }`}
            title="Toggle Music"
          >
            <Music className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToggleVoice}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              voiceEnabled
                ? 'bg-[#E9BC42]/15 border-[#E9BC42]/40 text-[#E9BC42]'
                : 'bg-white/[0.04] border-white/[0.10] text-[#A3A3A3]'
            }`}
            title="Toggle Voice Reactions"
          >
            {voiceEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
          {onOpenSoundboard && (
            <button
              type="button"
              onClick={onOpenSoundboard}
              className="p-2 rounded-xl border bg-white/[0.04] border-white/[0.10] hover:bg-white/[0.10] text-[#A3A3A3] hover:text-[#F5F5F5] transition cursor-pointer"
              title="Voice Reactions Soundboard & Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Main Brand Logo: Rizz Dice */}
        <div className="flex flex-col items-center mt-2 mb-6">
          <div className="relative mb-3">
            <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-3xl bg-gradient-to-tr from-[#E9BC42] via-yellow-200 to-[#E9BC42] p-0.5 shadow-[0_8px_30px_rgba(233,188,66,0.3)]">
              <div className="w-full h-full rounded-[22px] bg-[#161616] flex items-center justify-center overflow-hidden">
                <img
                  src="/images/dice6.png"
                  alt="Rizz Dice"
                  className="w-13 h-13 sm:w-15 sm:h-15 object-contain drop-shadow"
                />
              </div>
            </div>
            <Sparkles className="absolute -top-1.5 -right-1.5 w-6 h-6 text-[#E9BC42] animate-spin-slow" />
          </div>

          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-wider text-[#F5F5F5]">
            Rizz Dice
          </h1>
          <span className="text-xs uppercase tracking-widest font-black text-[#E9BC42] mt-0.5">
            Ludo King Redefined
          </span>
        </div>

        {/* Resume Saved Match Banner if Available */}
        {activeSession && onResumeSession && (
          <div className="w-full mb-5 p-3.5 bg-white/[0.04] border border-[#E9BC42]/40 rounded-2xl flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-wider text-[#E9BC42]">
                Active Match In Progress
              </span>
              <span className="text-[11px] text-[#A3A3A3]">
                {activeSession.players.length} Players • {activeSession.gameMode === 'vs_computer' ? 'vs Computer' : 'Pass \'N Play'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onResumeSession(activeSession)}
              className="py-1.5 px-3 bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-black text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center gap-1 shadow"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resume
            </button>
          </div>
        )}

        {/* Mode Tabs (Apple Segmented Glass Control) */}
        <div className="w-full grid grid-cols-2 p-1 bg-black/60 rounded-2xl border border-white/[0.08] mb-5">
          <button
            type="button"
            onClick={() => setSelectedTab('pass_and_play')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition cursor-pointer ${
              selectedTab === 'pass_and_play'
                ? 'bg-[#E9BC42] text-black shadow-md font-black'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Users className="w-4 h-4" />
            Pass 'N Play
          </button>

          <button
            type="button"
            onClick={() => setSelectedTab('vs_computer')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider transition cursor-pointer ${
              selectedTab === 'vs_computer'
                ? 'bg-[#E9BC42] text-black shadow-md font-black'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Bot className="w-4 h-4" />
            vs Computer
          </button>
        </div>

        {/* Player Count Selection */}
        <div className="w-full flex flex-col items-center mb-5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#A3A3A3] mb-2.5">
            {selectedTab === 'pass_and_play' ? 'Number of Players' : 'Match Format'}
          </span>
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {[2, 3, 4].map((count) => {
              const label =
                selectedTab === 'vs_computer'
                  ? count === 2
                    ? '1 vs 1 Bot'
                    : count === 3
                    ? '1 vs 2 Bots'
                    : '1 vs 3 Bots'
                  : `${count} Players`;

              const isSelected = playerCount === count;

              return (
                <button
                  key={`pcount-${count}`}
                  type="button"
                  onClick={() => setPlayerCount(count as 2 | 3 | 4)}
                  className={`py-2.5 px-1 rounded-2xl flex flex-col items-center gap-0.5 border transition cursor-pointer ${
                    isSelected
                      ? 'bg-[#E9BC42]/15 border-[#E9BC42] text-[#E9BC42] shadow-[0_0_15px_rgba(233,188,66,0.2)] font-black'
                      : 'bg-white/[0.04] border-white/[0.08] text-[#A3A3A3] hover:bg-white/[0.08] hover:text-[#F5F5F5]'
                  }`}
                >
                  <span className="text-xl sm:text-2xl font-black">{count}</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-center">
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Customizable Player Names */}
        <div className="w-full flex flex-col mb-6 bg-white/[0.03] p-3.5 rounded-2xl border border-white/[0.08]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#A3A3A3] mb-2">
            Customize Player Names
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeColorSlots.map((color, idx) => {
              const cfg = COLOR_CONFIGS[color];
              const isComp = selectedTab === 'vs_computer' && idx > 0;
              return (
                <div
                  key={`name-slot-${color}`}
                  className="flex items-center gap-2 p-1.5 bg-black/40 rounded-xl border border-white/[0.08] focus-within:border-[#E9BC42]/60 transition"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center p-1 shadow shrink-0"
                    style={{ backgroundColor: cfg.accentHex }}
                  >
                    <img src={cfg.pawnImage} alt={cfg.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      maxLength={15}
                      value={playerNames[color]}
                      onChange={(e) => handleNameChange(color, e.target.value)}
                      placeholder={isComp ? `Bot ${cfg.name}` : `Player ${idx + 1}`}
                      className="w-full bg-transparent text-xs font-bold text-[#F5F5F5] placeholder-gray-500 focus:outline-none"
                    />
                  </div>
                  {isComp && (
                    <span className="text-[9px] uppercase font-black px-1.5 py-0.5 bg-white/[0.1] rounded text-[#A3A3A3] shrink-0">
                      BOT
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Start Game Button (Primary Solid Golden Action) */}
        <button
          type="button"
          onClick={handleStart}
          className="w-full py-4 px-6 bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-black text-sm uppercase tracking-widest rounded-2xl shadow-[0_8px_25px_rgba(233,188,66,0.35)] flex items-center justify-center gap-2.5 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          Start Match
        </button>

        {/* Footer info */}
        <p className="text-[11px] text-[#A3A3A3] mt-4 text-center">
          Classy Glassmorphism • Fair Play • Configurable Audio
        </p>
      </div>
    </div>
  );
};
