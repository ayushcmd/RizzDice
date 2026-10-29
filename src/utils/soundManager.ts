class SoundManager {
  private isSoundOn = true;
  private isMusicOn = false;
  private musicAudio: HTMLAudioElement | null = null;
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  constructor() {
    // Preload audio on first user interaction if in browser
    if (typeof window !== 'undefined') {
      this.initSounds();
    }
  }

  private initSounds() {
    const soundFiles = [
      'diceroll',
      'step',
      'safe',
      'death',
      'panta',
      'congratulations',
      'gamestartsound',
      'click',
    ];

    soundFiles.forEach((name) => {
      try {
        const audio = new Audio(`/audio/${name}.mp3`);
        audio.preload = 'auto';
        this.audioCache.set(name, audio);
      } catch {
        // Audio not allowed yet
      }
    });

    try {
      this.musicAudio = new Audio('/audio/music.mp3');
      this.musicAudio.loop = true;
      this.musicAudio.volume = 0.35;
    } catch {
      // Ignored
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.isSoundOn = enabled;
  }

  public getSoundEnabled(): boolean {
    return this.isSoundOn;
  }

  public setMusicEnabled(enabled: boolean) {
    this.isMusicOn = enabled;
    if (this.musicAudio) {
      if (enabled) {
        this.musicAudio.play().catch(() => {});
      } else {
        this.musicAudio.pause();
      }
    }
  }

  public getMusicEnabled(): boolean {
    return this.isMusicOn;
  }

  public play(name: string) {
    if (!this.isSoundOn) return;

    try {
      const cached = this.audioCache.get(name);
      if (cached) {
        // Clone node or reset time to allow overlapping rapid sounds (like stepping)
        cached.currentTime = 0;
        cached.play().catch(() => {});
      } else {
        const audio = new Audio(`/audio/${name}.mp3`);
        audio.play().catch(() => {});
      }
    } catch {
      // Browser autoplay policy might block before user gesture
    }
  }

  public playStep() {
    if (!this.isSoundOn) return;
    try {
      const audio = new Audio('/audio/step.mp3');
      audio.volume = 0.8;
      audio.currentTime = 0.12; // Matches MainActivity.java: seekTo(120)
      audio.play().catch(() => {});
    } catch {
      // Ignored
    }
  }
}

export const sounds = new SoundManager();
