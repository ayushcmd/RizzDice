import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Sliders,
  Radio,
  X,
  Swords,
  Dice5,
  Flag,
  Trophy,
} from 'lucide-react';
import type {
  VoiceEventId,
  EventVoiceSetting,
  VoiceClipItem,
} from '../../types/ludo';
import {
  voices,
  AVAILABLE_AUDIO_CLIPS,
  SYSTEM_DEFAULT_SOUNDS,
} from '../../utils/voiceManager';

interface VoiceSoundboardModalProps {
  isOpen: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onClose: () => void;
}

export const VoiceSoundboardModal: React.FC<VoiceSoundboardModalProps> = ({
  isOpen,
  voiceEnabled,
  onToggleVoice,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'soundboard' | 'config'>('soundboard');
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);

  // Config state
  const [eventPlaybackEnabled, setEventPlaybackEnabled] = useState(() =>
    voices.getEventPlaybackEnabled()
  );
  const [eventConfig, setEventConfig] = useState<Record<VoiceEventId, EventVoiceSetting>>(() =>
    voices.getEventConfig()
  );

  // Subscribe to voice manager playing state
  useEffect(() => {
    const unsub = voices.subscribePlayState((id) => {
      setPlayingClipId(id);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const handlePlayClip = (clip: VoiceClipItem) => {
    if (playingClipId === clip.id) {
      voices.stop();
    } else {
      voices.playManual(clip);
    }
  };

  const handleToggleEventPlayback = () => {
    const next = !eventPlaybackEnabled;
    setEventPlaybackEnabled(next);
    voices.setEventPlaybackEnabled(next);
  };

  const handleModeChange = (eventId: VoiceEventId, mode: 'default' | 'custom') => {
    const updated = {
      ...eventConfig,
      [eventId]: {
        ...eventConfig[eventId],
        mode,
        customClipId: eventConfig[eventId]?.customClipId || AVAILABLE_AUDIO_CLIPS[0]?.id,
      },
    };
    setEventConfig(updated);
    voices.setEventConfig(updated);
  };

  const handleCustomClipChange = (eventId: VoiceEventId, customClipId: string) => {
    const updated = {
      ...eventConfig,
      [eventId]: {
        mode: 'custom' as const,
        customClipId,
      },
    };
    setEventConfig(updated);
    voices.setEventConfig(updated);
  };

  const eventMetadata: Array<{
    id: VoiceEventId;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'CAPTURE',
      title: 'Token Captured',
      description: 'Triggered when cutting an enemy piece',
      icon: Swords,
    },
    {
      id: 'ROLL_SIX',
      title: 'Rolling a Six',
      description: 'Triggered upon rolling a maximum six',
      icon: Dice5,
    },
    {
      id: 'HOME',
      title: 'Token Reaches Home',
      description: 'Triggered when completing the 57-step track',
      icon: Flag,
    },
    {
      id: 'VICTORY',
      title: 'Victory Royale',
      description: 'Triggered when a player wins the match',
      icon: Trophy,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#161616]/95 border border-white/[0.12] rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] text-[#F5F5F5] flex flex-col overflow-hidden backdrop-blur-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#E9BC42]/15 border border-[#E9BC42]/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#E9BC42]" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-base sm:text-lg font-black tracking-wide text-[#F5F5F5] uppercase">
                Voice Reactions
              </h3>
              <span className="text-[11px] font-bold tracking-widest text-[#A3A3A3] uppercase">
                Soundboard & Event Settings
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleVoice}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                voiceEnabled
                  ? 'bg-[#E9BC42]/15 border-[#E9BC42]/40 text-[#E9BC42]'
                  : 'bg-white/[0.04] border-white/[0.10] text-[#A3A3A3]'
              }`}
              title="Mute / Unmute Voice Audio"
            >
              {voiceEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Unmuted</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Muted</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                voices.stop();
                onClose();
              }}
              className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] transition text-[#A3A3A3] hover:text-[#F5F5F5] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-2 p-2 bg-[#111111]/90 border-b border-white/[0.08] text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('soundboard')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'soundboard'
                ? 'bg-white/[0.08] text-[#E9BC42] border border-[#E9BC42]/30 shadow'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Radio className="w-4 h-4" />
            Manual Soundboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'config'
                ? 'bg-white/[0.08] text-[#E9BC42] border border-[#E9BC42]/30 shadow'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Event Voice Triggers
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'soundboard' ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-[#A3A3A3]">
                  Tap any audio clip to play on-demand. Manual playback does not alter turns or gameplay.
                </span>
                {playingClipId && (
                  <button
                    type="button"
                    onClick={() => voices.stop()}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1 hover:bg-rose-500/30 transition cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                )}
              </div>

              {/* Soundboard Clips Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AVAILABLE_AUDIO_CLIPS.map((clip) => {
                  const isPlaying = playingClipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isPlaying
                          ? 'bg-[#E9BC42]/10 border-[#E9BC42]/50 shadow-[0_0_15px_rgba(233,188,66,0.2)]'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.08]'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-xs font-bold text-[#F5F5F5] truncate">
                          {clip.name}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-white/[0.06] text-[#A3A3A3] uppercase">
                            {clip.category}
                          </span>
                          {clip.duration && (
                            <span className="text-[10px] text-[#A3A3A3]">
                              {clip.duration}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePlayClip(clip)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition shrink-0 cursor-pointer ${
                          isPlaying
                            ? 'bg-[#E9BC42] text-black shadow-md'
                            : 'bg-white/[0.08] hover:bg-white/[0.15] text-[#F5F5F5]'
                        }`}
                        title={isPlaying ? 'Stop' : 'Play audio'}
                      >
                        {isPlaying ? (
                          <Square className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Notice for adding custom clips */}
              <div className="mt-5 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <Sparkles className="w-4 h-4 text-[#E9BC42] shrink-0 mt-0.5" />
                <div className="flex flex-col text-[11px] text-[#A3A3A3]">
                  <span className="font-bold text-[#F5F5F5]">
                    Custom Voice Library Ready
                  </span>
                  <span>
                    Additional funny Gen-Z audio clips can be placed into{' '}
                    <code className="text-[#E9BC42]">public/audio/voices/</code>. They will be detected
                    and made available for soundboard playback and event binding.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Master Event Playback Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-[#F5F5F5]">
                    Event Voice Reactions
                  </span>
                  <span className="text-[11px] text-[#A3A3A3]">
                    Automatically play assigned voice reactions when events occur in gameplay
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleEventPlayback}
                  className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition cursor-pointer ${
                    eventPlaybackEnabled
                      ? 'bg-[#E9BC42] text-black shadow-md'
                      : 'bg-white/[0.08] text-[#A3A3A3]'
                  }`}
                >
                  {eventPlaybackEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {!eventPlaybackEnabled && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-[#E9BC42]/90">
                  ⚠️ Event playback is currently disabled. Game sound effects (dice rolls, steps, safe spots) continue as normal, and no automatic reactions will play until enabled.
                </div>
              )}

              {/* 4 Event Cards */}
              <div className="space-y-3">
                {eventMetadata.map(({ id, title, description, icon: IconComponent }) => {
                  const currentSetting = eventConfig[id] || { mode: 'default' };
                  const isDefault = currentSetting.mode === 'default';

                  return (
                    <div
                      key={id}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-[#E9BC42]/10 border border-[#E9BC42]/25 flex items-center justify-center text-[#E9BC42]">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-[#F5F5F5]">{title}</span>
                            <span className="text-[10px] text-[#A3A3A3]">{description}</span>
                          </div>
                        </div>

                        {/* Mode Segmented Control: System Default vs Custom */}
                        <div className="flex p-0.5 rounded-xl bg-black/40 border border-white/[0.08] text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => handleModeChange(id, 'default')}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                              isDefault
                                ? 'bg-white/[0.12] text-[#E9BC42]'
                                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
                            }`}
                          >
                            System Default
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModeChange(id, 'custom')}
                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                              !isDefault
                                ? 'bg-white/[0.12] text-[#E9BC42]'
                                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
                            }`}
                          >
                            Custom Voice
                          </button>
                        </div>
                      </div>

                      {/* Detail row */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                        {isDefault ? (
                          <div className="flex items-center gap-2 text-xs text-[#A3A3A3]">
                            <span className="font-semibold text-[11px]">Assigned Sound:</span>
                            <span className="text-[#F5F5F5] font-bold">
                              {SYSTEM_DEFAULT_SOUNDS[id]?.name || 'Standard Audio'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs flex-1 mr-3">
                            <span className="font-semibold text-[11px] text-[#A3A3A3] shrink-0">
                              Selected Clip:
                            </span>
                            <select
                              value={currentSetting.customClipId || AVAILABLE_AUDIO_CLIPS[0]?.id}
                              onChange={(e) => handleCustomClipChange(id, e.target.value)}
                              className="bg-black/60 border border-white/[0.15] text-[#F5F5F5] text-xs rounded-xl px-2.5 py-1 w-full max-w-[240px] focus:outline-none focus:border-[#E9BC42]"
                            >
                              {AVAILABLE_AUDIO_CLIPS.map((clip) => (
                                <option key={clip.id} value={clip.id} className="bg-[#191919]">
                                  {clip.name} ({clip.category})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Preview button */}
                        <button
                          type="button"
                          onClick={() => voices.previewEvent(id)}
                          className="px-2.5 py-1 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#E9BC42] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          title="Preview assigned audio"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between text-xs text-[#A3A3A3]">
          <span>Classy Apple Glassmorphism • Audio Control Center</span>
          <button
            type="button"
            onClick={() => {
              voices.stop();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-[#E9BC42] hover:bg-[#d8ab33] text-black font-bold text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
