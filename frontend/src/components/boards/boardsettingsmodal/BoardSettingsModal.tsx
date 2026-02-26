import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import { useUIStore } from '@/store/uiStore';
import classes from './BoardSettingsModal.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Edit from '@/assets/icons/monochrome/edit.svg';
import DefaultUser from '@/assets/icons/monochrome/default-user.svg';
import { useBoardsUnifiedStore } from '@/store/boardsUnifiedStore';
import { useAuthStore } from '@/store/authStore';
import { Friend, useFriendsStore } from '@/store/friendsStore';
import { BoardParticipant, useBoardDetailsStore } from '@/store/boardDetailsStore';

const MAX_BOARD_IMAGE_SIZE_MB = 5;
const MAX_BOARD_IMAGE_SIZE_BYTES = MAX_BOARD_IMAGE_SIZE_MB * 1024 * 1024;
const BOARD_TITLE_MAX_LENGTH = 20;
const BOARD_DESCRIPTION_MAX_LENGTH = 80;

type BoardRole = 'owner' | 'guest' | 'editer' | null;

interface BoardResponse {
  id: number;
  owner_id: number;
  is_public?: number | boolean;
  title: string;
  description?: string | null;
  image?: string | null;
  created_at: string;
  my_role: BoardRole;
}

type BoardParticipantRole = 'owner' | 'guest' | 'editer';

type BoardInviteLinkResponse = {
  token: string;
  updated_at?: string;
};

const resolveBoardImageSrc = (image?: string | null) => {
  if (!image) return null;
  if (image.startsWith('/uploads/')) return `${API_URL}${image}`;
  return image;
};

const resolveAvatarSrc = (avatar?: string | null) => {
  if (!avatar) return null;
  if (avatar.startsWith('/uploads/')) return `${API_URL}${avatar}`;
  return avatar;
};

const loadImageElement = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const cropToAspect3_8 = async (file: File) => {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(srcUrl);

    const targetAspect = 3.8;
    const targetW = 1280;
    const targetH = Math.round(targetW / targetAspect);

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const srcAspect = srcW / srcH;

    let cropW = srcW;
    let cropH = srcH;
    let cropX = 0;
    let cropY = 0;

    if (srcAspect > targetAspect) {
      cropW = Math.round(srcH * targetAspect);
      cropX = Math.round((srcW - cropW) / 2);
    } else if (srcAspect < targetAspect) {
      cropH = Math.round(srcW / targetAspect);
      cropY = Math.round((srcH - cropH) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');

    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error('toBlob failed'));
          else resolve(b);
        },
        'image/jpeg',
        0.9
      );
    });

    return new File([blob], 'board.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
};

type BoardSettingsModalProps = {
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialImageSrc?: string | null;
  initialIsPublic?: boolean | null;
  preRenderAllTabs?: boolean;
};

