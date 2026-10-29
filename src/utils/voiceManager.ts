import type {
  VoiceEventId,
  EventVoiceSetting,
  VoiceClipItem,
  PlayerColor,
} from '../types/ludo';
import { storageManager } from './storageManager';

export const SYSTEM_DEFAULT_SOUNDS: Record<VoiceEventId, { name: string; url: string }> = {
  CAPTURE: { name: 'Elimination Sound', url: '/audio/death.mp3' },
  ROLL_SIX: { name: 'Dice Roll Chime', url: '/audio/diceroll.mp3' },
  HOME: { name: 'Home Horn Fanfare', url: '/audio/panta.mp3' },
  VICTORY: { name: 'Victory Celebration', url: '/audio/congratulations.mp3' },
};

export const AVAILABLE_AUDIO_CLIPS: VoiceClipItem[] = [
  {
    id: 'sfx_death',
    name: 'Token Cut / Elimination',
    category: 'Combat',
    url: '/audio/death.mp3',
    duration: '0:01',
  },
  {
    id: 'sfx_panta',
    name: 'Home Goal Celebration',
    category: 'Goal',
    url: '/audio/panta.mp3',
    duration: '0:02',
  },
  {
    id: 'sfx_congrats',
    name: 'Victory Fanfare',
    category: 'Victory',
    url: '/audio/congratulations.mp3',
    duration: '0:06',
  },
  {
    id: 'sfx_diceroll',
    name: 'Rapid Dice Roll',
    category: 'Dice',
    url: '/audio/diceroll.mp3',
    duration: '0:01',
  },
  {
    id: 'sfx_safe',
    name: 'Safe Spot Shield',
    category: 'Zone',
    url: '/audio/safe.mp3',
    duration: '0:01',
  },
  {
    id: 'sfx_gamestart',
    name: 'Match Start Gong',
    category: 'Game',
    url: '/audio/gamestartsound.mp3',
    duration: '0:02',
  },
  {
    id: 'sfx_step',
    name: 'Pawn Stride',
    category: 'Move',
    url: '/audio/step.mp3',
    duration: '0:01',
  },
  {
    id: 'sfx_click',
    name: 'Tactile Interface Click',
    category: 'UI',
    url: '/audio/click.mp3',
    duration: '0:01',
  },
];

class VoiceManager {
  private isVoiceOn = true;
  private eventPlaybackEnabled = false;
  private eventConfig: Record<VoiceEventId, EventVoiceSetting> = {
    CAPTURE: { mode: 'default' },
    ROLL_SIX: { mode: 'default' },
    HOME: { mode: 'default' },
    VICTORY: { mode: 'default' },
  };

