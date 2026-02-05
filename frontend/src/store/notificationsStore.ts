import { create } from 'zustand';
import axiosInstance from '@/../axiosInstance';

export type FriendStatus = 'friend' | 'none' | 'sent' | 'received' | 'rejected';

interface FriendRequestNoti {
  id: number;
  user_id: number;
  username: string;
  nickname?: string;
  avatar?: string | null;
  created_at: string;
  status?: FriendStatus;
}

interface NotificationsState {
  requests: FriendRequestNoti[];
  isLoading: boolean;
  highlightRequestId: number | null;

  fetchRequests: () => Promise<void>;
  addRequest: (req: FriendRequestNoti) => void;
  removeRequest: (id: number) => void;
  updateRequestStatus: (requestId: number, status: FriendStatus) => void;
  setHighlightRequestId: (id: number | null) => void;
  acceptRequest: (id: number) => Promise<void>;
  rejectRequest: (id: number) => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  requests: [],
  isLoading: true,
  highlightRequestId: null,

  fetchRequests: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ requests: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data } = await axiosInstance.get<FriendRequestNoti[]>('/api/friends/requests/incoming');
      let requests = data;

      // debug: add dummy notifications if enabled
      if (localStorage.getItem('debugNoti') === '1') {
        const now = new Date().toISOString();
        const dummies: FriendRequestNoti[] = Array.from({ length: 20 }).map((_, i) => ({
          id: 900000 + i,
          user_id: 1000 + i,
          username: `dummy_user_${i + 1}`,
          nickname: `Dummy ${i + 1}`,
          avatar: null,
          created_at: now
        }));
        requests = [...dummies, ...requests];
      }

      set({ requests });
    } catch {
      set({ requests: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  addRequest: (req) => {
    set((state) => ({
      requests: state.requests.some(r => r.id === req.id) ? state.requests : [req, ...state.requests]
    }));
  },

  removeRequest: (id) => {
    set((state) => ({
      requests: state.requests.filter(r => r.id !== id)
    }));
  },

  updateRequestStatus: (requestId, status) => {
    // если статус 'none' или 'friend', удаляем заявку
    if (status === 'none' || status === 'friend') {
      get().removeRequest(requestId);
      return;
    }

    // иначе обновляем статус заявки
    set((state) => ({
      requests: state.requests.map(r =>
        r.id === requestId ? { ...r, status } : r
      )
    }));
  },
  setHighlightRequestId: (id) => set({ highlightRequestId: id }),

  acceptRequest: async (id) => {
  try {
    await axiosInstance.put(`/api/friends/accept/${id}`);
    set(state => ({
      requests: state.requests.filter(r => r.id !== id)
    }));
  } catch (err) {
    console.error(err);
  }
},

rejectRequest: async (id) => {
  try {
    await axiosInstance.put(`/api/friends/reject/${id}`);
    set(state => ({
      requests: state.requests.filter(r => r.id !== id)
    }));
  } catch (err) {
    console.error(err);
  }
},
}));
