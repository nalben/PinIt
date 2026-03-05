import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import classes from './Board.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import { useAuthStore } from '@/store/authStore';
import { UnifiedBoard, useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';
import { BOARD_MENU_AUTO_OPEN_MIN_WIDTH, useUIStore } from '@/store/uiStore';
import FlowBoard, { type FlowBoardHandle } from '@/components/flow/FlowBoard';
import { useBoardAccess } from '@/components/flowboard/hooks/useBoardAccess';
import { resolveAvatarSrc } from '@/components/flowboard/utils/avatar';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import BoardSettingsModal from '@/components/boards/boardsettingsmodal/BoardSettingsModal';
import AuthTrigger from '@/components/auth/AuthTrigger';
import { InviteAuthModals, type InviteAuthView } from '@/components/flowboard/components/InviteAuthModals';
import Close from '@/assets/icons/monochrome/back.svg';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import DefaultUser from '@/assets/icons/monochrome/default-user.svg';
import Deny from '@/assets/icons/monochrome/deny.svg'
import Members from '@/assets/icons/monochrome/members.svg';
import SwitchIcon from '@/assets/icons/monochrome/switch.svg';
import { BoardParticipant, BoardParticipantsResponse, useBoardDetailsStore } from '@/store/boardDetailsStore';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';
import Plus from '@/assets/icons/monochrome/plus.svg'
import LinkIcon from '@/assets/icons/monochrome/link.svg'

type BoardParticipantRole = 'owner' | 'guest' | 'editer';

const PENDING_INVITE_LS_KEY = 'pinit_pendingInviteUrl';

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
    const boardMenuView = useUIStore((s) => s.boardMenuView);
    const selectedLink = useUIStore((s) => s.selectedLink);
    const selectedLinkDraft = useUIStore((s) => s.selectedLinkDraft);
    const selectedCardDetails = useUIStore((s) => s.selectedCardDetails);
    const openLinkInspector = useUIStore((s) => s.openLinkInspector);
    const closeLinkInspector = useUIStore((s) => s.closeLinkInspector);
    const patchSelectedLinkDraft = useUIStore((s) => s.patchSelectedLinkDraft);
    const closeCardDetails = useUIStore((s) => s.closeCardDetails);
    const showTopAlarm = useUIStore((s) => s.showTopAlarm);
    const openBoardSettingsModal = useUIStore((s) => s.openBoardSettingsModal);
    const closeBoardSettingsModal = useUIStore((s) => s.closeBoardSettingsModal);
    const setBoardSettingsModalParticipantsInnerViewNext = useUIStore((s) => s.setBoardSettingsModalParticipantsInnerViewNext);
    const [linkDeleteConfirmOpen, setLinkDeleteConfirmOpen] = useState(false);
    const [linkDeleteLoading, setLinkDeleteLoading] = useState(false);
    const [linkStyleDropdownOpen, setLinkStyleDropdownOpen] = useState(false);
    const [forcedAuthOpen, setForcedAuthOpen] = useState(false);
    const [forcedAuthView, setForcedAuthView] = useState<InviteAuthView>('login');
    const [hasMounted, setHasMounted] = useState(false);
    const effectiveBoardMenuOpen = hasMounted ? isBoardMenuOpen : false;
    const hasAutoOpenedBoardMenuRef = useRef(false);

    const [debugParticipantsData, setDebugParticipantsData] = useState<BoardParticipantsResponse | null>(null);
    const [removeConfirmParticipantId, setRemoveConfirmParticipantId] = useState<number | null>(null);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
    const [leaveLoading, setLeaveLoading] = useState(false);
    const [roleDropdownParticipantId, setRoleDropdownParticipantId] = useState<number | null>(null);
    const [roleLoadingParticipantId, setRoleLoadingParticipantId] = useState<number | null>(null);
    const [removeLoadingParticipantId, setRemoveLoadingParticipantId] = useState<number | null>(null);
    const flowBoardRef = useRef<FlowBoardHandle | null>(null);
    const boardMenuRef = useRef<HTMLDivElement | null>(null);
    const [isBoardMetaLoading, setIsBoardMetaLoading] = useState(true);
    const [boardMetaOverride, setBoardMetaOverride] = useState<Partial<UnifiedBoard> | null>(null);
    const [loadedBoardImageSrc, setLoadedBoardImageSrc] = useState<string | null>(null);
    const [failedBoardImageSrc, setFailedBoardImageSrc] = useState<string | null>(null);
    const [loadedParticipantAvatarSrcs, setLoadedParticipantAvatarSrcs] = useState<Record<string, true>>({});
    const [failedParticipantAvatarSrcs, setFailedParticipantAvatarSrcs] = useState<Record<string, true>>({});
    const hasAuthToken = useAuthStore((s) => s.hasToken);
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

    const saveSelectedLink = async () => {
        if (!hasValidBoardId) return;
        if (!selectedLink) return;
        if (!selectedLinkDraft) return;
        if (!isLoggedIn) return;
        if (!canEditCards) return;

        type LinkResponse = {
            id: number;
            board_id: number;
            from_card_id: number;
            to_card_id: number;
            style: 'line' | 'arrow';
            color: string;
            label: string | null;
            is_label_visible: number | boolean | null;
            created_at: string;
        };

        const label = selectedLinkDraft.label.trim().slice(0, 70);
        const currentLabel = (selectedLink.label ?? '').trim().slice(0, 70);
        const shouldFlipDirection =
            Number(selectedLinkDraft.fromCardId) === Number(selectedLink.toCardId) &&
            Number(selectedLinkDraft.toCardId) === Number(selectedLink.fromCardId);
        const shouldPatchLink =
            selectedLinkDraft.style !== selectedLink.style ||
            label !== currentLabel ||
            Boolean(selectedLinkDraft.isLabelVisible) !== Boolean(selectedLink.isLabelVisible);

        try {
            let finalFromCardId = Number(selectedLink.fromCardId);
            let finalToCardId = Number(selectedLink.toCardId);
            let finalStyle = selectedLink.style;
            let finalColor = selectedLink.color;
            let finalLabel = selectedLink.label ?? null;
            let finalIsLabelVisible = Boolean(selectedLink.isLabelVisible);

            if (shouldFlipDirection) {
                const flipRes = await axiosInstance.patch<LinkResponse>(`/api/boards/${numericBoardId}/links/${selectedLink.linkId}/flip`, {});

                finalFromCardId = Number(flipRes.data?.from_card_id);
                finalToCardId = Number(flipRes.data?.to_card_id);
                finalStyle = flipRes.data?.style ?? finalStyle;
                finalColor = flipRes.data?.color ?? finalColor;
                finalLabel = flipRes.data?.label ?? finalLabel;
                finalIsLabelVisible = typeof flipRes.data?.is_label_visible === 'number'
                    ? Boolean(flipRes.data?.is_label_visible)
                    : flipRes.data?.is_label_visible === null || flipRes.data?.is_label_visible === undefined
                        ? finalIsLabelVisible
                        : Boolean(flipRes.data?.is_label_visible);
            }

            if (shouldPatchLink) {
                const patchRes = await axiosInstance.patch<LinkResponse>(`/api/boards/${numericBoardId}/links/${selectedLink.linkId}`, {
                    style: selectedLinkDraft.style,
                    label: label ? label : null,
                    is_label_visible: selectedLinkDraft.isLabelVisible,
                });

                finalStyle = patchRes.data.style;
                finalColor = patchRes.data.color;
                finalLabel = patchRes.data.label ?? null;
                finalIsLabelVisible = typeof patchRes.data.is_label_visible === 'number'
                    ? Boolean(patchRes.data.is_label_visible)
                    : Boolean(patchRes.data.is_label_visible);
            }

            openLinkInspector({
                ...selectedLink,
                fromCardId: finalFromCardId,
                toCardId: finalToCardId,
                fromTitle: shouldFlipDirection ? (selectedLink.toTitle ?? null) : (selectedLink.fromTitle ?? null),
                toTitle: shouldFlipDirection ? (selectedLink.fromTitle ?? null) : (selectedLink.toTitle ?? null),
                style: finalStyle,
                color: finalColor,
                label: finalLabel,
                isLabelVisible: finalIsLabelVisible,
            });

            closeLinkInspector();
        } catch (e) {
            showTopAlarm('Не удалось сохранить связь.');
            if (process.env.NODE_ENV !== 'production') console.error(e);
        }
    };

    const deleteSelectedLink = async () => {
        if (!hasValidBoardId) return;
        if (!selectedLink) return;
        if (!isLoggedIn) return;
        if (!canEditCards) return;

        setLinkDeleteLoading(true);
        try {
            await axiosInstance.delete(`/api/boards/${numericBoardId}/links/${selectedLink.linkId}`);
            setLinkDeleteConfirmOpen(false);
            closeLinkInspector();
        } catch (e) {
            showTopAlarm('Не удалось удалить связь.');
            if (process.env.NODE_ENV !== 'production') console.error(e);
        } finally {
            setLinkDeleteLoading(false);
        }
    };

    const flipSelectedLinkDirection = async () => {
        if (!selectedLinkDraft) return;
        patchSelectedLinkDraft({
            fromCardId: selectedLinkDraft.toCardId,
            toCardId: selectedLinkDraft.fromCardId,
            fromTitle: selectedLinkDraft.toTitle ?? null,
            toTitle: selectedLinkDraft.fromTitle ?? null,
        });
    };

    const getPendingInviteUrlForThisBoard = useCallback(() => {
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
    }, [hasValidBoardId, numericBoardId]);

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
        setLinkDeleteConfirmOpen(false);
        setLinkDeleteLoading(false);
    }, [boardId]);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    useEffect(() => {
        hasAutoOpenedBoardMenuRef.current = false;
    }, [boardId]);

    useEffect(() => {
        if (boardMenuView !== 'link' || !selectedLink) {
            setLinkDeleteConfirmOpen(false);
            setLinkDeleteLoading(false);
        }
    }, [boardMenuView, selectedLink]);

    useEffect(() => {
        if (boardMenuView !== 'link' || !selectedLink) {
            setLinkStyleDropdownOpen(false);
        }
    }, [boardMenuView, selectedLink]);

    useEffect(() => {
        if (!hasValidBoardId) return;
        if (!isInitialized) return;
        if (isLoggedIn) return;

        let cancelled = false;

        const checkPublicStillAvailable = async () => {
            try {
                const res = await axiosInstance.get<{ is_public?: number | boolean | null }>(`/api/boards/public/${numericBoardId}`);
                const raw = res.data?.is_public;
                const isPublic = typeof raw === 'number' ? raw === 1 : typeof raw === 'boolean' ? raw : null;
                if (isPublic === false) throw new Error('board is private');
            } catch {
                if (cancelled) return;
                navigate('/spaces', { replace: true });
            }
        };

        void checkPublicStillAvailable();
        const id = window.setInterval((): void => {
            void checkPublicStillAvailable();
        }, 10_000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, [hasValidBoardId, isInitialized, isLoggedIn, navigate, numericBoardId]);

    useEscapeHandler({
        id: 'board:link-delete-confirm',
        priority: 1200,
        isOpen: linkDeleteConfirmOpen,
        onEscape: () => setLinkDeleteConfirmOpen(false),
    });

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

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const shouldOpen = window.innerWidth >= BOARD_MENU_AUTO_OPEN_MIN_WIDTH;
        if (!shouldOpen) return;
        if (hasAutoOpenedBoardMenuRef.current) return;
        const id = window.requestAnimationFrame(() => {
            hasAutoOpenedBoardMenuRef.current = true;
            openBoardMenu();
        });
        return () => window.cancelAnimationFrame(id);
    }, [boardId, openBoardMenu]);

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

    useBoardAccess({
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
    });

    const resolvedMyRole: BoardParticipantRole | null = (() => {
        if (!isLoggedIn) return null;
        const v = (debugParticipantsData ?? participantsData)?.my_role ?? boardInfo?.myRole ?? null;
        return v === 'owner' || v === 'guest' || v === 'editer' ? v : null;
    })();

    const isOwnerBoard = resolvedMyRole === 'owner';
    const isGuestBoard = resolvedMyRole === 'guest' || resolvedMyRole === 'editer';
    const canEditCards = resolvedMyRole === 'owner' || resolvedMyRole === 'editer';

    useEffect(() => {
        if (boardMenuView !== 'link') return;
        if (!selectedLink) return;
        if (canEditCards) return;
        closeLinkInspector();
    }, [boardMenuView, canEditCards, closeLinkInspector, selectedLink]);

    useEffect(() => {
        if (!effectiveBoardMenuOpen) return;
        if (boardMenuView !== 'link') return;
        if (!selectedLink) return;

        const onKeyDownCapture = (e: KeyboardEvent) => {
            const targetEl = e.target as unknown as HTMLElement | null;
            const isFormField =
                Boolean(targetEl) &&
                (targetEl instanceof HTMLInputElement ||
                    targetEl instanceof HTMLTextAreaElement ||
                    (targetEl as unknown as { isContentEditable?: boolean }).isContentEditable);

            if (e.key === 'Delete' && !isFormField) {
                if (!isLoggedIn || !canEditCards) return;
                if (!linkDeleteConfirmOpen && !linkDeleteLoading) {
                    e.preventDefault();
                    e.stopPropagation();
                    setLinkDeleteConfirmOpen(true);
                }
                return;
            }

            if (e.key === 'Enter') {
                if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                if ((e as unknown as { isComposing?: boolean }).isComposing) return;
                if (!linkDeleteConfirmOpen) return;

                e.preventDefault();
                e.stopPropagation();
                if (!linkDeleteLoading) void deleteSelectedLink();
            }
        };

        window.addEventListener('keydown', onKeyDownCapture, true);
        return () => window.removeEventListener('keydown', onKeyDownCapture, true);
    }, [boardMenuView, canEditCards, deleteSelectedLink, effectiveBoardMenuOpen, isLoggedIn, linkDeleteConfirmOpen, linkDeleteLoading, selectedLink]);

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
        setRoleDropdownParticipantId(null);
        if (current.role === nextRole) return;

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
            <div className={`${classes.board_container} ${__PLATFORM__ === 'desktop' ? classes.board_container_desktop : classes.board_container_mobile}`.trim()}>
                <div className={`${classes.board_flow_wrap} ${effectiveBoardMenuOpen ? classes.board_flow_shrink : ''}`.trim()}>
                    <FlowBoard ref={flowBoardRef} canEditCards={canEditCards} boardMenuRef={boardMenuRef} />
                </div>
            <div
                ref={boardMenuRef}
                className={`${classes.board_menu_con} ${!effectiveBoardMenuOpen ? classes.menu_close : ''}`}
            >
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
                    {boardMenuView === 'link' && selectedLink && canEditCards ? (
                        <div className={classes.link_inspector_root}>
                            <div className={classes.link_inspector_header}>
                                <div className={classes.link_inspector_title}>Связь</div>
                            </div>

                            <div className={classes.link_inspector_meta}>
                                <div>
                                    <span>От:</span> {selectedLinkDraft?.fromTitle || selectedLink.fromTitle || `#${selectedLinkDraft?.fromCardId ?? selectedLink.fromCardId}`}
                                </div>
                                <div>
                                    <span>К:</span> {selectedLinkDraft?.toTitle || selectedLink.toTitle || `#${selectedLinkDraft?.toCardId ?? selectedLink.toCardId}`}
                                </div>
                            </div>

                            <div className={classes.link_inspector_form}>
                                <div className={classes.link_inspector_field}>
                                    <div className={classes.link_inspector_label}>Вид</div>
                                    <div className={classes.link_inspector_select_row}>
                                        <div className={classes.link_inspector_select_wrap}>
                                            {__PLATFORM__ === 'desktop' ? (
                                                <DropdownWrapper
                                                    left
                                                    menuClassName={classes.link_inspector_style_dropdown}
                                                    isOpen={linkStyleDropdownOpen}
                                                    onClose={() => setLinkStyleDropdownOpen(false)}
                                                >
                                                    {[
                                                        <button
                                                            key="trigger"
                                                            type="button"
                                                            className={classes.link_inspector_select_trigger}
                                                            onClick={() => setLinkStyleDropdownOpen((prev) => !prev)}
                                                            disabled={!canEditCards || !isLoggedIn}
                                                        >
                                                            {(selectedLinkDraft?.style ?? selectedLink.style) === 'arrow' ? 'Стрелка' : 'Линия'}
                                                        </button>,
                                                        <div key="menu" className={classes.link_inspector_select_menu}>
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={`${classes.link_inspector_select_item} ${(selectedLinkDraft?.style ?? selectedLink.style) === 'line' ? classes.link_inspector_select_item_active : ''}`.trim()}
                                                                onClick={() => patchSelectedLinkDraft({ style: 'line' })}
                                                                disabled={!canEditCards || !isLoggedIn}
                                                            >
                                                                Линия
                                                            </button>
                                                            <button
                                                                type="button"
                                                                data-dropdown-class={`${classes.link_inspector_select_item} ${(selectedLinkDraft?.style ?? selectedLink.style) === 'arrow' ? classes.link_inspector_select_item_active : ''}`.trim()}
                                                                onClick={() => patchSelectedLinkDraft({ style: 'arrow' })}
                                                                disabled={!canEditCards || !isLoggedIn}
                                                            >
                                                                Стрелка
                                                            </button>
                                                        </div>,
                                                    ]}
                                                </DropdownWrapper>
                                            ) : (
                                                <select
                                                    value={selectedLinkDraft?.style ?? selectedLink.style}
                                                    onChange={(e) =>
                                                        patchSelectedLinkDraft({ style: e.currentTarget.value === 'arrow' ? 'arrow' : 'line' })
                                                    }
                                                    disabled={!canEditCards || !isLoggedIn}
                                                >
                                                    <option value="line">Линия</option>
                                                    <option value="arrow">Стрелка</option>
                                                </select>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            className={classes.link_inspector_flip_btn}
                                            onClick={(e) => {
                                                void flipSelectedLinkDirection();
                                                e.currentTarget.blur();
                                            }}
                                            disabled={!canEditCards || !isLoggedIn}
                                            aria-label="Развернуть связь"
                                        >
                                            <SwitchIcon />
                                        </button>
                                    </div>
                                </div>

                                <div className={classes.link_inspector_field}>
                                    <div className={classes.link_inspector_label}>Подпись</div>
                                    <input
                                        value={selectedLinkDraft?.label ?? (selectedLink.label ?? '')}
                                        placeholder="Введите подпись"
                                        maxLength={70}
                                        onChange={(e) =>
                                            patchSelectedLinkDraft({ label: e.currentTarget.value })
                                        }
                                        disabled={!canEditCards || !isLoggedIn}
                                    />
                                </div>

                                <label className={classes.link_inspector_toggle}>
                                    <span className={classes.link_inspector_toggle_text}>Показывать подпись</span>
                                    <input
                                        className={classes.link_inspector_toggle_input}
                                        type="checkbox"
                                        checked={Boolean(selectedLinkDraft?.isLabelVisible ?? selectedLink.isLabelVisible)}
                                        onChange={(e) =>
                                            patchSelectedLinkDraft({ isLabelVisible: e.currentTarget.checked })
                                        }
                                        disabled={!canEditCards || !isLoggedIn}
                                    />
                                    <span className={classes.link_inspector_toggle_switch} aria-hidden="true" />
                                </label>

                                <div className={classes.link_inspector_delete_row}>
                                    <DropdownWrapper upDel closeOnClick={false} isOpen={linkDeleteConfirmOpen} onClose={() => setLinkDeleteConfirmOpen(false)}>
                                        {[
                                            <button
                                                key="trigger"
                                                type="button"
                                                className={classes.link_inspector_delete_trigger}
                                                onClick={() => setLinkDeleteConfirmOpen((prev) => !prev)}
                                                disabled={!canEditCards || !isLoggedIn || linkDeleteLoading}
                                                aria-label="Удалить связь"
                                            >
                                                Удалить связь
                                            </button>,
                                            <div key="menu">
                                                <button
                                                    type="button"
                                                    data-dropdown-class={classes.participant_confirm_danger}
                                                    onClick={() => void deleteSelectedLink()}
                                                    disabled={!canEditCards || !isLoggedIn || linkDeleteLoading}
                                                >
                                                    {'Да, удалить'}
                                                </button>
                                                <button
                                                    type="button"
                                                    data-dropdown-class={classes.participant_confirm_cancel}
                                                    onClick={() => setLinkDeleteConfirmOpen(false)}
                                                    disabled={linkDeleteLoading}
                                                >
                                                    Отмена
                                                </button>
                                            </div>,
                                        ]}
                                    </DropdownWrapper>
                                </div>

                                <div className={classes.link_inspector_actions}>
                                    <Mainbtn
                                        variant="mini"
                                        kind="button"
                                        type="button"
                                        text="Сохранить"
                                        onClick={() => void saveSelectedLink()}
                                        disabled={!canEditCards || !isLoggedIn || !selectedLinkDraft}
                                    />
                                    <Mainbtn
                                        variant="mini"
                                        kind="button"
                                        type="button"
                                        text="Назад"
                                        onClick={() => closeLinkInspector()}
                                    />
                                </div>
                            </div>
                        </div>
                    ) : boardMenuView === 'card' && selectedCardDetails ? (
                        <div className={classes.link_inspector_root}>
                            <div className={classes.link_inspector_header}>
                                <div className={classes.link_inspector_title}>Карточка</div>
                            </div>
                            <div className={classes.link_inspector_meta}>
                                <div>
                                    <span>Название:</span> {selectedCardDetails.title || `#${selectedCardDetails.cardId}`}
                                </div>
                            </div>
                            <div className={classes.link_inspector_actions}>
                                <Mainbtn
                                    variant="mini"
                                    kind="button"
                                    type="button"
                                    text="Назад"
                                    onClick={() => closeCardDetails()}
                                />
                            </div>
                        </div>
                    ) : (
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
                    )}
                    {boardMenuView === 'board' && isLoggedIn && !isOwnerBoard && ownerParticipant ? (
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
                    {boardMenuView === 'board' && isLoggedIn && !isOwnerBoard && isGuestBoard ? (
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
                                            {'Покинуть'}
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
                    {boardMenuView === 'board' && isLoggedIn ? (
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
                    {boardMenuView === 'board' && !isLoggedIn && isInitialized ? (
                        <div className={classes.participants}>
                            <div className={classes.participant_add}>
                                <AuthTrigger type="login">
                                    <Mainbtn variant="mini" kind="button" type="button" text="Войти как гость" />
                                </AuthTrigger>
                            </div>
                        </div>
                    ) : null}
                    {boardMenuView === 'board' && isLoggedIn && shouldShowParticipants ? (
                        <div className={classes.participants}>
                            {participantsInitialLoading ? (
                                <div className={`${classes.skeleton} ${classes.participants_title_skeleton}`} />
                            ) : (
                                <span className={classes.participants_title}>Участники:</span>
                            )}
                            <div className={classes.participants_list}>
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

            <InviteAuthModals
                isOpen={forcedAuthOpen}
                view={forcedAuthView}
                hintClassName={classes.invite_auth_hint}
                onAbort={abortInviteAuth}
                onSuccess={closeInviteAuthAfterSuccess}
                onOpenView={setForcedAuthView}
            />
        </div>
    );
};

export default Board;

