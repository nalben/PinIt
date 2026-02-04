import axiosInstance, { API_URL } from '@/../axiosInstance';
import { create } from 'zustand';

interface Friend {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  created_at: string;
}

interface FriendsState {
  friends: Friend[];
  isLoading: boolean;
  fetchFriends: (userId: number) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>(set => ({
  friends: [],
  isLoading: false,
  fetchFriends: async (userId: number) => {
    if (userId <= 0) {
      set({ friends: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data } = await axiosInstance.get(`/api/friends/all/${userId}`);
      set({ friends: Array.isArray(data) ? data : [] });
    } catch {
      set({ friends: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
