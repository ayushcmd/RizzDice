import React, { useState, useEffect } from 'react';
import { X, Users, UserCheck, Home, Radio } from 'lucide-react';
import { socketClient } from '../../utils/socketClient';
import type {
  OnlinePlayer,
  PlayerPresenceStatus,
  FriendRecord,
  FriendRequest,
  MultiplayerRoom,
} from '../../types/multiplayer';
import { LobbyPanel } from './LobbyPanel';
import { FriendsPanel } from './FriendsPanel';
import { RoomPanel } from './RoomPanel';

interface OnlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartMatch: (room: MultiplayerRoom) => void;
}

export const OnlineModal: React.FC<OnlineModalProps> = ({
  isOpen,
  onClose,
  onStartMatch,
}) => {
  const [activeTab, setActiveTab] = useState<'lobby' | 'friends' | 'room'>('lobby');
  const [isConnected, setIsConnected] = useState(socketClient.isConnected);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>(socketClient.onlinePlayers);
  const [totalOnline, setTotalOnline] = useState(socketClient.totalOnlineCount);
  const [friends, setFriends] = useState<FriendRecord[]>(socketClient.friends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(socketClient.friendRequests);
  const [currentRoom, setCurrentRoom] = useState<MultiplayerRoom | null>(socketClient.currentRoom);
  const [myStatus, setMyStatus] = useState<PlayerPresenceStatus>('AVAILABLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Connect socket if not connected
    socketClient.connect();

    const unsubConn = socketClient.on('connection_change', (connected: unknown) => {
      setIsConnected(Boolean(connected));
    });

    const unsubLobby = socketClient.on('lobby_updated', (data: unknown) => {
      const d = data as { players: OnlinePlayer[]; totalOnline: number };
      setOnlinePlayers(d.players);
      setTotalOnline(d.totalOnline);
    });

    const unsubFriends = socketClient.on('friends_updated', (data: unknown) => {
      const d = data as { friends: FriendRecord[]; requests: FriendRequest[] };
      setFriends(d.friends);
      setFriendRequests(d.requests);
    });

    const unsubRoomUpdated = socketClient.on('room_updated', (room: unknown) => {
      const r = room as MultiplayerRoom;
      setCurrentRoom(r);
      setActiveTab('room');
    });

    const unsubRoomLeft = socketClient.on('room_left', () => {
      setCurrentRoom(null);
    });

    const unsubRoomClosed = socketClient.on('room_closed', (data: unknown) => {
      const d = data as { reason: string };
      setCurrentRoom(null);
      setErrorMessage(d.reason || 'Room closed.');
      setTimeout(() => setErrorMessage(null), 4000);
    });

    const unsubRoomError = socketClient.on('room_error', (msg: unknown) => {
      setErrorMessage(String(msg));
      setTimeout(() => setErrorMessage(null), 4000);
    });

    const unsubGameStarted = socketClient.on('game_started', (data: unknown) => {
      const d = data as { room: MultiplayerRoom };
      onStartMatch(d.room);
      onClose();
    });

    socketClient.getOnlinePlayersList();
    socketClient.getFriends();

    return () => {
      unsubConn();
      unsubLobby();
      unsubFriends();
      unsubRoomUpdated();
      unsubRoomLeft();
      unsubRoomClosed();
      unsubRoomError();
      unsubGameStarted();
    };
  }, [isOpen, onClose, onStartMatch]);

  if (!isOpen) return null;

  const friendIds = new Set(friends.map((f) => f.id));
  const myPlayerId = socketClient.getPlayerId();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#161616]/95 border border-white/[0.12] rounded-3xl p-5 sm:p-7 shadow-[0_25px_60px_rgba(0,0,0,0.8)] backdrop-blur-2xl flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E9BC42]/15 border border-[#E9BC42]/40 flex items-center justify-center text-[#E9BC42] shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black uppercase tracking-wider text-[#F5F5F5]">
                  Online Multiplayer
                </h2>
                <span
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                  }`}
                  title={isConnected ? 'Connected to Multiplayer Server' : 'Disconnected'}
                />
              </div>
              <span className="text-[11px] text-[#A3A3A3]">
                Lobby • Friends • Private Rooms • Redis Temporary Sync
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] text-[#A3A3A3] hover:text-[#F5F5F5] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Error Banner if any */}
        {errorMessage && (
          <div className="mt-3 p-2.5 bg-red-500/15 border border-red-500/30 text-red-300 rounded-xl text-xs font-semibold animate-shake">
            {errorMessage}
          </div>
        )}

        {/* Segmented Glass Tab Bar */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-black/40 rounded-2xl border border-white/[0.08] my-4">
          <button
            type="button"
            onClick={() => setActiveTab('lobby')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
              activeTab === 'lobby'
                ? 'bg-[#E9BC42] text-black font-black shadow'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Lobby
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                activeTab === 'lobby' ? 'bg-black/20 text-black' : 'bg-white/[0.1] text-[#A3A3A3]'
              }`}
            >
              {totalOnline}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('friends')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer relative ${
              activeTab === 'friends'
                ? 'bg-[#E9BC42] text-black font-black shadow'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Friends
            {friendRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-2" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('room')}
            className={`flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer relative ${
              activeTab === 'room'
                ? 'bg-[#E9BC42] text-black font-black shadow'
                : 'text-[#A3A3A3] hover:text-[#F5F5F5]'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            {currentRoom ? `Room #${currentRoom.code}` : 'Rooms'}
            {currentRoom && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-1 right-2" />
            )}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'lobby' && (
            <LobbyPanel
              onlinePlayers={onlinePlayers}
              totalOnline={totalOnline}
              myPlayerId={myPlayerId}
              myStatus={myStatus}
              currentRoomCode={currentRoom?.code}
              friendIds={friendIds}
              onSendFriendRequest={(id) => socketClient.sendFriendRequest(id)}
              onInvitePlayer={(id) => {
                if (currentRoom) socketClient.sendGameInvitation(id, currentRoom.code);
              }}
              onStatusChange={(status) => {
                setMyStatus(status);
                socketClient.setStatus(status);
              }}
            />
          )}

          {activeTab === 'friends' && (
            <FriendsPanel
              myPlayerId={myPlayerId}
              friends={friends}
              friendRequests={friendRequests}
              currentRoomCode={currentRoom?.code}
              onSearchAndAddFriend={(id) => socketClient.sendFriendRequest(id)}
              onAcceptRequest={(reqId, fromId) => socketClient.acceptFriendRequest(reqId, fromId)}
              onRejectRequest={(reqId) => socketClient.rejectFriendRequest(reqId)}
              onRemoveFriend={(fId) => socketClient.removeFriend(fId)}
              onInviteFriend={(fId) => {
                if (currentRoom) socketClient.sendGameInvitation(fId, currentRoom.code);
              }}
            />
          )}

          {activeTab === 'room' && (
            <RoomPanel
              currentRoom={currentRoom}
              myPlayerId={myPlayerId}
              friends={friends}
              onCreateRoom={(maxPlayers, withBots) => socketClient.createRoom(maxPlayers, withBots)}
              onJoinRoom={(code) => socketClient.joinRoom(code)}
              onToggleReady={(code) => socketClient.toggleReady(code)}
              onToggleBots={(code) => socketClient.toggleBots(code)}
              onLeaveRoom={(code) => socketClient.leaveRoom(code)}
              onStartMatch={(code) => socketClient.startMatch(code)}
              onInviteFriend={(fId, code) => socketClient.sendGameInvitation(fId, code)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
