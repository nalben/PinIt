import axiosInstance from '@/api/axiosInstance';
import { create } from 'zustand';

export interface Friend {
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
    if (localStorage.getItem('debugFriends') === '1') {
      set({ isLoading: false });
      return;
    }
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

// Dev helper: allow seeding fake friends from the browser console.
// Usage: window.addFakeFriends(10)
if (typeof window !== 'undefined') {
  (window as unknown as { addFakeFriends?: (count?: number) => void; clearFakeFriends?: () => void }).addFakeFriends = (count = 10) => {
    localStorage.setItem('debugFriends', '1');
    const now = new Date().toISOString();
    const fakeFriends: Friend[] = Array.from({ length: count }).map((_, i) => ({
      id: 700000 + i + 1,
      username: `debug_friend_${i + 1}`,
      nickname: `Debug Friend ${i + 1}`,
      avatar: null,
      created_at: now,
    }));

    useFriendsStore.setState({ friends: fakeFriends, isLoading: false });
  };

  (window as unknown as { addFakeFriends?: (count?: number) => void; clearFakeFriends?: () => void }).clearFakeFriends = () => {
    localStorage.removeItem('debugFriends');
    useFriendsStore.setState({ friends: [], isLoading: false });
  };
}
