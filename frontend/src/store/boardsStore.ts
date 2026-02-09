import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';

export interface Board {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  last_visited_at?: string | null;
  image?: string | null;
}

interface BoardsState {
  boards: Board[];
  recentBoards: Board[];
  isLoading: boolean;
  loadBoards: () => Promise<void>;
}

export const useBoardsStore = create<BoardsState>(set => ({
  boards: [],
  recentBoards: [],
  isLoading: false,
  loadBoards: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ boards: [], recentBoards: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data: myBoards } = await axiosInstance.get<Board[]>('/api/boards');
      const { data: recent } = await axiosInstance.get<Board[]>('/api/boards/recent');
      set({
        boards: Array.isArray(myBoards) ? myBoards : [],
        recentBoards: Array.isArray(recent) ? recent : [],
      });
    } catch {
      set({ boards: [], recentBoards: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));

// Dev helper: allow seeding fake boards from the browser console.
// Usage: window.addFakeRecentBoards()
if (typeof window !== 'undefined') {
  (window as unknown as { addFakeRecentBoards?: () => void }).addFakeRecentBoards = () => {
    const now = new Date().toISOString();
    const fakeBoards: Board[] = Array.from({ length: 10 }).map((_, i) => ({
      id: i + 1,
      title: `Fake board ${i + 1}`,
      description: `Fake description ${i + 1}`,
      created_at: now,
      last_visited_at: now,
    }));

    useBoardsStore.setState({ boards: fakeBoards, recentBoards: fakeBoards, isLoading: false });
  };
}