const BoardSettingsModal: React.FC<BoardSettingsModalProps> = ({
  initialTitle,
  initialDescription,
  initialImageSrc,
  initialIsPublic,
  preRenderAllTabs,
}) => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const isOpen = useUIStore((s) => s.boardSettingsModalOpen);
  const close = useUIStore((s) => s.closeBoardSettingsModal);
  const view = useUIStore((s) => s.boardSettingsModalView);
  const setView = useUIStore((s) => s.setBoardSettingsModalView);
  const participantsInnerViewNext = useUIStore((s) => s.boardSettingsModalParticipantsInnerViewNext);
  const setParticipantsInnerViewNext = useUIStore((s) => s.setBoardSettingsModalParticipantsInnerViewNext);
  const openFriendsModal = useUIStore((s) => s.openFriendsModal);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const friends = useFriendsStore((s) => s.friends);
  const friendsLoading = useFriendsStore((s) => s.isLoading);
  const ensureFriendsLoaded = useFriendsStore((s) => s.ensureFriendsLoaded);

  const [isPublicToggleNoAnim, setIsPublicToggleNoAnim] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [removedGuestsByUserId, setRemovedGuestsByUserId] = useState<Record<number, BoardParticipant>>({});
  const [inviteActionUserId, setInviteActionUserId] = useState<number | null>(null);
  const [roleActionUserId, setRoleActionUserId] = useState<number | null>(null);
  const [roleDropdownUserId, setRoleDropdownUserId] = useState<number | null>(null);

  const [inviteLinkError, setInviteLinkError] = useState<string | null>(null);
  const [inviteLinkActionLoading, setInviteLinkActionLoading] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const inviteLinkCopiedTimeoutRef = useRef<number | null>(null);
  const friendsListRef = useRef<HTMLDivElement | null>(null);
  const [hasFriendsListScroll, setHasFriendsListScroll] = useState(false);
  const [participantsInnerView, setParticipantsInnerView] = useState<'friends' | 'guests'>('friends');
  const [friendsSearch, setFriendsSearch] = useState('');
  const [guestsSearch, setGuestsSearch] = useState('');
  const [guestsAnchorUserId, setGuestsAnchorUserId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const numericBoardId = useMemo(() => {
    const id = Number(boardId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [boardId]);

  const shouldWarmAllTabs = Boolean(preRenderAllTabs);
  const boardMeta = useBoardDetailsStore((s) => (numericBoardId ? (s.boardMetaByBoardId[numericBoardId] ?? null) : null));
  const boardMetaLoadingFlags = useBoardDetailsStore((s) => (numericBoardId ? s.boardMetaLoadingByBoardId[numericBoardId] : undefined));
  const boardMetaLoadedOnce = useBoardDetailsStore((s) => (numericBoardId ? Boolean(s.boardMetaHasLoadedOnce[numericBoardId]) : false));
  const draft = useBoardDetailsStore((s) => (numericBoardId ? s.boardDraftByBoardId[numericBoardId] : undefined));
  const isDraftDirty = useBoardDetailsStore((s) => (numericBoardId ? Boolean(s.boardDraftDirtyByBoardId[numericBoardId]) : false));
  const isOwnerFromUnified = useBoardsUnifiedStore((s) => (numericBoardId ? s.entitiesById?.[numericBoardId]?.my_role === 'owner' : false));
  const isOwner = isOwnerFromUnified || boardMeta?.my_role === 'owner';
  const metaInitialLoading = Boolean(boardMetaLoadingFlags?.initial) && !boardMeta;
  const title = draft?.title ?? (typeof initialTitle === 'string' ? initialTitle : '');
  const description = draft?.description ?? (typeof initialDescription === 'string' ? initialDescription : '');
  const isPublic = draft?.is_public ?? Boolean(initialIsPublic);
  const currentImageSrc = resolveBoardImageSrc(boardMeta?.image ?? null);
  const imageSrc = imagePreview ?? currentImageSrc ?? initialImageSrc ?? null;
  const participantsResponse = useBoardDetailsStore((s) => (numericBoardId ? (s.participantsByBoardId[numericBoardId] ?? null) : null));
  const participantsLoadingFlags = useBoardDetailsStore((s) => (numericBoardId ? s.participantsLoadingByBoardId[numericBoardId] : undefined));
  const boardParticipants = participantsResponse?.participants ?? [];
  const participantsByUserId = useMemo(() => {
    const map: Record<number, true> = {};
    for (const p of boardParticipants) {
      const id = Number(p?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      map[id] = true;
    }
    return map;
  }, [boardParticipants]);

  const outgoingInvitesByUserId = useBoardDetailsStore((s) => (numericBoardId ? s.outgoingInvitesByBoardId[numericBoardId] : undefined)) ?? {};
  const outgoingInvitesLoadingFlags = useBoardDetailsStore((s) => (numericBoardId ? s.outgoingInvitesLoadingByBoardId[numericBoardId] : undefined));

  const inviteLinkToken = useBoardDetailsStore((s) => (numericBoardId ? (s.inviteLinkTokenByBoardId[numericBoardId] ?? null) : null));
  const inviteLinkLoadingFlags = useBoardDetailsStore((s) => (numericBoardId ? s.inviteLinkLoadingByBoardId[numericBoardId] : undefined));
  const participantsLoading = Boolean(participantsLoadingFlags?.initial) && !participantsResponse;
  const outgoingInvitesLoading = Boolean(outgoingInvitesLoadingFlags?.initial) && Object.keys(outgoingInvitesByUserId).length === 0;
  const inviteLinkLoading = inviteLinkActionLoading || (Boolean(inviteLinkLoadingFlags?.initial) && !inviteLinkToken);

  useEffect(() => {
    setRemovedGuestsByUserId((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const next = { ...prev };
      for (const key of keys) {
        const id = Number(key);
        if (!Number.isFinite(id) || id <= 0) continue;
        if (participantsByUserId[id]) delete next[id];
      }
      return next;
    });
  }, [participantsByUserId]);

  useEffect(() => {
    if (!numericBoardId) return;
    if (!isOpen && !shouldWarmAllTabs) return;

    useBoardDetailsStore.getState().seedBoardDraftFromInitial(numericBoardId, {
      title: typeof initialTitle === 'string' ? initialTitle : '',
      description: typeof initialDescription === 'string' ? initialDescription : '',
      is_public: typeof initialIsPublic === 'boolean' ? initialIsPublic : Boolean(initialIsPublic),
    });
    useBoardDetailsStore.getState().ensureBoardMetaLoaded(numericBoardId);
  }, [initialDescription, initialIsPublic, initialTitle, isOpen, numericBoardId, shouldWarmAllTabs]);

  useEffect(() => {
    if (!isOpen) return;
    setIsPublicToggleNoAnim(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (metaInitialLoading) return;

    const id = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setIsPublicToggleNoAnim(false));
      return () => cancelAnimationFrame(id2);
    });

    return () => cancelAnimationFrame(id);
  }, [metaInitialLoading, isOpen]);

  useEffect(() => {
    if (!numericBoardId) return;
    if (!isOpen && !shouldWarmAllTabs) return;
    useBoardDetailsStore.getState().ensureParticipantsLoaded(numericBoardId);
    useBoardDetailsStore.getState().ensureOutgoingInvitesLoaded(numericBoardId);
    useBoardDetailsStore.getState().ensureInviteLinkLoaded(numericBoardId);
    if (isOwner && userId) void ensureFriendsLoaded(userId);
  }, [ensureFriendsLoaded, isOpen, isOwner, numericBoardId, shouldWarmAllTabs, userId]);

  useEffect(() => {
    if (isOpen) return;
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setError(null);
    setIsSaving(false);
    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    setParticipantsError(null);
    setInviteActionUserId(null);
    setInviteLinkError(null);
    setInviteLinkActionLoading(false);
    setInviteLinkCopied(false);
    if (inviteLinkCopiedTimeoutRef.current) {
      window.clearTimeout(inviteLinkCopiedTimeoutRef.current);
      inviteLinkCopiedTimeoutRef.current = null;
    }
    if (numericBoardId) useBoardDetailsStore.getState().resetBoardDraft(numericBoardId);
  }, [imagePreview, isOpen, numericBoardId, shouldWarmAllTabs]);

  const inviteLinkUrl = useMemo(() => {
    if (!numericBoardId || !inviteLinkToken) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/spaces/${numericBoardId}?invite=${encodeURIComponent(inviteLinkToken)}`;
  }, [inviteLinkToken, numericBoardId]);

  useLayoutEffect(() => {
    const el = friendsListRef.current;
    if (!el) return;
    const next = el.scrollHeight > el.clientHeight + 1;
    setHasFriendsListScroll((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onResize = () => {
      const el = friendsListRef.current;
      if (!el) return;
      const next = el.scrollHeight > el.clientHeight + 1;
      setHasFriendsListScroll((prev) => (prev === next ? prev : next));
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const regenerateInviteLink = async () => {
    if (!numericBoardId) return;
    if (!isOwner) return;

    setInviteLinkActionLoading(true);
    setInviteLinkError(null);
    try {
      const { data } = await axiosInstance.post<BoardInviteLinkResponse>(`/api/boards/${numericBoardId}/invite-link/regenerate`);
      const token = typeof data?.token === 'string' ? data.token : null;
      useBoardDetailsStore.getState().setInviteLinkToken(numericBoardId, token);
    } catch {
      setInviteLinkError('Не удалось пересоздать ссылку');
    } finally {
      setInviteLinkActionLoading(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLinkUrl) return;

    const markCopied = () => {
      setInviteLinkCopied(true);
      if (inviteLinkCopiedTimeoutRef.current) window.clearTimeout(inviteLinkCopiedTimeoutRef.current);
      inviteLinkCopiedTimeoutRef.current = window.setTimeout(() => {
        setInviteLinkCopied(false);
        inviteLinkCopiedTimeoutRef.current = null;
      }, 2000);
    };

    try {
      await navigator.clipboard.writeText(inviteLinkUrl);
      markCopied();
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = inviteLinkUrl;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const ok = document.execCommand('copy');
        if (ok) markCopied();
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const inviteFriend = async (friend: { id: number; username: string }) => {
    if (!numericBoardId) return;
    if (!isOwner) return;

    setInviteActionUserId(friend.id);
    setParticipantsError(null);
    try {
      const { data } = await axiosInstance.post<{ id: number; invited_id: number; status: string }>(`/api/boards/${numericBoardId}/invites`, {
        username: friend.username,
      });

      const inviteId = Number(data?.id);
      if (Number.isFinite(inviteId) && inviteId > 0) {
        useBoardDetailsStore.getState().setOutgoingInvite(numericBoardId, friend.id, { id: inviteId, status: 'sent' });
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number; data?: unknown } })?.response?.status;
      const inviteId = Number((e as { response?: { data?: { invite_id?: number } } })?.response?.data?.invite_id);
      const inviteStatus = (e as { response?: { data?: { status?: string } } })?.response?.data?.status;
      if (status === 409 && Number.isFinite(inviteId) && inviteId > 0) {
        const nextStatus: 'sent' | 'rejected' = inviteStatus === 'rejected' ? 'rejected' : 'sent';
        useBoardDetailsStore.getState().setOutgoingInvite(numericBoardId, friend.id, { id: inviteId, status: nextStatus });
      } else {
        setParticipantsError('Не удалось отправить приглашение');
      }
    } finally {
      setInviteActionUserId(null);
    }
  };

  const cancelInvite = async (friend: { id: number; username: string }) => {
    if (!numericBoardId) return;
    if (!isOwner) return;

    const inviteInfo = outgoingInvitesByUserId[friend.id];
    if (!inviteInfo) return;
    if (inviteInfo.status !== 'sent') return;

    setInviteActionUserId(friend.id);
    setParticipantsError(null);
    try {
      await axiosInstance.delete(`/api/boards/${numericBoardId}/invites/${inviteInfo.id}`);
      useBoardDetailsStore.getState().removeOutgoingInvite(numericBoardId, friend.id);
    } catch {
      setParticipantsError('Не удалось отменить приглашение');
    } finally {
      setInviteActionUserId(null);
    }
  };

  const removeGuest = async (guest: BoardParticipant) => {
    if (!numericBoardId) return;
    if (!isOwner) return;
    if (guest.role === 'owner') return;

    setInviteActionUserId(guest.id);
    setParticipantsError(null);
    try {
      await axiosInstance.delete(`/api/boards/${numericBoardId}/guests/${guest.id}`);
      useBoardDetailsStore.getState().applyParticipantsPatch(numericBoardId, (prev) => {
        if (!prev) return prev;
        return { ...prev, participants: prev.participants.filter((p) => p.id !== guest.id) };
      });
      useBoardDetailsStore.getState().removeOutgoingInvite(numericBoardId, guest.id);
      setRemovedGuestsByUserId((prev) => ({ ...prev, [guest.id]: guest }));
    } catch {
      setParticipantsError('Не удалось удалить гостя');
    } finally {
      setInviteActionUserId(null);
    }
  };

  const updateGuestRole = async (guest: BoardParticipant, nextRole: 'guest' | 'editer') => {
    if (!numericBoardId) return;
    if (!isOwner) return;
    if (guest.role === 'owner') return;
    if (!participantsByUserId[guest.id]) return;
    if (guest.role === nextRole) {
      setRoleDropdownUserId(null);
      return;
    }

    setRoleActionUserId(guest.id);
    setParticipantsError(null);
    try {
      await axiosInstance.patch(`/api/boards/${numericBoardId}/guests/${guest.id}/role`, { role: nextRole });
      useBoardDetailsStore.getState().applyParticipantsPatch(numericBoardId, (prev) => {
        if (!prev) return prev;
        return { ...prev, participants: prev.participants.map((p) => (p.id === guest.id ? { ...p, role: nextRole } : p)) };
      });
      setRoleDropdownUserId(null);
    } catch {
      setParticipantsError('Не удалось изменить роль');
    } finally {
      setRoleActionUserId(null);
    }
  };

  const getRoleLabel = (role: BoardParticipantRole) => {
    if (role === 'editer') return 'Редактор';
    if (role === 'guest') return 'Гость';
    if (role === 'owner') return 'Владелец';
    return String(role);
  };

  useEffect(() => {
    if (!isOpen && !shouldWarmAllTabs) return;
    if (!shouldWarmAllTabs && view !== 'participants') return;
    if (!numericBoardId) return;

    setParticipantsError(null);
    setInviteLinkError(null);

    if (!isOwner) return;

    if (userId) void ensureFriendsLoaded(userId);
    const ttlMs = 60_000;
    useBoardDetailsStore.getState().refreshParticipantsIfStale(numericBoardId, ttlMs);
    useBoardDetailsStore.getState().refreshOutgoingInvitesIfStale(numericBoardId, ttlMs);
    useBoardDetailsStore.getState().refreshInviteLinkIfStale(numericBoardId, ttlMs);
  }, [ensureFriendsLoaded, isOpen, isOwner, numericBoardId, shouldWarmAllTabs, userId, view]);

  useEffect(() => {
    if (!isOpen) return;
    if (view !== 'participants') return;
    if (!participantsInnerViewNext) return;

    setParticipantsInnerView(participantsInnerViewNext);
    setParticipantsInnerViewNext(null);
  }, [isOpen, participantsInnerViewNext, setParticipantsInnerViewNext, view]);

  useEffect(() => {
    if (!isOpen) return;
    if (view !== 'participants') return;
    if (participantsInnerView !== 'guests') return;
    if (!guestsAnchorUserId) return;

    const el = document.getElementById(`board-guests-${guestsAnchorUserId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => setGuestsAnchorUserId(null), 600);
    }
  }, [boardParticipants, guestsAnchorUserId, isOpen, participantsInnerView, removedGuestsByUserId, view]);

  const deleteBoard = async () => {
    if (!numericBoardId) return;
    if (!isOwner) return;

    setIsDeleting(true);
    setError(null);
    try {
      await axiosInstance.delete(`/api/boards/${numericBoardId}`);

      useBoardsUnifiedStore.setState((s) => ({
        ...s,
        myIds: s.myIds.filter((id) => id !== numericBoardId),
        recentIds: s.recentIds.filter((id) => id !== numericBoardId),
        guestIds: s.guestIds.filter((id) => id !== numericBoardId),
        friendsIds: s.friendsIds.filter((id) => id !== numericBoardId),
        publicIds: s.publicIds.filter((id) => id !== numericBoardId),
        myBoards: s.myBoards.filter((b) => b.id !== numericBoardId),
        recentBoards: s.recentBoards.filter((b) => b.id !== numericBoardId),
        guestBoards: s.guestBoards.filter((b) => b.id !== numericBoardId),
        friendsBoards: s.friendsBoards.filter((b) => b.id !== numericBoardId),
        publicBoards: s.publicBoards.filter((b) => b.id !== numericBoardId),
      }));

      useBoardDetailsStore.getState().clearBoard(numericBoardId);

      close();
      navigate('/spaces', { replace: true });
    } catch {
      setError('Не удалось удалить доску');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  const submit = async () => {
    if (!numericBoardId) return;
    if (!isOwner) return;
    if (!boardMeta) {
      setError('Не удалось загрузить доску');
      return;
    }

    const updateBoardsStore = (patch: Partial<Pick<BoardResponse, 'title' | 'description' | 'image' | 'is_public'>>) => {
      useBoardsUnifiedStore.setState((s) => {
        const nextEntities = { ...s.entitiesById };
        const prev = nextEntities[numericBoardId];
        if (prev) {
          nextEntities[numericBoardId] = { ...prev, ...(patch as any), id: numericBoardId };
        }
        return {
          ...s,
          entitiesById: nextEntities,
          myBoards: s.myBoards.map((b) => (b.id === numericBoardId ? ({ ...b, ...(patch as any) } as typeof b) : b)),
          recentBoards: s.recentBoards.map((b) => (b.id === numericBoardId ? ({ ...b, ...(patch as any) } as typeof b) : b)),
          guestBoards: s.guestBoards.map((b) => (b.id === numericBoardId ? ({ ...b, ...(patch as any) } as typeof b) : b)),
          friendsBoards: s.friendsBoards.map((b) => (b.id === numericBoardId ? ({ ...b, ...(patch as any) } as typeof b) : b)),
          publicBoards: s.publicBoards.map((b) => (b.id === numericBoardId ? ({ ...b, ...(patch as any) } as typeof b) : b)),
        };
      });
    };

    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('Название обязательно');
      return;
    }
    if (nextTitle.length > BOARD_TITLE_MAX_LENGTH) {
      setError(`Название слишком длинное (max ${BOARD_TITLE_MAX_LENGTH})`);
      return;
    }
    if (description.trim().length > BOARD_DESCRIPTION_MAX_LENGTH) {
      setError(`Описание слишком длинное (max ${BOARD_DESCRIPTION_MAX_LENGTH})`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      if (nextTitle !== boardMeta.title) {
        const { data } = await axiosInstance.patch<{ title: string }>(`/api/boards/${numericBoardId}/title`, {
          title: nextTitle,
        });
        const next = data?.title ?? nextTitle;
        updateBoardsStore({ title: next });
        useBoardDetailsStore.getState().applyBoardMetaPatch(numericBoardId, { title: next });
      }

      const nextDescription = description.trim() || null;
      const prevDescription = boardMeta?.description ?? null;
      if (nextDescription !== prevDescription) {
        const { data } = await axiosInstance.patch<{ description: string | null }>(
          `/api/boards/${numericBoardId}/description`,
          {
            description: nextDescription,
          }
        );
        const next = data?.description ?? nextDescription;
        updateBoardsStore({ description: next });
        useBoardDetailsStore.getState().applyBoardMetaPatch(numericBoardId, { description: next });
      }

      if (imageFile) {
        const cropped = await cropToAspect3_8(imageFile);
        const form = new FormData();
        form.append('image', cropped);
        const { data } = await axiosInstance.patch<{ image: string | null }>(`/api/boards/${numericBoardId}/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const next = typeof data?.image === 'string' || data?.image === null ? data.image : boardMeta?.image ?? null;
        updateBoardsStore({ image: next });
        useBoardDetailsStore.getState().applyBoardMetaPatch(numericBoardId, { image: next });
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      const nextIsPublic = Boolean(isPublic);
      const prevIsPublic = typeof boardMeta?.is_public === 'boolean' ? boardMeta.is_public : Number(boardMeta?.is_public) === 1;
      if (nextIsPublic !== prevIsPublic) {
        const { data } = await axiosInstance.patch<{ is_public: number | boolean }>(`/api/boards/${numericBoardId}/public`, {
          is_public: nextIsPublic,
        });
        const next = typeof data?.is_public === 'boolean' ? data.is_public : Number(data?.is_public) === 1;
        updateBoardsStore({ is_public: next ? 1 : 0 });
        useBoardDetailsStore.getState().applyBoardMetaPatch(numericBoardId, { is_public: next ? 1 : 0 });
      }

      useBoardDetailsStore.getState().resetBoardDraft(numericBoardId);
      close();
    } catch {
      setError('Не удалось сохранить изменения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthModal isOpen={isOpen} onClose={close} closeOnOverlayClick={false}>
      <div className={classes.root}>
        <div className={classes.toggleButtons}>
          <button
            type="button"
            className={view === 'settings' ? classes.toggleActive : ''}
            onClick={() => setView('settings')}
          >
            Настройки
          </button>
          <button
            type="button"
            className={view === 'participants' ? classes.toggleActive : ''}
            onClick={() => setView('participants')}
          >
            Участники
          </button>
        </div>

        <div className={classes.page}>
          {view === 'settings' ? (
            <div className={classes.settings}>
              {error ? <p className={classes.error}>{error}</p> : null}
              {!metaInitialLoading && boardMeta && !isOwner ? <p className={classes.hint}>Только владелец может редактировать доску</p> : null}

              {metaInitialLoading && !boardMeta ? (
                <p className={classes.hint} />
              ) : (
                <>
                  <div className={classes.boardImageUpload}>
                    <label
                      htmlFor="board-image"
                      className={classes.uploadLabel}
                      onClick={(e) => {
                        if (!isOwner) e.preventDefault();
                      }}
                    >
                      {imagePreview ? (
                        <img src={imagePreview} alt="board preview" />
                      ) : imageSrc ? (
                        <img src={imageSrc} alt="board" />
                      ) : (
                        <Default />
                      )}
                      <Edit />
                    </label>
                    <label
                      htmlFor="board-image"
                      className={classes.uploadLabel}
                      onClick={(e) => {
                        if (!isOwner) e.preventDefault();
                      }}
                    >
                      <span>Изменить</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="board-image"
                      name="board-image"
                      accept="image/png, image/jpeg, image/webp"
                      disabled={!isOwner || isSaving}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        if (!file.type.startsWith('image/')) {
                          alert('Можно загружать только изображения');
                          e.target.value = '';
                          return;
                        }

                        if (file.size > MAX_BOARD_IMAGE_SIZE_BYTES) {
                          alert(`Максимальный размер картинки: ${MAX_BOARD_IMAGE_SIZE_MB}MB`);
                          e.target.value = '';
                          return;
                        }

                        if (imagePreview) URL.revokeObjectURL(imagePreview);
                        setImageFile(file);
                        setImagePreview(URL.createObjectURL(file));
                      }}
                    />
                  </div>

                  <label className={classes.inputLabel}>
                    <span className={classes.inputLabelItem}>Название</span>
                    <input
                      type="text"
                      value={title}
                      maxLength={BOARD_TITLE_MAX_LENGTH}
                      disabled={!isOwner || isSaving || metaInitialLoading}
                      onChange={(e) => {
                        if (!numericBoardId) return;
                        useBoardDetailsStore.getState().setBoardDraft(numericBoardId, { title: e.target.value });
                      }}
                      placeholder="Введите название"
                    />
                  </label>

                  <label className={classes.inputLabel}>
                    <span className={classes.inputLabelItem}>Описание</span>
                    <input
                      type="text"
                      value={description}
                      maxLength={BOARD_DESCRIPTION_MAX_LENGTH}
                      disabled={!isOwner || isSaving || metaInitialLoading}
                      onChange={(e) => {
                        if (!numericBoardId) return;
                        useBoardDetailsStore.getState().setBoardDraft(numericBoardId, { description: e.target.value });
                      }}
                      placeholder="Введите описание"
                    />
                  </label>

                  <label className={`${classes.publicToggle} ${isPublicToggleNoAnim ? classes.publicToggleNoAnim : ''}`}>
                    <span className={classes.publicToggleText}>Сделать доску публичной</span>
                    <input
                      className={classes.publicToggleInput}
                      type="checkbox"
                      checked={isPublic}
                      disabled={!isOwner || isSaving || isDeleting || metaInitialLoading}
                      onChange={(e) => {
                        if (!numericBoardId) return;
                        useBoardDetailsStore.getState().setBoardDraft(numericBoardId, { is_public: e.target.checked });
                      }}
                    />
                    <span className={classes.publicToggleSwitch} aria-hidden="true" />
                  </label>
                </>
              )}

                <div className={classes.deleteBoardRow}>
                  <DropdownWrapper
                    upDel
                    closeOnClick={false}
                    isOpen={deleteConfirmOpen}
                    onClose={() => setDeleteConfirmOpen(false)}
                  >
                    {[
                      <button
                        key="trigger"
                        type="button"
                        className={classes.deleteBoardTrigger}
                        disabled={isSaving || isDeleting || metaInitialLoading}
                        aria-label="Удалить доску"
                        onClick={() => setDeleteConfirmOpen((v) => !v)}
                      >
                        Удалить доску
                      </button>,
                      <div key="menu">
                        <button
                          type="button"
                          data-dropdown-class={classes.deleteBoardConfirmDanger}
                          onClick={deleteBoard}
                          disabled={isDeleting || isSaving || metaInitialLoading}
                        >
                          {isDeleting ? 'Удаление...' : 'Удалить'}
                        </button>
                        <button
                          type="button"
                          data-dropdown-class={classes.deleteBoardConfirmCancel}
                          onClick={() => setDeleteConfirmOpen(false)}
                          disabled={isDeleting || isSaving || metaInitialLoading}
                        >
                          Отмена
                        </button>
                      </div>,
                    ]}
                  </DropdownWrapper>
                </div>
              <div className={classes.actions}>
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={isSaving ? 'Сохранение...' : 'Сохранить'}
                  onClick={submit}
                  disabled={!isOwner || isSaving || isDeleting || metaInitialLoading}
                />
              </div>
            </div>
          ) : (
            <div className={classes.participantsTab}>
              {participantsError ? <p className={classes.error}>{participantsError}</p> : null}
              {inviteLinkError ? <p className={classes.error}>{inviteLinkError}</p> : null}
              {!metaInitialLoading && boardMeta && !isOwner ? <p className={classes.hint}>Только владелец может приглашать друзей</p> : null}

              {isOwner ? (
                <>
                  <div className={classes.inviteLinkBlock}>
                    <h2>Приглашение по ссылке</h2>
                    <div className={classes.inviteLinkRow}>
                      <input
                        className={classes.inviteLinkInput}
                        type="text"
                        value={inviteLinkUrl}
                        readOnly
                      />
                      <button
                        type="button"
                        className={classes.inviteLinkBtn}
                        onClick={copyInviteLink}
                        disabled={!inviteLinkUrl || inviteLinkLoading}
                      >
                        {inviteLinkCopied ? 'Скопировано!' : 'Скопировать'}
                      </button>
                      <button
                        type="button"
                        className={classes.inviteLinkBtn}
                        onClick={regenerateInviteLink}
                        disabled={inviteLinkLoading}
                      >
                        Пересоздать
                      </button>
                    </div>
                  </div>

                  <div className={classes.friendsInvitesBlock}>
                    <div className={classes.participantsInnerToggle}>
                      <button
                        type="button"
                        className={participantsInnerView === 'friends' ? classes.participantsInnerToggleActive : ''}
                        onClick={() => {
                          setGuestsAnchorUserId(null);
                          setParticipantsInnerView('friends');
                        }}
                      >
                        Друзья
                      </button>
                      <button
                        type="button"
                        className={participantsInnerView === 'guests' ? classes.participantsInnerToggleActive : ''}
                        onClick={() => setParticipantsInnerView('guests')}
                      >
                        Участники
                      </button>
                    </div>

                    {participantsInnerView === 'friends' ? (
                      <>
                        
                        {!friendsLoading && friends.length === 0 ? <p className={classes.hint}>Список друзей пуст</p> : null}
                        {!friendsLoading && friends.length === 0 ? (
                          <Mainbtn
                            variant="mini"
                            kind="button"
                            type="button"
                            text="Добавить друга"
                            onClick={() => {
                              close();
                              openFriendsModal('search');
                            }}
                          />
                        ) : null}

                        {friends.length > 0 ? (
                          <input
                            className={classes.guestsSearchInput}
                            type="text"
                            value={friendsSearch}
                            placeholder="Поиск по никнейму или юзернейму"
                            onChange={(e) => setFriendsSearch(e.target.value)}
                          />
                        ) : null}

                        <div
                          ref={friendsListRef}
                          className={`${classes.friendsList} ${hasFriendsListScroll ? classes.friendsListScroll : ''}`}
                        >
                          {(() => {
                            const query = friendsSearch.trim().toLowerCase();
                            const filtered = query
                              ? friends.filter((f) => {
                                  const username = String(f.username || '').toLowerCase();
                                  const nickname = String(f.nickname || '').toLowerCase();
                                  return username.includes(query) || nickname.includes(query);
                                })
                              : friends;

                            return filtered.map((f) => {
                                  const avatarSrc = resolveAvatarSrc(f.avatar);
                                  const isParticipant = Boolean(participantsByUserId[f.id]);
                                  const inviteInfo = outgoingInvitesByUserId[f.id];
                                  const isBusy = inviteActionUserId === f.id;

                                const inviteStatus =
                                  inviteInfo?.status === 'sent'
                                    ? 'sent'
                                    : inviteInfo?.status === 'rejected'
                                      ? 'rejected'
                                      : null;

                                const disabled =
                                  inviteStatus === 'rejected' ||
                                  isBusy ||
                                  friendsLoading ||
                                   outgoingInvitesLoading ||
                                   participantsLoading ||
                                   isSaving ||
                                   isDeleting ||
                                   metaInitialLoading;

                                const btnText = isParticipant
                                  ? 'Участник'
                                  : inviteStatus === 'sent'
                                    ? 'Отправлено'
                                    : inviteStatus === 'rejected'
                                      ? 'Отклонено'
                                      : 'Пригласить';

                                const btnClass = isParticipant
                                  ? classes.friendInviteBtnParticipant
                                  : inviteStatus === 'sent'
                                    ? classes.friendInviteBtnSent
                                    : inviteStatus === 'rejected'
                                      ? classes.friendInviteBtnRejected
                                      : classes.friendInviteBtnInvite;

                              return (
                                  <div key={f.id} className={classes.friendRow}>
                                    <Link className={classes.friendInfo} to={`/user/${f.username}`}>
                                      <div className={classes.friendAvatar}>
                                        {avatarSrc ? <img src={avatarSrc} alt={f.username} /> : <DefaultUser />}
                                      </div>
                                      <div className={classes.friendText}>
                                        <span className={classes.friendName}>{f.nickname || f.username}</span>
                                        {f.nickname ? <span className={classes.friendUsername}>@{f.username}</span> : null}
                                      </div>
                                    </Link>

                                    <button
                                      type="button"
                                      className={`${classes.friendInviteBtn} ${btnClass}`}
                                      disabled={disabled}
                                      onClick={() => {
                                        if (isParticipant) {
                                          setParticipantsInnerView('guests');
                                          setGuestsAnchorUserId(f.id);
                                          return;
                                        }
                                        if (inviteStatus === 'sent') {
                                          void cancelInvite(f);
                                          return;
                                        }
                                        void inviteFriend(f);
                                      }}
                                    >
                                      {btnText}
                                    </button>
                                  </div>
                                );
                            });
                          })()}
                        </div>
                      </>
                    ) : (
                      <>
                        {participantsLoading || outgoingInvitesLoading ? <p className={classes.hint} /> : null}

                        <input
                          className={classes.guestsSearchInput}
                          type="text"
                          value={guestsSearch}
                          placeholder="Поиск по никнейму или юзернейму"
                          onChange={(e) => setGuestsSearch(e.target.value)}
                        />

                        <div className={classes.guestsList}>
                          {(() => {
                            const query = guestsSearch.trim().toLowerCase();
                            const removedGuests = Object.values(removedGuestsByUserId).filter((g) => !participantsByUserId[g.id]);

                            const byId = new Map<number, BoardParticipant>();
                            for (const p of boardParticipants) byId.set(p.id, p);
                            for (const p of removedGuests) if (!byId.has(p.id)) byId.set(p.id, p);

                            const list = Array.from(byId.values());
                            const filtered = query
                              ? list.filter((p) => {
                                  const username = String(p.username || '').toLowerCase();
                                  const nickname = String(p.nickname || '').toLowerCase();
                                  return username.includes(query) || nickname.includes(query);
                                })
                              : list;

                            const sorted = filtered.sort((a, b) => {
                              if (a.role === 'owner' && b.role !== 'owner') return -1;
                              if (b.role === 'owner' && a.role !== 'owner') return 1;
                              return String(a.nickname || a.username).localeCompare(String(b.nickname || b.username));
                            });

                            return sorted.map((p) => {
                              const avatarSrc = resolveAvatarSrc(p.avatar);
                              const isBusy = inviteActionUserId === p.id || roleActionUserId === p.id;
                              const isOwnerRow = p.role === 'owner';
                              const isParticipant = Boolean(participantsByUserId[p.id]);
                              const inviteInfo = outgoingInvitesByUserId[p.id];
                              const inviteStatus =
                                inviteInfo?.status === 'sent' ? 'sent' : inviteInfo?.status === 'rejected' ? 'rejected' : null;

                              const disabled =
                                isOwnerRow ||
                                inviteStatus === 'rejected' ||
                                isBusy ||
                                participantsLoading ||
                                outgoingInvitesLoading ||
                                isSaving ||
                                isDeleting ||
                                metaInitialLoading;

                              const btnText = isOwnerRow
                                ? 'Владелец'
                                : isParticipant
                                  ? 'Удалить'
                                  : inviteStatus === 'sent'
                                    ? 'Отправлено'
                                    : inviteStatus === 'rejected'
                                      ? 'Отклонено'
                                      : 'Пригласить';

                              const btnClass = isOwnerRow
                                ? classes.friendInviteBtnParticipant
                                : isParticipant
                                  ? classes.friendInviteBtnRemove
                                  : inviteStatus === 'sent'
                                    ? classes.friendInviteBtnSent
                                    : inviteStatus === 'rejected'
                                      ? classes.friendInviteBtnRejected
                                      : classes.friendInviteBtnInvite;

                              return (
                                <div key={p.id} id={`board-guests-${p.id}`} className={classes.friendRow}>
                                  <Link className={classes.friendInfo} to={`/user/${p.username}`}>
                                    <div className={classes.friendAvatar}>
                                      {avatarSrc ? <img src={avatarSrc} alt={p.username} /> : <DefaultUser />}
                                    </div>
                                    <div className={classes.friendText}>
                                      <span className={classes.friendName}>{p.nickname || p.username}</span>
                                      {p.nickname ? <span className={classes.friendUsername}>@{p.username}</span> : null}
                                    </div>
                                  </Link>

                                  <div className={classes.guestActions}>
                                    {!isOwnerRow && isParticipant ? (
                                      <DropdownWrapper
                                        upDel
                                        closeOnClick={false}
                                        isOpen={roleDropdownUserId === p.id}
                                        onClose={() => setRoleDropdownUserId(null)}
                                      >
                                        {[
                                          <button
                                            key="trigger"
                                            type="button"
                                            className={classes.roleBtn}
                                            disabled={disabled}
                                            onClick={() => setRoleDropdownUserId((prev) => (prev === p.id ? null : p.id))}
                                          >
                                            {getRoleLabel(p.role)}
                                          </button>,
                                          <div key="menu">
                                            <button
                                              type="button"
                                              data-dropdown-class={classes.roleDropdownItem}
                                              onClick={() => void updateGuestRole(p, 'guest')}
                                              disabled={disabled}
                                            >
                                              Гость
                                            </button>
                                            <button
                                              type="button"
                                              data-dropdown-class={classes.roleDropdownItem}
                                              onClick={() => void updateGuestRole(p, 'editer')}
                                              disabled={disabled}
                                            >
                                              Редактор
                                            </button>
                                          </div>,
                                        ]}
                                      </DropdownWrapper>
                                    ) : null}

                                    <button
                                      type="button"
                                      className={`${classes.friendInviteBtn} ${btnClass}`}
                                      disabled={disabled}
                                      onClick={() => {
                                        if (isOwnerRow) return;
                                        if (isParticipant) {
                                          void removeGuest(p);
                                          return;
                                        }
                                        if (inviteStatus === 'sent') {
                                          void cancelInvite({ id: p.id, username: p.username });
                                          return;
                                        }
                                        void inviteFriend({ id: p.id, username: p.username });
                                      }}
                                    >
                                      {btnText}
                                    </button>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AuthModal>
  );
};

export default BoardSettingsModal;
