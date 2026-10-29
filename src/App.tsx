import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Player,
  Token,
  GameMode,
  WinnerRecord,
  PlayerColor,
  PositionIndex,
  StoredSession,
} from './types/ludo';
import { COLOR_CONFIGS, SAFE_SPOTS } from './utils/boardData';
import { sounds } from './utils/soundManager';
import { voices } from './utils/voiceManager';
import { storageManager } from './utils/storageManager';
import { chooseBotMove, canTokenMove, getStepSequence } from './utils/botAI';
import { StartMenu } from './components/Home/StartMenu';
import { LudoBoard } from './components/Board/LudoBoard';
import { DicePad } from './components/Controls/DicePad';
import { MenuModal } from './components/Modals/MenuModal';
import { WinnerModal } from './components/Modals/WinnerModal';
import { VoiceSoundboardModal } from './components/Modals/VoiceSoundboardModal';
import { Settings, RotateCcw, Sparkles } from 'lucide-react';

function createPlayer(
  id: number,
  name: string,
  color: PlayerColor,
  position: PositionIndex,
  isBot: boolean
): Player {
  const tokens: Token[] = [0, 1, 2, 3].map((slot) => ({
    id: slot,
    color,
    playerIndex: id,
    isAlive: false,
    currBlock: -1,
    numberOfSteps: 0,
    hasCompleted: false,
    currWinnerBlock: 0,
    yardSlot: slot,
  }));

  return {
    id,
    name,
    color,
    position,
    isBot,
    tokens,
    hasWon: false,
  };
}

