import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AuthModal from '@/components/auth/authmodal/AuthModal';
import { useUIStore } from '@/store/uiStore';
import classes from './BoardSettingsModal.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Edit from '@/assets/icons/monochrome/edit.svg';
import { useBoardsStore } from '@/store/boardsStore';
import { useSpacesBoardsStore } from '@/store/spacesBoardsStore';

const MAX_BOARD_IMAGE_SIZE_MB = 5;
const MAX_BOARD_IMAGE_SIZE_BYTES = MAX_BOARD_IMAGE_SIZE_MB * 1024 * 1024;
const BOARD_TITLE_MAX_LENGTH = 20;
const BOARD_DESCRIPTION_MAX_LENGTH = 80;

type BoardRole = 'owner' | 'guest' | null;

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

const resolveBoardImageSrc = (image?: string | null) => {
  if (!image) return null;
  if (image.startsWith('/uploads/')) return `${API_URL}${image}`;
  return image;
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
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const { data } = await axiosInstance.get<BoardResponse>(`/api/boards/${numericBoardId}`);
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
  }, [isOpen, imagePreview]);

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
            Настройки доски
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
                  <span>изменить</span>
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
                <span className={classes.publicToggleText}>сделать доску публичной</span>
                <input
                  className={classes.publicToggleInput}
                  type="checkbox"
                  checked={isPublic}
                  disabled={!isOwner || isSaving || isDeleting || isLoading}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                <span className={classes.publicToggleSwitch} aria-hidden="true" />
              </label>

              {isOwner ? (
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
              ) : null}

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
              <h2>Участники и приглашения</h2>
            </div>
          )}
        </div>
      </div>
    </AuthModal>
  );
};

export default BoardSettingsModal;
