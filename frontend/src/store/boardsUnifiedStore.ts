import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';

export type UnifiedBoard = {
  id: number;
  owner_id?: number;
  title: string;
  description?: string | null;
  created_at: string;
  last_visited_at?: string | null;
  image?: string | null;
  is_public?: number | boolean;
  my_role?: string | null;
};

export const RECENT_BOARDS_LS_KEY = 'pinit_recentBoards';

const readRecentBoardsFromLocalStorage = (): UnifiedBoard[] => {
  try {
    const raw = localStorage.getItem(RECENT_BOARDS_LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = new Date().toISOString();
    return parsed
      .filter((x): x is Partial<UnifiedBoard> & { id: unknown; title: unknown } => typeof x === 'object' && x !== null && 'id' in x && 'title' in x)
      .map((x): UnifiedBoard | null => {
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
          is_public: typeof x.is_public === 'boolean' || typeof x.is_public === 'number' ? x.is_public : undefined,
          my_role: typeof x.my_role === 'string' || x.my_role === null ? x.my_role : undefined,
          owner_id: typeof x.owner_id === 'number' ? x.owner_id : undefined,
        };
      })
      .filter((b): b is UnifiedBoard => b !== null);
  } catch {
    return [];
  }
};

type BoardsUpdatedCommand = { reason?: string; board_id?: number; user_id?: number };

type ListKey = 'my' | 'recent' | 'guest' | 'friends' | 'public';

