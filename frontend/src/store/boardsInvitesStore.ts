import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';
import { useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

export interface BoardInvite {
  id: number;
  board_id: number;
  title: string;
  description?: string | null;
  image?: string | null;
  created_at: string;

  user_id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
}

interface BoardsInvitesState {
  invites: BoardInvite[];
  isLoading: boolean;
  hasLoadedOnce: boolean;

  fetchInvites: () => Promise<void>;
  ensureInvitesLoaded: () => Promise<void>;
  addInvite: (invite: BoardInvite) => void;
  removeInvite: (inviteId: number) => void;
  clearInvites: () => void;

  acceptInvite: (inviteId: number) => Promise<void>;
  rejectInvite: (inviteId: number) => Promise<void>;
}

export const useBoardsInvitesStore = create<BoardsInvitesState>((set, get) => ({
  invites: [],
  isLoading: false,
  hasLoadedOnce: false,

  fetchInvites: async () => {
    if (get().isLoading) return;
    const token = localStorage.getItem('token');
    if (!token) {
      set({ invites: [], isLoading: false, hasLoadedOnce: false });
      return;
    }
    if (localStorage.getItem('debugBoardInvites') === '1') {
      set({ isLoading: false, hasLoadedOnce: true });
      return;
    }

    set({ isLoading: true });
    try {
      const { data } = await axiosInstance.get<BoardInvite[]>('/api/boards/invites/incoming');
      set({ invites: Array.isArray(data) ? data : [] });
    } catch {
      set({ invites: [] });
    } finally {
      set({ isLoading: false, hasLoadedOnce: true });
    }
  },

  ensureInvitesLoaded: async () => {
    if (get().hasLoadedOnce) return;
    await get().fetchInvites();
  },

  addInvite: (invite) => {
    set((state) => ({
      invites: state.invites.some(i => i.id === invite.id) ? state.invites : [invite, ...state.invites]
    }));
  },

  removeInvite: (inviteId) => {
    set((state) => ({
      invites: state.invites.filter(i => i.id !== inviteId)
    }));
  },

  clearInvites: () => set({ invites: [], isLoading: false, hasLoadedOnce: false }),

  acceptInvite: async (inviteId) => {
    if (localStorage.getItem('debugBoardInvites') === '1') {
      get().removeInvite(inviteId);
      return;
    }
    try {
      const invite = get().invites.find((i) => i.id === inviteId) ?? null;
      await axiosInstance.put(`/api/boards/invites/accept/${inviteId}`);
      get().removeInvite(inviteId);
      if (invite) {
        useBoardsUnifiedStore.getState().upsertFromInvite(
          {
            id: invite.board_id,
            title: invite.title,
            description: invite.description ?? null,
            created_at: invite.created_at,
            image: invite.image ?? null,
          },
          'guest'
        );
        useBoardsUnifiedStore.getState().upsertFromInvite(
          {
            id: invite.board_id,
            title: invite.title,
            description: invite.description ?? null,
            created_at: invite.created_at,
            image: invite.image ?? null,
          },
          'friends'
        );
      }
    } catch (e) {
      console.error(e);
    }
  },

  rejectInvite: async (inviteId) => {
    if (localStorage.getItem('debugBoardInvites') === '1') {
      get().removeInvite(inviteId);
      return;
    }
    try {
      await axiosInstance.put(`/api/boards/invites/reject/${inviteId}`);
      get().removeInvite(inviteId);
    } catch (e) {
      console.error(e);
    }
  },
}));

// Dev helper: allow adding fake board invites from the browser console.
// Usage: window.addFakeBoardInvites(5)
if (typeof window !== 'undefined') {
  (window as unknown as { addFakeBoardInvites?: (count?: number) => void; clearFakeBoardInvites?: () => void }).addFakeBoardInvites = (count = 3) => {
    localStorage.setItem('debugBoardInvites', '1');
    const now = new Date().toISOString();

    for (let i = 0; i < count; i += 1) {
      const id = Date.now() + i;
      useBoardsInvitesStore.getState().addInvite({
        id,
        board_id: 1000 + i,
        title: `Debug board ${i + 1}`,
        description: null,
        image: null,
        created_at: now,

        user_id: 2000 + i,
        username: `debug_inviter_${i + 1}`,
        nickname: `Debug Inviter ${i + 1}`,
        avatar: null,
      });
    }
  };

  (window as unknown as { addFakeBoardInvites?: (count?: number) => void; clearFakeBoardInvites?: () => void }).clearFakeBoardInvites = () => {
    localStorage.removeItem('debugBoardInvites');
    useBoardsInvitesStore.getState().clearInvites();
  };
}
