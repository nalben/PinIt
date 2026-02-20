import React, { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import classes from './Board.module.scss';
import axiosInstance from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { Board as BoardEntity, RECENT_BOARDS_LS_KEY, useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';
import FlowBoard from '@/components/flow/FlowBoard';

const Board = () => {
    const { boardId } = useParams<{ boardId: string }>();
    const location = useLocation();
    const isAuth = useAuthStore((s) => s.isAuth);
    const isInitialized = useAuthStore((s) => s.isInitialized);

    useEffect(() => {
        if (!isInitialized) return;
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;

        if (isAuth) {
            (async () => {
                try {
                    await axiosInstance.post(`/api/boards/${id}/visit`);
                } catch {
                    // ignore
                } finally {
                    void useBoardsStore.getState().loadBoards();
                }
            })();
            return;
        }

        const stateBoard = (location.state as { board?: Partial<BoardEntity> } | null)?.board;

        const spaces = useSpacesBoardsStore.getState();
        const known =
            (stateBoard && Number(stateBoard.id) === id ? stateBoard : undefined) ??
            spaces.publicBoards.find((b) => b.id === id) ??
            spaces.friendsBoards.find((b) => b.id === id) ??
            spaces.guestBoards.find((b) => b.id === id);

        const persistRecent = (entry: BoardEntity) => {
            const readCurrent = (): BoardEntity[] => {
                try {
                    const raw = localStorage.getItem(RECENT_BOARDS_LS_KEY);
                    if (!raw) return [];
                    const parsed: unknown = JSON.parse(raw);
                    return Array.isArray(parsed) ? (parsed as BoardEntity[]) : [];
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

            useBoardsStore.setState({ recentBoards: updated });
        };

        const now = new Date().toISOString();
        const explicitIsPublic = (() => {
            if (!known || typeof known !== 'object') return undefined;
            if (!('is_public' in known)) return undefined;
            const v = (known as { is_public?: unknown }).is_public;
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v === 1;
            return undefined;
        })();

        if (explicitIsPublic === false) return;

        if (known?.title) {
            const maybeMyRole: BoardEntity['my_role'] = (() => {
                if (!known || typeof known !== 'object') return undefined;
                if (!('my_role' in known)) return undefined;
                const v = (known as { my_role?: unknown }).my_role;
                if (typeof v === 'string' || v === null) return v as string | null;
                return undefined;
            })();

            persistRecent({
                id,
                title: known.title,
                description: known.description ?? null,
                created_at: known.created_at ?? now,
                last_visited_at: now,
                image: known.image ?? null,
                is_public: explicitIsPublic ?? true,
                my_role: maybeMyRole,
            });
            return;
        }

        axiosInstance
            .get<Partial<BoardEntity>>(`/api/boards/public/${id}`)
            .then(({ data }) => {
                const entry: BoardEntity = {
                    id,
                    title: typeof data?.title === 'string' && data.title.trim() ? data.title : `Board ${id}`,
                    description: typeof data?.description === 'string' || data?.description === null ? data.description : null,
                    created_at: typeof data?.created_at === 'string' ? data.created_at : now,
                    last_visited_at: now,
                    image: typeof data?.image === 'string' || data?.image === null ? data.image : null,
                    is_public: true,
                };
                persistRecent(entry);
            })
            .catch(() => {
                // not public / not accessible => don't persist to localStorage
            });
    }, [boardId, isAuth, isInitialized, location.state]);

    return (
        <div className={classes.board_container}>
            <FlowBoard />
        </div>
    );
};

export default Board;