  private activeAudio: HTMLAudioElement | null = null;
  private currentlyPlayingClipId: string | null = null;
  private lastEventTime = 0;
  private cooldownMs = 2200;
  private playStateListeners: Set<(clipId: string | null) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      const prefs = storageManager.getPreferences();
      this.isVoiceOn = prefs.voiceEnabled;
      this.eventPlaybackEnabled = prefs.eventPlaybackEnabled;
      this.eventConfig = prefs.eventVoiceConfig;
    }
  }

  public setVoiceEnabled(enabled: boolean) {
    this.isVoiceOn = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  public getVoiceEnabled(): boolean {
    return this.isVoiceOn;
  }

  public setEventPlaybackEnabled(enabled: boolean) {
    this.eventPlaybackEnabled = enabled;
    storageManager.savePreferences({ eventPlaybackEnabled: enabled });
  }

  public getEventPlaybackEnabled(): boolean {
    return this.eventPlaybackEnabled;
  }

  public setEventConfig(config: Record<VoiceEventId, EventVoiceSetting>) {
    this.eventConfig = config;
    storageManager.savePreferences({ eventVoiceConfig: config });
  }

  public getEventConfig(): Record<VoiceEventId, EventVoiceSetting> {
    return this.eventConfig;
  }

  public subscribePlayState(listener: (clipId: string | null) => void): () => void {
    this.playStateListeners.add(listener);
    return () => {
      this.playStateListeners.delete(listener);
    };
  }

  private notifyPlayState(clipId: string | null) {
    this.currentlyPlayingClipId = clipId;
    this.playStateListeners.forEach((l) => {
      try {
        l(clipId);
      } catch {
        // Ignored
      }
    });
  }

  public stop() {
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {
        // Ignored
      }
      this.activeAudio = null;
    }
    this.notifyPlayState(null);
  }

  /**
   * Manual playback of any clip from the soundboard.
   * Completely independent of turns, player, or game state.
   */
  public playManual(clip: VoiceClipItem) {
    if (!this.isVoiceOn) return;

    this.stop();

    try {
      const audio = new Audio(clip.url);
      audio.volume = 0.9;
      this.activeAudio = audio;
      this.notifyPlayState(clip.id);

      audio.onended = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
          this.notifyPlayState(null);
        }
      };

      audio.onerror = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
          this.notifyPlayState(null);
        }
      };

      audio.play().catch(() => {
        this.notifyPlayState(null);
      });
    } catch {
      this.notifyPlayState(null);
    }
  }

  /**
   * Play preview for an event's currently configured setting
   */
  public previewEvent(eventId: VoiceEventId) {
    if (!this.isVoiceOn) return;

    const setting = this.eventConfig[eventId];
    if (setting?.mode === 'custom' && setting.customClipId) {
      const clip = AVAILABLE_AUDIO_CLIPS.find((c) => c.id === setting.customClipId);
      if (clip) {
        this.playManual(clip);
        return;
      }
    }

    // Default preview
    const defaultSound = SYSTEM_DEFAULT_SOUNDS[eventId];
    if (defaultSound) {
      this.playManual({
        id: `preview_${eventId}`,
        name: defaultSound.name,
        category: 'Preview',
        url: defaultSound.url,
      });
    }
  }

  /**
   * Trigger an event voice reaction IF event playback is enabled by user.
   */
  public handleGameEvent(eventId: VoiceEventId, _playerColor?: PlayerColor) {
    // 1. Guard against voice mute or disabled event playback
    if (!this.isVoiceOn || !this.eventPlaybackEnabled) {
      return;
    }

    // 2. Enforce anti-spam cooldown between event reactions
    const now = Date.now();
    if (eventId !== 'VICTORY' && now - this.lastEventTime < this.cooldownMs) {
      return;
    }
    this.lastEventTime = now;

    const setting = this.eventConfig[eventId] || { mode: 'default' };

    let urlToPlay: string | null = null;
    let clipIdToTrack: string = `event_${eventId}`;

    if (setting.mode === 'custom' && setting.customClipId) {
      const customClip = AVAILABLE_AUDIO_CLIPS.find((c) => c.id === setting.customClipId);
      if (customClip) {
        urlToPlay = customClip.url;
        clipIdToTrack = customClip.id;
      }
    }

    // Fall back to system default sound if no custom clip found or mode is 'default'
    if (!urlToPlay) {
      urlToPlay = SYSTEM_DEFAULT_SOUNDS[eventId]?.url || null;
    }

    if (!urlToPlay) return;

    this.stop();

    try {
      const audio = new Audio(urlToPlay);
      audio.volume = 0.85;
      this.activeAudio = audio;
      this.notifyPlayState(clipIdToTrack);

      audio.onended = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
          this.notifyPlayState(null);
        }
      };

      audio.onerror = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
          this.notifyPlayState(null);
        }
      };

      audio.play().catch(() => {
        this.notifyPlayState(null);
      });
    } catch {
      this.notifyPlayState(null);
    }
  }

  public getCurrentlyPlayingClipId(): string | null {
    return this.currentlyPlayingClipId;
  }
}

export const voices = new VoiceManager();
