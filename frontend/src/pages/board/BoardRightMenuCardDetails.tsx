import React, { useEffect, useRef, useState } from 'react';
import axiosInstance from '@/api/axiosInstance';
import { resolveImageSrc } from '@/components/flow/flowBoardUtils';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import ImageCropModal from '@/components/_UI/imagecropmodal/ImageCropModal';
import { useUIStore } from '@/store/uiStore';
import { connectSocket } from '@/services/socketManager';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Image from '@/assets/icons/monochrome/image.svg';
import Text from '@/assets/icons/monochrome/text.svg';
import Fact from '@/assets/icons/monochrome/fact.svg';
import Check from '@/assets/icons/monochrome/check.svg';
import Edit from '@/assets/icons/monochrome/edit.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import classes from './Board.module.scss';
import { getDetailsImageCropPreset } from '@/utils/imageCropPresets';
import { useLanguageStore } from '@/store/languageStore';

type CardDetailsSnapshot = {
  cardId: number;
  boardId: number;
  title: string;
};

type CardDetailsItem = {
  id: number;
  content: string;
  sort_order: number;
  is_checked?: number | boolean;
};

type CardDetailsBlock =
  | {
      id: number;
      block_type: 'image';
      caption: string | null;
      image_path: string | null;
    }
  | {
      id: number;
      block_type: 'text';
      content: string;
    }
  | {
      id: number;
      block_type: 'facts' | 'checklist';
      items: CardDetailsItem[];
    };

type CardDetailsResponse = {
  card_id: number;
  board_id: number;
  title: string | null;
  blocks: CardDetailsBlock[];
};

type BoardsUpdatedCmd = {
  reason?: unknown;
  board_id?: unknown;
  card_id?: unknown;
};

type BoardRightMenuCardDetailsProps = {
  canEditCards: boolean;
  isLoggedIn: boolean;
  selectedCardDetails: CardDetailsSnapshot;
};

type DraftBlock =
  | {
      id: string;
      type: 'text';
      value: string;
    }
  | {
      id: string;
      type: 'image';
      file: File | null;
      previewUrl: string | null;
    }
  | {
      id: string;
      type: 'facts' | 'checklist';
      items: string[];
    };

type PendingCropTarget =
  | { kind: 'draft'; draftId: string }
  | { kind: 'replace'; blockId: number }
  | null;

const buildDetailsPath = (snapshot: CardDetailsSnapshot, isLoggedIn: boolean) =>
  isLoggedIn
    ? `/api/boards/${snapshot.boardId}/cards/${snapshot.cardId}/details`
    : `/api/boards/public/${snapshot.boardId}/cards/${snapshot.cardId}/details`;

