import type {
  StoredPreferences,
  StoredSession,
  PlayerColor,
  VoiceEventId,
  EventVoiceSetting,
} from '../types/ludo';

const PREFS_KEY = 'rizz_dice_preferences_v1';
const SESSION_KEY = 'rizz_dice_active_session_v1';

export const DEFAULT_PLAYER_NAMES: Record<PlayerColor, string> = {
  red: 'Rizzler',
  green: 'Sigma',
  yellow: 'Chad',
  blue: 'Giga',
};

export const DEFAULT_EVENT_VOICE_CONFIG: Record<VoiceEventId, EventVoiceSetting> = {
  CAPTURE: { mode: 'default' },
  ROLL_SIX: { mode: 'default' },
  HOME: { mode: 'default' },
  VICTORY: { mode: 'default' },
};

export const DEFAULT_PREFERENCES: StoredPreferences = {
  version: 1,
  soundEnabled: true,
  musicEnabled: false,
  voiceEnabled: true,
  eventPlaybackEnabled: false, // User must explicitly enable event playback
  eventVoiceConfig: DEFAULT_EVENT_VOICE_CONFIG,
  lastSelectedPlayerCount: 4,
  lastSelectedGameMode: 'pass_and_play',
  defaultPlayerNames: DEFAULT_PLAYER_NAMES,
};

/**
 * Validates a loaded session object to ensure all required fields, players,
 * and token coordinates conform to the strict schema.
 */
function isValidSession(data: unknown): data is StoredSession {
  if (!data || typeof data !== 'object') return false;

  const s = data as Partial<StoredSession>;

  if (s.version !== 1) return false;
  if (s.gameState !== 'PLAYING' && s.gameState !== 'WINNER') return false;
  if (s.gameMode !== 'pass_and_play' && s.gameMode !== 'vs_computer') return false;
  if (s.playerCount !== 2 && s.playerCount !== 3 && s.playerCount !== 4) return false;

  if (!Array.isArray(s.players) || s.players.length !== s.playerCount) return false;

  for (const p of s.players) {
    if (typeof p.id !== 'number' || typeof p.name !== 'string') return false;
    if (!['red', 'green', 'yellow', 'blue'].includes(p.color)) return false;
    if (![1, 2, 3, 4].includes(p.position)) return false;
    if (typeof p.isBot !== 'boolean' || typeof p.hasWon !== 'boolean') return false;
    if (!Array.isArray(p.tokens) || p.tokens.length !== 4) return false;

    for (const t of p.tokens) {
      if (typeof t.id !== 'number' || t.id < 0 || t.id > 3) return false;
      if (t.color !== p.color || t.playerIndex !== p.id) return false;
      if (typeof t.isAlive !== 'boolean') return false;
      if (typeof t.currBlock !== 'number') return false;
      if (typeof t.numberOfSteps !== 'number' || t.numberOfSteps < 0 || t.numberOfSteps > 57) return false;
      if (typeof t.hasCompleted !== 'boolean') return false;
      if (typeof t.currWinnerBlock !== 'number') return false;
      if (typeof t.yardSlot !== 'number') return false;
    }
  }

  if (
    typeof s.activePlayerIndex !== 'number' ||
    s.activePlayerIndex < 0 ||
    s.activePlayerIndex >= s.players.length
  ) {
    return false;
  }

  if (typeof s.diceValue !== 'number' || s.diceValue < 1 || s.diceValue > 6) return false;
  if (typeof s.canRoll !== 'boolean') return false;
  if (typeof s.hasExtraChance !== 'boolean') return false;
  if (typeof s.consecutiveSixes !== 'number') return false;
  if (!Array.isArray(s.winners)) return false;

  return true;
}

class StorageManager {
  private memoryStore = new Map<string, string>();

  private getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Fallback to in-memory store
    }
    return this.memoryStore.get(key) || null;
  }

  private setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback to in-memory store
    }
    this.memoryStore.set(key, value);
  }

  private removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Fallback to in-memory store
    }
    this.memoryStore.delete(key);
  }

  public getPreferences(): StoredPreferences {
    try {
      const raw = this.getItem(PREFS_KEY);
      if (!raw) return DEFAULT_PREFERENCES;

      const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
      if (parsed.version !== 1) {
        return DEFAULT_PREFERENCES;
      }

      return {
        version: 1,
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        musicEnabled: typeof parsed.musicEnabled === 'boolean' ? parsed.musicEnabled : false,
        voiceEnabled: typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : true,
        eventPlaybackEnabled:
          typeof parsed.eventPlaybackEnabled === 'boolean' ? parsed.eventPlaybackEnabled : false,
        eventVoiceConfig: {
          ...DEFAULT_EVENT_VOICE_CONFIG,
          ...(parsed.eventVoiceConfig || {}),
        },
        lastSelectedPlayerCount:
          parsed.lastSelectedPlayerCount === 2 ||
          parsed.lastSelectedPlayerCount === 3 ||
          parsed.lastSelectedPlayerCount === 4
            ? parsed.lastSelectedPlayerCount
            : 4,
        lastSelectedGameMode:
          parsed.lastSelectedGameMode === 'vs_computer' ? 'vs_computer' : 'pass_and_play',
        defaultPlayerNames: {
          ...DEFAULT_PLAYER_NAMES,
          ...(parsed.defaultPlayerNames || {}),
        },
      };
    } catch (err) {
      console.warn('Failed to parse preferences from localStorage, using defaults:', err);
      return DEFAULT_PREFERENCES;
    }
  }

  public savePreferences(prefs: Partial<StoredPreferences>): void {
    try {
      const current = this.getPreferences();
      const updated: StoredPreferences = {
        ...current,
        ...prefs,
        version: 1,
        eventVoiceConfig: {
          ...current.eventVoiceConfig,
          ...(prefs.eventVoiceConfig || {}),
        },
        defaultPlayerNames: {
          ...current.defaultPlayerNames,
          ...(prefs.defaultPlayerNames || {}),
        },
      };
      this.setItem(PREFS_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Failed to save preferences to localStorage:', err);
    }
  }

  public getActiveSession(): StoredSession | null {
    try {
      const raw = this.getItem(SESSION_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (isValidSession(parsed)) {
        return parsed;
      }

      console.warn('Invalid or corrupted active session detected in localStorage, discarding safely.');
      this.clearActiveSession();
      return null;
    } catch (err) {
      console.warn('Failed to parse active session from localStorage, discarding:', err);
      this.clearActiveSession();
      return null;
    }
  }

  public saveActiveSession(session: Omit<StoredSession, 'version' | 'timestamp'>): void {
    try {
      const payload: StoredSession = {
        ...session,
        version: 1,
        timestamp: Date.now(),
      };
      this.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to save active session to localStorage:', err);
    }
  }

  public clearActiveSession(): void {
    try {
      this.removeItem(SESSION_KEY);
    } catch {
      // Ignored
    }
  }

  public resetAllPreferences(): StoredPreferences {
    try {
      this.removeItem(PREFS_KEY);
      this.removeItem(SESSION_KEY);
    } catch {
      // Ignored
    }
    return DEFAULT_PREFERENCES;
  }
}

export const storageManager = new StorageManager();
