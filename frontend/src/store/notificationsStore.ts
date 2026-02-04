import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import axiosInstance, { API_URL } from '@/../axiosInstance';

interface FriendRequestNoti {
  id: number;
  user_id: number;
  username: string;
  nickname?: string;
  avatar?: string | null;
  created_at: string;
}

interface NotificationsState {
  requests: FriendRequestNoti[];
  socket: Socket | null;
  isLoading: boolean;

  initSocket: () => void;
  disconnectSocket: () => void;
  fetchRequests: () => Promise<void>;
  addRequest: (req: FriendRequestNoti) => void;
  removeRequest: (id: number) => void;
  acceptRequest: (id: number) => Promise<void>;
  rejectRequest: (id: number) => Promise<void>;
}
export type FriendStatus = 'friend' | 'none' | 'sent' | 'received' | 'rejected';

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  requests: [],
  socket: null,
  isLoading: true,

  fetchRequests: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ requests: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data } = await axiosInstance.get<FriendRequestNoti[]>('/api/friends/requests/incoming');
      set({ requests: data });
    } catch {
      set({ requests: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  initSocket: () => {
    if (get().socket) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const socket = io(API_URL, { auth: { token } });
    set({ socket });

    socket.on('connect', () => console.log('Socket connected:', socket.id));

    socket.on('friend_request:new', (newReq: FriendRequestNoti) => {
      get().addRequest(newReq);
    });

    socket.on('friend_request:removed', (removed: { id?: number | string; requestId?: number | string }) => {
      const id = Number(removed.id ?? removed.requestId);
      if (!isNaN(id)) get().removeRequest(id);
    });
socket.on('friends:status', (data: { userId: number; status: FriendStatus; requestId?: number }) => {
  const { userId, status, requestId } = data;

  // если статус 'none' и есть requestId, удаляем заявку из уведомлений
  if (status === 'none' && requestId) {
    get().removeRequest(requestId);
  }

  // обновляем статус заявки/кнопки
  set(state => ({
    requests: state.requests.map(r =>
      r.id === requestId ? { ...r, status } : r
    )
  }));
});



    
  },

  disconnectSocket: () => {
    get().socket?.disconnect();
    set({ socket: null });
  },

  addRequest: (req: FriendRequestNoti) => {
    set(state => ({
      requests: state.requests.some(r => r.id === req.id) ? state.requests : [req, ...state.requests]
    }));
  },

  removeRequest: (id: number) => {
    set(state => ({
      requests: state.requests.filter(r => r.id !== id)
    }));
  },

acceptRequest: async (id: number) => {
  try {
    await axiosInstance.put(`/api/friends/accept/${id}`);
    // не удаляем заявку сразу
    // ждем обновления через сокет: friends:status -> status: 'friend'
  } catch (err) {
    console.error(err);
  }
},

rejectRequest: async (id: number) => {
  try {
    await axiosInstance.put(`/api/friends/reject/${id}`);
    // не удаляем заявку сразу
    // ждем обновления через сокет: friends:status -> status: 'rejected'
  } catch (err) {
    console.error(err);
  }
},

}));
