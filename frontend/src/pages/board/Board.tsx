import React, { useEffect, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import classes from './Board.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { Board as BoardEntity, RECENT_BOARDS_LS_KEY, useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';
import { useUIStore } from '@/store/uiStore';
import FlowBoard from '@/components/flow/FlowBoard';
import Close from '@/assets/icons/monochrome/back.svg';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';

const Board = () => {
    const { boardId } = useParams<{ boardId: string }>();
    const location = useLocation();
    const isAuth = useAuthStore((s) => s.isAuth);
    const isInitialized = useAuthStore((s) => s.isInitialized);
    const boards = useBoardsStore((s) => s.boards);
    const recentBoards = useBoardsStore((s) => s.recentBoards);
    const publicBoards = useSpacesBoardsStore((s) => s.publicBoards);
    const friendsBoards = useSpacesBoardsStore((s) => s.friendsBoards);
    const guestBoards = useSpacesBoardsStore((s) => s.guestBoards);
    const isBoardMenuOpen = useUIStore((s) => s.isBoardMenuOpen);
    const toggleBoardMenu = useUIStore((s) => s.toggleBoardMenu);

    const boardInfo = useMemo(() => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return null;

        const stateBoard = (location.state as { board?: Partial<BoardEntity> } | null)?.board;
        const fromState = stateBoard && Number(stateBoard.id) === id ? stateBoard : undefined;

        const fromBoards = boards.find((b) => b.id === id);
        const fromRecent = recentBoards.find((b) => b.id === id);
        const fromPublic = publicBoards.find((b) => b.id === id);
        const fromFriends = friendsBoards.find((b) => b.id === id);
        const fromGuest = guestBoards.find((b) => b.id === id);

        const merged: Partial<BoardEntity> = {
            ...(fromPublic ?? {}),
            ...(fromFriends ?? {}),
            ...(fromGuest ?? {}),
            ...(fromRecent ?? {}),
            ...(fromBoards ?? {}),
            ...(fromState ?? {}),
            id,
        };

        const imageSrc = merged.image
            ? merged.image.startsWith('/uploads/')
                ? `${API_URL}${merged.image}`
                : merged.image
            : null;

        return {
            id,
            title: typeof merged.title === 'string' && merged.title.trim() ? merged.title : `Board ${id}`,
            description: typeof merged.description === 'string' ? merged.description : null,
            imageSrc,
        };
    }, [boardId, boards, friendsBoards, guestBoards, location.state, publicBoards, recentBoards]);

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
            <div className={`${classes.board_menu_con} ${!isBoardMenuOpen ? classes.menu_close : ''}`}>
                <button className={classes.close_btn} onClick={toggleBoardMenu} type="button">
                    <Close />
                </button>
                <div className={classes.board_menu_}>
                    <div className={classes.board_info}>
                        {boardInfo?.imageSrc ? (
                            <img src={boardInfo.imageSrc} alt={boardInfo.title} width={120} height={120} />
                        ) : (
                            <Default />
                        )}
                        <span>{boardInfo ? boardInfo.title : 'Board'}</span>
                        <p>{boardInfo?.description ?? ''}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Board;
