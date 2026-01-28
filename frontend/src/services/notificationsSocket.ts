import { io, Socket } from 'socket.io-client';
import { API_URL } from '@/../axiosInstance';

let socket: Socket | null = null;

export const connectNotificationsSocket = (
  onNewRequest: (data: any) => void,
  onRemoveRequest?: (data: any) => void
) => {
  const token = localStorage.getItem('token');
  if (!token || socket) return;

  socket = io(API_URL, { auth: { token } });

  socket.on('connect', () => console.log('Socket connected:', socket?.id));

  socket.on('friend_request:new', onNewRequest);
  if (onRemoveRequest) socket.on('friend_request:removed', onRemoveRequest);
};

export const disconnectNotificationsSocket = () => {
  socket?.disconnect();
  socket = null;
};