const trimValue = (value: string | null | undefined) => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const createDraftId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random()}`;
const IMAGE_CAPTION_MAX_LENGTH = 70;
const FACT_ITEM_MAX_LENGTH = 200;
const DETAILS_POLL_INTERVAL_MS = 10_000;
const normalizeSingleLine = (value: string) => value.replace(/[\r\n]+/g, ' ');
const shouldAddExtraSpacer = (node: HTMLTextAreaElement | null) => {
  if (!node) return false;
  const detailsContainer = node.closest(`.${classes.details_blocks}`);
  if (!detailsContainer) return false;
  return detailsContainer.scrollHeight > detailsContainer.clientHeight;
};
const autosizeTextarea = (node: HTMLTextAreaElement | null, needsExtra = false) => {
  if (!node) return;
  const computed = window.getComputedStyle(node);
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
  node.style.height = 'auto';
  node.style.height = `${node.scrollHeight + borderTop + borderBottom + (needsExtra ? 30 : 0)}px`;
};
const getApiErrorMessage = (error: unknown, fallback: string) => {
  const maybeError = error as { response?: { data?: { message?: unknown } } } | null;
  const message = maybeError?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
};
const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const MoveUpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 6 6.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 6 17.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 18V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const MoveDownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 18 6.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 18 17.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 6V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const BoardRightMenuCardDetails = (props: BoardRightMenuCardDetailsProps) => {
  const { canEditCards, isLoggedIn, selectedCardDetails } = props;
  const showTopAlarm = useUIStore((s) => s.showTopAlarm);
  const language = useLanguageStore((state) => state.language);
  const isEn = language === 'en';
  const imageBlockTooLargeMessage = isEn ? 'The file is too large. Choose an image up to 5 MB.' : 'Вес слишком большой — выберите изображение весом до 5 МБ.';
  const onlyImagesMessage = isEn ? 'Only image files can be uploaded.' : 'Можно загружать только изображения';
  const deleteConfirmText = isEn ? 'Yes, delete' : 'Да, удалить';
  const cancelText = isEn ? 'Cancel' : 'Отмена';
  const descriptionText = isEn ? 'Description' : 'Описание';
  const textPlaceholder = isEn ? 'Text' : 'Текст';
  const factsTitle = isEn ? 'Facts' : 'Факты';
  const factPlaceholder = isEn ? 'Fact' : 'Факт';
  const newFactPlaceholder = isEn ? 'New fact' : 'Новый факт';
  const checklistTitle = isEn ? 'Checklist' : 'Чеклист';
  const taskPlaceholder = isEn ? 'Task' : 'Задача';
  const newTaskPlaceholder = isEn ? 'New task' : 'Новая задача';
  const emptyDetailsText = isEn ? 'Add notes from the menu at the bottom of the screen.' : 'Добавьте заметки в меню снизу экрана';
  const moveBlockFailedText = isEn ? 'Failed to move block.' : 'Не удалось переместить блок';
  const moveItemFailedText = isEn ? 'Failed to move item.' : 'Не удалось переместить пункт';
  const saveTextBlockFailedText = isEn ? 'Failed to save text block.' : 'Не удалось сохранить текстовый блок';
  const replaceImageFailedText = isEn ? 'Failed to replace block image.' : 'Не удалось заменить картинку блока';
  const saveImageDescriptionFailedText = isEn ? 'Failed to save image description.' : 'Не удалось сохранить описание картинки';
  const saveFactFailedText = isEn ? 'Failed to save fact.' : 'Не удалось сохранить факт';
  const deleteFactFailedText = isEn ? 'Failed to delete fact.' : 'Не удалось удалить факт';
  const saveTaskFailedText = isEn ? 'Failed to save task.' : 'Не удалось сохранить задачу';
  const updateTaskFailedText = isEn ? 'Failed to update task.' : 'Не удалось обновить задачу';
  const deleteTaskFailedText = isEn ? 'Failed to delete task.' : 'Не удалось удалить задачу';
  const textCopiedText = isEn ? 'Text copied.' : 'Текст скопирован.';
  const factCopiedText = isEn ? 'Fact copied.' : 'Факт скопирован.';
  const taskCopiedText = isEn ? 'Task copied.' : 'Задача скопирована.';
  const copyTextFailedText = isEn ? 'Failed to copy text.' : 'Не удалось скопировать текст.';
  const copyFactFailedText = isEn ? 'Failed to copy fact.' : 'Не удалось скопировать факт.';
  const copyTaskFailedText = isEn ? 'Failed to copy task.' : 'Не удалось скопировать задачу.';
  const [details, setDetails] = useState<CardDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftBlocks, setDraftBlocks] = useState<DraftBlock[]>([]);
  const [confirmDeleteBlockId, setConfirmDeleteBlockId] = useState<number | null>(null);
  const [confirmDeleteFactItemId, setConfirmDeleteFactItemId] = useState<number | null>(null);
  const [confirmDeleteChecklistItemId, setConfirmDeleteChecklistItemId] = useState<number | null>(null);
  const [editingCaptionBlockId, setEditingCaptionBlockId] = useState<number | null>(null);
  const [editingCaptionValue, setEditingCaptionValue] = useState('');
  const [editingTextBlockId, setEditingTextBlockId] = useState<number | null>(null);
  const [editingFactItemId, setEditingFactItemId] = useState<number | null>(null);
  const [editingFactValue, setEditingFactValue] = useState('');
  const [factDraftValues, setFactDraftValues] = useState<Record<number, string>>({});
  const [pendingFactFocusBlockId, setPendingFactFocusBlockId] = useState<number | null>(null);
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<number | null>(null);
  const [editingChecklistValue, setEditingChecklistValue] = useState('');
  const [checklistDraftValues, setChecklistDraftValues] = useState<Record<number, string>>({});
  const [pendingChecklistFocusBlockId, setPendingChecklistFocusBlockId] = useState<number | null>(null);
  const [imageLoadedByKey, setImageLoadedByKey] = useState<Record<string, boolean>>({});
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [pendingCropTarget, setPendingCropTarget] = useState<PendingCropTarget>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageBlockInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const imageCaptionTextareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const captionCaretInitializedBlockIdRef = useRef<number | null>(null);
  const textBlockRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const factInputRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const checklistInputRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const socketReloadInFlightRef = useRef(false);
  const pollInFlightRef = useRef(false);

  const copyTextToClipboard = async (text: string, successMessage: string, errorMessage: string) => {
    const normalized = text.trim();
    if (!normalized) {
      showTopAlarm(errorMessage);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalized);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = normalized;
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!copied) throw new Error('copy failed');
      }

      showTopAlarm(successMessage);
    } catch {
      showTopAlarm(errorMessage);
    }
  };

  const moveDetailsBlock = async (blockId: number, direction: 'up' | 'down') => {
    if (!canEditCards || !isLoggedIn) return;
    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/order`,
        { direction }
      );
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, moveBlockFailedText));
    }
  };

  const moveDetailsItem = async (blockId: number, itemId: number, direction: 'up' | 'down') => {
    if (!canEditCards || !isLoggedIn) return;
    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}/order`,
        { direction }
      );
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, moveItemFailedText));
    }
  };

  useEffect(() => {
    if (editingCaptionBlockId !== null) return;
    captionCaretInitializedBlockIdRef.current = null;
  }, [editingCaptionBlockId]);

  useEffect(() => {
    if (editingFactItemId !== null) return;
    setEditingFactValue('');
  }, [editingFactItemId]);

  useEffect(() => {
    if (editingChecklistItemId !== null) return;
    setEditingChecklistValue('');
  }, [editingChecklistItemId]);

  const detailsPath = buildDetailsPath(selectedCardDetails, isLoggedIn);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setConfirmDeleteBlockId(null);
    setConfirmDeleteFactItemId(null);
    setConfirmDeleteChecklistItemId(null);
    setEditingCaptionBlockId(null);
    setEditingTextBlockId(null);
    setEditingFactItemId(null);
    setEditingFactValue('');
    setEditingChecklistItemId(null);
    setEditingChecklistValue('');
    setEditingCaptionValue('');
    setCropSourceFile(null);
    setPendingCropTarget(null);
    setFactDraftValues({});
    setPendingFactFocusBlockId(null);
    setChecklistDraftValues({});
    setPendingChecklistFocusBlockId(null);
    setImageLoadedByKey({});
    setDraftBlocks((prev) => {
      prev.forEach((draft) => {
        if (draft.type === 'image' && draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
      return [];
    });

    (async () => {
      try {
        const { data } = await axiosInstance.get<CardDetailsResponse>(detailsPath);
        if (cancelled) return;
        setDetails(data);
      } catch {
        if (cancelled) return;
        setDetails(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detailsPath]);

  useEffect(() => {
    return () => {
      draftBlocks.forEach((draft) => {
        if (draft.type === 'image' && draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
    };
  }, [draftBlocks]);

  useEffect(() => {
    if (pendingFactFocusBlockId === null) return;
    const node = factInputRefs.current[pendingFactFocusBlockId];
    if (!node) return;
    node.focus();
    const length = node.value.length;
    try {
      node.setSelectionRange(length, length);
    } catch {
      // ignore
    }
    setPendingFactFocusBlockId(null);
  }, [pendingFactFocusBlockId, details]);

  useEffect(() => {
    if (pendingChecklistFocusBlockId === null) return;
    const node = checklistInputRefs.current[pendingChecklistFocusBlockId];
    if (!node) return;
    node.focus();
    const length = node.value.length;
    try {
      node.setSelectionRange(length, length);
    } catch {
      // ignore
    }
    setPendingChecklistFocusBlockId(null);
  }, [pendingChecklistFocusBlockId, details]);

  const reloadFromResponse = (next: CardDetailsResponse) => {
    setConfirmDeleteBlockId((prev) => (prev !== null && !next.blocks.some((block) => block.id === prev) ? null : prev));
    setConfirmDeleteFactItemId((prev) => {
      if (prev === null) return prev;
      const hasItem = next.blocks.some(
        (block) => block.block_type === 'facts' && block.items.some((item) => item.id === prev)
      );
      return hasItem ? prev : null;
    });
    setConfirmDeleteChecklistItemId((prev) => {
      if (prev === null) return prev;
      const hasItem = next.blocks.some(
        (block) => block.block_type === 'checklist' && block.items.some((item) => item.id === prev)
      );
      return hasItem ? prev : null;
    });
    setEditingCaptionBlockId((prev) => (prev !== null && !next.blocks.some((block) => block.id === prev) ? null : prev));
    setEditingTextBlockId((prev) => (prev !== null && !next.blocks.some((block) => block.id === prev) ? null : prev));
    setEditingFactItemId((prev) => {
      if (prev === null) return prev;
      const hasItem = next.blocks.some(
        (block) => block.block_type === 'facts' && block.items.some((item) => item.id === prev)
      );
      return hasItem ? prev : null;
    });
    setEditingChecklistItemId((prev) => {
      if (prev === null) return prev;
      const hasItem = next.blocks.some(
        (block) => block.block_type === 'checklist' && block.items.some((item) => item.id === prev)
      );
      return hasItem ? prev : null;
    });
    setDetails(next);
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    const boardId = Number(selectedCardDetails.boardId);
    const cardId = Number(selectedCardDetails.cardId);
    if (!Number.isFinite(boardId) || !Number.isFinite(cardId)) return;

    let cancelled = false;

    const unsubscribe = connectSocket({
      onBoardsUpdate: (data) => {
        const cmd = data as BoardsUpdatedCmd;
        const reason = typeof cmd?.reason === 'string' ? cmd.reason : '';
        if (reason !== 'card_details_updated') return;

        const boardIdRaw = cmd?.board_id;
        const cardIdRaw = cmd?.card_id;
        const boardIdParsed = typeof boardIdRaw === 'number' ? boardIdRaw : Number(boardIdRaw);
        const cardIdParsed = typeof cardIdRaw === 'number' ? cardIdRaw : Number(cardIdRaw);
        if (!Number.isFinite(boardIdParsed) || !Number.isFinite(cardIdParsed)) return;
        if (boardIdParsed !== boardId || cardIdParsed !== cardId) return;

        if (socketReloadInFlightRef.current) return;
        socketReloadInFlightRef.current = true;

        (async () => {
          try {
            const { data: next } = await axiosInstance.get<CardDetailsResponse>(detailsPath);
            if (cancelled) return;
            reloadFromResponse(next);
          } catch {
            // ignore
          } finally {
            if (!cancelled) socketReloadInFlightRef.current = false;
          }
        })();
      },
    });

    return () => {
      cancelled = true;
      socketReloadInFlightRef.current = false;
      unsubscribe?.();
    };
  }, [detailsPath, isLoggedIn, selectedCardDetails.boardId, selectedCardDetails.cardId]);

  useEffect(() => {
    if (isLoggedIn) return;

    const boardId = Number(selectedCardDetails.boardId);
    const cardId = Number(selectedCardDetails.cardId);
    if (!Number.isFinite(boardId) || !Number.isFinite(cardId)) return;

    let cancelled = false;

    const poll = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const { data: next } = await axiosInstance.get<CardDetailsResponse>(detailsPath);
        if (cancelled) return;
        reloadFromResponse(next);
      } catch {
        // ignore
      } finally {
        if (!cancelled) pollInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(poll, DETAILS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      pollInFlightRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [detailsPath, isLoggedIn, selectedCardDetails.boardId, selectedCardDetails.cardId]);

  const removeDraftBlock = (draftId: string) => {
    setDraftBlocks((prev) => {
      const found = prev.find((draft) => draft.id === draftId);
      if (found?.type === 'image' && found.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((draft) => draft.id !== draftId);
    });
  };

  const updateDraftBlock = (draftId: string, updater: (draft: DraftBlock) => DraftBlock) => {
    setDraftBlocks((prev) => prev.map((draft) => (draft.id === draftId ? updater(draft) : draft)));
  };

  const saveTextDraft = async (draftId: string, value: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(value);
    if (!content) {
      removeDraftBlock(draftId);
      return;
    }

    const { data } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks`, {
      type: 'text',
      content,
    });
    removeDraftBlock(draftId);
    reloadFromResponse(data);
  };

  const saveTextBlock = async (blockId: number, rawValue: string, currentContent: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue);
    const normalizedCurrentContent = trimValue(currentContent);

    if (!content || content === normalizedCurrentContent) {
      setEditingTextBlockId(null);
      return;
    }

    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}`, {
        content,
      });
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, saveTextBlockFailedText));
    } finally {
      setEditingTextBlockId(null);
    }
  };

  const saveImageDraft = async (draftId: string, file: File | null) => {
    if (!canEditCards || !isLoggedIn) return;
    if (!file) {
      removeDraftBlock(draftId);
      return;
    }

    const form = new FormData();
    form.append('type', 'image');
    form.append('image', file);
    const { data } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    removeDraftBlock(draftId);
    reloadFromResponse(data);
  };

  const replaceImageBlock = async (blockId: number, file: File | null) => {
    if (!canEditCards || !isLoggedIn || !file) return;

    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await axiosInstance.patch<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      reloadFromResponse(data);
    } catch (error) {
      const message = getApiErrorMessage(error, replaceImageFailedText);
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes('5mb') ||
        normalizedMessage.includes('5 mb') ||
        normalizedMessage.includes('слишком большой') ||
        normalizedMessage.includes('too large') ||
        normalizedMessage.includes('file too large')
      ) {
        showTopAlarm(imageBlockTooLargeMessage);
        return;
      }
      showTopAlarm(message);
    }
  };

  const openCropModalForFile = (target: PendingCropTarget, file: File | null) => {
    if (!file) {
      if (target?.kind === 'draft') {
        removeDraftBlock(target.draftId);
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      showTopAlarm(onlyImagesMessage);
      if (target?.kind === 'draft') {
        removeDraftBlock(target.draftId);
      }
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showTopAlarm(imageBlockTooLargeMessage);
      if (target?.kind === 'draft') {
        removeDraftBlock(target.draftId);
      }
      return;
    }

    setPendingCropTarget(target);
    setCropSourceFile(file);
  };

  const closeCropModal = () => {
    if (pendingCropTarget?.kind === 'draft') {
      const draft = draftBlocks.find((item) => item.id === pendingCropTarget.draftId);
      if (draft?.type === 'image' && !draft.previewUrl && !draft.file) {
        removeDraftBlock(pendingCropTarget.draftId);
      }
    }
    setCropSourceFile(null);
    setPendingCropTarget(null);
  };

  const deleteDetailsBlock = async (blockId: number) => {
    if (!canEditCards || !isLoggedIn) return;
    const { data } = await axiosInstance.delete<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}`);
    setConfirmDeleteBlockId(null);
    reloadFromResponse(data);
  };

  const saveImageCaption = async (blockId: number, rawValue: string, currentCaption: string | null) => {
    if (!canEditCards || !isLoggedIn) return;
    const caption = trimValue(normalizeSingleLine(rawValue)).slice(0, IMAGE_CAPTION_MAX_LENGTH);
    const normalizedCurrentCaption = trimValue(currentCaption).slice(0, IMAGE_CAPTION_MAX_LENGTH);

    if (caption === normalizedCurrentCaption) {
      setEditingCaptionBlockId(null);
      setEditingCaptionValue('');
      return;
    }

    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}`, {
        caption,
      });
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, saveImageDescriptionFailedText));
    } finally {
      setEditingCaptionBlockId(null);
      setEditingCaptionValue('');
    }
  };

  const saveFactsDraft = async (draftId: string, rawValue: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    if (!content) {
      removeDraftBlock(draftId);
      return;
    }

    const { data: createdBlock } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks`, { type: 'facts' });
    const created = createdBlock.blocks[createdBlock.blocks.length - 1];
    if (!created || created.block_type !== 'facts') {
      reloadFromResponse(createdBlock);
      removeDraftBlock(draftId);
      return;
    }

    const response = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${created.id}/items`, {
      content,
    });
    removeDraftBlock(draftId);
    reloadFromResponse(response.data);
    setPendingFactFocusBlockId(created.id);
  };

  const saveFactItem = async (blockId: number, itemId: number, rawValue: string, currentContent: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    const normalizedCurrentContent = trimValue(currentContent).slice(0, FACT_ITEM_MAX_LENGTH);

    if (!content || content === normalizedCurrentContent) {
      setEditingFactItemId(null);
      return;
    }

    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}`,
        { content }
      );
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, saveFactFailedText));
    } finally {
      setEditingFactItemId(null);
    }
  };

  const saveNewFactItem = async (blockId: number, rawValue: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    if (!content) {
      setFactDraftValues((prev) => ({ ...prev, [blockId]: '' }));
      return;
    }

    const { data } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items`, {
      content,
    });
    reloadFromResponse(data);
    setFactDraftValues((prev) => ({ ...prev, [blockId]: '' }));
    setPendingFactFocusBlockId(blockId);
  };

  const deleteFactItem = async (blockId: number, itemId: number) => {
    if (!canEditCards || !isLoggedIn) return;
    try {
      const { data } = await axiosInstance.delete<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}`
      );
      setConfirmDeleteFactItemId(null);
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, deleteFactFailedText));
    }
  };

  const saveChecklistDraft = async (draftId: string, rawValue: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    if (!content) {
      removeDraftBlock(draftId);
      return;
    }

    const { data: createdBlock } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks`, {
      type: 'checklist',
    });
    const created = createdBlock.blocks[createdBlock.blocks.length - 1];
    if (!created || created.block_type !== 'checklist') {
      reloadFromResponse(createdBlock);
      removeDraftBlock(draftId);
      return;
    }

    const response = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${created.id}/items`, {
      content,
    });
    removeDraftBlock(draftId);
    reloadFromResponse(response.data);
    setPendingChecklistFocusBlockId(created.id);
  };

  const saveChecklistItem = async (blockId: number, itemId: number, rawValue: string, currentContent: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    const normalizedCurrentContent = trimValue(currentContent).slice(0, FACT_ITEM_MAX_LENGTH);

    if (!content || content === normalizedCurrentContent) {
      setEditingChecklistItemId(null);
      return;
    }

    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}`,
        { content }
      );
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, saveTaskFailedText));
    } finally {
      setEditingChecklistItemId(null);
    }
  };

  const saveNewChecklistItem = async (blockId: number, rawValue: string) => {
    if (!canEditCards || !isLoggedIn) return;
    const content = trimValue(rawValue).slice(0, FACT_ITEM_MAX_LENGTH);
    if (!content) {
      setChecklistDraftValues((prev) => ({ ...prev, [blockId]: '' }));
      return;
    }

    const { data } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items`, {
      content,
    });
    reloadFromResponse(data);
    setChecklistDraftValues((prev) => ({ ...prev, [blockId]: '' }));
    setPendingChecklistFocusBlockId(blockId);
  };

  const toggleChecklistItem = async (blockId: number, itemId: number, isChecked: boolean) => {
    if (!canEditCards || !isLoggedIn) return;
    try {
      const { data } = await axiosInstance.patch<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}`,
        { is_checked: isChecked }
      );
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, updateTaskFailedText));
    }
  };

  const deleteChecklistItem = async (blockId: number, itemId: number) => {
    if (!canEditCards || !isLoggedIn) return;
    try {
      const { data } = await axiosInstance.delete<CardDetailsResponse>(
        `${buildDetailsPath(selectedCardDetails, true)}/blocks/${blockId}/items/${itemId}`
      );
      setConfirmDeleteChecklistItemId(null);
      reloadFromResponse(data);
    } catch (error) {
      showTopAlarm(getApiErrorMessage(error, deleteTaskFailedText));
    }
  };

  const addDraftBlock = (type: DraftBlock['type']) => {
    const draftId = createDraftId(type);

    if (type === 'text') {
      setDraftBlocks((prev) => [...prev, { id: draftId, type: 'text', value: '' }]);
      return;
    }

    if (type === 'image') {
      setDraftBlocks((prev) => [...prev, { id: draftId, type: 'image', file: null, previewUrl: null }]);
      window.requestAnimationFrame(() => imageInputRefs.current[draftId]?.click());
      return;
    }

    setDraftBlocks((prev) => [...prev, { id: draftId, type, items: [''] }]);
  };

  const blocks = details?.blocks ?? [];
  const heading = selectedCardDetails.title;

  return (
    <div className={classes.menu_details}>
      <h1>{heading}</h1>

      <div className={classes.details_blocks}>
        {loading ? (
          <div className={classes.details_skeleton} aria-hidden="true">
            <div className={classes.details_skeleton_image_block}>
              <div className={classes.details_skeleton_image} />
              <div className={`${classes.skeleton} ${classes.details_skeleton_caption}`} />
            </div>
            <div className={classes.details_skeleton_text_lines}>
              <span className={`${classes.skeleton} ${classes.details_skeleton_text_line}`} />
              <span className={`${classes.skeleton} ${classes.details_skeleton_text_line} ${classes.details_skeleton_text_line_md}`} />
              <span className={`${classes.skeleton} ${classes.details_skeleton_text_line} ${classes.details_skeleton_text_line_lg}`} />
              <span className={`${classes.skeleton} ${classes.details_skeleton_text_line} ${classes.details_skeleton_text_line_sm}`} />
            </div>
            <div className={classes.details_skeleton_list}>
              <div className={classes.details_skeleton_list_item}>
                <span className={`${classes.skeleton} ${classes.details_skeleton_bullet}`} />
                <span className={`${classes.skeleton} ${classes.details_skeleton_list_line}`} />
              </div>
              <div className={classes.details_skeleton_list_item}>
                <span className={`${classes.skeleton} ${classes.details_skeleton_bullet}`} />
                <span className={`${classes.skeleton} ${classes.details_skeleton_list_line}`} />
              </div>
              <div className={classes.details_skeleton_list_item}>
                <span className={`${classes.skeleton} ${classes.details_skeleton_bullet}`} />
                <span className={`${classes.skeleton} ${classes.details_skeleton_list_line} ${classes.details_skeleton_list_line_short}`} />
              </div>
            </div>
          </div>
        ) : null}
        {blocks.map((block) => {
          if (block.block_type === 'image') {
            const src = resolveImageSrc(block.image_path ?? null);
            const imageKey = src ? `${block.id}:${src}` : '';
            const isImageLoaded = !src || Boolean(imageLoadedByKey[imageKey]);
            const isDeleteConfirmOpen = confirmDeleteBlockId === block.id;
            const isCaptionEditing = editingCaptionBlockId === block.id;
            const savedCaption = trimValue(block.caption).slice(0, IMAGE_CAPTION_MAX_LENGTH);
            return (
              <div key={block.id} className={classes.image_block}>
                <input
                  ref={(node) => {
                    imageBlockInputRefs.current[block.id] = node;
                  }}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = '';
                    openCropModalForFile({ kind: 'replace', blockId: block.id }, file);
                  }}
                />
                {canEditCards && isLoggedIn ? (
                  <>
                    <div className={`${classes.image_block_media} ${isDeleteConfirmOpen ? classes.image_block_media_actions_open : ''}`.trim()}>
                      {!isImageLoaded ? <div className={classes.image_block_skeleton} aria-hidden="true" /> : null}
                      <div className={`${classes.image_block_actions_top} ${__PLATFORM__ === 'desktop' ? classes.image_block_actions_top_desktop : classes.image_block_actions_top_mobile} ${isDeleteConfirmOpen ? classes.image_block_actions_top_open : ''}`.trim()}>
                        <DropdownWrapper right middleleftTop closeOnClick={false} isOpen={isDeleteConfirmOpen} onClose={() => setConfirmDeleteBlockId(null)}>
                          {[
                            <button
                              key="trigger"
                              type="button"
                              className={classes.image_block_icon_btn}
                              onClick={() => setConfirmDeleteBlockId((prev) => (prev === block.id ? null : block.id))}
                              aria-label={isEn ? 'Delete image block' : 'Удалить блок картинки'}
                            >
                              <DeleteIcon />
                            </button>,
                            <div key="menu">
                              <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteDetailsBlock(block.id)}>
                                {deleteConfirmText}
                              </button>
                              <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteBlockId(null)}>
                                {cancelText}
                              </button>
                            </div>,
                          ]}
                        </DropdownWrapper>
                        <button type="button" className={classes.image_block_icon_btn} onClick={() => void moveDetailsBlock(block.id, 'up')} aria-label={isEn ? 'Move image block up' : 'Поднять блок картинки'}>
                          <MoveUpIcon />
                        </button>
                        <button type="button" className={classes.image_block_icon_btn} onClick={() => void moveDetailsBlock(block.id, 'down')} aria-label={isEn ? 'Move image block down' : 'Опустить блок картинки'}>
                          <MoveDownIcon />
                        </button>
                        {__PLATFORM__ !== 'desktop' ? (
                          <button type="button" className={classes.image_block_icon_btn} onClick={() => imageBlockInputRefs.current[block.id]?.click()} aria-label={isEn ? 'Change block image' : 'Изменить картинку блока'}>
                            <Edit />
                          </button>
                        ) : null}
                      </div>
                      {__PLATFORM__ === 'desktop' ? (
                        <button
                          type="button"
                          className={`${classes.image_block_edit_center} ${isDeleteConfirmOpen ? classes.image_block_edit_center_open : ''}`.trim()}
                          onClick={() => imageBlockInputRefs.current[block.id]?.click()}
                          aria-label={isEn ? 'Change block image' : 'Изменить картинку блока'}
                        >
                          <Edit />
                        </button>
                      ) : null}
                      {src ? (
                        <img
                          src={src}
                          alt={block.caption ?? heading}
                          className={!isImageLoaded ? classes.image_block_img_hidden : undefined}
                          onLoad={() => {
                            if (!imageKey) return;
                            setImageLoadedByKey((prev) => (prev[imageKey] ? prev : { ...prev, [imageKey]: true }));
                          }}
                        />
                      ) : (
                        <Default />
                      )}
                    </div>
                  </>
                ) : null}
                {!canEditCards || !isLoggedIn ? (
                  <div className={classes.image_block_media}>
                    {!isImageLoaded ? <div className={classes.image_block_skeleton} aria-hidden="true" /> : null}
                    {src ? (
                      <img
                        src={src}
                        alt={block.caption ?? heading}
                        className={!isImageLoaded ? classes.image_block_img_hidden : undefined}
                        onLoad={() => {
                          if (!imageKey) return;
                          setImageLoadedByKey((prev) => (prev[imageKey] ? prev : { ...prev, [imageKey]: true }));
                        }}
                      />
                    ) : (
                      <Default />
                    )}
                  </div>
                ) : null}
                <div
                  className={`${classes.image_block_caption_row} ${isCaptionEditing ? classes.image_block_caption_row_editing : ''}`.trim()}
                >
                  {isCaptionEditing ? (
                    <textarea
                      className={`${classes.image_block_caption} ${classes.image_block_caption_editing}`.trim()}
                      value={editingCaptionValue}
                      placeholder={descriptionText}
                      rows={1}
                      autoFocus
                      ref={(node) => {
                        imageCaptionTextareaRefs.current[block.id] = node;
                        autosizeTextarea(node);
                      }}
                      onFocus={(event) => {
                        if (captionCaretInitializedBlockIdRef.current === block.id) return;
                        captionCaretInitializedBlockIdRef.current = block.id;
                        const node = event.currentTarget;
                        window.requestAnimationFrame(() => {
                          const len = node.value.length;
                          try {
                            node.setSelectionRange(len, len);
                          } catch {
                            // ignore
                          }
                        });
                      }}
                      onChange={(event) => {
                        const normalized = normalizeSingleLine(event.currentTarget.value).slice(0, IMAGE_CAPTION_MAX_LENGTH);
                        setEditingCaptionValue(normalized);
                        autosizeTextarea(event.currentTarget);
                      }}
                      onInput={(event) => autosizeTextarea(event.currentTarget)}
                      onBlur={() => void saveImageCaption(block.id, editingCaptionValue, block.caption ?? null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEditingCaptionBlockId(null);
                          setEditingCaptionValue('');
                        }
                      }}
                    />
                  ) : (
                    <span className={classes.image_block_caption}>{savedCaption || descriptionText}</span>
                  )}
                  {canEditCards && isLoggedIn && !isCaptionEditing ? (
                    <button
                      type="button"
                      className={classes.image_block_caption_edit_btn}
                      aria-label={isEn ? 'Edit image description' : 'Изменить описание картинки'}
                      onClick={() => {
                        setEditingCaptionBlockId(block.id);
                        setEditingCaptionValue(savedCaption);
                      }}
                    >
                      <Edit />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }

          if (block.block_type === 'text') {
            const isTextEditing = editingTextBlockId === block.id;
            const isDeleteConfirmOpen = confirmDeleteBlockId === block.id;
            return (
              <div key={block.id} className={classes.text_block}>
                {isTextEditing ? (
                  <textarea
                    ref={(node) => {
                      textBlockRefs.current[block.id] = node;
                      autosizeTextarea(node, shouldAddExtraSpacer(node));
                    }}
                    className={classes.text_block_textarea}
                    defaultValue={block.content}
                    autoFocus
                    placeholder={textPlaceholder}
                    onInput={(event) => {
                      const target = event.currentTarget;
                      autosizeTextarea(target, shouldAddExtraSpacer(target));
                    }}
                    onKeyDown={(event) => {
                      if (__PLATFORM__ === 'desktop' && event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditingTextBlockId(null);
                      }
                    }}
                    onBlur={(event) => {
                      const node = event.currentTarget;
                      window.requestAnimationFrame(() => {
                        if (document.activeElement === node) return;
                        void saveTextBlock(block.id, node.value, block.content);
                      });
                    }}
                  />
                ) : (
                  <>
                    <span>{block.content}</span>
                    {canEditCards && isLoggedIn ? (
                      <span className={classes.text_block_actions}>
                        <button
                          type="button"
                          className={classes.text_block_edit_btn}
                          aria-label={isEn ? 'Move text block up' : 'Поднять текстовый блок'}
                          onClick={() => void moveDetailsBlock(block.id, 'up')}
                        >
                          <MoveUpIcon />
                        </button>
                        <button
                          type="button"
                          className={classes.text_block_edit_btn}
                          aria-label={isEn ? 'Move text block down' : 'Опустить текстовый блок'}
                          onClick={() => void moveDetailsBlock(block.id, 'down')}
                        >
                          <MoveDownIcon />
                        </button>
                        <button
                          type="button"
                          className={classes.text_block_edit_btn}
                          aria-label={isEn ? 'Copy text block' : 'Скопировать текстовый блок'}
                          onClick={() => void copyTextToClipboard(block.content, textCopiedText, copyTextFailedText)}
                        >
                          <CopyIcon />
                        </button>
                        <button
                          type="button"
                          className={classes.text_block_edit_btn}
                          aria-label={isEn ? 'Edit text block' : 'Изменить текстовый блок'}
                          onClick={() => {
                            setEditingTextBlockId(block.id);
                            window.requestAnimationFrame(() => {
                              const node = textBlockRefs.current[block.id];
                              if (!node) return;
                              node.focus();
                              const length = node.value.length;
                              node.setSelectionRange(length, length);
                            });
                          }}
                        >
                          <Edit />
                        </button>
                        <DropdownWrapper right fixed minWidthPx={140} closeOnClick={false} isOpen={isDeleteConfirmOpen} onClose={() => setConfirmDeleteBlockId(null)}>
                          {[
                            <button
                              key="trigger"
                              type="button"
                              className={classes.text_block_edit_btn}
                              aria-label={isEn ? 'Delete text block' : 'Удалить текстовый блок'}
                              onClick={() => setConfirmDeleteBlockId((prev) => (prev === block.id ? null : block.id))}
                            >
                              <DeleteIcon />
                            </button>,
                            <div key="menu">
                              <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteDetailsBlock(block.id)}>
                                {deleteConfirmText}
                              </button>
                              <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteBlockId(null)}>
                                {cancelText}
                              </button>
                            </div>,
                          ]}
                        </DropdownWrapper>
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            );
          }

          if (block.block_type === 'facts') {
            const draftValue = factDraftValues[block.id] ?? '';
            return (
              <div key={block.id} className={classes.facts_block}>
                {canEditCards && isLoggedIn ? (
                  <div className={classes.details_block_header}>
                    <span className={classes.details_block_title}>{factsTitle}</span>
                    <span className={classes.text_block_actions}>
                      <button type="button" className={classes.text_block_edit_btn} aria-label={isEn ? 'Move facts block up' : 'Поднять блок фактов'} onClick={() => void moveDetailsBlock(block.id, 'up')}>
                        <MoveUpIcon />
                      </button>
                      <button type="button" className={classes.text_block_edit_btn} aria-label={isEn ? 'Move facts block down' : 'Опустить блок фактов'} onClick={() => void moveDetailsBlock(block.id, 'down')}>
                        <MoveDownIcon />
                      </button>
                    </span>
                  </div>
                ) : null}
                {block.items.map((item) => {
                  const isFactEditing = editingFactItemId === item.id;
                  const isDeleteConfirmOpen = confirmDeleteFactItemId === item.id;
                  return (
                    <div key={item.id} className={classes.facts_item}>
                      {isFactEditing ? (
                        <textarea
                          className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                          value={editingFactValue}
                          autoFocus
                          placeholder={factPlaceholder}
                          rows={1}
                          maxLength={FACT_ITEM_MAX_LENGTH}
                          ref={(node) => autosizeTextarea(node)}
                          onFocus={(event) => {
                            const node = event.currentTarget;
                            const length = node.value.length;
                            try {
                              node.setSelectionRange(length, length);
                            } catch {
                              // ignore
                            }
                          }}
                          onChange={(event) => {
                            const normalized = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                            setEditingFactValue(normalized);
                            autosizeTextarea(event.currentTarget);
                          }}
                          onInput={(event) => autosizeTextarea(event.currentTarget)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingFactItemId(null);
                            }
                          }}
                          onBlur={(event) => {
                            void saveFactItem(block.id, item.id, event.currentTarget.value, item.content);
                          }}
                        />
                      ) : (
                        <span className={classes.facts_item_text}>{item.content}</span>
                      )}
                      {canEditCards && isLoggedIn && !isFactEditing ? (
                        <span className={classes.facts_item_actions}>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Move fact up' : 'Поднять факт'}
                            onClick={() => void moveDetailsItem(block.id, item.id, 'up')}
                          >
                            <MoveUpIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Move fact down' : 'Опустить факт'}
                            onClick={() => void moveDetailsItem(block.id, item.id, 'down')}
                          >
                            <MoveDownIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Copy fact' : 'Скопировать факт'}
                            onClick={() => void copyTextToClipboard(item.content, factCopiedText, copyFactFailedText)}
                          >
                            <CopyIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Edit fact' : 'Изменить факт'}
                            onClick={() => {
                              setEditingFactItemId(item.id);
                              setEditingFactValue(item.content.slice(0, FACT_ITEM_MAX_LENGTH));
                            }}
                          >
                            <Edit />
                          </button>
                          <DropdownWrapper right fixed minWidthPx={140} closeOnClick={false} isOpen={isDeleteConfirmOpen} onClose={() => setConfirmDeleteFactItemId(null)}>
                            {[
                              <button
                                key="trigger"
                                type="button"
                                className={classes.text_block_edit_btn}
                                aria-label={isEn ? 'Delete fact' : 'Удалить факт'}
                                onClick={() => setConfirmDeleteFactItemId((prev) => (prev === item.id ? null : item.id))}
                              >
                                <DeleteIcon />
                              </button>,
                              <div key="menu">
                                <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteFactItem(block.id, item.id)}>
                                  {deleteConfirmText}
                                </button>
                                <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteFactItemId(null)}>
                                  {cancelText}
                                </button>
                              </div>,
                            ]}
                          </DropdownWrapper>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {canEditCards && isLoggedIn ? (
                  <div className={classes.facts_item}>
                    <textarea
                      ref={(node) => {
                        factInputRefs.current[block.id] = node;
                        autosizeTextarea(node);
                      }}
                      className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                      value={draftValue}
                      placeholder={newFactPlaceholder}
                      rows={1}
                      maxLength={FACT_ITEM_MAX_LENGTH}
                      onChange={(event) => {
                        const nextValue = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                        setFactDraftValues((prev) => ({ ...prev, [block.id]: nextValue }));
                        autosizeTextarea(event.currentTarget);
                      }}
                      onInput={(event) => autosizeTextarea(event.currentTarget)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setFactDraftValues((prev) => ({ ...prev, [block.id]: '' }));
                          event.currentTarget.blur();
                        }
                      }}
                      onBlur={(event) => {
                        void saveNewFactItem(block.id, event.currentTarget.value);
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <div key={block.id} className={classes.checklist_block}>
              {canEditCards && isLoggedIn ? (
                <div className={classes.details_block_header}>
                  <span className={classes.details_block_title}>{checklistTitle}</span>
                  <span className={classes.text_block_actions}>
                    <button type="button" className={classes.text_block_edit_btn} aria-label={isEn ? 'Move checklist block up' : 'Поднять блок чеклиста'} onClick={() => void moveDetailsBlock(block.id, 'up')}>
                      <MoveUpIcon />
                    </button>
                    <button type="button" className={classes.text_block_edit_btn} aria-label={isEn ? 'Move checklist block down' : 'Опустить блок чеклиста'} onClick={() => void moveDetailsBlock(block.id, 'down')}>
                      <MoveDownIcon />
                    </button>
                  </span>
                </div>
              ) : null}
              {block.items.map((item) => {
                const isChecklistEditing = editingChecklistItemId === item.id;
                const isDeleteConfirmOpen = confirmDeleteChecklistItemId === item.id;
                return (
                  <div key={item.id} className={classes.checklist_row}>
                    <span className={classes.checklist_box}>
                      <input
                        type="checkbox"
                        className={classes.checklist_checkbox}
                        checked={Boolean(item.is_checked)}
                        disabled={!canEditCards || !isLoggedIn}
                        onChange={(event) => void toggleChecklistItem(block.id, item.id, event.currentTarget.checked)}
                      />
                      <span className={classes.checklist_indicator} />
                    </span>
                    <span className={classes.checklist_text_wrap}>
                      {isChecklistEditing ? (
                        <textarea
                          className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                          value={editingChecklistValue}
                          autoFocus
                          placeholder={taskPlaceholder}
                          rows={1}
                          maxLength={FACT_ITEM_MAX_LENGTH}
                          ref={(node) => autosizeTextarea(node)}
                          onFocus={(event) => {
                            const node = event.currentTarget;
                            const length = node.value.length;
                            try {
                              node.setSelectionRange(length, length);
                            } catch {
                              // ignore
                            }
                          }}
                          onChange={(event) => {
                            const normalized = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                            setEditingChecklistValue(normalized);
                            autosizeTextarea(event.currentTarget);
                          }}
                          onInput={(event) => autosizeTextarea(event.currentTarget)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setEditingChecklistItemId(null);
                            }
                          }}
                          onBlur={(event) => {
                            void saveChecklistItem(block.id, item.id, event.currentTarget.value, item.content);
                          }}
                        />
                      ) : (
                        <span
                          className={`${classes.checklist_text} ${Boolean(item.is_checked) ? classes.checklist_text_checked : ''}`.trim()}
                        >
                          {item.content}
                        </span>
                      )}
                      {canEditCards && isLoggedIn && !isChecklistEditing ? (
                        <span className={classes.checklist_item_actions}>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Move task up' : 'Поднять задачу'}
                            onClick={() => void moveDetailsItem(block.id, item.id, 'up')}
                          >
                            <MoveUpIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Move task down' : 'Опустить задачу'}
                            onClick={() => void moveDetailsItem(block.id, item.id, 'down')}
                          >
                            <MoveDownIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Copy task' : 'Скопировать задачу'}
                            onClick={() =>
                              void copyTextToClipboard(
                                `${Boolean(item.is_checked) ? '[x]' : '[ ]'} ${item.content}`,
                                taskCopiedText,
                                copyTaskFailedText
                              )
                            }
                          >
                            <CopyIcon />
                          </button>
                          <button
                            type="button"
                            className={classes.text_block_edit_btn}
                            aria-label={isEn ? 'Edit task' : 'Изменить задачу'}
                            onClick={() => {
                              setEditingChecklistItemId(item.id);
                              setEditingChecklistValue(item.content.slice(0, FACT_ITEM_MAX_LENGTH));
                            }}
                          >
                            <Edit />
                          </button>
                          <DropdownWrapper right fixed minWidthPx={140} closeOnClick={false} isOpen={isDeleteConfirmOpen} onClose={() => setConfirmDeleteChecklistItemId(null)}>
                            {[
                              <button
                                key="trigger"
                                type="button"
                                className={classes.text_block_edit_btn}
                                aria-label={isEn ? 'Delete task' : 'Удалить задачу'}
                                onClick={() => setConfirmDeleteChecklistItemId((prev) => (prev === item.id ? null : item.id))}
                              >
                                <DeleteIcon />
                              </button>,
                              <div key="menu">
                                <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteChecklistItem(block.id, item.id)}>
                                  {deleteConfirmText}
                                </button>
                                <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteChecklistItemId(null)}>
                                  {cancelText}
                                </button>
                              </div>,
                            ]}
                          </DropdownWrapper>
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              {canEditCards && isLoggedIn ? (
                <div className={classes.checklist_row}>
                  <span className={classes.checklist_box}>
                    <input type="checkbox" className={classes.checklist_checkbox} checked={false} disabled />
                    <span className={classes.checklist_indicator} />
                  </span>
                  <textarea
                    ref={(node) => {
                      checklistInputRefs.current[block.id] = node;
                      autosizeTextarea(node);
                    }}
                    className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                    value={checklistDraftValues[block.id] ?? ''}
                    placeholder={newTaskPlaceholder}
                    rows={1}
                    maxLength={FACT_ITEM_MAX_LENGTH}
                    onChange={(event) => {
                      const nextValue = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                      setChecklistDraftValues((prev) => ({ ...prev, [block.id]: nextValue }));
                      autosizeTextarea(event.currentTarget);
                    }}
                    onInput={(event) => autosizeTextarea(event.currentTarget)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setChecklistDraftValues((prev) => ({ ...prev, [block.id]: '' }));
                        event.currentTarget.blur();
                      }
                    }}
                    onBlur={(event) => {
                      void saveNewChecklistItem(block.id, event.currentTarget.value);
                    }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        {draftBlocks.map((draft) => {
          if (draft.type === 'text') {
            return (
              <div key={draft.id} className={classes.details_editor_block}>
                <textarea
                  className={classes.details_textarea}
                  value={draft.value}
                  autoFocus
                  placeholder={textPlaceholder}
                  onKeyDown={(event) => {
                    if (__PLATFORM__ === 'desktop' && event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      removeDraftBlock(draft.id);
                    }
                  }}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    updateDraftBlock(draft.id, () => ({ ...draft, value: nextValue }));
                  }}
                  onBlur={(event) => {
                    void saveTextDraft(draft.id, event.currentTarget.value);
                  }}
                />
              </div>
            );
          }

          if (draft.type === 'image') {
            return (
              <div key={draft.id} className={classes.details_editor_block}>
                <input
                  ref={(node) => {
                    imageInputRefs.current[draft.id] = node;
                  }}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = '';
                    openCropModalForFile({ kind: 'draft', draftId: draft.id }, file);
                  }}
                />
                {draft.previewUrl ? <img className={classes.details_draft_image} src={draft.previewUrl} alt="preview" /> : null}
              </div>
            );
          }

          if (draft.type === 'facts') {
            const value = draft.items[0] ?? '';
            return (
              <div key={draft.id} className={classes.details_editor_block}>
                <textarea
                  className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                  value={value}
                  autoFocus
                  placeholder={newFactPlaceholder}
                  rows={1}
                  maxLength={FACT_ITEM_MAX_LENGTH}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      removeDraftBlock(draft.id);
                    }
                  }}
                  onChange={(event) => {
                    const nextValue = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                    updateDraftBlock(draft.id, () => ({ ...draft, items: [nextValue] }));
                    autosizeTextarea(event.currentTarget);
                  }}
                  onInput={(event) => autosizeTextarea(event.currentTarget)}
                  onBlur={(event) => {
                    void saveFactsDraft(draft.id, event.currentTarget.value);
                  }}
                />
              </div>
            );
          }

          if (draft.type === 'checklist') {
            const value = draft.items[0] ?? '';
            return (
              <div key={draft.id} className={classes.details_editor_block}>
                <div className={classes.checklist_row}>
                  <span className={classes.checklist_box}>
                    <input type="checkbox" className={classes.checklist_checkbox} checked={false} disabled />
                    <span className={classes.checklist_indicator} />
                  </span>
                  <textarea
                    className={`${classes.details_inline_textarea} ${classes.details_inline_textarea_editing}`.trim()}
                    value={value}
                    autoFocus
                    placeholder={newTaskPlaceholder}
                    rows={1}
                    maxLength={FACT_ITEM_MAX_LENGTH}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        removeDraftBlock(draft.id);
                      }
                    }}
                    onChange={(event) => {
                      const nextValue = normalizeSingleLine(event.currentTarget.value).slice(0, FACT_ITEM_MAX_LENGTH);
                      updateDraftBlock(draft.id, () => ({ ...draft, items: [nextValue] }));
                      autosizeTextarea(event.currentTarget);
                    }}
                    onInput={(event) => autosizeTextarea(event.currentTarget)}
                    onBlur={(event) => {
                      void saveChecklistDraft(draft.id, event.currentTarget.value);
                    }}
                  />
                </div>
              </div>
            );
          }

          return null;
        })}

        {!loading && !blocks.length && !draftBlocks.length ? <div className={classes.details_empty}>{emptyDetailsText}</div> : null}
      </div>

      {canEditCards && isLoggedIn ? (
        <div className={classes.details_btn}>
          <button type="button" onClick={() => addDraftBlock('image')}>
            <Image />
          </button>
          <button type="button" onClick={() => addDraftBlock('text')}>
            <Text />
          </button>
          <button type="button" onClick={() => addDraftBlock('facts')}>
            <Fact />
          </button>
          <button type="button" onClick={() => addDraftBlock('checklist')}>
            <Check />
          </button>
        </div>
      ) : null}

      <ImageCropModal
        isOpen={Boolean(cropSourceFile && pendingCropTarget)}
        sourceFile={cropSourceFile}
        config={getDetailsImageCropPreset()}
        onClose={closeCropModal}
        onApply={(file) => {
          const target = pendingCropTarget;
          if (!target) {
            setCropSourceFile(null);
            setPendingCropTarget(null);
            return;
          }

          if (target.kind === 'draft') {
            const draft = draftBlocks.find((item) => item.id === target.draftId);
            if (draft?.type === 'image') {
              const previewUrl = URL.createObjectURL(file);
              updateDraftBlock(target.draftId, (current) => {
                if (current.type !== 'image') return current;
                if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
                return {
                  ...current,
                  file,
                  previewUrl,
                };
              });
              void saveImageDraft(target.draftId, file);
            }
          } else {
            void replaceImageBlock(target.blockId, file);
          }

          setCropSourceFile(null);
          setPendingCropTarget(null);
        }}
      />
    </div>
  );
};
