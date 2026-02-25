import { create } from 'zustand';
import axiosInstance from '@/api/axiosInstance';
import { useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

type BoardParticipantRole = 'owner' | 'guest' | 'editer';
type BoardRole = BoardParticipantRole | null;

export type BoardParticipant = {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  role: BoardParticipantRole;
  added_at?: string;
};

export type BoardParticipantsResponse = {
  board_id?: number;
  my_role: BoardRole;
  participants: BoardParticipant[];
};

type OutgoingInvitesByUserId = Record<number, { id: number; status: 'sent' | 'rejected' }>;

export type BoardMeta = {
  id: number;
  owner_id: number;
  is_public?: number | boolean;
  title: string;
  description?: string | null;
  image?: string | null;
  created_at: string;
  my_role: BoardRole;
};

export type BoardMetaDraft = {
  title: string;
  description: string;
  is_public: boolean;
};

type LoadingFlags = {
  initial: boolean;
  refreshing: boolean;
};

export type BoardsUpdatedCommand = {
  reason?: string;
  board_id?: number | string;
};

const participantsInFlight = new Map<number, Promise<BoardParticipantsResponse | null>>();
const outgoingInvitesInFlight = new Map<number, Promise<OutgoingInvitesByUserId>>();
const inviteLinkInFlight = new Map<number, Promise<string | null>>();
const boardMetaInFlight = new Map<number, Promise<BoardMeta | null>>();

const normalizeId = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const isOwnerForBoard = (boardId: number) => {
  const entity = useBoardsUnifiedStore.getState().entitiesById?.[boardId];
  const role = (entity as { my_role?: unknown } | null)?.my_role;
  return role === 'owner';
};

export type BoardDetailsState = {
  boardMetaByBoardId: Record<number, BoardMeta | null>;
  boardMetaLoadingByBoardId: Record<number, LoadingFlags>;
  boardMetaHasLoadedOnce: Record<number, true>;
  boardMetaFetchedAtByBoardId: Record<number, number>;
  boardDraftByBoardId: Record<number, BoardMetaDraft | undefined>;
  boardDraftDirtyByBoardId: Record<number, true>;

  participantsByBoardId: Record<number, BoardParticipantsResponse | null>;
  participantsLoadingByBoardId: Record<number, LoadingFlags>;
  participantsHasLoadedOnce: Record<number, true>;
  participantsFetchedAtByBoardId: Record<number, number>;

  outgoingInvitesByBoardId: Record<number, OutgoingInvitesByUserId>;
  outgoingInvitesLoadingByBoardId: Record<number, LoadingFlags>;
  outgoingInvitesHasLoadedOnce: Record<number, true>;
  outgoingInvitesFetchedAtByBoardId: Record<number, number>;

  inviteLinkTokenByBoardId: Record<number, string | null>;
  inviteLinkLoadingByBoardId: Record<number, LoadingFlags>;
  inviteLinkHasLoadedOnce: Record<number, true>;
  inviteLinkFetchedAtByBoardId: Record<number, number>;

  accessLostBoards: Record<number, true>;

  ensureBoardMetaLoaded: (boardId: number) => void;
  refreshBoardMetaSilent: (boardId: number) => void;
  refreshBoardMetaIfStale: (boardId: number, ttlMs: number) => void;
  seedBoardDraftFromInitial: (boardId: number, seed?: Partial<BoardMetaDraft>) => void;
  setBoardDraft: (boardId: number, patch: Partial<BoardMetaDraft>, markDirty?: boolean) => void;
  resetBoardDraft: (boardId: number) => void;
  applyBoardMetaPatch: (boardId: number, patch: Partial<BoardMeta>) => void;

  ensureParticipantsLoaded: (boardId: number) => void;
  refreshParticipantsSilent: (boardId: number) => void;
  refreshParticipantsIfStale: (boardId: number, ttlMs: number) => void;
  applyParticipantsPatch: (boardId: number, patch: (prev: BoardParticipantsResponse | null) => BoardParticipantsResponse | null) => void;

  ensureOutgoingInvitesLoaded: (boardId: number) => void;
  refreshOutgoingInvitesSilent: (boardId: number) => void;
  refreshOutgoingInvitesIfStale: (boardId: number, ttlMs: number) => void;
  setOutgoingInvite: (boardId: number, userId: number, invite: { id: number; status: 'sent' | 'rejected' }) => void;
  removeOutgoingInvite: (boardId: number, userId: number) => void;

  ensureInviteLinkLoaded: (boardId: number) => void;
  refreshInviteLinkSilent: (boardId: number) => void;
  refreshInviteLinkIfStale: (boardId: number, ttlMs: number) => void;
  setInviteLinkToken: (boardId: number, token: string | null) => void;

  clearBoard: (boardId: number) => void;
  clearAll: () => void;

  handleBoardsUpdated: (cmd?: BoardsUpdatedCommand) => void;
};

const getLoading = (state: Record<number, LoadingFlags>, boardId: number): LoadingFlags =>
  state[boardId] ?? { initial: false, refreshing: false };

const fetchParticipants = async (boardId: number) => {
  const { data } = await axiosInstance.get<BoardParticipantsResponse>(`/api/boards/${boardId}/participants`);
  if (!data || typeof data !== 'object') return null;
  return {
    board_id: typeof (data as { board_id?: unknown }).board_id === 'number' ? (data as { board_id: number }).board_id : boardId,
    my_role: ((data as { my_role?: unknown }).my_role as BoardRole) ?? null,
    participants: Array.isArray((data as { participants?: unknown }).participants) ? ((data as { participants: BoardParticipant[] }).participants ?? []) : [],
  } as BoardParticipantsResponse;
};

const fetchOutgoingInvites = async (boardId: number) => {
  const { data } = await axiosInstance.get<{ id: number; invited_id: number; status: string }[]>(`/api/boards/${boardId}/invites/outgoing`);
  const map: OutgoingInvitesByUserId = {};
  if (Array.isArray(data)) {
    for (const inv of data) {
      const invitedId = normalizeId(inv?.invited_id);
      const inviteId = normalizeId(inv?.id);
      const status = inv?.status;
      if (!invitedId || !inviteId) continue;
      if (status !== 'sent' && status !== 'rejected') continue;
      if (map[invitedId]) continue;
      map[invitedId] = { id: inviteId, status };
    }
  }
  return map;
};

const fetchInviteLink = async (boardId: number) => {
  const { data } = await axiosInstance.get<{ token?: string | null }>(`/api/boards/${boardId}/invite-link`);
  const token = typeof data?.token === 'string' ? data.token : null;
  return token;
};

const fetchBoardMeta = async (boardId: number) => {
  const { data } = await axiosInstance.get<BoardMeta>(`/api/boards/${boardId}`);
  if (!data || typeof data !== 'object') return null;
  const id = normalizeId((data as { id?: unknown }).id) ?? boardId;
  return { ...(data as BoardMeta), id };
};

export const useBoardDetailsStore = create<BoardDetailsState>((set, get) => ({
  boardMetaByBoardId: {},
  boardMetaLoadingByBoardId: {},
  boardMetaHasLoadedOnce: {},
  boardMetaFetchedAtByBoardId: {},
  boardDraftByBoardId: {},
  boardDraftDirtyByBoardId: {},

  participantsByBoardId: {},
  participantsLoadingByBoardId: {},
  participantsHasLoadedOnce: {},
  participantsFetchedAtByBoardId: {},

  outgoingInvitesByBoardId: {},
  outgoingInvitesLoadingByBoardId: {},
  outgoingInvitesHasLoadedOnce: {},
  outgoingInvitesFetchedAtByBoardId: {},

  inviteLinkTokenByBoardId: {},
  inviteLinkLoadingByBoardId: {},
  inviteLinkHasLoadedOnce: {},
  inviteLinkFetchedAtByBoardId: {},

  accessLostBoards: {},

  ensureBoardMetaLoaded: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (get().boardMetaHasLoadedOnce[id]) return;
    void get().refreshBoardMetaSilent(id);
  },

  refreshBoardMetaSilent: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;

    const hasData = Boolean(get().boardMetaByBoardId[id]);
    const loading = getLoading(get().boardMetaLoadingByBoardId, id);
    if (!hasData && !loading.initial) {
      set((s) => ({
        boardMetaLoadingByBoardId: { ...s.boardMetaLoadingByBoardId, [id]: { initial: true, refreshing: false } },
      }));
    } else if (hasData && !loading.refreshing) {
      set((s) => ({
        boardMetaLoadingByBoardId: { ...s.boardMetaLoadingByBoardId, [id]: { initial: false, refreshing: true } },
      }));
    }

    const promise =
      boardMetaInFlight.get(id) ??
      fetchBoardMeta(id)
        .catch(() => null)
        .finally(() => {
          boardMetaInFlight.delete(id);
          set((s) => ({
            boardMetaFetchedAtByBoardId: { ...s.boardMetaFetchedAtByBoardId, [id]: Date.now() },
          }));
          set((s) => ({
            boardMetaLoadingByBoardId: { ...s.boardMetaLoadingByBoardId, [id]: { initial: false, refreshing: false } },
          }));
        });

    if (!boardMetaInFlight.has(id)) boardMetaInFlight.set(id, promise);

    void promise.then((meta) => {
      set((s) => {
        const next: Partial<BoardDetailsState> = {
          boardMetaByBoardId: { ...s.boardMetaByBoardId, [id]: meta },
          boardMetaHasLoadedOnce: { ...s.boardMetaHasLoadedOnce, [id]: true },
        };

        const isDirty = Boolean(s.boardDraftDirtyByBoardId[id]);
        const hasDraft = Boolean(s.boardDraftByBoardId[id]);
        if (meta && (!isDirty || !hasDraft)) {
          const nextDraft: BoardMetaDraft = {
            title: typeof meta.title === 'string' ? meta.title : '',
            description: typeof meta.description === 'string' ? meta.description : meta.description == null ? '' : String(meta.description),
            is_public: typeof meta.is_public === 'boolean' ? meta.is_public : Number(meta.is_public) === 1,
          };
          next.boardDraftByBoardId = { ...s.boardDraftByBoardId, [id]: nextDraft };
          next.boardDraftDirtyByBoardId = (() => {
            const dirty = { ...s.boardDraftDirtyByBoardId };
            delete dirty[id];
            return dirty;
          })();
        }

        return next as BoardDetailsState;
      });
    });
  },

  refreshBoardMetaIfStale: (boardId, ttlMs) => {
    const id = normalizeId(boardId);
    if (!id) return;
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const last = Number(get().boardMetaFetchedAtByBoardId[id] ?? 0);
    if (last && Date.now() - last < ttl) return;
    get().refreshBoardMetaSilent(id);
  },

  seedBoardDraftFromInitial: (boardId, seed) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => {
      if (s.boardDraftByBoardId[id] || s.boardMetaByBoardId[id]) return s;
      const nextDraft: BoardMetaDraft = {
        title: typeof seed?.title === 'string' ? seed.title : '',
        description: typeof seed?.description === 'string' ? seed.description : '',
        is_public: typeof seed?.is_public === 'boolean' ? seed.is_public : Boolean(seed?.is_public),
      };
      return {
        boardDraftByBoardId: { ...s.boardDraftByBoardId, [id]: nextDraft },
      } as Partial<BoardDetailsState> as BoardDetailsState;
    });
  },

  setBoardDraft: (boardId, patch, markDirty = true) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => {
      const prev = s.boardDraftByBoardId[id];
      const meta = s.boardMetaByBoardId[id];
      const base: BoardMetaDraft =
        prev ??
        (meta
          ? {
              title: typeof meta.title === 'string' ? meta.title : '',
              description: typeof meta.description === 'string' ? meta.description : meta.description == null ? '' : String(meta.description),
              is_public: typeof meta.is_public === 'boolean' ? meta.is_public : Number(meta.is_public) === 1,
            }
          : { title: '', description: '', is_public: false });

      const nextDraft: BoardMetaDraft = { ...base, ...(patch ?? {}) };
      const next: Partial<BoardDetailsState> = {
        boardDraftByBoardId: { ...s.boardDraftByBoardId, [id]: nextDraft },
      };
      if (markDirty) next.boardDraftDirtyByBoardId = { ...s.boardDraftDirtyByBoardId, [id]: true };
      return next as BoardDetailsState;
    });
  },

  resetBoardDraft: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => {
      const meta = s.boardMetaByBoardId[id];
      const nextDraft: BoardMetaDraft =
        meta
          ? {
              title: typeof meta.title === 'string' ? meta.title : '',
              description: typeof meta.description === 'string' ? meta.description : meta.description == null ? '' : String(meta.description),
              is_public: typeof meta.is_public === 'boolean' ? meta.is_public : Number(meta.is_public) === 1,
            }
          : s.boardDraftByBoardId[id] ?? { title: '', description: '', is_public: false };
      const dirty = { ...s.boardDraftDirtyByBoardId };
      delete dirty[id];
      return {
        boardDraftByBoardId: { ...s.boardDraftByBoardId, [id]: nextDraft },
        boardDraftDirtyByBoardId: dirty,
      } as Partial<BoardDetailsState> as BoardDetailsState;
    });
  },

  applyBoardMetaPatch: (boardId, patch) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => {
      const prev = s.boardMetaByBoardId[id];
      const nextMeta = prev ? ({ ...prev, ...(patch as Partial<BoardMeta>), id } as BoardMeta) : (prev ?? null);
      const next: Partial<BoardDetailsState> = {
        boardMetaByBoardId: { ...s.boardMetaByBoardId, [id]: nextMeta },
        boardMetaHasLoadedOnce: { ...s.boardMetaHasLoadedOnce, [id]: true },
      };

      const isDirty = Boolean(s.boardDraftDirtyByBoardId[id]);
      if (!isDirty && nextMeta) {
        const nextDraft: BoardMetaDraft = {
          title: typeof nextMeta.title === 'string' ? nextMeta.title : '',
          description:
            typeof nextMeta.description === 'string' ? nextMeta.description : nextMeta.description == null ? '' : String(nextMeta.description),
          is_public: typeof nextMeta.is_public === 'boolean' ? nextMeta.is_public : Number(nextMeta.is_public) === 1,
        };
        next.boardDraftByBoardId = { ...s.boardDraftByBoardId, [id]: nextDraft };
      }

      return next as BoardDetailsState;
    });
  },

  ensureParticipantsLoaded: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (get().participantsHasLoadedOnce[id]) return;
    void get().refreshParticipantsSilent(id);
  },

  refreshParticipantsSilent: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;

    const hasData = Boolean(get().participantsByBoardId[id]);
    const loading = getLoading(get().participantsLoadingByBoardId, id);
    if (!hasData && !loading.initial) {
      set((s) => ({
        participantsLoadingByBoardId: { ...s.participantsLoadingByBoardId, [id]: { initial: true, refreshing: false } },
      }));
    } else if (hasData && !loading.refreshing) {
      set((s) => ({
        participantsLoadingByBoardId: { ...s.participantsLoadingByBoardId, [id]: { initial: false, refreshing: true } },
      }));
    }

    const promise =
      participantsInFlight.get(id) ??
      fetchParticipants(id)
        .then((data) => data)
        .catch((err) => {
          const status = Number((err as { response?: { status?: unknown } } | null)?.response?.status);
          if (status === 403 || status === 404) {
            set((s) => ({
              accessLostBoards: { ...s.accessLostBoards, [id]: true },
            }));
          }
          return null;
        })
        .finally(() => {
          participantsInFlight.delete(id);
          set((s) => ({
            participantsFetchedAtByBoardId: { ...s.participantsFetchedAtByBoardId, [id]: Date.now() },
          }));
          set((s) => ({
            participantsLoadingByBoardId: { ...s.participantsLoadingByBoardId, [id]: { initial: false, refreshing: false } },
          }));
        });

    if (!participantsInFlight.has(id)) participantsInFlight.set(id, promise);

    void promise.then((data) => {
      set((s) => ({
        participantsByBoardId: { ...s.participantsByBoardId, [id]: data },
        participantsHasLoadedOnce: { ...s.participantsHasLoadedOnce, [id]: true },
      }));
    });
  },

  refreshParticipantsIfStale: (boardId, ttlMs) => {
    const id = normalizeId(boardId);
    if (!id) return;
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const last = Number(get().participantsFetchedAtByBoardId[id] ?? 0);
    if (last && Date.now() - last < ttl) return;
    get().refreshParticipantsSilent(id);
  },

  applyParticipantsPatch: (boardId, patch) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => ({
      participantsByBoardId: { ...s.participantsByBoardId, [id]: patch(s.participantsByBoardId[id] ?? null) },
    }));
  },

  ensureOutgoingInvitesLoaded: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (get().outgoingInvitesHasLoadedOnce[id]) return;
    if (!isOwnerForBoard(id)) return;
    void get().refreshOutgoingInvitesSilent(id);
  },

  refreshOutgoingInvitesSilent: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (!isOwnerForBoard(id)) return;

    const hasData = Boolean(get().outgoingInvitesByBoardId[id]);
    const loading = getLoading(get().outgoingInvitesLoadingByBoardId, id);
    if (!hasData && !loading.initial) {
      set((s) => ({
        outgoingInvitesLoadingByBoardId: { ...s.outgoingInvitesLoadingByBoardId, [id]: { initial: true, refreshing: false } },
      }));
    } else if (hasData && !loading.refreshing) {
      set((s) => ({
        outgoingInvitesLoadingByBoardId: { ...s.outgoingInvitesLoadingByBoardId, [id]: { initial: false, refreshing: true } },
      }));
    }

    const promise =
      outgoingInvitesInFlight.get(id) ??
      fetchOutgoingInvites(id)
        .catch(() => ({} as OutgoingInvitesByUserId))
        .finally(() => {
          outgoingInvitesInFlight.delete(id);
          set((s) => ({
            outgoingInvitesFetchedAtByBoardId: { ...s.outgoingInvitesFetchedAtByBoardId, [id]: Date.now() },
          }));
          set((s) => ({
            outgoingInvitesLoadingByBoardId: { ...s.outgoingInvitesLoadingByBoardId, [id]: { initial: false, refreshing: false } },
          }));
        });

    if (!outgoingInvitesInFlight.has(id)) outgoingInvitesInFlight.set(id, promise);

    void promise.then((map) => {
      set((s) => ({
        outgoingInvitesByBoardId: { ...s.outgoingInvitesByBoardId, [id]: map },
        outgoingInvitesHasLoadedOnce: { ...s.outgoingInvitesHasLoadedOnce, [id]: true },
      }));
    });
  },

  refreshOutgoingInvitesIfStale: (boardId, ttlMs) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (!isOwnerForBoard(id)) return;
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const last = Number(get().outgoingInvitesFetchedAtByBoardId[id] ?? 0);
    if (last && Date.now() - last < ttl) return;
    get().refreshOutgoingInvitesSilent(id);
  },

  setOutgoingInvite: (boardId, userId, invite) => {
    const id = normalizeId(boardId);
    const uid = normalizeId(userId);
    if (!id || !uid) return;
    set((s) => {
      const prevMap = s.outgoingInvitesByBoardId[id] ?? {};
      const nextMap: OutgoingInvitesByUserId = { ...prevMap, [uid]: invite };
      return {
        outgoingInvitesByBoardId: { ...s.outgoingInvitesByBoardId, [id]: nextMap },
        outgoingInvitesHasLoadedOnce: { ...s.outgoingInvitesHasLoadedOnce, [id]: true },
      };
    });
  },

  removeOutgoingInvite: (boardId, userId) => {
    const id = normalizeId(boardId);
    const uid = normalizeId(userId);
    if (!id || !uid) return;
    set((s) => {
      const prevMap = s.outgoingInvitesByBoardId[id] ?? {};
      if (!prevMap[uid]) return s;
      const nextMap: OutgoingInvitesByUserId = { ...prevMap };
      delete nextMap[uid];
      return {
        outgoingInvitesByBoardId: { ...s.outgoingInvitesByBoardId, [id]: nextMap },
        outgoingInvitesHasLoadedOnce: { ...s.outgoingInvitesHasLoadedOnce, [id]: true },
      };
    });
  },

  ensureInviteLinkLoaded: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (get().inviteLinkHasLoadedOnce[id]) return;
    if (!isOwnerForBoard(id)) return;
    void get().refreshInviteLinkSilent(id);
  },

  refreshInviteLinkSilent: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (!isOwnerForBoard(id)) return;

    const hasData = typeof get().inviteLinkTokenByBoardId[id] === 'string';
    const loading = getLoading(get().inviteLinkLoadingByBoardId, id);
    if (!hasData && !loading.initial) {
      set((s) => ({
        inviteLinkLoadingByBoardId: { ...s.inviteLinkLoadingByBoardId, [id]: { initial: true, refreshing: false } },
      }));
    } else if (hasData && !loading.refreshing) {
      set((s) => ({
        inviteLinkLoadingByBoardId: { ...s.inviteLinkLoadingByBoardId, [id]: { initial: false, refreshing: true } },
      }));
    }

    const promise =
      inviteLinkInFlight.get(id) ??
      fetchInviteLink(id)
        .catch(() => null)
        .finally(() => {
          inviteLinkInFlight.delete(id);
          set((s) => ({
            inviteLinkFetchedAtByBoardId: { ...s.inviteLinkFetchedAtByBoardId, [id]: Date.now() },
          }));
          set((s) => ({
            inviteLinkLoadingByBoardId: { ...s.inviteLinkLoadingByBoardId, [id]: { initial: false, refreshing: false } },
          }));
        });

    if (!inviteLinkInFlight.has(id)) inviteLinkInFlight.set(id, promise);

    void promise.then((token) => {
      set((s) => ({
        inviteLinkTokenByBoardId: { ...s.inviteLinkTokenByBoardId, [id]: token },
        inviteLinkHasLoadedOnce: { ...s.inviteLinkHasLoadedOnce, [id]: true },
      }));
    });
  },

  refreshInviteLinkIfStale: (boardId, ttlMs) => {
    const id = normalizeId(boardId);
    if (!id) return;
    if (!isOwnerForBoard(id)) return;
    const ttl = Number(ttlMs);
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    const last = Number(get().inviteLinkFetchedAtByBoardId[id] ?? 0);
    if (last && Date.now() - last < ttl) return;
    get().refreshInviteLinkSilent(id);
  },

  setInviteLinkToken: (boardId, token) => {
    const id = normalizeId(boardId);
    if (!id) return;
    set((s) => ({
      inviteLinkTokenByBoardId: { ...s.inviteLinkTokenByBoardId, [id]: token },
      inviteLinkHasLoadedOnce: { ...s.inviteLinkHasLoadedOnce, [id]: true },
    }));
  },

  clearBoard: (boardId) => {
    const id = normalizeId(boardId);
    if (!id) return;
    participantsInFlight.delete(id);
    outgoingInvitesInFlight.delete(id);
    inviteLinkInFlight.delete(id);
    boardMetaInFlight.delete(id);
    set((s) => {
      const next = { ...s };
      const bm = { ...s.boardMetaByBoardId };
      const bml = { ...s.boardMetaLoadingByBoardId };
      const bmh = { ...s.boardMetaHasLoadedOnce };
      const bmf = { ...s.boardMetaFetchedAtByBoardId };
      const bd = { ...s.boardDraftByBoardId };
      const bdd = { ...s.boardDraftDirtyByBoardId };
      const p = { ...s.participantsByBoardId };
      const pl = { ...s.participantsLoadingByBoardId };
      const ph = { ...s.participantsHasLoadedOnce };
      const pf = { ...s.participantsFetchedAtByBoardId };
      const oi = { ...s.outgoingInvitesByBoardId };
      const oil = { ...s.outgoingInvitesLoadingByBoardId };
      const oih = { ...s.outgoingInvitesHasLoadedOnce };
      const oif = { ...s.outgoingInvitesFetchedAtByBoardId };
      const il = { ...s.inviteLinkTokenByBoardId };
      const ill = { ...s.inviteLinkLoadingByBoardId };
      const ilh = { ...s.inviteLinkHasLoadedOnce };
      const ilf = { ...s.inviteLinkFetchedAtByBoardId };
      const al = { ...s.accessLostBoards };
      delete bm[id];
      delete bml[id];
      delete bmh[id];
      delete bmf[id];
      delete bd[id];
      delete bdd[id];
      delete p[id];
      delete pl[id];
      delete ph[id];
      delete pf[id];
      delete oi[id];
      delete oil[id];
      delete oih[id];
      delete oif[id];
      delete il[id];
      delete ill[id];
      delete ilh[id];
      delete ilf[id];
      delete al[id];
      return {
        ...next,
        boardMetaByBoardId: bm,
        boardMetaLoadingByBoardId: bml,
        boardMetaHasLoadedOnce: bmh,
        boardMetaFetchedAtByBoardId: bmf,
        boardDraftByBoardId: bd,
        boardDraftDirtyByBoardId: bdd,
        participantsByBoardId: p,
        participantsLoadingByBoardId: pl,
        participantsHasLoadedOnce: ph,
        participantsFetchedAtByBoardId: pf,
        outgoingInvitesByBoardId: oi,
        outgoingInvitesLoadingByBoardId: oil,
        outgoingInvitesHasLoadedOnce: oih,
        outgoingInvitesFetchedAtByBoardId: oif,
        inviteLinkTokenByBoardId: il,
        inviteLinkLoadingByBoardId: ill,
        inviteLinkHasLoadedOnce: ilh,
        inviteLinkFetchedAtByBoardId: ilf,
        accessLostBoards: al,
      };
    });
  },

  clearAll: () => {
    participantsInFlight.clear();
    outgoingInvitesInFlight.clear();
    inviteLinkInFlight.clear();
    boardMetaInFlight.clear();
    set({
      boardMetaByBoardId: {},
      boardMetaLoadingByBoardId: {},
      boardMetaHasLoadedOnce: {},
      boardMetaFetchedAtByBoardId: {},
      boardDraftByBoardId: {},
      boardDraftDirtyByBoardId: {},
      participantsByBoardId: {},
      participantsLoadingByBoardId: {},
      participantsHasLoadedOnce: {},
      participantsFetchedAtByBoardId: {},
      outgoingInvitesByBoardId: {},
      outgoingInvitesLoadingByBoardId: {},
      outgoingInvitesHasLoadedOnce: {},
      outgoingInvitesFetchedAtByBoardId: {},
      inviteLinkTokenByBoardId: {},
      inviteLinkLoadingByBoardId: {},
      inviteLinkHasLoadedOnce: {},
      inviteLinkFetchedAtByBoardId: {},
      accessLostBoards: {},
    });
  },

  handleBoardsUpdated: (cmd) => {
    const reason = typeof cmd?.reason === 'string' ? cmd.reason : '';
    const boardId = normalizeId(cmd?.board_id);
    if (!boardId) return;

    const isTracked =
      Boolean(get().participantsHasLoadedOnce[boardId]) ||
      Boolean(get().outgoingInvitesHasLoadedOnce[boardId]) ||
      Boolean(get().inviteLinkHasLoadedOnce[boardId]) ||
      Boolean(get().boardMetaHasLoadedOnce[boardId]) ||
      Boolean(get().boardDraftByBoardId[boardId]);

    if (!isTracked) return;

    const shouldRefreshParticipants =
      reason === 'role' ||
      reason === 'removed' ||
      reason === 'left' ||
      reason === 'join_public' ||
      reason === 'invite_accepted' ||
      reason === 'invite_link_accepted' ||
      reason === 'public_changed' ||
      reason === 'meta_changed' ||
      reason === 'title_changed' ||
      reason === 'description_changed' ||
      reason === 'image_changed' ||
      reason === 'invite_cleared' ||
      reason === 'invite_rejected' ||
      reason === '';

    if (shouldRefreshParticipants && get().participantsHasLoadedOnce[boardId]) {
      get().refreshParticipantsSilent(boardId);
    }

    // Outgoing invites change only on invite workflow (status change / delete / clear) and some joins that clear invites.
    const shouldRefreshOutgoingInvites =
      reason === 'invite_rejected' ||
      reason === 'invite_accepted' ||
      reason === 'invite_link_accepted' ||
      reason === 'join_public' ||
      reason === 'invite_cleared';

    if (shouldRefreshOutgoingInvites && isOwnerForBoard(boardId) && get().outgoingInvitesHasLoadedOnce[boardId]) {
      get().refreshOutgoingInvitesSilent(boardId);
    }

    const metaReasons = new Set(['meta_changed', 'public_changed', 'title_changed', 'description_changed', 'image_changed']);
    if (metaReasons.has(reason) && get().boardMetaHasLoadedOnce[boardId]) {
      get().refreshBoardMetaSilent(boardId);
    }
  },
}));
