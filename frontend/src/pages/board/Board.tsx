import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import classes from './Board.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { Board as BoardEntity, RECENT_BOARDS_LS_KEY, useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';
import { useUIStore } from '@/store/uiStore';
import FlowBoard from '@/components/flow/FlowBoard';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import BoardSettingsModal from '@/components/boards/boardsettingsmodal/BoardSettingsModal';
import AuthTrigger from '@/components/auth/AuthTrigger';
import Close from '@/assets/icons/monochrome/back.svg';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import DefaultUser from '@/assets/icons/monochrome/default-user.svg';
import Deny from '@/assets/icons/monochrome/deny.svg'

type BoardParticipantRole = 'owner' | 'guest';

interface BoardParticipant {
    id: number;
    username: string;
    nickname?: string | null;
    avatar?: string | null;
    role: BoardParticipantRole;
}

interface BoardParticipantsResponse {
    board_id: number;
    my_role: BoardParticipantRole | null;
    participants: BoardParticipant[];
}

const resolveAvatarSrc = (avatar?: string | null) => {
    if (!avatar) return null;
    if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
    return avatar;
};

const loadBoardParticipants = async (boardId: number) => {
    const { data } = await axiosInstance.get<BoardParticipantsResponse>(`/api/boards/${boardId}/participants`);
    return data;
};

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
    const openBoardSettingsModal = useUIStore((s) => s.openBoardSettingsModal);

    const [participantsData, setParticipantsData] = useState<BoardParticipantsResponse | null>(null);
    const [participantsLoading, setParticipantsLoading] = useState(false);
    const [removeConfirmParticipantId, setRemoveConfirmParticipantId] = useState<number | null>(null);

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

    useEffect(() => {
        if (!isInitialized) return;
        if (!isAuth) {
            setParticipantsData(null);
            setRemoveConfirmParticipantId(null);
            return;
        }

        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;

        let cancelled = false;
        setParticipantsLoading(true);
        loadBoardParticipants(id)
            .then((data) => {
                if (cancelled) return;
                setParticipantsData(data ?? null);
            })
            .catch(() => {
                if (cancelled) return;
                setParticipantsData(null);
            })
            .finally(() => {
                if (cancelled) return;
                setParticipantsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [boardId, isAuth, isInitialized]);

    const isOwner = participantsData?.my_role === 'owner';
    const participants = participantsData?.participants ?? [];
    const guests = participants.filter((p) => p.role !== 'owner');
    const shouldShowParticipants = participantsLoading || isOwner || guests.length > 0;

    const removeParticipant = async (participantId: number) => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;
        if (!isOwner) return;

        setParticipantsLoading(true);
        try {
            await axiosInstance.delete(`/api/boards/${id}/guests/${participantId}`);
            const data = await loadBoardParticipants(id);
            setParticipantsData(data ?? null);
        } catch {
            // ignore
        } finally {
            setParticipantsLoading(false);
            setRemoveConfirmParticipantId(null);
        }
    };

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
                            <img src={boardInfo.imageSrc} alt={boardInfo.title} />
                        ) : (
                            <Default />
                        )}
                        <span>{boardInfo ? boardInfo.title : 'Board'}</span>
                        <p>{boardInfo?.description ?? ''}</p>
                    </div>
                    <div className={classes.board_info_actions}>
                        <Mainbtn variant="mini" kind="button" type="button" text="Настройки" onClick={openBoardSettingsModal} />
                    </div>
                    {!isAuth ? (
                        <div className={classes.participants}>
                            <div className={classes.participant_add}>
                                <AuthTrigger type="login">
                                    <Mainbtn variant="mini" kind="button" type="button" text="Войти как гость" />
                                </AuthTrigger>
                            </div>
                        </div>
                    ) : null}
                    {isAuth && shouldShowParticipants ? (
                        <div className={classes.participants}>
                            <span className={classes.participants_title}>Участники:</span>
                            <div className={classes.participants_list}>
                                {isOwner ? (
                                    <div className={classes.participant_add}>
                                        <Mainbtn variant="mini" kind="button" type="button" text="Добавить участников" disabled />
                                    </div>
                                ) : null}
                                {participantsLoading ? <p>Загрузка...</p> : null}
                                {guests.map((p) => {
                                    const avatarSrc = resolveAvatarSrc(p.avatar);
                                    const displayName = (p.nickname ?? '').trim() || p.username;
                                    const shouldShowUsername = Boolean((p.nickname ?? '').trim());

                                    return (
                                        <div className={classes.participant_item} key={p.id}>
                                            <Link className={classes.participant_link} to={`/user/${p.username}`}>
                                                <div className={classes.participant_avatar}>
                                                    {avatarSrc ? <img src={avatarSrc} alt={displayName} /> : <DefaultUser />}
                                                </div>
                                                <div className={classes.participant_names}>
                                                    <span className={classes.participant_name}>{displayName}</span>
                                                    {shouldShowUsername ? <span className={classes.participant_username}>{p.username}</span> : null}
                                                </div>
                                            </Link>
                                            <span className={classes.participant_role}>{p.role === 'owner' ? 'Владелец' : 'Гость'}</span>
                                            {isOwner ? (
                                                <DropdownWrapper
                                                    right
                                                    up
                                                    closeOnClick={false}
                                                    isOpen={removeConfirmParticipantId === p.id}
                                                    onClose={() => setRemoveConfirmParticipantId(null)}
                                                >
                                                    {[
                                                        <button
                                                            key="trigger"
                                                            type="button"
                                                            className={classes.participant_remove}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRemoveConfirmParticipantId((prev) => (prev === p.id ? null : p.id));
                                                            }}
                                                            disabled={participantsLoading}
                                                            aria-label="Удалить участника"
                                                        >
                                                            <Deny />
                                                        </button>,
                                                        <div key="menu">
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_confirm_danger}
                                                                onClick={() => removeParticipant(p.id)}
                                                                disabled={participantsLoading}
                                                            >
                                                                Удалить
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_confirm_cancel}
                                                                onClick={() => setRemoveConfirmParticipantId(null)}
                                                                disabled={participantsLoading}
                                                            >
                                                                Отмена
                                                            </button>
                                                        </div>,
                                                    ]}
                                                </DropdownWrapper>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                            {false ? (
                                <div className={classes.participants_empty}>
                                    <Mainbtn variant="mini" kind="button" type="button" text="Добавить участников" disabled />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
            <BoardSettingsModal />
        </div>
    );
};

export default Board;
