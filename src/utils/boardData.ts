import type { PlayerColor, PositionIndex } from '../types/ludo';

/**
 * Normalized percentage coordinates extracted from MainActivity.java (lines 79-82).
 * 0..51: 52 cells along the perimeter track
 * 52..57: Green Home stretch
 * 58..63: Yellow Home stretch
 * 64..69: Blue Home stretch
 * 70..75: Red Home stretch
 */
export const DX: readonly number[] = [
  53.32, 53.32, 53.32, 53.32, 53.32, 60.04, 66.7, 73.36, 80.02, 86.68, 93.34, 93.34, 93.34, 86.68, 80.02, 73.36, 66.7, 60.04, 53.32, 53.32, 53.32, 53.32, 53.32, 53.32, 46.66, 40, 40, 40, 40, 40, 40,
  33.34, 26.68, 20.02, 13.36, 6.7, 0.04, 0.04, 0.04, 6.7, 13.36, 20.02, 26.68, 33.34, 40, 40, 40, 40, 40, 40, 46.66, 53.32, 46.66, 46.66, 46.66, 46.66, 46.66, 46.66, 86.68, 80.02, 73.36, 66.7, 60.04, 53.38, 46.66, 46.66, 46.66, 46.66, 46.66, 46.66, 6.66, 13.32, 19.98, 26.64, 33.3, 39.96
];

export const DY: readonly number[] = [
  6.66, 13.32, 19.98, 26.64, 33.3, 40, 40, 40, 40, 40, 40, 46.66, 53.32, 53.32, 53.32, 53.32, 53.32, 53.32, 60.04, 66.7, 73.36, 80.02, 86.68, 93.34, 93.34, 93.34, 86.68, 80.02, 73.36, 66.7, 60.04,
  53.32, 53.32, 53.32, 53.32, 53.32, 53.32, 46.66, 40, 40, 40, 40, 40, 40, 33.34, 26.68, 20.02, 13.36, 6.7, 0.04, 0.04, 0.04, 6.66, 13.32, 19.98, 26.64, 33.3, 39.96, 46.66, 46.66, 46.66, 46.66, 46.66, 46.66, 86.68, 80.02, 73.36, 66.7, 60.04, 53.38, 46.66, 46.66, 46.66, 46.66, 46.66, 46.66
];

/** Safe cells on the perimeter where tokens cannot be captured */
export const SAFE_SPOTS: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export interface ColorConfig {
  color: PlayerColor;
  name: string;
  position: PositionIndex;
  startPosition: number;
  endPosition: number;
  winnerBlocks: readonly number[];
  yardSlots: readonly { x: number; y: number }[];
  pawnImage: string;
  accentHex: string;
  bgHex: string;
}

export const COLOR_CONFIGS: Record<PlayerColor, ColorConfig> = {
  red: {
    color: 'red',
    name: 'Red',
    position: 1, // Top-Left
    startPosition: 39,
    endPosition: 37,
    winnerBlocks: [70, 71, 72, 73, 74, 75],
    yardSlots: [
      { x: 13.5, y: 13.5 },
      { x: 26.5, y: 13.5 },
      { x: 13.5, y: 26.5 },
      { x: 26.5, y: 26.5 },
    ],
    pawnImage: '/images/redpiece.png',
    accentHex: '#e53935',
    bgHex: '#ef5350',
  },
  green: {
    color: 'green',
    name: 'Green',
    position: 2, // Top-Right
    startPosition: 0,
    endPosition: 50,
    winnerBlocks: [52, 53, 54, 55, 56, 57],
    yardSlots: [
      { x: 73.5, y: 13.5 },
      { x: 86.5, y: 13.5 },
      { x: 73.5, y: 26.5 },
      { x: 86.5, y: 26.5 },
    ],
    pawnImage: '/images/greenpiece.png',
    accentHex: '#43a047',
    bgHex: '#66bb6a',
  },
  yellow: {
    color: 'yellow',
    name: 'Yellow',
    position: 4, // Bottom-Right
    startPosition: 13,
    endPosition: 11,
    winnerBlocks: [58, 59, 60, 61, 62, 63],
    yardSlots: [
      { x: 73.5, y: 73.5 },
      { x: 86.5, y: 73.5 },
      { x: 73.5, y: 86.5 },
      { x: 86.5, y: 86.5 },
    ],
    pawnImage: '/images/yellowpiece.png',
    accentHex: '#fbc02d',
    bgHex: '#ffee58',
  },
  blue: {
    color: 'blue',
    name: 'Blue',
    position: 3, // Bottom-Left
    startPosition: 26,
    endPosition: 24,
    winnerBlocks: [64, 65, 66, 67, 68, 69],
    yardSlots: [
      { x: 13.5, y: 73.5 },
      { x: 26.5, y: 73.5 },
      { x: 13.5, y: 86.5 },
      { x: 26.5, y: 86.5 },
    ],
    pawnImage: '/images/bluepiece.png',
    accentHex: '#1e88e5',
    bgHex: '#42a5f5',
  },
};

/** Get home stretch cells for a given end position */
export function getWinnerBlocks(endPosition: number): readonly number[] {
  switch (endPosition) {
    case 50:
      return COLOR_CONFIGS.green.winnerBlocks;
    case 11:
      return COLOR_CONFIGS.yellow.winnerBlocks;
    case 24:
      return COLOR_CONFIGS.blue.winnerBlocks;
    case 37:
      return COLOR_CONFIGS.red.winnerBlocks;
    default:
      return COLOR_CONFIGS.green.winnerBlocks;
  }
}
