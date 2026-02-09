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

const RECENT_BOARDS_LS_KEY = 'pinit_recentBoards';

const readRecentBoardsFromLocalStorage = (): Board[] => {
  try {
    const raw = localStorage.getItem(RECENT_BOARDS_LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = new Date().toISOString();
    return parsed
      .filter((x): x is Partial<Board> & { id: unknown; title: unknown } => typeof x === 'object' && x !== null && 'id' in x && 'title' in x)
      .map((x): Board | null => {
        const id = typeof x.id === 'number' ? x.id : Number(x.id);
        if (!Number.isFinite(id)) return null;

        const title = typeof x.title === 'string' ? x.title : String(x.title ?? '');
        if (!title) return null;

        return {
          id,
          title,
          description: typeof x.description === 'string' || x.description === null ? x.description : undefined,
          created_at: typeof x.created_at === 'string' ? x.created_at : now,
          last_visited_at: typeof x.last_visited_at === 'string' || x.last_visited_at === null ? x.last_visited_at : null,
          image: typeof x.image === 'string' || x.image === null ? x.image : null,
        };
      })
      .filter((b): b is Board => b !== null);
  } catch {
    return [];
  }
};

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
      set({ boards: [], recentBoards: readRecentBoardsFromLocalStorage(), isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const { data: myBoards } = await axiosInstance.get<Board[]>('/api/boards');
      const { data: recent } = await axiosInstance.get<Board[]>('/api/boards/recent');
      const recentBoards = Array.isArray(recent) ? recent : [];

      set({
        boards: Array.isArray(myBoards) ? myBoards : [],
        recentBoards,
      });

      try {
        localStorage.setItem(RECENT_BOARDS_LS_KEY, JSON.stringify(recentBoards));
      } catch {
        // ignore localStorage write errors (quota/private mode)
      }
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

    try {
      localStorage.setItem(RECENT_BOARDS_LS_KEY, JSON.stringify(fakeBoards));
    } catch {
      // ignore
    }
  };
}
