import React, { useEffect, useState, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import type { Player } from '../../types/ludo';
import { COLOR_CONFIGS } from '../../utils/boardData';

interface DicePadProps {
  player: Player;
  isActive: boolean;
  canRoll: boolean;
  isRolling: boolean;
  diceValue: number;
  hasExtraChance: boolean;
  reactionBadge?: string | null;
  reactionText?: string | null;
  onRoll: () => void;
  onRenamePlayer: (playerId: number, newName: string) => void;
}

export const DicePad: React.FC<DicePadProps> = ({
  player,
  isActive,
  canRoll,
  isRolling,
  diceValue,
  hasExtraChance,
  reactionBadge,
  reactionText,
  onRoll,
  onRenamePlayer,
}) => {
  const config = COLOR_CONFIGS[player.color];
  const [animFrame, setAnimFrame] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(player.name);
  const [prevPlayerName, setPrevPlayerName] = useState(player.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync editedName if player.name changes from outside
  if (player.name !== prevPlayerName) {
    setPrevPlayerName(player.name);
    setEditedName(player.name);
  }

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Animate 8-frame dice roll cleanly
  useEffect(() => {
    if (!isRolling || !isActive) return;

    const interval = setInterval(() => {
      setAnimFrame((prev) => (prev >= 8 ? 1 : prev + 1));
    }, 45);

    return () => clearInterval(interval);
  }, [isRolling, isActive]);

  const handleSaveName = () => {
    const trimmed = editedName.trim();
    if (trimmed && trimmed.length <= 15) {
      onRenamePlayer(player.id, trimmed);
    } else {
      setEditedName(player.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditedName(player.name);
      setIsEditing(false);
    }
  };

  const diceImageSrc =
    isRolling && isActive
      ? `/images/dice000${animFrame}.png`
      : diceValue >= 1 && diceValue <= 6
      ? `/images/dice${diceValue}.png`
      : '/images/dice6.png';

  return (
    <div
      className={`relative flex items-center justify-between gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl transition-all duration-300 backdrop-blur-xl select-none ${
        isActive
          ? 'bg-[#1c1c1c]/95 border-2 border-[#E9BC42]/80 shadow-[0_8px_30px_rgba(0,0,0,0.6)]'
          : 'bg-[#141414]/75 border border-white/[0.08] opacity-75'
      }`}
    >
      {/* Floating Reaction Bubble */}
      {reactionBadge && (
        <div className="absolute -top-7 left-2 sm:left-4 z-30 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#1e1e1e] border border-[#E9BC42]/60 text-[#E9BC42] text-xs font-black shadow-lg animate-bounce whitespace-nowrap">
          <span>{reactionBadge}</span>
          {reactionText && (
            <span className="hidden sm:inline font-bold text-[10px] text-[#A3A3A3]">
              "{reactionText}"
            </span>
          )}
        </div>
      )}

      {/* Extra Chance Badge */}
      {isActive && hasExtraChance && (
        <div className="absolute -top-3.5 right-4 z-20 px-2.5 py-0.5 bg-[#E9BC42] text-black text-[10px] sm:text-xs font-black tracking-widest uppercase rounded-full shadow-md animate-pulse whitespace-nowrap">
          🎲 Bonus Roll
        </div>
      )}

      {/* Player Pawn Icon & Name Column */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center p-1.5 shadow-md shrink-0 border border-white/20"
          style={{ backgroundColor: config.accentHex }}
        >
          <img
            src={config.pawnImage}
            alt={player.name}
            className="w-full h-full object-contain drop-shadow"
          />
        </div>

        <div className="flex flex-col min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={editedName}
                maxLength={15}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-22 sm:w-28 px-1.5 py-0.5 text-xs font-bold bg-black/60 text-[#F5F5F5] rounded border border-[#E9BC42] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="p-1 text-emerald-400 hover:text-emerald-300 cursor-pointer"
                title="Save name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditedName(player.name);
                  setIsEditing(false);
                }}
                className="p-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs sm:text-sm tracking-wide text-[#F5F5F5] truncate max-w-[85px] sm:max-w-[120px]">
                {player.name}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-0.5 text-[#A3A3A3] hover:text-[#E9BC42] opacity-60 hover:opacity-100 transition cursor-pointer"
                title="Rename player"
              >
                <Pencil className="w-3 h-3" />
              </button>
              {player.isBot && (
                <span className="px-1.5 py-0.2 text-[9px] uppercase font-black bg-white/[0.1] text-[#A3A3A3] rounded tracking-wider">
                  BOT
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="text-[10px] font-black uppercase tracking-wider"
              style={{ color: config.accentHex }}
            >
              {config.name}
            </span>
            {isActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1 rounded bg-[#E9BC42]/15 text-[#E9BC42]">
                Turn
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Prominent Enlarged Dice Box */}
      <div className="relative shrink-0">
        {/* Bouncing Arrow Hint for Active Player */}
        {isActive && canRoll && !isRolling && !player.isBot && (
          <div className="absolute -left-5 top-1/2 -translate-y-1/2 animate-bounce pointer-events-none z-20">
            <img
              src="/images/arrow_dice_hint.png"
              alt="Roll Dice"
              className="w-5 h-5 rotate-90 drop-shadow"
            />
          </div>
        )}

        <button
          type="button"
          disabled={!isActive || !canRoll || isRolling || player.isBot}
          onClick={onRoll}
          className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center p-1.5 transition-all duration-200 ${
            isActive && canRoll && !player.isBot
              ? 'cursor-pointer hover:scale-105 active:scale-95 shadow-[0_4px_20px_rgba(233,188,66,0.3)] ring-2 ring-[#E9BC42]/80 bg-white/[0.05]'
              : 'cursor-default opacity-85 bg-black/30'
          }`}
        >
          <img
            src={diceImageSrc}
            alt={`Dice ${diceValue}`}
            className={`w-full h-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] select-none transition-transform duration-200 ${
              isRolling && isActive ? 'animate-spin scale-110' : ''
            }`}
            draggable={false}
          />
        </button>
      </div>
    </div>
  );
};
