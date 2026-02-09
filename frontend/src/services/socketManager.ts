import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/api/axiosInstance';

let socket: Socket | null = null;

type Callbacks = {
  onFriendsUpdate?: (friends: any[]) => void;
  onFriendStatusChange?: (data: { userId: number; status: string; requestId?: number }) => void;
  onNewRequest?: (data: any) => void;
  onRemoveRequest?: (data: any) => void;
};

export const connectSocket = (callbacks?: Callbacks) => {
  const token = localStorage.getItem('token');
  if (!token) return () => {};

  // создаём сокет ТОЛЬКО если его нет
  if (!socket) {
    socket = io(API_URL, { auth: { token } });
    socket.on('connect', () => console.log('Socket connected:', socket?.id));
  }

  // ⚠️ ВАЖНО: подписки добавляем ВСЕГДА
  if (!callbacks) return () => {};

  const listeners: Array<[string, (...args: any[]) => void]> = [];

  if (callbacks.onFriendsUpdate)
    socket.on('friends:list', callbacks.onFriendsUpdate);
  if (callbacks.onFriendsUpdate)
    listeners.push(['friends:list', callbacks.onFriendsUpdate]);

  if (callbacks.onFriendStatusChange)
    socket.on('friends:status', callbacks.onFriendStatusChange);
  if (callbacks.onFriendStatusChange)
    listeners.push(['friends:status', callbacks.onFriendStatusChange]);

  if (callbacks.onNewRequest)
    socket.on('friend_request:new', callbacks.onNewRequest);
  if (callbacks.onNewRequest)
    listeners.push(['friend_request:new', callbacks.onNewRequest]);

  if (callbacks.onRemoveRequest)
    socket.on('friend_request:removed', callbacks.onRemoveRequest);
  if (callbacks.onRemoveRequest)
    listeners.push(['friend_request:removed', callbacks.onRemoveRequest]);

  return () => {
    if (!socket) return;
    listeners.forEach(([event, handler]) => socket?.off(event, handler));
  };
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
