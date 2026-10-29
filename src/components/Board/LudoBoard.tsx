import React from 'react';
import type { Player, Token } from '../../types/ludo';
import { DX, DY, COLOR_CONFIGS, SAFE_SPOTS } from '../../utils/boardData';
import { TokenPiece } from './TokenPiece';

interface LudoBoardProps {
  players: Player[];
  activePlayer: Player | null;
  selectableTokens: Token[];
  onTokenClick: (token: Token) => void;
}

export const LudoBoard: React.FC<LudoBoardProps> = ({
  players,
  activePlayer,
  selectableTokens,
  onTokenClick,
}) => {
  const selectableSet = new Set(selectableTokens.map((t) => `${t.playerIndex}-${t.id}`));

  // Collect all tokens from all active players
  const allTokens: Token[] = players.flatMap((p) => p.tokens);

  // Group tokens currently on the track by their currBlock for multi-token offset calculation
  const blockTokenMap = new Map<number, Token[]>();
  for (const token of allTokens) {
    if (token.isAlive && !token.hasCompleted && token.currBlock >= 0) {
      const list = blockTokenMap.get(token.currBlock) || [];
      list.push(token);
      blockTokenMap.set(token.currBlock, list);
    }
  }

  // Calculate coordinates and offsets for each token
  const renderedTokens = allTokens.map((token) => {
    const config = COLOR_CONFIGS[token.color];
    const isSelectable =
      Boolean(activePlayer && token.playerIndex === activePlayer.id) &&
      selectableSet.has(`${token.playerIndex}-${token.id}`);

    let xPercent = 50;
    let yPercent = 50;
    let scale = 1.0;
    let xOffset = 0;
    let yOffset = 0;

    if (token.hasCompleted) {
      // Placed inside the center home triangle
      switch (token.color) {
        case 'red':
          xPercent = 46.5;
          yPercent = 43.5 + token.id * 1.2;
          break;
        case 'green':
          xPercent = 53.5;
          yPercent = 43.5 + token.id * 1.2;
          break;
        case 'yellow':
          xPercent = 53.5;
          yPercent = 56.5 - token.id * 1.2;
          break;
        case 'blue':
          xPercent = 46.5;
          yPercent = 56.5 - token.id * 1.2;
          break;
      }
      scale = 0.65;
    } else if (!token.isAlive) {
      // In player's starting yard box
      const slot = config.yardSlots[token.yardSlot];
      xPercent = slot.x;
      yPercent = slot.y;
      scale = 1.0;
    } else {
      // On track or in home stretch
      const block = token.currBlock;
      if (block >= 0 && block < DX.length) {
        xPercent = DX[block] + 3.33;
        yPercent = DY[block] + 3.33;

        // Apply multi-token stacking adjustments
        const tokensOnSameBlock = blockTokenMap.get(block) || [];
        const n = tokensOnSameBlock.length;
        if (n > 1) {
          const indexInGroup = tokensOnSameBlock.findIndex(
            (t) => t.playerIndex === token.playerIndex && t.id === token.id
          );
          scale = Math.min(0.85, 100 / (n * 32 + 70));
          const offsetStep = 1.8;
          xOffset = (indexInGroup - (n - 1) / 2) * offsetStep;
          yOffset = (indexInGroup - (n - 1) / 2) * offsetStep;
        }
      }
    }

    return {
      token,
      xPercent,
      yPercent,
      scale,
      xOffset,
      yOffset,
      isSelectable,
    };
  });

  return (
    <div className="relative w-full aspect-square max-w-[620px] mx-auto rounded-3xl shadow-2xl overflow-hidden border-4 border-amber-900/60 bg-amber-50">
      {/* Background Ludo Board Image */}
      <img
        src="/images/ludoboardfinal.png"
        alt="Ludo Board"
        className="w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
      />

      {/* Star markers on Safe Spots (Visual highlight) */}
      {Array.from(SAFE_SPOTS).map((spotIdx) => {
        const starX = DX[spotIdx] + 3.33;
        const starY = DY[spotIdx] + 3.33;
        return (
          <div
            key={`safe-${spotIdx}`}
            style={{
              left: `${starX}%`,
              top: `${starY}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute pointer-events-none text-yellow-400 text-xs sm:text-base font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
          >
            ★
          </div>
        );
      })}

      {/* Render All Tokens */}
      {renderedTokens.map(({ token, xPercent, yPercent, scale, xOffset, yOffset, isSelectable }) => (
        <TokenPiece
          key={`token-${token.playerIndex}-${token.id}`}
          token={token}
          xPercent={xPercent}
          yPercent={yPercent}
          scale={scale}
          xOffsetPercent={xOffset}
          yOffsetPercent={yOffset}
          isSelectable={isSelectable}
          onSelect={onTokenClick}
        />
      ))}
    </div>
  );
};
