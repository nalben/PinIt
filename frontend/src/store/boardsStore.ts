import { create } from 'zustand';
import axiosInstance, { API_URL } from '@/../axiosInstance';

interface Board {
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
