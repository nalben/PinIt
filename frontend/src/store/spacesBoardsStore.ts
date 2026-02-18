import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';

export interface FriendsBoard {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  image?: string | null;
}

export interface GuestBoard {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  image?: string | null;
  my_role?: string | null;
  last_visited_at?: string | null;
}

export interface PublicBoard {
  id: number;
  title: string;
  description?: string | null;
  created_at: string;
  image?: string | null;
}

interface SpacesBoardsState {
  friendsBoards: FriendsBoard[];
  isLoadingFriendsBoards: boolean;
  hasLoadedOnceFriendsBoards: boolean;

  guestBoards: GuestBoard[];
  isLoadingGuestBoards: boolean;
  hasLoadedOnceGuestBoards: boolean;

  publicBoards: PublicBoard[];
  isLoadingPublicBoards: boolean;
  hasLoadedOncePublicBoards: boolean;

  ensureFriendsBoardsLoaded: () => void;
  refreshFriendsBoards: () => void;
  clearFriendsBoards: () => void;

  ensureGuestBoardsLoaded: () => void;
  refreshGuestBoards: () => void;
  clearGuestBoards: () => void;

  ensurePublicBoardsLoaded: () => void;
  refreshPublicBoards: () => void;
  clearPublicBoards: () => void;
}

export const useSpacesBoardsStore = create<SpacesBoardsState>((set, get) => {
  let friendsInFlight = false;
  let guestInFlight = false;
  let publicInFlight = false;

  const fetchFriendsBoards = async (force: boolean) => {
    if (friendsInFlight) return;
    const token = localStorage.getItem('token');
    if (!token) {
      set({ friendsBoards: [], isLoadingFriendsBoards: false, hasLoadedOnceFriendsBoards: false });
      return;
    }

    if (!force) {
      if (get().hasLoadedOnceFriendsBoards) return;
    }

    set({ isLoadingFriendsBoards: true });
    friendsInFlight = true;
    axiosInstance.get<FriendsBoard[]>('/api/boards/friends')
      .then(({ data }) => {
        set({ friendsBoards: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        set({ friendsBoards: [] });
      })
      .then(() => {
        friendsInFlight = false;
        set({ isLoadingFriendsBoards: false, hasLoadedOnceFriendsBoards: true });
      });
  };

  const fetchGuestBoards = async (force: boolean) => {
    if (guestInFlight) return;
    const token = localStorage.getItem('token');
    if (!token) {
      set({ guestBoards: [], isLoadingGuestBoards: false, hasLoadedOnceGuestBoards: false });
      return;
    }

    if (!force) {
      if (get().hasLoadedOnceGuestBoards) return;
    }

    set({ isLoadingGuestBoards: true });
    guestInFlight = true;
    axiosInstance.get<GuestBoard[]>('/api/boards/guest')
      .then(({ data }) => {
        set({ guestBoards: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        set({ guestBoards: [] });
      })
      .then(() => {
        guestInFlight = false;
        set({ isLoadingGuestBoards: false, hasLoadedOnceGuestBoards: true });
      });
  };

  const fetchPublicBoards = async (force: boolean) => {
    if (publicInFlight) return;
    if (!force) {
      if (get().hasLoadedOncePublicBoards) return;
    }

    set({ isLoadingPublicBoards: true });
    publicInFlight = true;
    axiosInstance.get<PublicBoard[]>('/api/boards/public/popular')
      .then(({ data }) => {
        set({ publicBoards: Array.isArray(data) ? data : [] });
      })
      .catch(() => {
        set({ publicBoards: [] });
      })
      .then(() => {
        publicInFlight = false;
        set({ isLoadingPublicBoards: false, hasLoadedOncePublicBoards: true });
      });
  };

  return {
    friendsBoards: [],
    isLoadingFriendsBoards: false,
    hasLoadedOnceFriendsBoards: false,

    guestBoards: [],
    isLoadingGuestBoards: false,
    hasLoadedOnceGuestBoards: false,

    publicBoards: [],
    isLoadingPublicBoards: false,
    hasLoadedOncePublicBoards: false,

    ensureFriendsBoardsLoaded: () => { void fetchFriendsBoards(false); },
    refreshFriendsBoards: () => { void fetchFriendsBoards(true); },
    clearFriendsBoards: () => set({ friendsBoards: [], isLoadingFriendsBoards: false, hasLoadedOnceFriendsBoards: false }),

    ensureGuestBoardsLoaded: () => { void fetchGuestBoards(false); },
    refreshGuestBoards: () => { void fetchGuestBoards(true); },
    clearGuestBoards: () => set({ guestBoards: [], isLoadingGuestBoards: false, hasLoadedOnceGuestBoards: false }),

    ensurePublicBoardsLoaded: () => { void fetchPublicBoards(false); },
    refreshPublicBoards: () => { void fetchPublicBoards(true); },
    clearPublicBoards: () => set({ publicBoards: [], isLoadingPublicBoards: false, hasLoadedOncePublicBoards: false }),
  };
});
