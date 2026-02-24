import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';
import { useAuthStore } from '@/store/authStore';
import { Friend, useFriendsStore } from '@/store/friendsStore';

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

type BoardParticipant = {
  id: number;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  role: BoardParticipantRole;
  added_at?: string;
};

type OutgoingBoardInvite = {
  id: number;
  invited_id: number;
  status: 'sent' | 'rejected' | string;
  created_at: string;
};

type BoardInviteLinkResponse = {
  token: string;
  updated_at?: string;
};

type BoardCacheEntry = BoardResponse;

type BoardParticipantsCacheEntry = {
  participantsByUserId: Record<number, true>;
  participants: BoardParticipant[];
};

type OutgoingInvitesCacheEntry = {
  invitesByUserId: Record<number, { id: number; status: 'sent' | 'rejected' }>;
};

const boardParticipantsCache = new Map<number, BoardParticipantsCacheEntry>();
const boardParticipantsInFlight = new Map<number, Promise<BoardParticipantsCacheEntry>>();
const outgoingInvitesCache = new Map<number, OutgoingInvitesCacheEntry>();
const outgoingInvitesInFlight = new Map<number, Promise<OutgoingInvitesCacheEntry>>();
const inviteLinkCache = new Map<number, string>();
const inviteLinkInFlight = new Map<number, Promise<string | null>>();
const boardCache = new Map<number, BoardCacheEntry>();
const boardInFlight = new Map<number, Promise<BoardCacheEntry | null>>();

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
};

