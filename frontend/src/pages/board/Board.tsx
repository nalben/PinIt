import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import classes from './Board.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { RECENT_BOARDS_LS_KEY, UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';
import { useUIStore } from '@/store/uiStore';
import FlowBoard, { type FlowBoardHandle } from '@/components/flow/FlowBoard';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import BoardSettingsModal from '@/components/boards/boardsettingsmodal/BoardSettingsModal';
import AuthTrigger from '@/components/auth/AuthTrigger';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import LoginForm from '@/components/auth/login/Login';
import RegisterForm from '@/components/auth/register/Register';
import ResetPasswordForm from '@/components/auth/reset/ResetPasswordForm';
import Close from '@/assets/icons/monochrome/back.svg';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import DefaultUser from '@/assets/icons/monochrome/default-user.svg';
import Deny from '@/assets/icons/monochrome/deny.svg'
import Members from '@/assets/icons/monochrome/members.svg';
import { BoardParticipant, BoardParticipantsResponse, useBoardDetailsStore } from '@/store/boardDetailsStore';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';
import Plus from '@/assets/icons/monochrome/plus.svg'
import LinkIcon from '@/assets/icons/monochrome/link.svg'

type BoardParticipantRole = 'owner' | 'guest' | 'editer';

const PENDING_INVITE_LS_KEY = 'pinit_pendingInviteUrl';
type AuthView = 'login' | 'register' | 'reset';

const resolveAvatarSrc = (avatar?: string | null) => {
    if (!avatar) return null;
    if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
    return avatar;
};

