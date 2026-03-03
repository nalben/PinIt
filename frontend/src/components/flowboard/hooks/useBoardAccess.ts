import { useEffect } from 'react';
import type React from 'react';
import type { NavigateFunction } from 'react-router-dom';
import axiosInstance from '@/api/axiosInstance';
import { RECENT_BOARDS_LS_KEY, UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';

const applyAuthBoardPatch = (boardId: number, patch: Partial<UnifiedBoard>) => {
  useBoardsUnifiedStore.setState((s) => {
    const prev = s.entitiesById[boardId];
    const nextEntities = {
      ...s.entitiesById,
      [boardId]: { ...(prev ?? { id: boardId, title: '', created_at: new Date().toISOString() }), ...prev, ...patch, id: boardId },
    };

    const apply = <T extends { id: number }>(list: T[]) => list.map((b) => (b.id === boardId ? ({ ...b, ...patch } as T) : b));

    return {
      ...s,
      entitiesById: nextEntities,
      myBoards: apply(s.myBoards),
      recentBoards: apply(s.recentBoards),
      guestBoards: apply(s.guestBoards),
      friendsBoards: apply(s.friendsBoards),
      publicBoards: apply(s.publicBoards),
    };
  });
};

const persistRecentPublicBoard = (entry: UnifiedBoard) => {
  const readCurrent = (): UnifiedBoard[] => {
    try {
      const raw = localStorage.getItem(RECENT_BOARDS_LS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as UnifiedBoard[]) : [];
    } catch {
      return [];
    }
  };

  const current = readCurrent();
  const withoutThis = current.filter((b) => Number(b?.id) !== entry.id);
  const updated = [entry, ...withoutThis].slice(0, 20);

  try {
    localStorage.setItem(RECENT_BOARDS_LS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }

  useBoardsUnifiedStore.setState((s) => {
    const nextEntities = { ...s.entitiesById };
    const nextIds: number[] = [];
    for (const b of updated) {
      const id = Number(b?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      nextIds.push(id);
      nextEntities[id] = { ...(nextEntities[id] ?? b), ...b, id };
    }
    return {
      ...s,
      entitiesById: nextEntities,
      recentIds: nextIds,
      recentBoards: updated,
      hasLoadedOnceRecent: true,
    };
  });
};

export const useBoardAccess = (params: {
  hasValidBoardId: boolean;
  numericBoardId: number;
  inviteToken: string | null;
  isInitialized: boolean;
  isLoggedIn: boolean;
  hasAuthToken: boolean;
  navigate: NavigateFunction;
  setIsBoardMetaLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setBoardMetaOverride: React.Dispatch<React.SetStateAction<Partial<UnifiedBoard> | null>>;
  getPendingInviteUrlForThisBoard: () => string | null;
}) => {
  const {
    hasValidBoardId,
    numericBoardId,
    inviteToken,
    isInitialized,
    isLoggedIn,
    hasAuthToken,
    navigate,
    setIsBoardMetaLoading,
    setBoardMetaOverride,
    getPendingInviteUrlForThisBoard,
  } = params;

  useEffect(() => {
    if (!hasValidBoardId) {
      setIsBoardMetaLoading(false);
      return;
    }
    setIsBoardMetaLoading(true);
    setBoardMetaOverride(null);
  }, [hasValidBoardId, numericBoardId, setBoardMetaOverride, setIsBoardMetaLoading]);

  useEffect(() => {
    if (!hasValidBoardId) return;
    const id = numericBoardId;
    if (!Number.isFinite(id) || id <= 0) return;

    let cancelled = false;

    const redirectToSpaces = () => {
      if (cancelled) return;
      navigate('/spaces', { replace: true });
    };

    const tryLoadAccessibleBoard = async () => {
      const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/${id}`);
      if (cancelled) return null;
      if (data && typeof data === 'object') {
        setBoardMetaOverride({ ...data, id });
        applyAuthBoardPatch(id, data);
        if (inviteToken) {
          navigate(`/spaces/${id}`, { replace: true });
        }
        return data;
      }
      return null;
    };

    (async () => {
      try {
        // If token exists, wait for auth bootstrap to decide auth/non-auth flow.
        if (hasAuthToken && !isInitialized) {
          if (inviteToken) {
            try {
              const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/invite-link/preview`, {
                params: { token: inviteToken },
              });
              if (cancelled) return;
              if (data && typeof data === 'object') {
                const payload = data as Partial<UnifiedBoard>;
                const resolvedId = Number((payload as { board_id?: unknown }).board_id ?? payload.id);
                if (Number.isFinite(resolvedId) && resolvedId > 0 && resolvedId !== id) {
                  navigate(`/spaces/${resolvedId}?invite=${encodeURIComponent(inviteToken)}`, { replace: true });
                  return;
                }
                setBoardMetaOverride({ ...payload, id });
              }
            } catch {
              // ignore
            }
          }
          return;
        }

        if (isLoggedIn) {
          if (inviteToken) {
            try {
              const { data } = await axiosInstance.get<{ board_id: number }>(`/api/boards/invite-link/resolve`, {
                params: { token: inviteToken },
              });
              if (cancelled) return;

              const resolvedBoardId = Number(data?.board_id);
              if (Number.isFinite(resolvedBoardId) && resolvedBoardId > 0 && resolvedBoardId !== id) {
                navigate(`/spaces/${resolvedBoardId}?invite=${encodeURIComponent(inviteToken)}`, { replace: true });
                return;
              }
            } catch (err: unknown) {
              const status = (err as { response?: { status?: number } })?.response?.status;
              if (status === 404) {
                redirectToSpaces();
                return;
              }
            }
          }

          try {
            const accessible = await tryLoadAccessibleBoard();
            if (accessible) {
              try {
                await axiosInstance.post(`/api/boards/${id}/visit`);
              } catch {
                // ignore
              }
              void useBoardsUnifiedStore.getState().refreshRecentSilent();
              return;
            }
          } catch (err: unknown) {
            const status = (err as { response?: { status?: number } })?.response?.status;

            // Not owner/guest -> maybe public; check public endpoint and join as guest
            if (status === 404 || status === 403) {
              if (inviteToken) {
                try {
                  const { data: acceptData } = await axiosInstance.post<{ board_id: number }>(`/api/boards/invite-link/accept`, {
                    token: inviteToken,
                  });
                  if (cancelled) return;

                  const acceptedBoardId = Number(acceptData?.board_id);
                  if (Number.isFinite(acceptedBoardId) && acceptedBoardId > 0) {
                    if (acceptedBoardId !== id) {
                      navigate(`/spaces/${acceptedBoardId}`, { replace: true });
                      return;
                    }

                    try {
                      const joined = await tryLoadAccessibleBoard();
                      if (joined) {
                        try {
                          await axiosInstance.post(`/api/boards/${id}/visit`);
                        } catch {
                          // ignore
                        }
                        void useBoardsUnifiedStore.getState().refreshRecentSilent();
                        return;
                      }
                    } catch {
                      // ignore
                    }
                  }
                } catch {
                  // ignore
                }
              }

              try {
                const { data: publicData } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/public/${id}`);
                if (cancelled) return;
                if (!publicData || typeof publicData !== 'object') {
                  redirectToSpaces();
                  return;
                }

                try {
                  await axiosInstance.post(`/api/boards/${id}/join-public`);
                } catch {
                  redirectToSpaces();
                  return;
                }

                try {
                  const joined = await tryLoadAccessibleBoard();
                  if (!joined) {
                    redirectToSpaces();
                    return;
                  }
                } catch {
                  redirectToSpaces();
                  return;
                }

                setBoardMetaOverride({ ...publicData, id, is_public: true });

                try {
                  await axiosInstance.post(`/api/boards/${id}/visit`);
                } catch {
                  // ignore
                }
                void useBoardsUnifiedStore.getState().refreshRecentSilent();
                return;
              } catch {
                redirectToSpaces();
                return;
              }
            }
          }

          redirectToSpaces();
          return;
        }

        // Non-auth: allow only public
        try {
          const inviteGate = Boolean(inviteToken || getPendingInviteUrlForThisBoard());
          if (inviteToken) {
            try {
              const { data: preview } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/invite-link/preview`, {
                params: { token: inviteToken },
              });
              if (cancelled) return;
              if (preview && typeof preview === 'object') {
                const payload = preview as Partial<UnifiedBoard>;
                const resolvedId = Number((payload as { board_id?: unknown }).board_id ?? payload.id);
                if (Number.isFinite(resolvedId) && resolvedId > 0 && resolvedId !== id) {
                  navigate(`/spaces/${resolvedId}?invite=${encodeURIComponent(inviteToken)}`, { replace: true });
                  return;
                }
                setBoardMetaOverride({ ...payload, id });
              }
            } catch {
              // ignore
            }
          }

          const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/public/${id}`);
          if (cancelled) return;
          if (!data || typeof data !== 'object') {
            if (!inviteGate) redirectToSpaces();
            return;
          }

          setBoardMetaOverride({ ...data, id, is_public: true });

          const now = new Date().toISOString();
          persistRecentPublicBoard({
            id,
            title: typeof data?.title === 'string' && data.title.trim() ? data.title : 'Board',
            description: typeof data?.description === 'string' || data?.description === null ? data.description : null,
            created_at: typeof data?.created_at === 'string' ? data.created_at : now,
            last_visited_at: now,
            image: typeof data?.image === 'string' || data?.image === null ? data.image : null,
            is_public: true,
          });
        } catch {
          const inviteGate = Boolean(inviteToken || getPendingInviteUrlForThisBoard());
          if (!inviteGate) redirectToSpaces();
          return;
        }
      } finally {
        if (cancelled) return;
        setIsBoardMetaLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    getPendingInviteUrlForThisBoard,
    hasAuthToken,
    hasValidBoardId,
    inviteToken,
    isInitialized,
    isLoggedIn,
    navigate,
    numericBoardId,
    setBoardMetaOverride,
    setIsBoardMetaLoading,
  ]);
};

