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
import type { MultiplayerRoom, GameInvitation, OnlineMatchState } from './types/multiplayer';
import { COLOR_CONFIGS, SAFE_SPOTS } from './utils/boardData';
import { sounds } from './utils/soundManager';
import { voices } from './utils/voiceManager';
import { storageManager } from './utils/storageManager';
import { chooseBotMove, canTokenMove, calculateTokenMovement, type IntermediateStep } from './utils/botAI';
import { socketClient } from './utils/socketClient';
import { StartMenu } from './components/Home/StartMenu';
import { LudoBoard } from './components/Board/LudoBoard';
import { DicePad } from './components/Controls/DicePad';
import { MenuModal } from './components/Modals/MenuModal';
import { WinnerModal } from './components/Modals/WinnerModal';
import { VoiceSoundboardModal } from './components/Modals/VoiceSoundboardModal';
import { OnlineModal } from './components/Online/OnlineModal';
import { InvitationBanner } from './components/Online/InvitationBanner';
import { Sparkles, Clock, Menu } from 'lucide-react';

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

  // Online Multiplayer State
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState<MultiplayerRoom | null>(null);
  const [incomingInvitation, setIncomingInvitation] = useState<GameInvitation | null>(null);
  const [totalOnline, setTotalOnline] = useState(0);
  const [disconnectedNotice, setDisconnectedNotice] = useState<{
    name: string;
    secondsLeft: number;
  } | null>(null);

  // References to prevent race conditions during rapid clicks or bot turns
  const isTurnProcessingRef = useRef(false);
  const playersRef = useRef<Player[]>([]);
  const activePlayerIndexRef = useRef(0);
  const onlineRoomRef = useRef<MultiplayerRoom | null>(null);

  // Active game timers registry to prevent memory leaks and dangling animations upon quitting/ending
  const activeGameTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const safeSetTimeout = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      activeGameTimersRef.current.delete(timer);
      fn();
    }, ms);
    activeGameTimersRef.current.add(timer);
    return timer;
  }, []);

  const clearAllGameTimers = useCallback(() => {
    activeGameTimersRef.current.forEach((t) => clearTimeout(t));
    activeGameTimersRef.current.clear();
    isTurnProcessingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      clearAllGameTimers();
    };
  }, [clearAllGameTimers]);

  // Sync refs with state
  useEffect(() => {
    playersRef.current = players;
    activePlayerIndexRef.current = activePlayerIndex;
    onlineRoomRef.current = onlineRoom;
  }, [players, activePlayerIndex, onlineRoom]);

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

    safeSetTimeout(() => {
      setActiveReactions((prev) => {
        const next = { ...prev };
        delete next[color];
        return next;
      });
    }, 2800);
  }, [safeSetTimeout]);

  // Save session changes to local storage whenever game progresses (offline modes only)
  useEffect(() => {
    if (gameState === 'PLAYING' && players.length >= 2 && currentGameMode !== 'online_multiplayer') {
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

  // Start offline match initialization
  const handleStartGame = (
    mode: GameMode,
    playerCount: 2 | 3 | 4,
    botCount: number,
    playerNames: string[]
  ) => {
    clearAllGameTimers();
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

    setOnlineRoom(null);
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

  // Start Online Match Initializer
  const handleStartOnlineMatch = (room: MultiplayerRoom) => {
    clearAllGameTimers();
    const positionMap: Record<PlayerColor, PositionIndex> = {
      red: 1,
      green: 2,
      blue: 3,
      yellow: 4,
    };

    const count = room.maxPlayers;
    const roomSeats = room.seats.slice(0, count);

    const initialOnlinePlayers: Player[] = roomSeats.map((seat, idx) =>
      createPlayer(
        idx,
        seat.playerName || `Player ${idx + 1}`,
        seat.color,
        positionMap[seat.color],
        Boolean(seat.isBot)
      )
    );

    setOnlineRoom(room);
    setCurrentGameMode('online_multiplayer');
    setPlayers(initialOnlinePlayers);
    setActivePlayerIndex(0);
    setDiceValue(6);

    const myId = socketClient.getPlayerId();
    const isHostSeat = roomSeats[0]?.playerId === myId;
    setCanRoll(isHostSeat);
    setIsRolling(false);
    setHasExtraChance(false);
    setConsecutiveSixes(0);
    setSelectableTokens([]);
    setWinners([]);
    setGameState('PLAYING');
    isTurnProcessingRef.current = false;
  };

  // Resume saved session from local storage
  const handleResumeSession = (session: StoredSession) => {
    clearAllGameTimers();
    setCurrentGameMode(session.gameMode);
    setPlayers(session.players);
    setActivePlayerIndex(session.activePlayerIndex);
    setDiceValue(session.diceValue);
    setCanRoll(session.canRoll);
    setIsRolling(false);
    setHasExtraChance(session.hasExtraChance);
    setConsecutiveSixes(session.consecutiveSixes || 0);
    setWinners(session.winners);
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

  // Offline step-by-step token movement executor
  const executeTokenMove = useCallback(
    (token: Token, rolledValue: number) => {
      isTurnProcessingRef.current = true;
      setSelectableTokens([]);

      const liveToken =
        playersRef.current.find((p) => p.id === token.playerIndex)?.tokens.find((t) => t.id === token.id) ||
        token;

      const movement = calculateTokenMovement(liveToken, rolledValue);
      if (!movement.isValid) {
        isTurnProcessingRef.current = false;
        return;
      }

      const currentList = playersRef.current;

      // Spawning token from base yard on 6
      if (movement.isSpawning) {
        sounds.play('step');
        voices.handleGameEvent('ROLL_SIX', liveToken.color);
        triggerReactionBadge(liveToken.color, '🎲', 'Spawned!');

        const updated = currentList.map((p) => {
          if (p.id !== liveToken.playerIndex) return p;
          return {
            ...p,
            tokens: p.tokens.map((t) => {
              if (t.id !== liveToken.id) return t;
              return {
                ...t,
                isAlive: true,
                currBlock: movement.finalBlock,
                numberOfSteps: movement.finalSteps,
                currWinnerBlock: movement.finalWinnerBlockIndex,
              };
            }),
          };
        });

        setPlayers(updated);
        playersRef.current = updated;

        safeSetTimeout(() => {
          setHasExtraChance(true);
          setCanRoll(true);
          isTurnProcessingRef.current = false;
        }, 350);
        return;
      }

      // Advancing an alive token step-by-step
      const stepSequence = movement.stepSequence;
      if (stepSequence.length === 0) {
        isTurnProcessingRef.current = false;
        return;
      }

      const stepDelay = 185;
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
          safeSetTimeout(runNextStep, stepDelay);
          return;
        }

        // All intermediate steps completed!
        const finalStep = stepSequence[stepSequence.length - 1];
        const latestPlayers = playersRef.current;
        let gainedExtraTurn = false;

        // Reached Home Center (57 steps)
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
              safeSetTimeout(() => {
                storageManager.clearActiveSession();
                setActiveSession(null);
                setGameState('WINNER');
              }, 800);
              return;
            }

            safeSetTimeout(() => {
              switchPlayers(updatedWithWin);
            }, 450);
            return;
          }

          safeSetTimeout(() => {
            setHasExtraChance(true);
            setCanRoll(true);
            isTurnProcessingRef.current = false;
          }, 350);
          return;
        }

        // Landed on perimeter or home stretch square
        const destBlock = finalStep.block;
        const targetIsSafe = SAFE_SPOTS.has(destBlock);
        let capturedEnemy = false;

        const updatedWithCapture = latestPlayers.map((p) => {
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

        safeSetTimeout(() => {
          if (gainedExtraTurn) {
            setHasExtraChance(true);
            setCanRoll(true);
            isTurnProcessingRef.current = false;
          } else {
            switchPlayers(updatedWithCapture);
          }
        }, 350);
      };

      runNextStep();
    },
    [switchPlayers, winners, triggerReactionBadge, safeSetTimeout]
  );

  // Online Authoritative Token Step Movement Executor
  const executeOnlineTokenStepMovement = useCallback(
    (
      playerIndex: number,
      tokenId: number,
      stepSequence: IntermediateStep[],
      isSpawning: boolean,
      capturedToken?: { color: PlayerColor; tokenId: number; yardSlot: number },
      _playerWon?: boolean,
      isGameOver?: boolean,
      extraChance?: boolean,
      nextPlayerIndex?: number,
      finalMatch?: OnlineMatchState
    ) => {
      isTurnProcessingRef.current = true;
      setSelectableTokens([]);

      const currentList = playersRef.current;
      const targetPlayer = currentList[playerIndex];
      if (!targetPlayer) {
        if (finalMatch) setPlayers(finalMatch.players);
        isTurnProcessingRef.current = false;
        return;
      }
      const token = targetPlayer.tokens.find((t) => t.id === tokenId);
      if (!token) {
        if (finalMatch) setPlayers(finalMatch.players);
        isTurnProcessingRef.current = false;
        return;
      }

      const config = COLOR_CONFIGS[token.color];

      // Spawning on 6
      if (isSpawning) {
        sounds.play('step');
        voices.handleGameEvent('ROLL_SIX', token.color);
        triggerReactionBadge(token.color, '🎲', 'Spawned!');

        const updated = currentList.map((p) => {
          if (p.id !== playerIndex) return p;
          return {
            ...p,
            tokens: p.tokens.map((t) => {
              if (t.id !== tokenId) return t;
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

        const myId = socketClient.getPlayerId();
        const mySeat = onlineRoomRef.current?.seats.find((s) => s.playerId === myId);
        const amIActive = mySeat?.slot === playerIndex;

        safeSetTimeout(() => {
          setHasExtraChance(true);
          setCanRoll(amIActive);
          isTurnProcessingRef.current = false;
        }, 350);
        return;
      }

      // Step-by-step traversal
      const stepDelay = 185;
      let stepIndex = 0;

      const runNextOnlineStep = () => {
        if (stepIndex < stepSequence.length) {
          const step = stepSequence[stepIndex];
          sounds.playStep();

          setPlayers((prevPlayers) => {
            const updated = prevPlayers.map((p) => {
              if (p.id !== playerIndex) return p;
              return {
                ...p,
                tokens: p.tokens.map((t) => {
                  if (t.id !== tokenId) return t;
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
          safeSetTimeout(runNextOnlineStep, stepDelay);
          return;
        }

        // Final landing evaluations
        const finalStep = stepSequence[stepSequence.length - 1];
        if (finalStep?.isHomeCenter) {
          sounds.play('panta');
          voices.handleGameEvent('HOME', token.color);
          triggerReactionBadge(token.color, '🏁', 'Home!');
        } else if (capturedToken) {
          sounds.play('death');
          voices.handleGameEvent('CAPTURE', token.color);
          triggerReactionBadge(token.color, '⚔️', 'Captured!');
        } else if (SAFE_SPOTS.has(finalStep?.block || -1)) {
          sounds.play('safe');
          triggerReactionBadge(token.color, '🛡️', 'Safe!');
        }

        if (finalMatch) {
          setPlayers(finalMatch.players);
          playersRef.current = finalMatch.players;
          if (nextPlayerIndex !== undefined) {
            setActivePlayerIndex(nextPlayerIndex);
          }
        }

        if (isGameOver) {
          setGameState('WINNER');
          isTurnProcessingRef.current = false;
          return;
        }

        const myId = socketClient.getPlayerId();
        const mySeat = onlineRoomRef.current?.seats.find((s) => s.playerId === myId);
        const resolvedNextIdx = nextPlayerIndex !== undefined ? nextPlayerIndex : activePlayerIndexRef.current;
        const isMyTurnNow = mySeat?.slot === resolvedNextIdx;

        safeSetTimeout(() => {
          setHasExtraChance(Boolean(extraChance));
          setCanRoll(isMyTurnNow);
          isTurnProcessingRef.current = false;
        }, 350);
      };

      runNextOnlineStep();
    },
    [triggerReactionBadge, safeSetTimeout]
  );

  // Setup Socket Listeners
  useEffect(() => {
    socketClient.connect();

    const unsubLobby = socketClient.on('lobby_updated', (data: unknown) => {
      const d = data as { totalOnline: number };
      setTotalOnline(d.totalOnline);
    });

    const unsubInvite = socketClient.on('invite_incoming', (inv: unknown) => {
      setIncomingInvitation(inv as GameInvitation);
    });

    const unsubInviteClear = socketClient.on('invite_cleared', () => {
      setIncomingInvitation(null);
    });

    const unsubGameStarted = socketClient.on('game_started', (data: unknown) => {
      const d = data as { match: OnlineMatchState; room: MultiplayerRoom };
      handleStartOnlineMatch(d.room);
    });

    const unsubDiceRolled = socketClient.on('game_dice_rolled', (data: unknown) => {
      const d = data as {
        diceValue: number;
        activePlayerIndex: number;
        consecutiveSixes: number;
        selectableTokenIds: number[];
        isThreeSixes: boolean;
        autoPassTurn: boolean;
        match: OnlineMatchState;
      };

      sounds.play('diceroll');
      setIsRolling(true);
      setCanRoll(false);

      safeSetTimeout(() => {
        setIsRolling(false);
        setDiceValue(d.diceValue);
        setConsecutiveSixes(d.consecutiveSixes);

        const currP = d.match.players[d.activePlayerIndex];
        if (d.diceValue === 6 && currP) {
          voices.handleGameEvent('ROLL_SIX', currP.color);
        }

        if (d.isThreeSixes && currP) {
          triggerReactionBadge(currP.color, '⚠️', '3 Sixes Forfeit!');
        }

        if (d.autoPassTurn) {
          if (!d.isThreeSixes && currP) {
            triggerReactionBadge(currP.color, '🚫', 'No Moves');
          }
          setActivePlayerIndex(d.match.activePlayerIndex);
          const myId = socketClient.getPlayerId();
          const mySeat = onlineRoomRef.current?.seats.find((s) => s.playerId === myId);
          setCanRoll(mySeat?.slot === d.match.activePlayerIndex);
        } else {
          // Tokens selectable
          const myId = socketClient.getPlayerId();
          const mySeat = onlineRoomRef.current?.seats.find((s) => s.playerId === myId);
          if (mySeat?.slot === d.activePlayerIndex) {
            const activeTokens = currP?.tokens || [];
            const selectable = activeTokens.filter((t) => d.selectableTokenIds.includes(t.id));
            setSelectableTokens(selectable);
            // If only 1 move and it's mine, auto-execute
            if (selectable.length === 1 && onlineRoomRef.current) {
              safeSetTimeout(() => {
                if (onlineRoomRef.current && !isTurnProcessingRef.current) {
                  isTurnProcessingRef.current = true;
                  setSelectableTokens([]);
                  socketClient.moveToken(onlineRoomRef.current.code, selectable[0].id);
                }
              }, 400);
            }
          }
        }
      }, 350);
    });

    const unsubTokenMoved = socketClient.on('game_token_moved', (data: unknown) => {
      const d = data as {
        tokenId: number;
        playerIndex: number;
        stepSequence: IntermediateStep[];
        isSpawning: boolean;
        capturedToken?: { color: PlayerColor; tokenId: number; yardSlot: number };
        playerWon?: boolean;
        isGameOver?: boolean;
        extraChance: boolean;
        nextPlayerIndex: number;
        match: OnlineMatchState;
      };

      executeOnlineTokenStepMovement(
        d.playerIndex,
        d.tokenId,
        d.stepSequence,
        d.isSpawning,
        d.capturedToken,
        d.playerWon,
        d.isGameOver,
        d.extraChance,
        d.nextPlayerIndex,
        d.match
      );
    });

    const unsubSync = socketClient.on('game_sync', (data: unknown) => {
      const match = (data as { match: OnlineMatchState }).match;
      // Do not overwrite board tokens if an animation is actively processing steps
      if (!isTurnProcessingRef.current) {
        setPlayers(match.players);
        playersRef.current = match.players;
      }
      setActivePlayerIndex(match.activePlayerIndex);
      setDiceValue(match.diceValue);
      setWinners(match.winners);
      setDisconnectedNotice(null);

      const myId = socketClient.getPlayerId();
      const mySeat = onlineRoomRef.current?.seats.find((s) => s.playerId === myId);
      const isMine = mySeat?.slot === match.activePlayerIndex;
      setCanRoll(isMine && match.canRoll);

      if (isMine && !match.canRoll && match.selectableTokenIds.length > 0) {
        const currP = match.players[match.activePlayerIndex];
        if (currP) {
          setSelectableTokens(currP.tokens.filter((t) => match.selectableTokenIds.includes(t.id)));
        }
      }
    });

    const unsubReaction = socketClient.on('game_reaction', (data: unknown) => {
      const d = data as { color: PlayerColor; badge: string; text: string };
      triggerReactionBadge(d.color, d.badge, d.text);
    });

    const unsubGameOver = socketClient.on('game_over', (data: unknown) => {
      const d = data as { winners: WinnerRecord[] };
      setWinners(d.winners);
      setGameState('WINNER');
    });

    const unsubConnChanged = socketClient.on('player_connection_changed', (data: unknown) => {
      const d = data as {
        playerId: string;
        playerName: string;
        isConnected: boolean;
        gracePeriodSeconds?: number;
      };
      if (!d.isConnected) {
        setDisconnectedNotice({
          name: d.playerName,
          secondsLeft: d.gracePeriodSeconds || 120,
        });
      } else {
        setDisconnectedNotice(null);
      }
    });

    const unsubForfeited = socketClient.on('player_forfeited', (data: unknown) => {
      const d = data as { playerName: string };
      setDisconnectedNotice(null);
      triggerReactionBadge('red', '🏳️', `${d.playerName} Forfeited`);
    });

    const unsubRoomClosed = socketClient.on('room_closed', () => {
      clearAllGameTimers();
      setOnlineRoom(null);
      setGameState('MENU');
    });

    const unsubGameEnded = socketClient.on('game_ended', () => {
      clearAllGameTimers();
      setOnlineRoom(null);
      setGameState('MENU');
    });

    return () => {
      unsubLobby();
      unsubInvite();
      unsubInviteClear();
      unsubGameStarted();
      unsubDiceRolled();
      unsubTokenMoved();
      unsubSync();
      unsubReaction();
      unsubGameOver();
      unsubConnChanged();
      unsubForfeited();
      unsubRoomClosed();
      unsubGameEnded();
    };
  }, [triggerReactionBadge, executeOnlineTokenStepMovement, clearAllGameTimers]);

  // Roll dice action
  const handleRollDice = useCallback(() => {
    if (!canRoll || isRolling || !activePlayer || isTurnProcessingRef.current) return;

    // Online Multiplayer: Server Authoritative
    if (currentGameMode === 'online_multiplayer') {
      if (!onlineRoom) return;
      const myId = socketClient.getPlayerId();
      const mySeat = onlineRoom.seats.find((s) => s.playerId === myId);
      if (!mySeat || mySeat.slot !== activePlayerIndex) return;

      socketClient.rollDice(onlineRoom.code);
      return;
    }

    // Offline modes (Pass 'N Play, vs Computer)
    setIsRolling(true);
    setCanRoll(false);
    setSelectableTokens([]);
    sounds.play('diceroll');

    safeSetTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1;
      setDiceValue(roll);
      setIsRolling(false);

      if (roll === 6) {
        voices.handleGameEvent('ROLL_SIX', activePlayer.color);
        const nextSixCount = consecutiveSixes + 1;
        if (nextSixCount >= 3) {
          triggerReactionBadge(activePlayer.color, '⚠️', '3 Sixes Forfeit!');
          setConsecutiveSixes(0);
          safeSetTimeout(() => {
            switchPlayers();
          }, 700);
          return;
        }
        setConsecutiveSixes(nextSixCount);
      } else {
        setConsecutiveSixes(0);
      }

      const movable = activePlayer.tokens.filter((t) => canTokenMove(t, roll));

      if (movable.length === 0) {
        triggerReactionBadge(activePlayer.color, '🚫', 'No Moves');
        safeSetTimeout(() => {
          switchPlayers();
        }, 650);
      } else if (movable.length === 1) {
        safeSetTimeout(() => {
          executeTokenMove(movable[0], roll);
        }, 350);
      } else {
        if (activePlayer.isBot) {
          const chosen = chooseBotMove(activePlayer, playersRef.current, roll) || movable[0];
          safeSetTimeout(() => {
            executeTokenMove(chosen, roll);
          }, 450);
        } else {
          setSelectableTokens(movable);
          isTurnProcessingRef.current = false;
        }
      }
    }, 450);
  }, [
    canRoll,
    isRolling,
    activePlayer,
    currentGameMode,
    onlineRoom,
    activePlayerIndex,
    consecutiveSixes,
    triggerReactionBadge,
    switchPlayers,
    executeTokenMove,
    safeSetTimeout,
  ]);

  // Token click handler
  const handleTokenClick = (token: Token) => {
    if (currentGameMode === 'online_multiplayer') {
      if (!onlineRoom || isTurnProcessingRef.current) return;
      const myId = socketClient.getPlayerId();
      const mySeat = onlineRoom.seats.find((s) => s.playerId === myId);
      if (!mySeat || mySeat.slot !== activePlayerIndex) return;

      const isSelectable = selectableTokens.some((t) => t.id === token.id);
      if (!isSelectable) return;

      // Immediately debounce to prevent rapid double-clicks
      isTurnProcessingRef.current = true;
      setSelectableTokens([]);
      socketClient.moveToken(onlineRoom.code, token.id);
      return;
    }

    if (canRoll || isRolling || isTurnProcessingRef.current) return;

    if (token.playerIndex !== activePlayerIndex) return;

    const isSelectable = selectableTokens.some((t) => t.id === token.id);
    if (!isSelectable) return;

    const liveToken =
      playersRef.current.find((p) => p.id === token.playerIndex)?.tokens.find((t) => t.id === token.id) ||
      token;

    executeTokenMove(liveToken, diceValue);
  };

  // Rename player name
  const handleRenamePlayer = (playerId: number, newName: string) => {
    const updated = players.map((p) => {
      if (p.id !== playerId) return p;
      return { ...p, name: newName };
    });
    setPlayers(updated);
    playersRef.current = updated;

    const activeP = updated.find((p) => p.id === playerId);
    if (activeP) {
      storageManager.savePreferences({
        defaultPlayerNames: {
          ...preferences.defaultPlayerNames,
          [activeP.color]: newName,
        },
      });
    }
  };

  // Quit Game: Exit match cleanly, stop all timers, return to menu, preserving saved session for offline
  const handleQuitGame = useCallback(() => {
    clearAllGameTimers();
    if (currentGameMode === 'online_multiplayer' && onlineRoomRef.current) {
      socketClient.leaveRoom(onlineRoomRef.current.code);
      setOnlineRoom(null);
    }
    setGameState('MENU');
    setActiveSession(storageManager.getActiveSession());
  }, [clearAllGameTimers, currentGameMode]);

  // End Game: Permanently terminate match, stop all timers, erase saved session
  const handleEndGame = useCallback(() => {
    clearAllGameTimers();
    if (currentGameMode === 'online_multiplayer' && onlineRoomRef.current) {
      socketClient.endGame(onlineRoomRef.current.code);
      setOnlineRoom(null);
    } else {
      storageManager.clearActiveSession();
      setActiveSession(null);
    }
    setGameState('MENU');
  }, [clearAllGameTimers, currentGameMode]);

  // Reset all preferences
  const handleResetPreferences = () => {
    const defaults = storageManager.resetAllPreferences();
    setPreferences(defaults);
    setSoundEnabled(defaults.soundEnabled);
    setMusicEnabled(defaults.musicEnabled);
    setVoiceEnabled(defaults.voiceEnabled);
    setIsSettingsOpen(false);
  };

  // Bot Turn Automation Effect (Offline vs Computer only)
  useEffect(() => {
    if (
      gameState === 'PLAYING' &&
      currentGameMode === 'vs_computer' &&
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
  }, [gameState, currentGameMode, activePlayer?.isBot, canRoll, isRolling, handleRollDice]);

  // Main Menu Screen
  if (gameState === 'MENU') {
    return (
      <>
        {/* Floating Game Invitation Toast */}
        <InvitationBanner
          invitation={incomingInvitation}
          onAccept={(roomCode) => {
            socketClient.clearIncomingInvitation();
            socketClient.joinRoom(roomCode);
            setIsOnlineModalOpen(true);
          }}
          onDecline={(inviteId, fromId) => {
            socketClient.declineInvitation(inviteId, fromId);
          }}
        />

        <StartMenu
          onStartGame={handleStartGame}
          onResumeSession={handleResumeSession}
          onOpenSoundboard={() => setIsSoundboardOpen(true)}
          onOpenOnlineModal={() => setIsOnlineModalOpen(true)}
          onlineCount={totalOnline}
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

        <OnlineModal
          isOpen={isOnlineModalOpen}
          onClose={() => setIsOnlineModalOpen(false)}
          onStartMatch={(room) => {
            setIsOnlineModalOpen(false);
            handleStartOnlineMatch(room);
          }}
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

  // Active Game Screen
  const isOnlineMode = currentGameMode === 'online_multiplayer';
  const myId = socketClient.getPlayerId();
  const mySeat = onlineRoom?.seats.find((s) => s.playerId === myId) || null;
  const isMyTurn = isOnlineMode ? (mySeat !== null && activePlayerIndex === mySeat.slot) : true;

  return (
    <div className="min-h-screen bg-[#111111] text-[#F5F5F5] flex flex-col justify-between p-2 sm:p-4 select-none overflow-x-hidden">
      {/* Floating Game Invitation Toast */}
      <InvitationBanner
        invitation={incomingInvitation}
        onAccept={(roomCode) => {
          socketClient.clearIncomingInvitation();
          socketClient.joinRoom(roomCode);
          setIsOnlineModalOpen(true);
        }}
        onDecline={(inviteId, fromId) => {
          socketClient.declineInvitation(inviteId, fromId);
        }}
      />

      {/* Top Navbar */}
      <header className="flex items-center justify-between max-w-4xl w-full mx-auto px-4 py-2.5 mb-2 bg-[#161616]/90 backdrop-blur-xl rounded-2xl border border-white/[0.12] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        {/* Brand & Mode Tag */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-[#E9BC42]/40 flex items-center justify-center shadow-md">
            <img
              src="/images/icon.png"
              alt="Logo"
              className="w-5 h-5 object-contain"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-sm uppercase tracking-wider text-[#F5F5F5] leading-none">
                RIZZ DICE
              </span>
              {isOnlineMode && onlineRoom && (
                <span className="text-[9px] font-mono font-bold bg-[#E9BC42]/15 text-[#E9BC42] px-1.5 py-0.2 rounded border border-[#E9BC42]/30">
                  #{onlineRoom.code}
                </span>
              )}
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#E9BC42]">
              {isOnlineMode ? 'Online Multiplayer' : 'Ludo King Redefined'}
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

          {/* Game Menu (Resume / Quit / End Game / Settings) */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-[#F5F5F5] border border-white/[0.08] transition cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Game Menu"
          >
            <Menu className="w-3.5 h-3.5 text-[#E9BC42]" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      {/* Disconnected Player Grace Period Banner */}
      {disconnectedNotice && (
        <div className="w-full max-w-lg mx-auto mb-2 p-2.5 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs text-amber-200 animate-pulse">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>
              <strong>{disconnectedNotice.name}</strong> disconnected. 120s grace period active...
            </span>
          </div>
          <span className="font-mono font-black text-amber-300">
            {disconnectedNotice.secondsLeft}s
          </span>
        </div>
      )}

      {/* Main Board Arena with 4 Player Stations */}
      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl w-full mx-auto px-1">
        {/* Top Player Stations (Red: Pos 1 Top-Left, Green: Pos 2 Top-Right) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full max-w-[620px] mb-2">
          {players.find((p) => p.position === 1) ? (
            <DicePad
              player={players.find((p) => p.position === 1)!}
              isActive={activePlayer?.position === 1}
              canRoll={isOnlineMode ? (isMyTurn && activePlayer?.position === 1 && canRoll) : canRoll}
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
              canRoll={isOnlineMode ? (isMyTurn && activePlayer?.position === 2 && canRoll) : canRoll}
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
              canRoll={isOnlineMode ? (isMyTurn && activePlayer?.position === 3 && canRoll) : canRoll}
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
              canRoll={isOnlineMode ? (isMyTurn && activePlayer?.position === 4 && canRoll) : canRoll}
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

      {/* Game Menu Modal */}
      <MenuModal
        isOpen={isSettingsOpen}
        soundEnabled={soundEnabled}
        musicEnabled={musicEnabled}
        voiceEnabled={voiceEnabled}
        isOnline={isOnlineMode}
        onResume={() => setIsSettingsOpen(false)}
        onQuitGame={handleQuitGame}
        onEndGame={handleEndGame}
        onToggleSound={handleToggleSound}
        onToggleMusic={handleToggleMusic}
        onToggleVoice={handleToggleVoice}
        onOpenSoundboard={() => setIsSoundboardOpen(true)}
        onRestart={() => {
          clearAllGameTimers();
          handleStartGame(
            currentGameMode,
            players.length as 2 | 3 | 4,
            players.filter((p) => p.isBot).length,
            players.map((p) => p.name)
          );
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
          onPlayAgain={() => {
            clearAllGameTimers();
            if (isOnlineMode && onlineRoom) {
              socketClient.leaveRoom(onlineRoom.code);
              setOnlineRoom(null);
            }
            handleStartGame(
              currentGameMode === 'online_multiplayer' ? 'pass_and_play' : currentGameMode,
              players.length as 2 | 3 | 4,
              players.filter((p) => p.isBot).length,
              players.map((p) => p.name)
            );
          }}
          onMainMenu={() => {
            clearAllGameTimers();
            if (isOnlineMode && onlineRoom) {
              socketClient.leaveRoom(onlineRoom.code);
              setOnlineRoom(null);
            }
            setGameState('MENU');
            setActiveSession(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