const Board = () => {
    const { boardId } = useParams<{ boardId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const isAuth = useAuthStore((s) => s.isAuth);
    const isInitialized = useAuthStore((s) => s.isInitialized);
    const boards = useBoardsUnifiedStore((s) => s.myBoards);
    const recentBoards = useBoardsUnifiedStore((s) => s.recentBoards);
    const publicBoards = useBoardsUnifiedStore((s) => s.publicBoards);
    const friendsBoards = useBoardsUnifiedStore((s) => s.friendsBoards);
    const guestBoards = useBoardsUnifiedStore((s) => s.guestBoards);
    const isBoardMenuOpen = useUIStore((s) => s.isBoardMenuOpen);
    const toggleBoardMenu = useUIStore((s) => s.toggleBoardMenu);
    const openBoardMenu = useUIStore((s) => s.openBoardMenu);
    const closeBoardMenu = useUIStore((s) => s.closeBoardMenu);
    const openBoardSettingsModal = useUIStore((s) => s.openBoardSettingsModal);
    const closeBoardSettingsModal = useUIStore((s) => s.closeBoardSettingsModal);
    const setBoardSettingsModalParticipantsInnerViewNext = useUIStore((s) => s.setBoardSettingsModalParticipantsInnerViewNext);
    const [forcedAuthOpen, setForcedAuthOpen] = useState(false);
    const [forcedAuthView, setForcedAuthView] = useState<AuthView>('login');
    const [hasMounted, setHasMounted] = useState(false);
    const effectiveBoardMenuOpen = hasMounted ? isBoardMenuOpen : false;

    const [debugParticipantsData, setDebugParticipantsData] = useState<BoardParticipantsResponse | null>(null);
    const [removeConfirmParticipantId, setRemoveConfirmParticipantId] = useState<number | null>(null);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [roleDropdownParticipantId, setRoleDropdownParticipantId] = useState<number | null>(null);
    const [roleLoadingParticipantId, setRoleLoadingParticipantId] = useState<number | null>(null);
    const [removeLoadingParticipantId, setRemoveLoadingParticipantId] = useState<number | null>(null);
    const participantsListRef = useRef<HTMLDivElement | null>(null);
    const flowBoardRef = useRef<FlowBoardHandle | null>(null);
    const boardMenuRef = useRef<HTMLDivElement | null>(null);
    const [hasParticipantsListScroll, setHasParticipantsListScroll] = useState(false);
    const [isBoardMetaLoading, setIsBoardMetaLoading] = useState(true);
    const [boardMetaOverride, setBoardMetaOverride] = useState<Partial<UnifiedBoard> | null>(null);
    const [loadedBoardImageSrc, setLoadedBoardImageSrc] = useState<string | null>(null);
    const [failedBoardImageSrc, setFailedBoardImageSrc] = useState<string | null>(null);
    const [loadedParticipantAvatarSrcs, setLoadedParticipantAvatarSrcs] = useState<Record<string, true>>({});
    const [failedParticipantAvatarSrcs, setFailedParticipantAvatarSrcs] = useState<Record<string, true>>({});
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
    const participantsData = useBoardDetailsStore((s) => (hasValidBoardId ? (s.participantsByBoardId[numericBoardId] ?? null) : null));
    const participantsLoadingFlags = useBoardDetailsStore((s) => (hasValidBoardId ? s.participantsLoadingByBoardId[numericBoardId] : undefined));
    const accessLost = useBoardDetailsStore((s) => (hasValidBoardId ? Boolean(s.accessLostBoards[numericBoardId]) : false));
    const participantsInitialLoading = Boolean(participantsLoadingFlags?.initial) && !participantsData;

    const getPendingInviteUrlForThisBoard = () => {
        if (!hasValidBoardId) return null;

        let raw: string | null = null;
        try {
            raw = localStorage.getItem(PENDING_INVITE_LS_KEY);
        } catch {
            raw = null;
        }

        if (!raw) return null;

        const normalizeToRelative = (value: string) => {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('/')) return trimmed;
            try {
                const u = new URL(trimmed);
                return `${u.pathname}${u.search}`;
            } catch {
                return null;
            }
        };

        const relative = normalizeToRelative(raw);
        if (!relative) return null;

        try {
            const u = new URL(relative, window.location.origin);
            if (u.pathname !== `/spaces/${numericBoardId}`) return null;
            const invite = u.searchParams.get('invite');
            if (!invite) return null;
            return `${u.pathname}${u.search}`;
        } catch {
            return null;
        }
    };

    const abortInviteAuth = () => {
        try {
            localStorage.removeItem(PENDING_INVITE_LS_KEY);
        } catch {
            // ignore
        }
        setForcedAuthOpen(false);
        navigate('/spaces', { replace: true });
    };

    const closeInviteAuthAfterSuccess = () => {
        setForcedAuthOpen(false);
    };

    useEffect(() => {
        if (!hasValidBoardId) return;
        if (isLoggedIn) {
            setForcedAuthOpen(false);
            return;
        }

        const currentUrl = `${location.pathname}${location.search}`;
        const pendingUrl = getPendingInviteUrlForThisBoard();

        const tokenFromPendingUrl = (() => {
            if (!pendingUrl) return null;
            try {
                const u = new URL(pendingUrl, window.location.origin);
                const v = u.searchParams.get('invite');
                return typeof v === 'string' && v.trim() ? v.trim() : null;
            } catch {
                return null;
            }
        })();

        const tokenToValidate = inviteToken || tokenFromPendingUrl;
        if (!tokenToValidate) {
            if (forcedAuthOpen) setForcedAuthOpen(false);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const { data } = await axiosInstance.get<{ board_id: number }>(`/api/boards/invite-link/resolve`, {
                    params: { token: tokenToValidate },
                });
                if (cancelled) return;

                const resolvedBoardId = Number(data?.board_id);
                if (!Number.isFinite(resolvedBoardId) || resolvedBoardId <= 0) {
                    throw new Error('Invalid resolve response');
                }

                if (resolvedBoardId !== numericBoardId) {
                    navigate(`/spaces/${resolvedBoardId}?invite=${encodeURIComponent(tokenToValidate)}`, { replace: true });
                    return;
                }

                if (inviteToken) {
                    try {
                        localStorage.setItem(PENDING_INVITE_LS_KEY, currentUrl);
                    } catch {
                        // ignore
                    }
                } else if (pendingUrl && pendingUrl !== currentUrl) {
                    navigate(pendingUrl, { replace: true });
                    return;
                }

                if (!forcedAuthOpen) setForcedAuthView('login');
                setForcedAuthOpen(true);
            } catch (err: unknown) {
                if (cancelled) return;
                const status = (err as { response?: { status?: number } })?.response?.status;

                if (status === 404) {
                    try {
                        localStorage.removeItem(PENDING_INVITE_LS_KEY);
                    } catch {
                        // ignore
                    }

                    if (inviteToken) {
                        navigate('/spaces', { replace: true });
                    } else {
                        setForcedAuthOpen(false);
                    }
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [forcedAuthOpen, hasValidBoardId, inviteToken, isLoggedIn, location.pathname, location.search, navigate, numericBoardId]);

    useEffect(() => {
        setLeaveConfirmOpen(false);
        setLeaveLoading(false);
        setRoleDropdownParticipantId(null);
        setRoleLoadingParticipantId(null);
    }, [boardId]);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEscapeHandler({
        id: 'board:participants-role-dropdown',
        priority: 1100,
        isOpen: roleDropdownParticipantId !== null,
        onEscape: () => setRoleDropdownParticipantId(null),
    });

    useEscapeHandler({
        id: 'board:right-menu',
        priority: 500,
        isOpen: effectiveBoardMenuOpen,
        onEscape: closeBoardMenu,
    });

    useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        closeBoardMenu();
    }, [closeBoardMenu]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const shouldOpen = window.innerWidth >= 1440;
        if (shouldOpen) openBoardMenu();
    }, [openBoardMenu]);

    const boardInfo = useMemo(() => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return null;

        const stateBoard = (location.state as { board?: Partial<UnifiedBoard> } | null)?.board;
        const fromState = stateBoard && Number(stateBoard.id) === id ? stateBoard : undefined;
        const fromOverride = boardMetaOverride && Number(boardMetaOverride.id) === id ? boardMetaOverride : undefined;

        const fromBoards = boards.find((b) => b.id === id);
        const fromRecent = recentBoards.find((b) => b.id === id);
        const fromPublic = publicBoards.find((b) => b.id === id);
        const fromFriends = friendsBoards.find((b) => b.id === id);
        const fromGuest = guestBoards.find((b) => b.id === id);

        const merged: Partial<UnifiedBoard> = {
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

        const applyAuthBoardPatch = (patch: Partial<UnifiedBoard>) => {
            useBoardsUnifiedStore.setState((s) => {
                const prev = s.entitiesById[id];
                const nextEntities = {
                    ...s.entitiesById,
                    [id]: { ...(prev ?? { id, title: '', created_at: new Date().toISOString() }), ...prev, ...patch, id },
                };

                const apply = <T extends { id: number }>(list: T[]) => list.map((b) => (b.id === id ? ({ ...b, ...patch } as T) : b));

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

        (async () => {
            try {
                // If token exists, wait for auth bootstrap to decide auth/non-auth flow.
                if (tokenPresent && !isInitialized) {
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

                    const tryLoadAccessibleBoard = async () => {
                        const { data } = await axiosInstance.get<Partial<UnifiedBoard>>(`/api/boards/${id}`);
                        if (cancelled) return null;
                        if (data && typeof data === 'object') {
                            setBoardMetaOverride({ ...data, id });
                            applyAuthBoardPatch(data);
                            if (inviteToken) {
                                navigate(`/spaces/${id}`, { replace: true });
                            }
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

                    const persistRecent = (entry: UnifiedBoard) => {
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
    }, [hasValidBoardId, inviteToken, isInitialized, isLoggedIn, navigate, numericBoardId, tokenPresent]);

    const resolvedMyRole: BoardParticipantRole | null = (() => {
        if (!isLoggedIn) return null;
        const v = (debugParticipantsData ?? participantsData)?.my_role ?? boardInfo?.myRole ?? null;
        return v === 'owner' || v === 'guest' || v === 'editer' ? v : null;
    })();

    const isOwnerBoard = resolvedMyRole === 'owner';
    const isGuestBoard = resolvedMyRole === 'guest' || resolvedMyRole === 'editer';
    const canEditCards = resolvedMyRole === 'owner' || resolvedMyRole === 'editer';

    useEffect(() => {
        if (isOwnerBoard) return;
        closeBoardSettingsModal();
    }, [closeBoardSettingsModal, isOwnerBoard]);

    useEffect(() => {
        if (!isInitialized) return;
        if (!isLoggedIn) {
            setRemoveConfirmParticipantId(null);
            return;
        }

        if (!isOwnerBoard && !isGuestBoard) return;

        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;
        useBoardDetailsStore.getState().ensureParticipantsLoaded(id);

        return () => {};
    }, [boardId, isGuestBoard, isInitialized, isLoggedIn, isOwnerBoard]);

    useEffect(() => {
        if (!hasValidBoardId) return;
        if (!accessLost) return;

        closeBoardSettingsModal();
        void useBoardsUnifiedStore.getState().refreshMySilent();
        void useBoardsUnifiedStore.getState().refreshRecentSilent();
        void useBoardsUnifiedStore.getState().refreshGuestSilent();
        void useBoardsUnifiedStore.getState().refreshFriendsSilent();
        void useBoardsUnifiedStore.getState().refreshPublicSilent();
        useBoardDetailsStore.getState().clearBoard(numericBoardId);
        navigate('/spaces', { replace: true });
    }, [accessLost, closeBoardSettingsModal, hasValidBoardId, navigate, numericBoardId]);

    const effectiveParticipantsData = debugParticipantsData ?? participantsData;
    const isOwner = effectiveParticipantsData?.my_role === 'owner';
    const participants = effectiveParticipantsData?.participants ?? [];
    const guests = participants.filter((p) => p.role !== 'owner');
    const shouldShowParticipants = participantsInitialLoading || isOwner || guests.length > 0;
    const canManageParticipants = isOwner || isOwnerBoard;
    const shouldShowOwnerActions = canManageParticipants && !participantsInitialLoading;
    const ownerParticipant = participants.find((p) => p.role === 'owner') ?? null;
    const ownerAvatarSrc = ownerParticipant ? resolveAvatarSrc(ownerParticipant.avatar) : null;

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

        setRemoveLoadingParticipantId(participantId);
        try {
            await axiosInstance.delete(`/api/boards/${id}/guests/${participantId}`);
            useBoardDetailsStore.getState().applyParticipantsPatch(id, (prev) => {
                if (!prev) return prev;
                return { ...prev, participants: prev.participants.filter((p) => p.id !== participantId) };
            });
            void useBoardDetailsStore.getState().refreshParticipantsSilent(id);
        } catch {
            // ignore
        } finally {
            setRemoveLoadingParticipantId(null);
            setRemoveConfirmParticipantId(null);
        }
    };

    const updateParticipantRole = async (participantId: number, nextRole: Extract<BoardParticipantRole, 'guest' | 'editer'>) => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;
        if (!isOwner) return;

        const current = participants.find((p) => p.id === participantId);
        if (!current) return;
        if (current.role === 'owner') return;
        if (current.role === nextRole) {
            setRoleDropdownParticipantId(null);
            return;
        }

        setRoleLoadingParticipantId(participantId);
        try {
            await axiosInstance.patch(`/api/boards/${id}/guests/${participantId}/role`, { role: nextRole });

            const apply = (prev: BoardParticipantsResponse | null) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    participants: prev.participants.map((p) => (p.id === participantId ? { ...p, role: nextRole } : p)),
                };
            };

            useBoardDetailsStore.getState().applyParticipantsPatch(id, apply);
            setDebugParticipantsData(apply);
            setRoleDropdownParticipantId(null);
        } catch {
            // ignore
        } finally {
            setRoleLoadingParticipantId(null);
        }
    };

    const leaveBoard = async () => {
        const id = Number(boardId);
        if (!Number.isFinite(id) || id <= 0) return;
        if (!isLoggedIn) return;
        if (!isGuestBoard) return;

        setLeaveLoading(true);
        try {
            await axiosInstance.post(`/api/boards/${id}/leave`);
            setLeaveConfirmOpen(false);
            navigate('/spaces', { replace: true });
        } catch {
            // ignore
        } finally {
            setLeaveLoading(false);
        }
    };

    return (
            <div className={classes.board_container}>
                <div className={`${classes.board_flow_wrap} ${effectiveBoardMenuOpen ? classes.board_flow_shrink : ''}`.trim()}>
                    <FlowBoard ref={flowBoardRef} canEditCards={canEditCards} />
                </div>
            <div ref={boardMenuRef} className={`${classes.board_menu_con} ${!effectiveBoardMenuOpen ? classes.menu_close : ''}`}>
                <div className={classes.left_menu_btns}>
                    <button
                        className={`${classes.left_menu_btn} ${classes.left_menu_btn_toggle}`.trim()}
                        onClick={(e) => {
                            toggleBoardMenu();
                            e.currentTarget.blur();
                        }}
                        type="button"
                    >
                        <Close />
                    </button>
                    {canEditCards ? (
                        <button
                            className={`${classes.left_menu_btn} ${classes.left_menu_btn_create_node}`.trim()}
                            type="button"
                            onClick={() => flowBoardRef.current?.createDraftNodeAtCenter()}
                        >
                            <Plus />
                        </button>
                    ) : null}
                    {canEditCards ? (
                        <button
                            className={`${classes.left_menu_btn} ${classes.left_menu_btn_create_node}`.trim()}
                            type="button"
                            onClick={(e) => {
                                flowBoardRef.current?.startLinkMode();
                                e.currentTarget.blur();
                            }}
                            aria-label="Связать записи"
                        >
                            <LinkIcon />
                        </button>
                    ) : null}
                </div>
                <div className={classes.board_menu_}>
                    <div className={classes.board_info}>
                        {isBoardMetaLoading || !boardInfo?.title ? (
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
                    {isLoggedIn && !isOwnerBoard && ownerParticipant ? (
                        <div>
                            <div className={classes.owner_block}>
                                <span className={classes.owner_title}>Владелец:</span>
                                <div className={classes.owner_row}>
                                    <Link className={classes.owner_link} to={`/user/${ownerParticipant.username}`}>
                                        <div className={classes.owner_avatar}>
                                            {ownerAvatarSrc ? (
                                                <img src={ownerAvatarSrc} alt={ownerParticipant.nickname || ownerParticipant.username} />
                                            ) : (
                                                <DefaultUser />
                                            )}
                                        </div>
                                        <div className={classes.owner_names}>
                                            <span className={classes.owner_name}>{ownerParticipant.nickname || ownerParticipant.username}</span>
                                            <span className={classes.owner_username}>@{ownerParticipant.username}</span>
                                        </div>
                                    </Link>
                                    <Mainbtn variant="mini" kind="navlink" href={`/user/${ownerParticipant.username}`} text="Открыть" />
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {isLoggedIn && !isOwnerBoard && isGuestBoard ? (
                        <div className={classes.leave_board_row}>
                            <DropdownWrapper upDel closeOnClick={false} isOpen={leaveConfirmOpen} onClose={() => setLeaveConfirmOpen(false)}>
                                {[
                                    <button
                                        key="trigger"
                                        type="button"
                                        className={classes.leave_board_trigger}
                                        onClick={() => setLeaveConfirmOpen((v) => !v)}
                                        disabled={leaveLoading || participantsInitialLoading}
                                        aria-label="Покинуть доску"
                                    >
                                        Покинуть доску
                                    </button>,
                                    <div key="menu">
                                        <button
                                            type="button"
                                            data-dropdown-class={classes.participant_confirm_danger}
                                            onClick={leaveBoard}
                                            disabled={leaveLoading || participantsInitialLoading}
                                        >
                                            {leaveLoading ? 'Выход...' : 'Покинуть'}
                                        </button>
                                        <button
                                            type="button"
                                            data-dropdown-class={classes.participant_confirm_cancel}
                                            onClick={() => setLeaveConfirmOpen(false)}
                                            disabled={leaveLoading || participantsInitialLoading}
                                        >
                                            Отмена
                                        </button>
                                    </div>,
                                ]}
                            </DropdownWrapper>
                        </div>
                    ) : null}
                    {isLoggedIn ? (
                        isBoardMetaLoading ? (
                            <div className={classes.board_info_actions}>
                                <div className={`${classes.skeleton} ${classes.board_info_actions_skeleton}`} />
                            </div>
                        ) : isOwnerBoard ? (
                            <div className={classes.board_info_actions}>
                                <Mainbtn variant="mini" kind="button" type="button" text="Настройки" onClick={() => openBoardSettingsModal()} />
                            </div>
                        ) : null
                    ) : null}
                    {!isLoggedIn && isInitialized ? (
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
                            {participantsInitialLoading ? (
                                <div className={`${classes.skeleton} ${classes.participants_title_skeleton}`} />
                            ) : (
                                <span className={classes.participants_title}>Участники:</span>
                            )}
                            <div
                                ref={participantsListRef}
                                className={`${classes.participants_list} ${hasParticipantsListScroll ? classes.participants_list_scroll : ''}`}
                            >
                                {canManageParticipants ? (
                                    participantsInitialLoading ? (
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
                                {participantsInitialLoading ? (
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
                                {!participantsInitialLoading ? guests.map((p) => {
                                    const avatarSrc = resolveAvatarSrc(p.avatar);
                                    const displayName = (p.nickname ?? '').trim() || p.username;
                                    const shouldShowUsername = Boolean((p.nickname ?? '').trim());
                                    const isRoleBusy = roleLoadingParticipantId === p.id;
                                    const isAvatarLoaded = Boolean(avatarSrc && loadedParticipantAvatarSrcs[avatarSrc]);
                                    const isAvatarFailed = Boolean(avatarSrc && failedParticipantAvatarSrcs[avatarSrc]);
                                    const roleLabel = p.role === 'editer' ? 'Редактор' : 'Гость';

                                    return (
                                        <div className={classes.participant_item} key={p.id}>
                                            <Link className={classes.participant_link} to={`/user/${p.username}`}>
                                                <div className={classes.participant_avatar}>
                                                    {avatarSrc && !isAvatarFailed ? (
                                                        <>
                                                            {!isAvatarLoaded ? (
                                                                <div
                                                                    className={`${classes.skeleton} ${classes.participant_avatar_skeleton} ${classes.participant_avatar_overlay}`}
                                                                />
                                                            ) : null}
                                                            <img
                                                                src={avatarSrc}
                                                                alt={displayName}
                                                                className={`${classes.participant_avatar_img} ${isAvatarLoaded ? classes.participant_avatar_img_visible : classes.participant_avatar_img_hidden}`}
                                                                loading="lazy"
                                                                onLoad={() => {
                                                                    setLoadedParticipantAvatarSrcs((prev) =>
                                                                        prev[avatarSrc] ? prev : { ...prev, [avatarSrc]: true }
                                                                    );
                                                                }}
                                                                onError={() => {
                                                                    setFailedParticipantAvatarSrcs((prev) =>
                                                                        prev[avatarSrc] ? prev : { ...prev, [avatarSrc]: true }
                                                                    );
                                                                }}
                                                            />
                                                        </>
                                                    ) : (
                                                        <DefaultUser />
                                                    )}
                                                </div>
                                                <div className={classes.participant_names}>
                                                    <span className={classes.participant_name}>{displayName}</span>
                                                    {shouldShowUsername ? <span className={classes.participant_username}>{p.username}</span> : null}
                                                </div>
                                            </Link>
                                            {isOwner ? (
                                                <DropdownWrapper
                                                    upDel
                                                    closeOnClick={false}
                                                    isOpen={roleDropdownParticipantId === p.id}
                                                    onClose={() => setRoleDropdownParticipantId(null)}
                                                >
                                                    {[
                                                        <button
                                                            key="trigger"
                                                            type="button"
                                                            className={classes.participant_role_btn}
                                                            onClick={() => setRoleDropdownParticipantId((prev) => (prev === p.id ? null : p.id))}
                                                            disabled={participantsInitialLoading || isRoleBusy}
                                                        >
                                                            {roleLabel}
                                                        </button>,
                                                        <div key="menu">
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_role_item}
                                                                onClick={() => updateParticipantRole(p.id, 'guest')}
                                                                disabled={participantsInitialLoading || isRoleBusy}
                                                            >
                                                                Гость
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_role_item}
                                                                onClick={() => updateParticipantRole(p.id, 'editer')}
                                                                disabled={participantsInitialLoading || isRoleBusy}
                                                            >
                                                                Редактор
                                                            </button>
                                                        </div>,
                                                    ]}
                                                </DropdownWrapper>
                                            ) : (
                                                <span className={classes.participant_role}>{p.role === 'editer' ? 'Редактор' : 'Гость'}</span>
                                            )}
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
                                                            disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}
                                                            aria-label="Удалить участника"
                                                        >
                                                            <Deny />
                                                        </button>,
                                                        <div key="menu">
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_confirm_danger}
                                                                onClick={() => removeParticipant(p.id)}
                                                                disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}
                                                            >
                                                                Удалить
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={classes.participant_confirm_cancel}
                                                                onClick={() => setRemoveConfirmParticipantId(null)}
                                                                disabled={participantsInitialLoading || removeLoadingParticipantId === p.id}
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
                    preRenderAllTabs
                />
            ) : null}

            <AuthModal isOpen={forcedAuthOpen && forcedAuthView === 'login'} onClose={abortInviteAuth} closeOnOverlayClick={false}>
                <div className={classes.invite_auth_hint}>Войдите в аккаунт, чтобы присоединиться к доске</div>
                <LoginForm
                    onOpenReset={() => setForcedAuthView('reset')}
                    onOpenRegister={() => setForcedAuthView('register')}
                    onClose={closeInviteAuthAfterSuccess}
                />
            </AuthModal>

            <AuthModal
                isOpen={forcedAuthOpen && forcedAuthView === 'register'}
                onClose={abortInviteAuth}
                closeOnOverlayClick={false}
            >
                <div className={classes.invite_auth_hint}>Войдите в аккаунт, чтобы присоединиться к доске</div>
                <RegisterForm onClose={closeInviteAuthAfterSuccess} />
            </AuthModal>

            <AuthModal
                isOpen={forcedAuthOpen && forcedAuthView === 'reset'}
                onClose={abortInviteAuth}
                closeOnOverlayClick={false}
                onBack={() => setForcedAuthView('login')}
            >
                <div className={classes.invite_auth_hint}>Войдите в аккаунт, чтобы присоединиться к доске</div>
                <ResetPasswordForm onClose={closeInviteAuthAfterSuccess} />
            </AuthModal>
        </div>
    );
};

export default Board;