const BoardSettingsModal: React.FC<BoardSettingsModalProps> = ({ initialTitle, initialDescription, initialImageSrc, initialIsPublic }) => {
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

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(() => Boolean(initialIsPublic));
  const [isPublicToggleNoAnim, setIsPublicToggleNoAnim] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsByUserId, setParticipantsByUserId] = useState<Record<number, true>>({});
  const [boardParticipants, setBoardParticipants] = useState<BoardParticipant[]>([]);
  const [removedGuestsByUserId, setRemovedGuestsByUserId] = useState<Record<number, BoardParticipant>>({});
  const [outgoingInvitesLoading, setOutgoingInvitesLoading] = useState(false);
  const [outgoingInvitesByUserId, setOutgoingInvitesByUserId] = useState<Record<number, { id: number; status: 'sent' | 'rejected' }>>({});
  const [inviteActionUserId, setInviteActionUserId] = useState<number | null>(null);
  const [roleActionUserId, setRoleActionUserId] = useState<number | null>(null);
  const [roleDropdownUserId, setRoleDropdownUserId] = useState<number | null>(null);

  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const [inviteLinkToken, setInviteLinkToken] = useState<string | null>(null);
  const [inviteLinkError, setInviteLinkError] = useState<string | null>(null);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const inviteLinkCopiedTimeoutRef = useRef<number | null>(null);
  const friendsListRef = useRef<HTMLDivElement | null>(null);
  const [hasFriendsListScroll, setHasFriendsListScroll] = useState(false);
  const [participantsInnerView, setParticipantsInnerView] = useState<'friends' | 'guests'>('friends');
  const [friendsSearch, setFriendsSearch] = useState('');
  const [guestsSearch, setGuestsSearch] = useState('');
  const [guestsAnchorUserId, setGuestsAnchorUserId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const didSeedFromInitialRef = useRef(false);

  const numericBoardId = useMemo(() => {
    const id = Number(boardId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [boardId]);

  const isOwner = board?.my_role === 'owner';
  const currentImageSrc = resolveBoardImageSrc(board?.image ?? null);
  const imageSrc = imagePreview ?? currentImageSrc ?? initialImageSrc ?? null;

  useEffect(() => {
    if (!isOpen) {
      didSeedFromInitialRef.current = false;
      return;
    }

    if (didSeedFromInitialRef.current) return;
    didSeedFromInitialRef.current = true;

    if (typeof initialTitle === 'string') setTitle(initialTitle);
    if (initialTitle === null || initialTitle === undefined) setTitle('');

    if (typeof initialDescription === 'string') setDescription(initialDescription);
    if (initialDescription === null || initialDescription === undefined) setDescription('');

    if (typeof initialIsPublic === 'boolean') setIsPublic(initialIsPublic);
  }, [initialDescription, initialIsPublic, initialTitle, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setIsPublicToggleNoAnim(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (isLoading) return;

    const id = requestAnimationFrame(() => {
      const id2 = requestAnimationFrame(() => setIsPublicToggleNoAnim(false));
      return () => cancelAnimationFrame(id2);
    });

    return () => cancelAnimationFrame(id);
  }, [isLoading, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!numericBoardId) return;

    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const cached = boardCache.get(numericBoardId);
        if (cached) {
          setBoard(cached ?? null);
          setTitle(typeof cached?.title === 'string' ? cached.title : '');
          setDescription(typeof cached?.description === 'string' ? cached.description : '');
          setIsPublic(typeof cached?.is_public === 'boolean' ? cached.is_public : Number(cached?.is_public) === 1);
          setIsLoading(false);
          return;
        }

        setIsLoading(true);

        const promise =
          boardInFlight.get(numericBoardId) ??
          (async () => {
            const { data } = await axiosInstance.get<BoardResponse>(`/api/boards/${numericBoardId}`);
            const entry = (data ?? null) as BoardCacheEntry | null;
            if (entry) boardCache.set(numericBoardId, entry);
            return entry;
          })();

        if (!boardInFlight.has(numericBoardId)) {
          boardInFlight.set(
            numericBoardId,
            promise.then(
              (v) => {
                boardInFlight.delete(numericBoardId);
                return v;
              },
              (err) => {
                boardInFlight.delete(numericBoardId);
                throw err;
              }
            )
          );
        }

        const data = await boardInFlight.get(numericBoardId)!;
        if (cancelled) return;
        setBoard(data ?? null);
        setTitle(typeof data?.title === 'string' ? data.title : '');
        setDescription(typeof data?.description === 'string' ? data.description : '');
        setIsPublic(typeof data?.is_public === 'boolean' ? data.is_public : Number(data?.is_public) === 1);
      } catch {
        if (cancelled) return;
        setError('Не удалось загрузить доску');
        setBoard(null);
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, numericBoardId]);

  useEffect(() => {
    if (isOpen) return;
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setError(null);
    setIsSaving(false);
    setIsLoading(false);
    setIsDeleting(false);
    setDeleteConfirmOpen(false);
    setParticipantsError(null);
    setParticipantsLoading(false);
    setOutgoingInvitesLoading(false);
    setInviteActionUserId(null);
    setInviteLinkLoading(false);
    setInviteLinkError(null);
    setInviteLinkCopied(false);
    if (inviteLinkCopiedTimeoutRef.current) {
      window.clearTimeout(inviteLinkCopiedTimeoutRef.current);
      inviteLinkCopiedTimeoutRef.current = null;
    }
  }, [isOpen, imagePreview]);

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

  const loadParticipants = async (boardId: number) => {
    try {
      const cached = boardParticipantsCache.get(boardId);
      if (cached) {
        setParticipantsError(null);
        setBoardParticipants(cached.participants);
        setParticipantsByUserId(cached.participantsByUserId);
        setParticipantsLoading(false);
        return;
      }

      setParticipantsLoading(true);
      setParticipantsError(null);

      const promise =
        boardParticipantsInFlight.get(boardId) ??
        (async () => {
          const { data } = await axiosInstance.get<{ participants?: BoardParticipant[] }>(`/api/boards/${boardId}/participants`);
          const participants = Array.isArray(data?.participants) ? data.participants : [];
          const map: Record<number, true> = {};
          for (const p of participants) {
            const id = Number(p?.id);
            if (!Number.isFinite(id) || id <= 0) continue;
            map[id] = true;
          }

          const entry: BoardParticipantsCacheEntry = { participants, participantsByUserId: map };
          boardParticipantsCache.set(boardId, entry);
          return entry;
        })();

      if (!boardParticipantsInFlight.has(boardId)) {
        boardParticipantsInFlight.set(
          boardId,
          promise.then(
            (v) => {
              boardParticipantsInFlight.delete(boardId);
              return v;
            },
            (err) => {
              boardParticipantsInFlight.delete(boardId);
              throw err;
            }
          )
        );
      }

      const entry = await boardParticipantsInFlight.get(boardId)!;
      setBoardParticipants(entry.participants);
      setParticipantsByUserId(entry.participantsByUserId);

      setRemovedGuestsByUserId((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          const id = Number(key);
          if (!Number.isFinite(id) || id <= 0) return;
          if (entry.participantsByUserId[id]) delete next[id];
        });
        return next;
      });
    } catch {
      setParticipantsByUserId({});
      setBoardParticipants([]);
      setParticipantsError('Не удалось загрузить участников');
    } finally {
      setParticipantsLoading(false);
    }
  };

  const loadOutgoingInvites = async (boardId: number) => {
    try {
      const cached = outgoingInvitesCache.get(boardId);
      if (cached) {
        setParticipantsError(null);
        setOutgoingInvitesByUserId(cached.invitesByUserId);
        setOutgoingInvitesLoading(false);
        return;
      }

      setOutgoingInvitesLoading(true);
      setParticipantsError(null);

      const promise =
        outgoingInvitesInFlight.get(boardId) ??
        (async () => {
          const { data } = await axiosInstance.get<OutgoingBoardInvite[]>(`/api/boards/${boardId}/invites/outgoing`);
          const map: Record<number, { id: number; status: 'sent' | 'rejected' }> = {};
          if (Array.isArray(data)) {
            for (const inv of data) {
              const invitedId = Number(inv?.invited_id);
              const inviteId = Number(inv?.id);
              const status = inv?.status;

              if (!Number.isFinite(invitedId) || invitedId <= 0) continue;
              if (!Number.isFinite(inviteId) || inviteId <= 0) continue;
              if (status !== 'sent' && status !== 'rejected') continue;
              if (map[invitedId]) continue;

              map[invitedId] = { id: inviteId, status };
            }
          }

          const entry: OutgoingInvitesCacheEntry = { invitesByUserId: map };
          outgoingInvitesCache.set(boardId, entry);
          return entry;
        })();

      if (!outgoingInvitesInFlight.has(boardId)) {
        outgoingInvitesInFlight.set(
          boardId,
          promise.then(
            (v) => {
              outgoingInvitesInFlight.delete(boardId);
              return v;
            },
            (err) => {
              outgoingInvitesInFlight.delete(boardId);
              throw err;
            }
          )
        );
      }

      const entry = await outgoingInvitesInFlight.get(boardId)!;
      setOutgoingInvitesByUserId(entry.invitesByUserId);
    } catch {
      setOutgoingInvitesByUserId({});
      setParticipantsError('Не удалось загрузить приглашения');
    } finally {
      setOutgoingInvitesLoading(false);
    }
  };

  const loadInviteLink = async (boardId: number) => {
    try {
      const cached = inviteLinkCache.get(boardId);
      if (cached) {
        setInviteLinkError(null);
        setInviteLinkToken(cached);
        setInviteLinkLoading(false);
        return;
      }

      setInviteLinkLoading(true);
      setInviteLinkError(null);

      const promise =
        inviteLinkInFlight.get(boardId) ??
        (async () => {
          const { data } = await axiosInstance.get<BoardInviteLinkResponse>(`/api/boards/${boardId}/invite-link`);
          const token = typeof data?.token === 'string' ? data.token : null;
          if (token) inviteLinkCache.set(boardId, token);
          return token;
        })();

      if (!inviteLinkInFlight.has(boardId)) {
        inviteLinkInFlight.set(
          boardId,
          promise.then(
            (v) => {
              inviteLinkInFlight.delete(boardId);
              return v;
            },
            (err) => {
              inviteLinkInFlight.delete(boardId);
              throw err;
            }
          )
        );
      }

      const token = await inviteLinkInFlight.get(boardId)!;
      setInviteLinkToken(token);
    } catch {
      setInviteLinkToken(null);
      setInviteLinkError('Не удалось загрузить ссылку');
    } finally {
      setInviteLinkLoading(false);
    }
  };

  const regenerateInviteLink = async () => {
    if (!numericBoardId) return;
    if (!isOwner) return;

    setInviteLinkLoading(true);
    setInviteLinkError(null);
    try {
      const { data } = await axiosInstance.post<BoardInviteLinkResponse>(`/api/boards/${numericBoardId}/invite-link/regenerate`);
      const token = typeof data?.token === 'string' ? data.token : null;
      if (token) inviteLinkCache.set(numericBoardId, token);
      else inviteLinkCache.delete(numericBoardId);
      setInviteLinkToken(token);
    } catch {
      setInviteLinkError('Не удалось пересоздать ссылку');
    } finally {
      setInviteLinkLoading(false);
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
        setOutgoingInvitesByUserId((prev) => {
          const next = { ...prev, [friend.id]: { id: inviteId, status: 'sent' as const } };
          if (numericBoardId) outgoingInvitesCache.set(numericBoardId, { invitesByUserId: next });
          return next;
        });
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number; data?: unknown } })?.response?.status;
      const inviteId = Number((e as { response?: { data?: { invite_id?: number } } })?.response?.data?.invite_id);
      const inviteStatus = (e as { response?: { data?: { status?: string } } })?.response?.data?.status;
      if (status === 409 && Number.isFinite(inviteId) && inviteId > 0) {
        const nextStatus: 'sent' | 'rejected' = inviteStatus === 'rejected' ? 'rejected' : 'sent';
        setOutgoingInvitesByUserId((prev) => {
          const next = { ...prev, [friend.id]: { id: inviteId, status: nextStatus } };
          if (numericBoardId) outgoingInvitesCache.set(numericBoardId, { invitesByUserId: next });
          return next;
        });
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
      setOutgoingInvitesByUserId((prev) => {
        const next = { ...prev };
        delete next[friend.id];
        outgoingInvitesCache.set(numericBoardId, { invitesByUserId: next });
        return next;
      });
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

      const nextParticipants = boardParticipants.filter((p) => p.id !== guest.id);
      const nextById = { ...participantsByUserId };
      delete nextById[guest.id];

      setBoardParticipants(nextParticipants);
      setParticipantsByUserId(nextById);
      boardParticipantsCache.set(numericBoardId, { participants: nextParticipants, participantsByUserId: nextById });

      setOutgoingInvitesByUserId((prev) => {
        if (!prev[guest.id]) return prev;
        const next = { ...prev };
        delete next[guest.id];
        outgoingInvitesCache.set(numericBoardId, { invitesByUserId: next });
        return next;
      });
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
      const nextParticipants = boardParticipants.map((p) => (p.id === guest.id ? { ...p, role: nextRole } : p));
      setBoardParticipants(nextParticipants);
      boardParticipantsCache.set(numericBoardId, { participants: nextParticipants, participantsByUserId });
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
    if (!isOpen) return;
    if (view !== 'participants') return;
    if (!numericBoardId) return;

    setParticipantsError(null);
    setInviteLinkError(null);

    if (!isOwner) return;

    if (userId) void ensureFriendsLoaded(userId);
    void loadParticipants(numericBoardId);
    void loadOutgoingInvites(numericBoardId);
    void loadInviteLink(numericBoardId);
  }, [ensureFriendsLoaded, isOpen, isOwner, numericBoardId, userId, view]);

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

      useBoardsStore.setState((s) => ({
        ...s,
        boards: s.boards.filter((b) => b.id !== numericBoardId),
        recentBoards: s.recentBoards.filter((b) => b.id !== numericBoardId),
      }));

      useSpacesBoardsStore.setState((s) => ({
        ...s,
        publicBoards: s.publicBoards.filter((b) => b.id !== numericBoardId),
        friendsBoards: s.friendsBoards.filter((b) => b.id !== numericBoardId),
        guestBoards: s.guestBoards.filter((b) => b.id !== numericBoardId),
      }));

      boardCache.delete(numericBoardId);
      boardParticipantsCache.delete(numericBoardId);
      outgoingInvitesCache.delete(numericBoardId);
      inviteLinkCache.delete(numericBoardId);

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

    const updateBoardsStore = (patch: Partial<Pick<BoardResponse, 'title' | 'description' | 'image' | 'is_public'>>) => {
      const current = useBoardsStore.getState();
      const apply = <T extends { id: number }>(list: T[]) =>
        list.map((b) => (b.id === numericBoardId ? ({ ...b, ...patch } as T) : b));

      useBoardsStore.setState({
        boards: apply(current.boards),
        recentBoards: apply(current.recentBoards),
      });
    };

    const updateBoardCache = (patch: Partial<Pick<BoardResponse, 'title' | 'description' | 'image' | 'is_public'>>) => {
      const current = boardCache.get(numericBoardId) ?? board;
      if (!current) return;
      boardCache.set(numericBoardId, { ...current, ...patch });
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
      if (board && nextTitle !== board.title) {
        const { data } = await axiosInstance.patch<{ title: string }>(`/api/boards/${numericBoardId}/title`, {
          title: nextTitle,
        });
        const next = data?.title ?? nextTitle;
        setBoard((prev) => (prev ? { ...prev, title: next } : prev));
        updateBoardsStore({ title: next });
        updateBoardCache({ title: next });
      }

      const nextDescription = description.trim() || null;
      const prevDescription = board?.description ?? null;
      if (board && nextDescription !== prevDescription) {
        const { data } = await axiosInstance.patch<{ description: string | null }>(
          `/api/boards/${numericBoardId}/description`,
          {
            description: nextDescription,
          }
        );
        const next = data?.description ?? nextDescription;
        setBoard((prev) => (prev ? { ...prev, description: next } : prev));
        updateBoardsStore({ description: next });
        updateBoardCache({ description: next });
      }

      if (imageFile) {
        const cropped = await cropToAspect3_8(imageFile);
        const form = new FormData();
        form.append('image', cropped);
        const { data } = await axiosInstance.patch<{ image: string | null }>(`/api/boards/${numericBoardId}/image`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const next = typeof data?.image === 'string' || data?.image === null ? data.image : board?.image ?? null;
        setBoard((prev) => (prev ? { ...prev, image: next } : prev));
        updateBoardsStore({ image: next });
        updateBoardCache({ image: next });
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }

      const nextIsPublic = Boolean(isPublic);
      const prevIsPublic = typeof board?.is_public === 'boolean' ? board.is_public : Number(board?.is_public) === 1;
      if (board && nextIsPublic !== prevIsPublic) {
        const { data } = await axiosInstance.patch<{ is_public: number | boolean }>(`/api/boards/${numericBoardId}/public`, {
          is_public: nextIsPublic,
        });
        const next = typeof data?.is_public === 'boolean' ? data.is_public : Number(data?.is_public) === 1;
        setBoard((prev) => (prev ? { ...prev, is_public: next ? 1 : 0 } : prev));
        updateBoardsStore({ is_public: next ? 1 : 0 });
        updateBoardCache({ is_public: next ? 1 : 0 });
      }

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
              {!isLoading && board && !isOwner ? <p className={classes.hint}>Только владелец может редактировать доску</p> : null}

              {isLoading && !board ? (
                <div className={classes.settingsSkeleton}>
                  <div className={`${classes.skeleton} ${classes.boardImageSkeleton}`} />
                  <div className={`${classes.skeleton} ${classes.inputSkeleton}`} />
                  <div className={`${classes.skeleton} ${classes.inputSkeleton}`} />
                  <div className={`${classes.skeleton} ${classes.toggleSkeleton}`} />
                </div>
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
                      disabled={!isOwner || isSaving || isLoading}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Введите название"
                    />
                  </label>

                  <label className={classes.inputLabel}>
                    <span className={classes.inputLabelItem}>Описание</span>
                    <input
                      type="text"
                      value={description}
                      maxLength={BOARD_DESCRIPTION_MAX_LENGTH}
                      disabled={!isOwner || isSaving || isLoading}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Введите описание"
                    />
                  </label>

                  <label className={`${classes.publicToggle} ${isPublicToggleNoAnim ? classes.publicToggleNoAnim : ''}`}>
                    <span className={classes.publicToggleText}>Сделать доску публичной</span>
                    <input
                      className={classes.publicToggleInput}
                      type="checkbox"
                      checked={isPublic}
                      disabled={!isOwner || isSaving || isDeleting || isLoading}
                      onChange={(e) => setIsPublic(e.target.checked)}
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
                        disabled={isSaving || isDeleting || isLoading}
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
                          disabled={isDeleting || isSaving || isLoading}
                        >
                          {isDeleting ? 'Удаление...' : 'Удалить'}
                        </button>
                        <button
                          type="button"
                          data-dropdown-class={classes.deleteBoardConfirmCancel}
                          onClick={() => setDeleteConfirmOpen(false)}
                          disabled={isDeleting || isSaving || isLoading}
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
                  disabled={!isOwner || isSaving || isDeleting || isLoading}
                />
              </div>
            </div>
          ) : (
            <div className={classes.participantsTab}>
              {participantsError ? <p className={classes.error}>{participantsError}</p> : null}
              {inviteLinkError ? <p className={classes.error}>{inviteLinkError}</p> : null}
              {!isLoading && board && !isOwner ? <p className={classes.hint}>Только владелец может приглашать друзей</p> : null}

              {isOwner ? (
                <>
                  <div className={classes.inviteLinkBlock}>
                    <h2>Приглашение по ссылке</h2>
                    <div className={classes.inviteLinkRow}>
                      <input
                        className={classes.inviteLinkInput}
                        type="text"
                        value={inviteLinkLoading ? '...' : inviteLinkUrl}
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
                        {friendsLoading || outgoingInvitesLoading || participantsLoading ? <p className={classes.hint}>Загрузка...</p> : null}
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
                          {(friendsLoading || outgoingInvitesLoading || participantsLoading) && friends.length === 0
                            ? Array.from({ length: 3 }).map((_, i) => (
                                <div key={`sk-${i}`} className={classes.listSkeletonRow}>
                                  <div className={classes.listSkeletonLeft}>
                                    <div className={`${classes.skeleton} ${classes.avatarSkeleton}`} />
                                    <div className={`${classes.skeleton} ${classes.nameSkeleton}`} />
                                  </div>
                                  <div className={`${classes.skeleton} ${classes.btnSkeleton}`} />
                                </div>
                              ))
                            : (() => {
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
                                  isLoading;

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
                        {participantsLoading || outgoingInvitesLoading ? <p className={classes.hint}>Загрузка...</p> : null}

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

                            if ((participantsLoading || outgoingInvitesLoading) && boardParticipants.length === 0 && removedGuests.length === 0) {
                              return Array.from({ length: 3 }).map((_, i) => (
                                <div key={`gsk-${i}`} className={classes.listSkeletonRow}>
                                  <div className={classes.listSkeletonLeft}>
                                    <div className={`${classes.skeleton} ${classes.avatarSkeleton}`} />
                                    <div className={`${classes.skeleton} ${classes.nameSkeleton}`} />
                                  </div>
                                  <div className={`${classes.skeleton} ${classes.btnSkeleton}`} />
                                </div>
                              ));
                            }

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
                                isLoading;

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
