import React from 'react';
import type { Token } from '../../types/ludo';
import { COLOR_CONFIGS } from '../../utils/boardData';

interface TokenPieceProps {
  token: Token;
  xPercent: number;
  yPercent: number;
  scale?: number;
  xOffsetPercent?: number;
  yOffsetPercent?: number;
  isSelectable: boolean;
  onSelect: (token: Token) => void;
}

export const TokenPiece: React.FC<TokenPieceProps> = ({
  token,
  xPercent,
  yPercent,
  scale = 1.0,
  xOffsetPercent = 0,
  yOffsetPercent = 0,
  isSelectable,
  onSelect,
}) => {
  const config = COLOR_CONFIGS[token.color];

  // Base position + adjustments for stacked pieces
  const finalX = xPercent + xOffsetPercent;
  const finalY = yPercent + yOffsetPercent;

  return (
    <div
      onClick={() => isSelectable && onSelect(token)}
      style={{
        left: `${finalX}%`,
        top: `${finalY}%`,
        transform: `translate(-50%, -60%) scale(${scale})`,
        zIndex: isSelectable ? 40 : token.isAlive ? 20 + (token.currBlock % 10) : 10,
      }}
      className={`absolute cursor-pointer transition-all duration-200 select-none ${
        isSelectable ? 'animate-bounce' : ''
      }`}
    >
      {/* Active rotating selection halo */}
      {isSelectable && (
        <div
          className="absolute inset-0 -m-2 rounded-full border-2 border-dashed border-white animate-spin"
          style={{ borderColor: config.accentHex }}
        />
      )}

      {/* Pawn Image */}
      <img
        src={config.pawnImage}
        alt={`${token.color} token`}
        className={`w-7 h-9 sm:w-9 sm:h-12 md:w-11 md:h-14 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] transition-transform duration-200 ${
          isSelectable ? 'brightness-110 drop-shadow-[0_0_8px_white]' : ''
        }`}
        draggable={false}
      />
    </div>
  );
};