export function App() {
  // Load preferences and any saved active match session from local storage
  const initialPreferences = storageManager.getPreferences();
  const initialSession = storageManager.getActiveSession();
  const hasValidActiveMatch = Boolean(
    initialSession &&
    initialSession.gameState === 'PLAYING' &&
    Array.isArray(initialSession.players) &&
    initialSession.players.length >= 2
  );

  const [preferences, setPreferences] = useState(() => initialPreferences);
  const [activeSession, setActiveSession] = useState<StoredSession | null>(() => initialSession);

  // Directly resume match on refresh if an active match was in progress
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'WINNER'>(() =>
    hasValidActiveMatch ? 'PLAYING' : 'MENU'
  );

  const [currentGameMode, setCurrentGameMode] = useState<GameMode>(() =>
    hasValidActiveMatch && initialSession
      ? initialSession.gameMode
      : initialPreferences.lastSelectedGameMode || 'pass_and_play'
  );

  const [players, setPlayers] = useState<Player[]>(() =>
    hasValidActiveMatch && initialSession ? initialSession.players : []
  );

  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(() =>
    hasValidActiveMatch && initialSession ? initialSession.activePlayerIndex : 0
  );

  const [diceValue, setDiceValue] = useState<number>(() =>
    hasValidActiveMatch && initialSession ? initialSession.diceValue : 6
  );

  const [isRolling, setIsRolling] = useState(false);

  const [canRoll, setCanRoll] = useState<boolean>(() =>
    hasValidActiveMatch && initialSession ? initialSession.canRoll : true
  );

  const [hasExtraChance, setHasExtraChance] = useState<boolean>(() =>
    hasValidActiveMatch && initialSession ? initialSession.hasExtraChance : false
  );

  const [consecutiveSixes, setConsecutiveSixes] = useState<number>(() =>
    hasValidActiveMatch && initialSession ? initialSession.consecutiveSixes || 0 : 0
  );

  const [winners, setWinners] = useState<WinnerRecord[]>(() =>
    hasValidActiveMatch && initialSession ? initialSession.winners || [] : []
  );

  // If match was saved mid-turn waiting for token selection (!canRoll), restore selectable tokens
  const [selectableTokens, setSelectableTokens] = useState<Token[]>(() => {
    if (hasValidActiveMatch && initialSession && !initialSession.canRoll) {
      const activeP = initialSession.players[initialSession.activePlayerIndex];
      if (activeP && !activeP.isBot) {
        return activeP.tokens.filter((t) => canTokenMove(t, initialSession.diceValue));
      }
    }
    return [];
  });

  // Active reaction badges per player station
  const [activeReactions, setActiveReactions] = useState<
    Partial<Record<PlayerColor, { badge: string; text: string }>>
  >({});

  // Audio & Modal states
  const [soundEnabled, setSoundEnabled] = useState(preferences.soundEnabled);
  const [musicEnabled, setMusicEnabled] = useState(preferences.musicEnabled);
  const [voiceEnabled, setVoiceEnabled] = useState(preferences.voiceEnabled);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSoundboardOpen, setIsSoundboardOpen] = useState(false);

  // References to prevent race conditions during rapid clicks or bot turns
  const isTurnProcessingRef = useRef(false);
  const playersRef = useRef<Player[]>([]);
  const activePlayerIndexRef = useRef(0);

  // Sync refs with state
  useEffect(() => {
    playersRef.current = players;
    activePlayerIndexRef.current = activePlayerIndex;
  }, [players, activePlayerIndex]);

  const activePlayer = players[activePlayerIndex] || null;

  // Initialize sounds and voice configuration
  useEffect(() => {
    sounds.setSoundEnabled(soundEnabled);
    sounds.setMusicEnabled(musicEnabled);
    voices.setVoiceEnabled(voiceEnabled);
  }, [soundEnabled, musicEnabled, voiceEnabled]);

  // Helper to trigger reaction badge on a player station
  const triggerReactionBadge = useCallback((color: PlayerColor, badge: string, text: string) => {
    setActiveReactions((prev) => ({
      ...prev,
      [color]: { badge, text },
    }));

    setTimeout(() => {
      setActiveReactions((prev) => {
        const next = { ...prev };
        delete next[color];
        return next;
      });
    }, 2800);
  }, []);

  // Save session changes to local storage whenever game progresses
  useEffect(() => {
    if (gameState === 'PLAYING' && players.length >= 2) {
      const sessionData = {
        gameState,
        gameMode: currentGameMode,
        playerCount: players.length as 2 | 3 | 4,
        players,
        activePlayerIndex,
        diceValue,
        canRoll,
        hasExtraChance,
        consecutiveSixes,
        winners,
      };
      storageManager.saveActiveSession(sessionData);
    }
  }, [
    gameState,
    players,
    activePlayerIndex,
    diceValue,
    canRoll,
    hasExtraChance,
    consecutiveSixes,
    winners,
    currentGameMode,
  ]);

  // Audio toggles
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.setSoundEnabled(next);
    storageManager.savePreferences({ soundEnabled: next });
  };

  const handleToggleMusic = () => {
    const next = !musicEnabled;
    setMusicEnabled(next);
    sounds.setMusicEnabled(next);
    storageManager.savePreferences({ musicEnabled: next });
  };

  const handleToggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    voices.setVoiceEnabled(next);
    storageManager.savePreferences({ voiceEnabled: next });
  };

  // Start match initialization
  const handleStartGame = (
    mode: GameMode,
    playerCount: 2 | 3 | 4,
    botCount: number,
    playerNames: string[]
  ) => {
    let newPlayers: Player[] = [];

    if (playerCount === 2) {
      // 2 Players: Opposite corners (Red vs Yellow)
      newPlayers = [
        createPlayer(0, playerNames[0] || 'Rizzler', 'red', 1, false),
        createPlayer(1, playerNames[1] || 'Chad', 'yellow', 4, botCount > 0),
      ];
    } else if (playerCount === 3) {
      // 3 Players: Red -> Green -> Yellow
      newPlayers = [
        createPlayer(0, playerNames[0] || 'Rizzler', 'red', 1, false),
        createPlayer(1, playerNames[1] || 'Sigma', 'green', 2, botCount >= 2),
        createPlayer(2, playerNames[2] || 'Chad', 'yellow', 4, botCount >= 1),
      ];
    } else {
      // 4 Players: Red -> Green -> Yellow -> Blue (Clockwise)
      newPlayers = [
        createPlayer(0, playerNames[0] || 'Rizzler', 'red', 1, false),
        createPlayer(1, playerNames[1] || 'Sigma', 'green', 2, botCount >= 3),
        createPlayer(2, playerNames[2] || 'Chad', 'yellow', 4, botCount >= 2),
        createPlayer(3, playerNames[3] || 'Giga', 'blue', 3, botCount >= 1),
      ];
    }

    setCurrentGameMode(mode);
    setPlayers(newPlayers);
    setActivePlayerIndex(0);
    setDiceValue(6);
    setCanRoll(true);
    setIsRolling(false);
    setHasExtraChance(false);
    setConsecutiveSixes(0);
    setSelectableTokens([]);
    setWinners([]);
    setGameState('PLAYING');
    isTurnProcessingRef.current = false;

    // Immediately persist initial active session
    storageManager.saveActiveSession({
      gameState: 'PLAYING',
      gameMode: mode,
      playerCount,
      players: newPlayers,
      activePlayerIndex: 0,
      diceValue: 6,
      canRoll: true,
      hasExtraChance: false,
      consecutiveSixes: 0,
      winners: [],
    });

    // Save preferences
    storageManager.savePreferences({
      lastSelectedGameMode: mode,
      lastSelectedPlayerCount: playerCount,
    });
  };

  // Resume saved session from local storage
  const handleResumeSession = (session: StoredSession) => {
    setCurrentGameMode(session.gameMode);
    setPlayers(session.players);
    setActivePlayerIndex(session.activePlayerIndex);
    setDiceValue(session.diceValue);
    setCanRoll(session.canRoll);
    setIsRolling(false);
    setHasExtraChance(session.hasExtraChance);
    setConsecutiveSixes(session.consecutiveSixes || 0);
    setWinners(session.winners);
    // If waiting for token move, recompute selectable tokens
    if (!session.canRoll) {
      const activeP = session.players[session.activePlayerIndex];
      if (activeP && !activeP.isBot) {
        setSelectableTokens(activeP.tokens.filter((t) => canTokenMove(t, session.diceValue)));
      } else {
        setSelectableTokens([]);
      }
    } else {
      setSelectableTokens([]);
    }
    setGameState('PLAYING');
    isTurnProcessingRef.current = false;
  };

  // Turn switching: calculates next active player in clockwise order
  const switchPlayers = useCallback((customPlayersList?: Player[]) => {
    const currentList = customPlayersList || playersRef.current;
    const currentIdx = activePlayerIndexRef.current;

    const nonWinners = currentList.filter((p) => !p.hasWon);
    if (nonWinners.length <= 1) {
      return;
    }

    let nextIdx = (currentIdx + 1) % currentList.length;
    while (currentList[nextIdx].hasWon) {
      nextIdx = (nextIdx + 1) % currentList.length;
    }

    setActivePlayerIndex(nextIdx);
    setCanRoll(true);
    setHasExtraChance(false);
    setConsecutiveSixes(0);
    setSelectableTokens([]);
    isTurnProcessingRef.current = false;
  }, []);

  // Execute a token move step-by-step
  const executeTokenMove = useCallback(
    (token: Token, rolledValue: number) => {
      isTurnProcessingRef.current = true;
      setSelectableTokens([]);

      const config = COLOR_CONFIGS[token.color];
      const currentList = playersRef.current;

      // Case A: Spawning token from base yard on 6 (smooth single step into starting square)
      if (!token.isAlive && rolledValue === 6) {
        sounds.play('step');
        voices.handleGameEvent('ROLL_SIX', token.color);
        triggerReactionBadge(token.color, '🎲', 'Spawned!');

        const updated = currentList.map((p) => {
          if (p.id !== token.playerIndex) return p;
          return {
            ...p,
            tokens: p.tokens.map((t) => {
              if (t.id !== token.id) return t;
              return {
                ...t,
                isAlive: true,
                currBlock: config.startPosition,
                numberOfSteps: 0,
                currWinnerBlock: 0,
              };
            }),
          };
        });

        setPlayers(updated);
        playersRef.current = updated;

        setTimeout(() => {
          setHasExtraChance(true);
          setCanRoll(true);
          isTurnProcessingRef.current = false;
        }, 350);
        return;
      }

      // Case B: Advancing an alive token step-by-step
      const stepSequence = getStepSequence(token, rolledValue);
      if (stepSequence.length === 0) {
        isTurnProcessingRef.current = false;
        return;
      }

      const stepDelay = 185; // 185ms per square: smooth, readable, and responsive
      let stepIndex = 0;

      const runNextStep = () => {
        if (stepIndex < stepSequence.length) {
          const step = stepSequence[stepIndex];
          sounds.playStep();

          setPlayers((prevPlayers) => {
            const updated = prevPlayers.map((p) => {
              if (p.id !== token.playerIndex) return p;
              return {
                ...p,
                tokens: p.tokens.map((t) => {
                  if (t.id !== token.id) return t;
                  return {
                    ...t,
                    currBlock: step.block,
                    numberOfSteps: step.numberOfSteps,
                    currWinnerBlock: step.currWinnerBlock,
                    hasCompleted: step.isHomeCenter,
                  };
                }),
              };
            });
            playersRef.current = updated;
            return updated;
          });

          stepIndex++;
          setTimeout(runNextStep, stepDelay);
          return;
        }

        // All intermediate steps completed! Now evaluate final landing square rules
        const finalStep = stepSequence[stepSequence.length - 1];
        const latestPlayers = playersRef.current;
        let gainedExtraTurn = false;

        // Sub-case 1: Reached Home Center (57 steps)
        if (finalStep.isHomeCenter) {
          sounds.play('panta');
          voices.handleGameEvent('HOME', token.color);
          triggerReactionBadge(token.color, '🏁', 'Home!');

          const activeP = latestPlayers.find((p) => p.id === token.playerIndex);
          const completedCount = activeP?.tokens.filter((t) => t.hasCompleted).length || 0;
          const hasWon = completedCount === 4;

          if (hasWon && activeP) {
            const completedWinnerPlayer = { ...activeP, hasWon: true };
            const updatedWithWin = latestPlayers.map((p) =>
              p.id === token.playerIndex ? completedWinnerPlayer : p
            );
            setPlayers(updatedWithWin);
            playersRef.current = updatedWithWin;

            const updatedWinnerRecord = {
              player: completedWinnerPlayer,
              rank: winners.length + 1,
            };
            const nextWinners = [...winners, updatedWinnerRecord];
            setWinners(nextWinners);

            const remainingActive = updatedWithWin.filter((p) => !p.hasWon);
            if (remainingActive.length <= 1) {
              // Match is over!
              setTimeout(() => {
                storageManager.clearActiveSession();
                setActiveSession(null);
                setGameState('WINNER');
              }, 800);
              return;
            }

            // Player won, rotate turn to next active player without extra turn
            setTimeout(() => {
              switchPlayers(updatedWithWin);
            }, 450);
            return;
          }

          // Token reached home but player hasn't completed all 4 tokens -> extra roll!
          setTimeout(() => {
            setHasExtraChance(true);
            setCanRoll(true);
            isTurnProcessingRef.current = false;
          }, 350);
          return;
        }

        // Sub-case 2: Landed on perimeter or home stretch square
        const destBlock = finalStep.block;
        const targetIsSafe = SAFE_SPOTS.has(destBlock);
        let capturedEnemy = false;

        const updatedWithCapture = latestPlayers.map((p) => {
          // If another player has token on same non-safe block -> capture!
          if (p.id !== token.playerIndex && !p.hasWon && !targetIsSafe) {
            const hasVictim = p.tokens.some((t) => t.isAlive && t.currBlock === destBlock);
            if (hasVictim) {
              capturedEnemy = true;
              return {
                ...p,
                tokens: p.tokens.map((t) => {
                  if (t.isAlive && t.currBlock === destBlock) {
                    return {
                      ...t,
                      isAlive: false,
                      currBlock: -1,
                      numberOfSteps: 0,
                      currWinnerBlock: 0,
                    };
                  }
                  return t;
                }),
              };
            }
          }
          return p;
        });

        setPlayers(updatedWithCapture);
        playersRef.current = updatedWithCapture;

        // Sound & Voice triggers
        if (capturedEnemy) {
          sounds.play('death');
          voices.handleGameEvent('CAPTURE', token.color);
          triggerReactionBadge(token.color, '⚔️', 'Captured!');
          gainedExtraTurn = true;
        } else if (targetIsSafe) {
          sounds.play('safe');
          triggerReactionBadge(token.color, '🛡️', 'Safe!');
        }

        if (rolledValue === 6) {
          gainedExtraTurn = true;
        }

        setTimeout(() => {
          if (gainedExtraTurn) {
            setHasExtraChance(true);
            setCanRoll(true);
            isTurnProcessingRef.current = false;
          } else {
            switchPlayers(updatedWithCapture);
          }
        }, 350);
      };

      // Start sequential movement
      runNextStep();
    },
    [switchPlayers, winners, triggerReactionBadge]
  );

  // Roll dice action
  const handleRollDice = useCallback(() => {
    if (!canRoll || isRolling || !activePlayer || isTurnProcessingRef.current) return;

    setIsRolling(true);
    setCanRoll(false);
    setSelectableTokens([]);
    sounds.play('diceroll');

    setTimeout(() => {
      // 100% Fair random roll 1..6
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceValue(roll);
      setIsRolling(false);

      // Check 3 consecutive 6s penalty
      if (roll === 6) {
        voices.handleGameEvent('ROLL_SIX', activePlayer.color);
        const nextSixCount = consecutiveSixes + 1;
        if (nextSixCount >= 3) {
          triggerReactionBadge(activePlayer.color, '⚠️', '3 Sixes Forfeit!');
          setConsecutiveSixes(0);
          setTimeout(() => {
            switchPlayers();
          }, 700);
          return;
        }
        setConsecutiveSixes(nextSixCount);
      } else {
        setConsecutiveSixes(0);
      }

      // Evaluate valid movable tokens
      const movable = activePlayer.tokens.filter((t) => canTokenMove(t, roll));

      if (movable.length === 0) {
        // No moves possible -> switch turn
        triggerReactionBadge(activePlayer.color, '🚫', 'No Moves');
        setTimeout(() => {
          switchPlayers();
        }, 650);
      } else if (movable.length === 1) {
        // Exactly 1 move possible -> auto-move!
        setTimeout(() => {
          executeTokenMove(movable[0], roll);
        }, 350);
      } else {
        // Multiple moves possible
        if (activePlayer.isBot) {
          // Bot evaluates best move
          const chosen = chooseBotMove(activePlayer, playersRef.current, roll) || movable[0];
          setTimeout(() => {
            executeTokenMove(chosen, roll);
          }, 450);
        } else {
          // Human player selects
          setSelectableTokens(movable);
          isTurnProcessingRef.current = false;
        }
      }
    }, 450);
  }, [
    canRoll,
    isRolling,
    activePlayer,
    consecutiveSixes,
    executeTokenMove,
    switchPlayers,
    triggerReactionBadge,
  ]);

  // Handle Token Click by Human Player
  // Fixed: removed !canRoll guard so player can click during token selection
  const handleTokenClick = (token: Token) => {
    if (
      isTurnProcessingRef.current ||
      isRolling ||
      !activePlayer ||
      activePlayer.isBot ||
      token.playerIndex !== activePlayer.id ||
      selectableTokens.length === 0 ||
      !selectableTokens.some((t) => t.playerIndex === token.playerIndex && t.id === token.id)
    ) {
      return;
    }

    // Immediately debounce further clicks
    isTurnProcessingRef.current = true;
    setSelectableTokens([]);
    executeTokenMove(token, diceValue);
  };

  // Custom player renaming during gameplay
  const handleRenamePlayer = (playerId: number, newName: string) => {
    const updated = players.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, name: newName };
    });
    setPlayers(updated);

    // Save customized name into preferences
    const targetPlayer = players.find((p) => p.id === playerId);
    if (targetPlayer) {
      storageManager.savePreferences({
        defaultPlayerNames: {
          ...preferences.defaultPlayerNames,
          [targetPlayer.color]: newName,
        },
      });
    }
  };

  // Reset all preferences
  const handleResetPreferences = () => {
    const defaults = storageManager.resetAllPreferences();
    setPreferences(defaults);
    setSoundEnabled(defaults.soundEnabled);
    setMusicEnabled(defaults.musicEnabled);
    setVoiceEnabled(defaults.voiceEnabled);
    setIsSettingsOpen(false);
  };

  // Bot Turn Automation Effect
  useEffect(() => {
    if (
      gameState === 'PLAYING' &&
      activePlayer?.isBot &&
      canRoll &&
      !isRolling &&
      !isTurnProcessingRef.current
    ) {
      const timer = setTimeout(() => {
        handleRollDice();
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [gameState, activePlayer?.isBot, canRoll, isRolling, handleRollDice]);

  // Main Menu Screen
  if (gameState === 'MENU') {
    return (
      <>
        <StartMenu
          onStartGame={handleStartGame}
          onResumeSession={handleResumeSession}
          onOpenSoundboard={() => setIsSoundboardOpen(true)}
          activeSession={activeSession}
          initialPlayerCount={preferences.lastSelectedPlayerCount}
          initialMode={preferences.lastSelectedGameMode}
          initialPlayerNames={preferences.defaultPlayerNames}
          soundEnabled={soundEnabled}
          musicEnabled={musicEnabled}
          voiceEnabled={voiceEnabled}
          onToggleSound={handleToggleSound}
          onToggleMusic={handleToggleMusic}
          onToggleVoice={handleToggleVoice}
        />
        <VoiceSoundboardModal
          isOpen={isSoundboardOpen}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
          onClose={() => setIsSoundboardOpen(false)}
        />
      </>
    );
  }

  // Active Game Screen — Apple-inspired Glassmorphism with deep charcoal background & champagne gold accents
  return (
    <div className="min-h-screen bg-[#111111] text-[#F5F5F5] flex flex-col justify-between p-2 sm:p-4 select-none overflow-x-hidden">
      {/* Top Navbar */}
      <header className="flex items-center justify-between max-w-4xl w-full mx-auto px-4 py-2.5 mb-2 bg-[#161616]/90 backdrop-blur-xl rounded-2xl border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-[#E9BC42]/40 flex items-center justify-center shadow-md">
            <img
              src="/images/icon.png"
              alt="Logo"
              className="w-5 h-5 object-contain"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm uppercase tracking-wider text-[#F5F5F5] leading-none">
              RIZZ DICE
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#E9BC42]">
              Ludo King Redefined
            </span>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2">
          {/* Soundboard Launcher */}
          <button
            type="button"
            onClick={() => setIsSoundboardOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#E9BC42]/30 text-[#F5F5F5] flex items-center gap-1.5 transition text-xs font-bold cursor-pointer"
            title="Voice Reactions Soundboard"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#E9BC42]" />
            <span className="hidden sm:inline">Soundboard</span>
          </button>

          {/* Restart Match */}
          <button
            type="button"
            onClick={() =>
              handleStartGame(
                currentGameMode,
                players.length as 2 | 3 | 4,
                players.filter((p) => p.isBot).length,
                players.map((p) => p.name)
              )
            }
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#A3A3A3] hover:text-[#F5F5F5] border border-white/[0.08] transition cursor-pointer"
            title="Restart Match"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Settings Modal */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#A3A3A3] hover:text-[#F5F5F5] border border-white/[0.08] transition cursor-pointer"
            title="Game Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Board Arena with 4 Player Stations */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl w-full mx-auto px-1">
        {/* Top Player Stations (Red: Pos 1 Top-Left, Green: Pos 2 Top-Right) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-[620px] mb-2">
          {players.find((p) => p.position === 1) ? (
            <DicePad
              player={players.find((p) => p.position === 1)!}
              isActive={activePlayer?.position === 1}
              canRoll={canRoll}
              isRolling={isRolling}
              diceValue={diceValue}
              hasExtraChance={hasExtraChance}
              reactionBadge={activeReactions.red?.badge}
              reactionText={activeReactions.red?.text}
              onRoll={handleRollDice}
              onRenamePlayer={handleRenamePlayer}
            />
          ) : (
            <div />
          )}

          {players.find((p) => p.position === 2) ? (
            <DicePad
              player={players.find((p) => p.position === 2)!}
              isActive={activePlayer?.position === 2}
              canRoll={canRoll}
              isRolling={isRolling}
              diceValue={diceValue}
              hasExtraChance={hasExtraChance}
              reactionBadge={activeReactions.green?.badge}
              reactionText={activeReactions.green?.text}
              onRoll={handleRollDice}
              onRenamePlayer={handleRenamePlayer}
            />
          ) : (
            <div />
          )}
        </div>

        {/* Central Responsive Ludo Board — 100% PRESERVED */}
        <LudoBoard
          players={players}
          activePlayer={activePlayer}
          selectableTokens={selectableTokens}
          onTokenClick={handleTokenClick}
        />

        {/* Bottom Player Stations (Blue: Pos 3 Bottom-Left, Yellow: Pos 4 Bottom-Right) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-[620px] mt-2">
          {players.find((p) => p.position === 3) ? (
            <DicePad
              player={players.find((p) => p.position === 3)!}
              isActive={activePlayer?.position === 3}
              canRoll={canRoll}
              isRolling={isRolling}
              diceValue={diceValue}
              hasExtraChance={hasExtraChance}
              reactionBadge={activeReactions.blue?.badge}
              reactionText={activeReactions.blue?.text}
              onRoll={handleRollDice}
              onRenamePlayer={handleRenamePlayer}
            />
          ) : (
            <div />
          )}

          {players.find((p) => p.position === 4) ? (
            <DicePad
              player={players.find((p) => p.position === 4)!}
              isActive={activePlayer?.position === 4}
              canRoll={canRoll}
              isRolling={isRolling}
              diceValue={diceValue}
              hasExtraChance={hasExtraChance}
              reactionBadge={activeReactions.yellow?.badge}
              reactionText={activeReactions.yellow?.text}
              onRoll={handleRollDice}
              onRenamePlayer={handleRenamePlayer}
            />
          ) : (
            <div />
          )}
        </div>
      </main>

      {/* Settings Modal */}
      <MenuModal
        isOpen={isSettingsOpen}
        soundEnabled={soundEnabled}
        musicEnabled={musicEnabled}
        voiceEnabled={voiceEnabled}
        onToggleSound={handleToggleSound}
        onToggleMusic={handleToggleMusic}
        onToggleVoice={handleToggleVoice}
        onOpenSoundboard={() => setIsSoundboardOpen(true)}
        onRestart={() =>
          handleStartGame(
            currentGameMode,
            players.length as 2 | 3 | 4,
            players.filter((p) => p.isBot).length,
            players.map((p) => p.name)
          )
        }
        onMainMenu={() => {
          setGameState('MENU');
          setActiveSession(storageManager.getActiveSession());
        }}
        onResetPreferences={handleResetPreferences}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Voice Reactions Soundboard Modal */}
      <VoiceSoundboardModal
        isOpen={isSoundboardOpen}
        voiceEnabled={voiceEnabled}
        onToggleVoice={handleToggleVoice}
        onClose={() => setIsSoundboardOpen(false)}
      />

      {/* Winner Celebration Modal */}
      {gameState === 'WINNER' && (
        <WinnerModal
          winners={winners}
          onPlayAgain={() =>
            handleStartGame(
              currentGameMode,
              players.length as 2 | 3 | 4,
              players.filter((p) => p.isBot).length,
              players.map((p) => p.name)
            )
          }
          onMainMenu={() => {
            setGameState('MENU');
            setActiveSession(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