const normalizeId = (raw: unknown): number | null => {
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const mergeEntity = (prev: UnifiedBoard | undefined, next: UnifiedBoard): UnifiedBoard => {
  if (!prev) return next;
  return {
    ...prev,
    ...next,
    id: next.id,
  };
};

interface BoardsUnifiedState {
  entitiesById: Record<number, UnifiedBoard>;

  myIds: number[];
  recentIds: number[];
  guestIds: number[];
  friendsIds: number[];
  publicIds: number[];

  isLoadingMy: boolean;
  isLoadingRecent: boolean;
  isLoadingGuest: boolean;
  isLoadingFriends: boolean;
  isLoadingPublic: boolean;

  hasLoadedOnceMy: boolean;
  hasLoadedOnceRecent: boolean;
  hasLoadedOnceGuest: boolean;
  hasLoadedOnceFriends: boolean;
  hasLoadedOncePublic: boolean;

  myBoards: UnifiedBoard[];
  recentBoards: UnifiedBoard[];
  guestBoards: UnifiedBoard[];
  friendsBoards: UnifiedBoard[];
  publicBoards: UnifiedBoard[];

  ensureMyLoaded: () => void;
  ensureRecentLoaded: () => void;
  ensureGuestLoaded: () => void;
  ensureFriendsLoaded: () => void;
  ensurePublicLoaded: () => void;

  refreshMySilent: () => void;
  refreshRecentSilent: () => void;
  refreshGuestSilent: () => void;
  refreshFriendsSilent: () => void;
  refreshPublicSilent: () => void;

  clearAuthBoards: () => void;

  upsertFromInvite: (board: Pick<UnifiedBoard, 'id' | 'title' | 'description' | 'image' | 'created_at'>, kind: 'guest' | 'friends') => void;

  handleBoardsUpdated: (cmd?: BoardsUpdatedCommand) => void;
}

const mapIdsToBoards = (entitiesById: Record<number, UnifiedBoard>, ids: number[]) =>
  ids.map((id) => entitiesById[id]).filter(Boolean);

export const useBoardsUnifiedStore = create<BoardsUnifiedState>((set, get) => {
  let myInFlight = false;
  let recentInFlight = false;
  let guestInFlight = false;
  let friendsInFlight = false;
  let publicInFlight = false;

  let syncTimer: number | null = null;
  let pendingPublicRefresh = false;
  let pendingMyRefresh = false;
  let pendingRecentRefresh = false;
  let pendingGuestRefresh = false;
  let pendingFriendsRefresh = false;
  let pendingMetaBoardIds = new Set<number>();

  const setList = (key: ListKey, boards: UnifiedBoard[]) => {
    set((state) => {
      const nextEntities = { ...state.entitiesById };
      const nextIds: number[] = [];

      for (const b of boards) {
        const id = normalizeId(b?.id);
        if (!id) continue;
        nextIds.push(id);
        nextEntities[id] = mergeEntity(nextEntities[id], { ...b, id });
      }

      const nextState: Partial<BoardsUnifiedState> = {
        entitiesById: nextEntities,
      };

      if (key === 'my') nextState.myIds = nextIds;
      if (key === 'recent') nextState.recentIds = nextIds;
      if (key === 'guest') nextState.guestIds = nextIds;
      if (key === 'friends') nextState.friendsIds = nextIds;
      if (key === 'public') nextState.publicIds = nextIds;

      const myBoards = key === 'my' ? mapIdsToBoards(nextEntities, nextIds) : state.myBoards;
      const recentBoards = key === 'recent' ? mapIdsToBoards(nextEntities, nextIds) : state.recentBoards;
      const guestBoards = key === 'guest' ? mapIdsToBoards(nextEntities, nextIds) : state.guestBoards;
      const friendsBoards = key === 'friends' ? mapIdsToBoards(nextEntities, nextIds) : state.friendsBoards;
      const publicBoards = key === 'public' ? mapIdsToBoards(nextEntities, nextIds) : state.publicBoards;

      nextState.myBoards = myBoards;
      nextState.recentBoards = recentBoards;
      nextState.guestBoards = guestBoards;
      nextState.friendsBoards = friendsBoards;
      nextState.publicBoards = publicBoards;

      return nextState as BoardsUnifiedState;
    });
  };

  const removeFromList = (key: ListKey, boardId: number) => {
    set((state) => {
      const nextState: Partial<BoardsUnifiedState> = {};
      if (key === 'my') nextState.myIds = state.myIds.filter((id) => id !== boardId);
      if (key === 'recent') nextState.recentIds = state.recentIds.filter((id) => id !== boardId);
      if (key === 'guest') nextState.guestIds = state.guestIds.filter((id) => id !== boardId);
      if (key === 'friends') nextState.friendsIds = state.friendsIds.filter((id) => id !== boardId);
      if (key === 'public') nextState.publicIds = state.publicIds.filter((id) => id !== boardId);

      const entitiesById = state.entitiesById;
      nextState.myBoards = mapIdsToBoards(entitiesById, nextState.myIds ?? state.myIds);
      nextState.recentBoards = mapIdsToBoards(entitiesById, nextState.recentIds ?? state.recentIds);
      nextState.guestBoards = mapIdsToBoards(entitiesById, nextState.guestIds ?? state.guestIds);
      nextState.friendsBoards = mapIdsToBoards(entitiesById, nextState.friendsIds ?? state.friendsIds);
      nextState.publicBoards = mapIdsToBoards(entitiesById, nextState.publicIds ?? state.publicIds);
      return nextState as BoardsUnifiedState;
    });
  };

  const fetchList = async (key: ListKey, force: boolean, silent?: boolean) => {
    const token = localStorage.getItem('token');
    const isAuth = Boolean(token);

    if (key !== 'public' && !isAuth) {
      if (key === 'recent') {
        const recent = readRecentBoardsFromLocalStorage();
        setList('recent', recent);
        set({ isLoadingRecent: false, hasLoadedOnceRecent: true });
      } else {
        set((s) => ({
          ...(key === 'my' ? { myIds: [], myBoards: [] } : null),
          ...(key === 'guest' ? { guestIds: [], guestBoards: [] } : null),
          ...(key === 'friends' ? { friendsIds: [], friendsBoards: [] } : null),
          isLoadingMy: key === 'my' ? false : s.isLoadingMy,
          isLoadingGuest: key === 'guest' ? false : s.isLoadingGuest,
          isLoadingFriends: key === 'friends' ? false : s.isLoadingFriends,
          hasLoadedOnceMy: key === 'my' ? false : s.hasLoadedOnceMy,
          hasLoadedOnceGuest: key === 'guest' ? false : s.hasLoadedOnceGuest,
          hasLoadedOnceFriends: key === 'friends' ? false : s.hasLoadedOnceFriends,
        }));
      }
      return;
    }

    if (!force) {
      if (key === 'my' && get().hasLoadedOnceMy) return;
      if (key === 'recent' && get().hasLoadedOnceRecent) return;
      if (key === 'guest' && get().hasLoadedOnceGuest) return;
      if (key === 'friends' && get().hasLoadedOnceFriends) return;
      if (key === 'public' && get().hasLoadedOncePublic) return;
    }

    const setLoading = (v: boolean) => {
      if (silent) return;
      if (key === 'my') set({ isLoadingMy: v });
      if (key === 'recent') set({ isLoadingRecent: v });
      if (key === 'guest') set({ isLoadingGuest: v });
      if (key === 'friends') set({ isLoadingFriends: v });
      if (key === 'public') set({ isLoadingPublic: v });
    };

    setLoading(true);

    const markDone = () => {
      if (key === 'my') set({ isLoadingMy: false, hasLoadedOnceMy: true });
      if (key === 'recent') set({ isLoadingRecent: false, hasLoadedOnceRecent: true });
      if (key === 'guest') set({ isLoadingGuest: false, hasLoadedOnceGuest: true });
      if (key === 'friends') set({ isLoadingFriends: false, hasLoadedOnceFriends: true });
      if (key === 'public') set({ isLoadingPublic: false, hasLoadedOncePublic: true });
    };

    const onErr = () => {
      if (silent) return;
      if (key === 'my') setList('my', []);
      if (key === 'recent') setList('recent', []);
      if (key === 'guest') setList('guest', []);
      if (key === 'friends') setList('friends', []);
      if (key === 'public') setList('public', []);
    };

    try {
      let data: unknown = null;
      if (key === 'my') ({ data } = await axiosInstance.get('/api/boards'));
      if (key === 'recent') ({ data } = await axiosInstance.get('/api/boards/recent'));
      if (key === 'guest') ({ data } = await axiosInstance.get('/api/boards/guest'));
      if (key === 'friends') ({ data } = await axiosInstance.get('/api/boards/friends'));
      if (key === 'public') ({ data } = await axiosInstance.get('/api/boards/public/popular'));

      const boards = Array.isArray(data) ? (data as UnifiedBoard[]) : [];
      setList(key, boards);
    } catch {
      onErr();
    } finally {
      setLoading(false);
      markDone();
    }
  };

  const refreshBoardMeta = async (boardId: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/${boardId}`);
      if (!data || typeof data !== 'object') return;
      set((state) => {
        const prev = state.entitiesById[boardId];
        const nextEntities = { ...state.entitiesById, [boardId]: mergeEntity(prev, { ...(data as UnifiedBoard), id: boardId }) };

        return {
          entitiesById: nextEntities,
          myBoards: mapIdsToBoards(nextEntities, state.myIds),
          recentBoards: mapIdsToBoards(nextEntities, state.recentIds),
          guestBoards: mapIdsToBoards(nextEntities, state.guestIds),
          friendsBoards: mapIdsToBoards(nextEntities, state.friendsIds),
          publicBoards: mapIdsToBoards(nextEntities, state.publicIds),
        } as Partial<BoardsUnifiedState> as BoardsUnifiedState;
      });
    } catch {
      // ignore
    }
  };

  const flushSync = () => {
    syncTimer = null;
    const metaIds = Array.from(pendingMetaBoardIds);
    pendingMetaBoardIds = new Set<number>();
    const doPublic = pendingPublicRefresh;
    pendingPublicRefresh = false;

    const doMy = pendingMyRefresh;
    const doRecent = pendingRecentRefresh;
    const doGuest = pendingGuestRefresh;
    const doFriends = pendingFriendsRefresh;

    pendingMyRefresh = false;
    pendingRecentRefresh = false;
    pendingGuestRefresh = false;
    pendingFriendsRefresh = false;

    if (doPublic) void fetchList('public', true, true);
    if (doMy) void fetchList('my', true, true);
    if (doRecent) void fetchList('recent', true, true);
    if (doGuest) void fetchList('guest', true, true);
    if (doFriends) void fetchList('friends', true, true);
    for (const id of metaIds) {
      void refreshBoardMeta(id);
    }
  };

  const scheduleSync = () => {
    if (syncTimer) return;
    syncTimer = window.setTimeout(flushSync, 200);
  };

  const getMyUserId = () => {
    const fromStore = useAuthStore.getState().user?.id;
    if (typeof fromStore === 'number' && Number.isFinite(fromStore) && fromStore > 0) return fromStore;
    try {
      const raw = localStorage.getItem('userId');
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  };

  return {
    entitiesById: {},

    myIds: [],
    recentIds: [],
    guestIds: [],
    friendsIds: [],
    publicIds: [],

    isLoadingMy: false,
    isLoadingRecent: false,
    isLoadingGuest: false,
    isLoadingFriends: false,
    isLoadingPublic: false,

    hasLoadedOnceMy: false,
    hasLoadedOnceRecent: false,
    hasLoadedOnceGuest: false,
    hasLoadedOnceFriends: false,
    hasLoadedOncePublic: false,

    myBoards: [],
    recentBoards: [],
    guestBoards: [],
    friendsBoards: [],
    publicBoards: [],

    ensureMyLoaded: () => void fetchList('my', false),
    ensureRecentLoaded: () => void fetchList('recent', false),
    ensureGuestLoaded: () => void fetchList('guest', false),
    ensureFriendsLoaded: () => void fetchList('friends', false),
    ensurePublicLoaded: () => void fetchList('public', false),

    refreshMySilent: () => void fetchList('my', true, true),
    refreshRecentSilent: () => void fetchList('recent', true, true),
    refreshGuestSilent: () => void fetchList('guest', true, true),
    refreshFriendsSilent: () => void fetchList('friends', true, true),
    refreshPublicSilent: () => void fetchList('public', true, true),

    clearAuthBoards: () => {
      set((s) => ({
        ...s,
        myIds: [],
        myBoards: [],
        guestIds: [],
        guestBoards: [],
        friendsIds: [],
        friendsBoards: [],
        isLoadingMy: false,
        isLoadingGuest: false,
        isLoadingFriends: false,
        hasLoadedOnceMy: false,
        hasLoadedOnceGuest: false,
        hasLoadedOnceFriends: false,
      }));
    },

    upsertFromInvite: (board, kind) => {
      const boardId = normalizeId(board?.id);
      if (!boardId) return;
      set((state) => {
        const prev = state.entitiesById[boardId];
        const nextEntities = { ...state.entitiesById, [boardId]: mergeEntity(prev, { ...(board as UnifiedBoard), id: boardId }) };

        const next: Partial<BoardsUnifiedState> = {
          entitiesById: nextEntities,
        };

        if (kind === 'guest') {
          const ids = state.guestIds.includes(boardId) ? state.guestIds : [boardId, ...state.guestIds];
          next.guestIds = ids;
          next.guestBoards = mapIdsToBoards(nextEntities, ids);
          next.hasLoadedOnceGuest = true;
        }

        if (kind === 'friends') {
          const ids = state.friendsIds.includes(boardId) ? state.friendsIds : [boardId, ...state.friendsIds];
          next.friendsIds = ids;
          next.friendsBoards = mapIdsToBoards(nextEntities, ids);
          next.hasLoadedOnceFriends = true;
        }

        return next as BoardsUnifiedState;
      });
    },

    handleBoardsUpdated: (cmd) => {
      const reason = typeof cmd?.reason === 'string' ? cmd?.reason : '';
      const boardId = normalizeId(cmd?.board_id);
      const subjectUserId = normalizeId(cmd?.user_id);
      const myUserId = getMyUserId();
      const affectsMe = subjectUserId && myUserId ? subjectUserId === myUserId : true;
      const state = get();

      const membershipReasons = new Set(['join_public', 'invite_accepted', 'invite_link_accepted', 'left']);

      // Card updates should not refresh boards lists/meta.
      // (Cards are handled on the board page itself.)
      if (
        reason === 'card_created' ||
        reason === 'card_updated' ||
        reason === 'card_deleted' ||
        reason === 'cards_changed' ||
        reason === 'card_moved'
      ) {
        return;
      }

      if (reason === 'removed' && boardId) {
        if (!affectsMe) return;
        removeFromList('public', boardId);
        removeFromList('guest', boardId);
        removeFromList('friends', boardId);
        removeFromList('recent', boardId);
        pendingRecentRefresh = Boolean(state.hasLoadedOnceRecent);
        pendingGuestRefresh = Boolean(state.hasLoadedOnceGuest);
        pendingFriendsRefresh = Boolean(state.hasLoadedOnceFriends);
        pendingPublicRefresh = Boolean(state.hasLoadedOncePublic);
        if (pendingRecentRefresh || pendingGuestRefresh || pendingFriendsRefresh || pendingPublicRefresh) scheduleSync();
        return;
      }

      if (reason === 'public_changed') {
        pendingPublicRefresh = Boolean(state.hasLoadedOncePublic);
        if (boardId) pendingMetaBoardIds.add(boardId);
        if (pendingPublicRefresh || (boardId && pendingMetaBoardIds.size)) scheduleSync();
        return;
      }

      if (reason === 'meta_changed' || reason === 'title_changed' || reason === 'description_changed' || reason === 'image_changed') {
        if (boardId) pendingMetaBoardIds.add(boardId);
        pendingPublicRefresh = Boolean(state.hasLoadedOncePublic);
        if (pendingPublicRefresh || (boardId && pendingMetaBoardIds.size)) scheduleSync();
        return;
      }

      if (membershipReasons.has(reason)) {
        if (!affectsMe) return;
        if (reason === 'left' && boardId) {
          removeFromList('guest', boardId);
          removeFromList('friends', boardId);
          removeFromList('recent', boardId);
        }
        pendingGuestRefresh = Boolean(state.hasLoadedOnceGuest);
        pendingFriendsRefresh = Boolean(state.hasLoadedOnceFriends);
        pendingRecentRefresh = Boolean(state.hasLoadedOnceRecent);
        pendingPublicRefresh = Boolean(state.hasLoadedOncePublic);
        if (boardId) pendingMetaBoardIds.add(boardId);
        if (reason === 'left') pendingPublicRefresh = false;
        if (pendingGuestRefresh || pendingFriendsRefresh || pendingRecentRefresh || pendingPublicRefresh || (boardId && pendingMetaBoardIds.size)) scheduleSync();
        return;
      }

      // Role changes affect only participants, not boards lists/meta.
      if (reason === 'role') {
        return;
      }

      if (reason === 'invite_cleared' || reason === 'invite_rejected') {
        return;
      }

      if (boardId) {
        pendingMetaBoardIds.add(boardId);
        scheduleSync();
        return;
      }

      pendingGuestRefresh = Boolean(state.hasLoadedOnceGuest);
      pendingFriendsRefresh = Boolean(state.hasLoadedOnceFriends);
      pendingRecentRefresh = Boolean(state.hasLoadedOnceRecent);
      pendingPublicRefresh = Boolean(state.hasLoadedOncePublic);
      if (pendingGuestRefresh || pendingFriendsRefresh || pendingRecentRefresh || pendingPublicRefresh) scheduleSync();
    },
  };
});
