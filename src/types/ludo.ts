export type PlayerColor = 'red' | 'green' | 'yellow' | 'blue';

export type PositionIndex = 1 | 2 | 3 | 4;

export type GameMode = 'pass_and_play' | 'vs_computer';

export interface Token {
  id: number; // 0..3 for each player
  color: PlayerColor;
  playerIndex: number;
  isAlive: boolean; // false = in yard/home base, true = on board track/stretch
  currBlock: number; // -1 if in yard, 0..51 on outer track, 52..75 in home stretches
  numberOfSteps: number; // 0..57 (57 = reached home center / panta)
  hasCompleted: boolean; // reached destination
  currWinnerBlock: number; // index into winnerBlocks (0..5)
  yardSlot: number; // 0..3 index in base
}

export interface Player {
  id: number;
  name: string;
  color: PlayerColor;
  position: PositionIndex; // 1 = Top-Left (Red), 2 = Top-Right (Green), 4 = Bottom-Right (Yellow), 3 = Bottom-Left (Blue)
  isBot: boolean;
  tokens: Token[];
  hasWon: boolean;
  rank?: number;
}

export interface WinnerRecord {
  player: Player;
  rank: number;
}

// Configurable Event Reactions
export type VoiceEventId = 'CAPTURE' | 'ROLL_SIX' | 'HOME' | 'VICTORY';

export type EventVoiceMode = 'default' | 'custom';

export interface EventVoiceSetting {
  mode: EventVoiceMode;
  customClipId?: string;
}

export interface VoiceClipItem {
  id: string;
  name: string;
  category: string;
  url: string;
  duration?: string;
}

export interface GameSettings {
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
  eventPlaybackEnabled: boolean;
  eventVoiceConfig: Record<VoiceEventId, EventVoiceSetting>;
}

export interface StoredPreferences {
  version: 1;
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
  eventPlaybackEnabled: boolean;
  eventVoiceConfig: Record<VoiceEventId, EventVoiceSetting>;
  lastSelectedPlayerCount: 2 | 3 | 4;
  lastSelectedGameMode: GameMode;
  defaultPlayerNames: Record<PlayerColor, string>;
}

export interface StoredSession {
  version: 1;
  gameState: 'PLAYING' | 'WINNER';
  gameMode: GameMode;
  playerCount: 2 | 3 | 4;
  players: Player[];
  activePlayerIndex: number;
  diceValue: number;
  canRoll: boolean;
  hasExtraChance: boolean;
  consecutiveSixes: number;
  winners: WinnerRecord[];
  timestamp: number;
}
