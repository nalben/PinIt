import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
import Members from '@/assets/icons/monochrome/members.svg';

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
    const navigate = useNavigate();
    const isAuth = useAuthStore((s) => s.isAuth);
    const isInitialized = useAuthStore((s) => s.isInitialized);
    const boards = useBoardsStore((s) => s.boards);
    const recentBoards = useBoardsStore((s) => s.recentBoards);
    const publicBoards = useSpacesBoardsStore((s) => s.publicBoards);
    const friendsBoards = useSpacesBoardsStore((s) => s.friendsBoards);
    const guestBoards = useSpacesBoardsStore((s) => s.guestBoards);
    const isBoardMenuOpen = useUIStore((s) => s.isBoardMenuOpen);
    const toggleBoardMenu = useUIStore((s) => s.toggleBoardMenu);
    const openBoardMenu = useUIStore((s) => s.openBoardMenu);
    const closeBoardMenu = useUIStore((s) => s.closeBoardMenu);
    const openBoardSettingsModal = useUIStore((s) => s.openBoardSettingsModal);
    const closeBoardSettingsModal = useUIStore((s) => s.closeBoardSettingsModal);
    const setBoardSettingsModalParticipantsInnerViewNext = useUIStore((s) => s.setBoardSettingsModalParticipantsInnerViewNext);

    const [participantsData, setParticipantsData] = useState<BoardParticipantsResponse | null>(null);
    const [debugParticipantsData, setDebugParticipantsData] = useState<BoardParticipantsResponse | null>(null);
    const [participantsLoading, setParticipantsLoading] = useState(false);
    const [removeConfirmParticipantId, setRemoveConfirmParticipantId] = useState<number | null>(null);
    const participantsListRef = useRef<HTMLDivElement | null>(null);
    const [hasParticipantsListScroll, setHasParticipantsListScroll] = useState(false);
    const [isBoardMetaLoading, setIsBoardMetaLoading] = useState(true);
    const [boardMetaOverride, setBoardMetaOverride] = useState<Partial<BoardEntity> | null>(null);
    const [loadedBoardImageSrc, setLoadedBoardImageSrc] = useState<string | null>(null);
    const [failedBoardImageSrc, setFailedBoardImageSrc] = useState<string | null>(null);
    const tokenPresent = Boolean(localStorage.getItem('token'));
    const inviteToken = useMemo(() => {
        try {
            const value = new URLSearchParams(location.search).get('invite');
            return typeof value === 'string' && value.trim() ? value.trim() : null;
        } catch {
            return null;
        }
    }, [location.search]);
    const isLoggedIn = isInitialized && isAuth;
    const numericBoardId = Number(boardId);
    const hasValidBoardId = Number.isFinite(numericBoardId) && numericBoardId > 0;

    useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        const shouldOpen = window.innerWidth >= 1440;
        if (shouldOpen) openBoardMenu();
        else closeBoardMenu();
    }, [closeBoardMenu, openBoardMenu]);

    const boardInfo = useMemo(() => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return null;

        const stateBoard = (location.state as { board?: Partial<BoardEntity> } | null)?.board;
        const fromState = stateBoard && Number(stateBoard.id) === id ? stateBoard : undefined;
        const fromOverride = boardMetaOverride && Number(boardMetaOverride.id) === id ? boardMetaOverride : undefined;

        const fromBoards = boards.find((b) => b.id === id);
        const fromRecent = recentBoards.find((b) => b.id === id);
        const fromPublic = publicBoards.find((b) => b.id === id);
        const fromFriends = friendsBoards.find((b) => b.id === id);
        const fromGuest = guestBoards.find((b) => b.id === id);

        const merged: Partial<BoardEntity> = {
            ...(fromState ?? {}),
            ...(fromPublic ?? {}),
            ...(fromFriends ?? {}),
            ...(fromGuest ?? {}),
            ...(fromOverride ?? {}),
            ...(fromRecent ?? {}),
            ...(fromBoards ?? {}),
            id,
        };

        const imageValue = merged.image;
        const imageSrc = merged.image
            ? merged.image.startsWith('/uploads/')
                ? `${API_URL}${merged.image}`
                : merged.image
            : null;

        const isPublic = (() => {
            if (!merged || typeof merged !== 'object') return null;
            if (!('is_public' in merged)) return null;
            const v = (merged as { is_public?: unknown }).is_public;
            if (typeof v === 'boolean') return v;
            if (typeof v === 'number') return v === 1;
            return null;
        })();

        return {
            id,
            title: typeof merged.title === 'string' && merged.title.trim() ? merged.title : null,
            description: typeof merged.description === 'string' ? merged.description : null,
            imageSrc,
            imageState: typeof imageValue === 'string' ? ('some' as const) : imageValue === null ? ('none' as const) : ('unknown' as const),
            isPublic,
            myRole: typeof merged.my_role === 'string' || merged.my_role === null ? merged.my_role : null,
        };
    }, [boardId, boardMetaOverride, boards, friendsBoards, guestBoards, location.state, publicBoards, recentBoards]);

    useEffect(() => {
        const src = boardInfo?.imageSrc ?? null;
        if (!src) {
            setLoadedBoardImageSrc(null);
            setFailedBoardImageSrc(null);
            return;
        }

        let cancelled = false;
        setLoadedBoardImageSrc(null);
        setFailedBoardImageSrc(null);

        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setLoadedBoardImageSrc(src);
        };
        img.onerror = () => {
            if (cancelled) return;
            setFailedBoardImageSrc(src);
        };
        img.src = src;

        return () => {
            cancelled = true;
        };
    }, [boardInfo?.imageSrc]);

    useEffect(() => {
        if (!hasValidBoardId) {
            setIsBoardMetaLoading(false);
            return;
        }
        setIsBoardMetaLoading(true);
        setBoardMetaOverride(null);
    }, [hasValidBoardId, numericBoardId]);

    useEffect(() => {
        if (!hasValidBoardId) return;
        const id = numericBoardId;
        if (!Number.isFinite(id) || id <= 0) return;

        let cancelled = false;
        const redirectToSpaces = () => {
            if (cancelled) return;
            navigate('/spaces', { replace: true });
        };

        const applyAuthBoardPatch = (patch: Partial<BoardEntity>) => {
            useBoardsStore.setState((s) => ({
                ...s,
                boards: s.boards.map((b) => (b.id === id ? { ...b, ...patch } : b)),
                recentBoards: s.recentBoards.map((b) => (b.id === id ? { ...b, ...patch } : b)),
            }));
        };

        (async () => {
            try {
                // If token exists, wait for auth bootstrap to decide auth/non-auth flow.
                if (tokenPresent && !isInitialized) return;

                if (isLoggedIn) {
                    const tryLoadAccessibleBoard = async () => {
                        const { data } = await axiosInstance.get<Partial<BoardEntity>>(`/api/boards/${id}`);
                        if (cancelled) return null;
                        if (data && typeof data === 'object') {
                            setBoardMetaOverride({ ...data, id });
                            applyAuthBoardPatch(data);
                            return data;
                        }
                        return null;
                    };

                    try {
                        const accessible = await tryLoadAccessibleBoard();
                        if (accessible) {
                            try {
                                await axiosInstance.post(`/api/boards/${id}/visit`);
                            } catch {
                                // ignore
                            }
                            void useBoardsStore.getState().loadBoards();
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
                                                void useBoardsStore.getState().loadBoards();
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
                                const { data: publicData } = await axiosInstance.get<Partial<BoardEntity>>(`/api/boards/public/${id}`);
                                if (cancelled) return;
                                if (!publicData || typeof publicData !== 'object') {
                                    redirectToSpaces();
                                    return;
                                }

                                setBoardMetaOverride({ ...publicData, id, is_public: true });

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

                                try {
                                    await axiosInstance.post(`/api/boards/${id}/visit`);
                                } catch {
                                    // ignore
                                }
                                void useBoardsStore.getState().loadBoards();
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
                    const { data } = await axiosInstance.get<Partial<BoardEntity>>(`/api/boards/public/${id}`);
                    if (cancelled) return;
                    if (!data || typeof data !== 'object') {
                        redirectToSpaces();
                        return;
                    }

                    setBoardMetaOverride({ ...data, id, is_public: true });

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
                    persistRecent({
                        id,
                        title: typeof data?.title === 'string' && data.title.trim() ? data.title : 'Доска',
                        description: typeof data?.description === 'string' || data?.description === null ? data.description : null,
                        created_at: typeof data?.created_at === 'string' ? data.created_at : now,
                        last_visited_at: now,
                        image: typeof data?.image === 'string' || data?.image === null ? data.image : null,
                        is_public: true,
                    });
                } catch {
                    redirectToSpaces();
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
    }, [hasValidBoardId, inviteToken, isInitialized, isLoggedIn, navigate, numericBoardId, tokenPresent]);

    const isOwnerBoard = boardInfo?.myRole === 'owner';

    useEffect(() => {
        if (isOwnerBoard) return;
        closeBoardSettingsModal();
    }, [closeBoardSettingsModal, isOwnerBoard]);

    useEffect(() => {
        if (!isLoggedIn) {
            setParticipantsData(null);
            setRemoveConfirmParticipantId(null);
            setParticipantsLoading(false);
            return;
        }

        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;

        let cancelled = false;
        setParticipantsLoading(true);
        setParticipantsData(null);
        setRemoveConfirmParticipantId(null);
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
    }, [boardId, boardInfo?.myRole, isLoggedIn]);

    const effectiveParticipantsData = debugParticipantsData ?? participantsData;
    const isOwner = effectiveParticipantsData?.my_role === 'owner';
    const participants = effectiveParticipantsData?.participants ?? [];
    const guests = participants.filter((p) => p.role !== 'owner');
    const shouldShowParticipants = participantsLoading || isOwner || guests.length > 0;
    const canManageParticipants = isOwner || isOwnerBoard;
    const shouldShowOwnerActions = canManageParticipants && !participantsLoading;

    useLayoutEffect(() => {
        const el = participantsListRef.current;
        if (!el) return;
        const next = el.scrollHeight > el.clientHeight + 1;
        setHasParticipantsListScroll((prev) => (prev === next ? prev : next));
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const onResize = () => {
            const el = participantsListRef.current;
            if (!el) return;
            const next = el.scrollHeight > el.clientHeight + 1;
            setHasParticipantsListScroll((prev) => (prev === next ? prev : next));
        };

        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, []);

    useEffect(() => {
        if (__ENV__ !== 'development') return;
        if (typeof window === 'undefined') return;

        const w = window as unknown as {
            addFakeBoardParticipants?: (count?: number) => void;
            setFakeBoardParticipants?: (participants: BoardParticipant[]) => void;
            clearFakeBoardParticipants?: () => void;
        };

        w.addFakeBoardParticipants = (count = 8) => {
            const fakeGuests: BoardParticipant[] = Array.from({ length: count }).map((_, i) => ({
                id: 900000 + i + 1,
                username: `debug_participant_${i + 1}`,
                nickname: `Debug Participant ${i + 1}`,
                role: 'guest',
            }));

            setDebugParticipantsData({
                board_id: Number(boardId) || 0,
                my_role: 'owner',
                participants: [
                    {
                        id: 1,
                        username: 'debug_owner',
                        nickname: 'Debug Owner',
                        avatar: null,
                        role: 'owner',
                    },
                    ...fakeGuests,
                ],
            });
        };

        w.setFakeBoardParticipants = (nextParticipants) => {
            setDebugParticipantsData({
                board_id: Number(boardId) || 0,
                my_role: 'owner',
                participants: Array.isArray(nextParticipants) ? nextParticipants : [],
            });
        };

        w.clearFakeBoardParticipants = () => {
            setDebugParticipantsData(null);
        };

        return () => {
            delete w.addFakeBoardParticipants;
            delete w.setFakeBoardParticipants;
            delete w.clearFakeBoardParticipants;
        };
    }, [boardId]);

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
                        {isBoardMetaLoading ? (
                            <>
                                <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                                <div className={`${classes.skeleton} ${classes.board_info_line_skeleton}`} />
                                <div className={`${classes.skeleton} ${classes.board_info_line_sm_skeleton}`} />
                            </>
                        ) : (
                            <>
                                {boardInfo?.imageSrc ? (
                                    loadedBoardImageSrc === boardInfo.imageSrc ? (
                                        <img src={boardInfo.imageSrc} alt={boardInfo.title ?? 'board'} />
                                    ) : failedBoardImageSrc === boardInfo.imageSrc ? (
                                        <Default />
                                    ) : (
                                        <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                                    )
                                ) : boardInfo?.imageState === 'unknown' ? (
                                    <div className={`${classes.skeleton} ${classes.board_info_img_skeleton}`} />
                                ) : (
                                    <Default />
                                )}
                                {boardInfo?.title ? <span>{boardInfo.title}</span> : null}
                                {boardInfo?.description ? <p>{boardInfo.description}</p> : null}
                            </>
                        )}
                    </div>
                    {isOwnerBoard && !isBoardMetaLoading ? (
                        <div className={classes.board_info_actions}>
                            <Mainbtn variant="mini" kind="button" type="button" text="Настройки" onClick={() => openBoardSettingsModal()} />
                        </div>
                    ) : null}
                    {!isLoggedIn ? (
                        <div className={classes.participants}>
                            <div className={classes.participant_add}>
                                <AuthTrigger type="login">
                                    <Mainbtn variant="mini" kind="button" type="button" text="Войти как гость" />
                                </AuthTrigger>
                            </div>
                        </div>
                    ) : null}
                    {isLoggedIn && shouldShowParticipants ? (
                        <div className={classes.participants}>
                            {participantsLoading ? (
                                <div className={`${classes.skeleton} ${classes.participants_title_skeleton}`} />
                            ) : (
                                <span className={classes.participants_title}>Участники:</span>
                            )}
                            <div
                                ref={participantsListRef}
                                className={`${classes.participants_list} ${hasParticipantsListScroll ? classes.participants_list_scroll : ''}`}
                            >
                                {canManageParticipants ? (
                                    participantsLoading ? (
                                        <div className={`${classes.skeleton} ${classes.participant_add_skeleton}`} />
                                    ) : (
                                        <div className={classes.participant_add}>
                                                <div className={classes.participant_add_row}>
                                                    <div className={classes.participant_add_main}>
                                                    <Mainbtn
                                                        variant="mini"
                                                        kind="button"
                                                        type="button"
                                                        text="Добавить участников"
                                                        onClick={() => {
                                                            setBoardSettingsModalParticipantsInnerViewNext('friends');
                                                            openBoardSettingsModal('participants');
                                                        }}
                                                    />
                                                    </div>
                                                <Mainbtn
                                                    variant="mini"
                                                    kind="button"
                                                    type="button"
                                                    className={classes.participant_add_icon}
                                                    text={<Members />}
                                                    onClick={() => {
                                                        setBoardSettingsModalParticipantsInnerViewNext('guests');
                                                        openBoardSettingsModal('participants');
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )
                                ) : null}
                                {participantsLoading ? (
                                    <>
                                        {[0, 1, 2].map((idx) => (
                                            <div className={classes.participant_item} key={`participant-skeleton-${idx}`}>
                                                <div className={classes.participant_link}>
                                                    <div className={`${classes.skeleton} ${classes.participant_avatar_skeleton}`} />
                                                    <div className={classes.participant_names}>
                                                        <div className={`${classes.skeleton} ${classes.participant_name_skeleton}`} />
                                                        <div className={`${classes.skeleton} ${classes.participant_username_skeleton}`} />
                                                    </div>
                                                </div>
                                                <div className={`${classes.skeleton} ${classes.participant_role_skeleton}`} />
                                                {canManageParticipants ? <div className={`${classes.skeleton} ${classes.participant_remove_skeleton}`} /> : null}
                                            </div>
                                        ))}
                                    </>
                                ) : null}
                                {!participantsLoading ? guests.map((p) => {
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
                                            {shouldShowOwnerActions ? (
                                                <DropdownWrapper
                                                    right
                                                    middleleft
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
                                }) : null}
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
            {isOwnerBoard ? (
                <BoardSettingsModal
                    initialTitle={boardInfo?.title ?? null}
                    initialDescription={boardInfo?.description ?? null}
                    initialImageSrc={boardInfo?.imageSrc ?? null}
                    initialIsPublic={boardInfo?.isPublic ?? null}
                />
            ) : null}
        </div>
    );
};

export default Board;
