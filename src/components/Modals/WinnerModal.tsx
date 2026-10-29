import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RotateCcw, Home } from 'lucide-react';
import type { WinnerRecord } from '../../types/ludo';
import { COLOR_CONFIGS } from '../../utils/boardData';
import { sounds } from '../../utils/soundManager';
import { voices } from '../../utils/voiceManager';

interface WinnerModalProps {
  winners: WinnerRecord[];
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export const WinnerModal: React.FC<WinnerModalProps> = ({
  winners,
  onPlayAgain,
  onMainMenu,
}) => {
  const firstPlace = winners[0];

  useEffect(() => {
    sounds.play('congratulations');
    if (firstPlace) {
      voices.handleGameEvent('VICTORY', firstPlace.player.color);
    }

    // Trigger fireworks confetti celebration
    const end = Date.now() + 3000;
    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      if (Date.now() > end) {
        return clearInterval(interval);
      }
      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        colors: ['#E9BC42', '#F5F5F5', '#10B981', '#EF4444'],
        origin: { x: Math.random(), y: Math.random() - 0.2 },
      });
    }, 280);

    return () => clearInterval(interval);
  }, [firstPlace]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-md bg-[#161616]/95 border border-white/[0.14] p-6 sm:p-8 rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] text-center text-[#F5F5F5] backdrop-blur-2xl">
        {/* Crown & Champagne Gold Header */}
        <div className="mb-5">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-[#E9BC42]/15 border border-[#E9BC42]/30 mb-3 shadow-[0_0_24px_rgba(233,188,66,0.2)]">
            <Trophy className="w-8 h-8 text-[#E9BC42] animate-bounce" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider text-[#F5F5F5]">
            Victory Royale
          </h2>
          <p className="text-xs font-bold uppercase tracking-widest text-[#E9BC42] mt-1">
            Rizz Dice Champion • Ludo King Redefined
          </p>
        </div>

        {/* 1st Place Hero Card */}
        {firstPlace && (
          <div className="my-5 p-5 bg-white/[0.04] rounded-2xl border border-[#E9BC42]/40 shadow-[0_8px_32px_rgba(0,0,0,0.4)] flex flex-col items-center relative overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-[#E9BC42] text-black font-black text-[10px] uppercase tracking-wider rounded-bl-xl shadow-md">
              Champion
            </div>
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center p-3 mb-3 shadow-xl ring-4 ring-[#E9BC42]/60"
              style={{ backgroundColor: COLOR_CONFIGS[firstPlace.player.color].accentHex }}
            >
              <img
                src={COLOR_CONFIGS[firstPlace.player.color].pawnImage}
                alt="Winner token"
                className="w-full h-full object-contain drop-shadow"
              />
            </div>
            <span className="text-2xl font-black tracking-wide text-[#F5F5F5]">
              {firstPlace.player.name}
            </span>
            <span
              className="text-xs uppercase font-black tracking-widest mt-1"
              style={{ color: COLOR_CONFIGS[firstPlace.player.color].accentHex }}
            >
              {COLOR_CONFIGS[firstPlace.player.color].name} House
            </span>
          </div>
        )}

        {/* Runner-up Rankings (2nd, 3rd) */}
        {winners.length > 1 && (
          <div className="flex flex-col gap-2 my-4 text-left">
            {winners.slice(1).map((record) => (
              <div
                key={record.player.id}
                className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] rounded-xl border border-white/[0.08]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-black text-[#E9BC42] text-xs">#{record.rank}</span>
                  <span className="font-bold text-sm text-[#F5F5F5]">{record.player.name}</span>
                </div>
                <span
                  className="text-xs font-black uppercase tracking-wider"
                  style={{ color: COLOR_CONFIGS[record.player.color].accentHex }}
                >
                  {COLOR_CONFIGS[record.player.color].name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onPlayAgain}
            className="flex-1 py-3 px-4 flex items-center justify-center gap-2 bg-[#E9BC42] hover:bg-[#d8ab35] text-black font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl transition shadow-[0_4px_16px_rgba(233,188,66,0.25)] cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
          <button
            type="button"
            onClick={onMainMenu}
            className="flex-1 py-3 px-4 flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] text-[#F5F5F5] font-black text-xs sm:text-sm uppercase tracking-wider rounded-xl transition cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
