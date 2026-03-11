import React, { useEffect, useRef, useState } from 'react';
import axiosInstance from '@/api/axiosInstance';
import { resolveImageSrc } from '@/components/flow/flowBoardUtils';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import { useUIStore } from '@/store/uiStore';
import Default from '@/assets/icons/monochrome/image-placeholder.svg';
import Edit from '@/assets/icons/monochrome/edit.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import classes from './Board.module.scss';

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

const buildDetailsPath = (snapshot: CardDetailsSnapshot, isLoggedIn: boolean) =>
  isLoggedIn
    ? `/api/boards/${snapshot.boardId}/cards/${snapshot.cardId}/details`
    : `/api/boards/public/${snapshot.boardId}/cards/${snapshot.cardId}/details`;

const trimValue = (value: string | null | undefined) => String(value ?? '').replace(/\u00a0/g, ' ').trim();
const createDraftId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random()}`;
const IMAGE_CAPTION_MAX_LENGTH = 70;
const FACT_ITEM_MAX_LENGTH = 200;
const IMAGE_BLOCK_TOO_LARGE_MESSAGE = 'Вес слишком большой — выберите изображение весом до 5 МБ.';
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

export const BoardRightMenuCardDetails = (props: BoardRightMenuCardDetailsProps) => {
  const { canEditCards, isLoggedIn, selectedCardDetails } = props;
  const showTopAlarm = useUIStore((s) => s.showTopAlarm);
  const [details, setDetails] = useState<CardDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [draftBlocks, setDraftBlocks] = useState<DraftBlock[]>([]);
  const [confirmDeleteBlockId, setConfirmDeleteBlockId] = useState<number | null>(null);
  const [confirmDeleteFactItemId, setConfirmDeleteFactItemId] = useState<number | null>(null);
  const [editingCaptionBlockId, setEditingCaptionBlockId] = useState<number | null>(null);
  const [editingCaptionValue, setEditingCaptionValue] = useState('');
  const [editingTextBlockId, setEditingTextBlockId] = useState<number | null>(null);
  const [editingFactItemId, setEditingFactItemId] = useState<number | null>(null);
  const [editingFactValue, setEditingFactValue] = useState('');
  const [factDraftValues, setFactDraftValues] = useState<Record<number, string>>({});
  const [pendingFactFocusBlockId, setPendingFactFocusBlockId] = useState<number | null>(null);
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageBlockInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const imageCaptionTextareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const captionCaretInitializedBlockIdRef = useRef<number | null>(null);
  const textBlockRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});
  const factInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    if (editingCaptionBlockId !== null) return;
    captionCaretInitializedBlockIdRef.current = null;
  }, [editingCaptionBlockId]);

  useEffect(() => {
    if (editingFactItemId !== null) return;
    setEditingFactValue('');
  }, [editingFactItemId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setConfirmDeleteBlockId(null);
    setConfirmDeleteFactItemId(null);
    setEditingCaptionBlockId(null);
    setEditingTextBlockId(null);
    setEditingFactItemId(null);
    setEditingFactValue('');
    setEditingCaptionValue('');
    setFactDraftValues({});
    setPendingFactFocusBlockId(null);
    setDraftBlocks((prev) => {
      prev.forEach((draft) => {
        if (draft.type === 'image' && draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      });
      return [];
    });

    (async () => {
      try {
        const { data } = await axiosInstance.get<CardDetailsResponse>(buildDetailsPath(selectedCardDetails, isLoggedIn));
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
  }, [isLoggedIn, selectedCardDetails]);

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

  const reloadFromResponse = (next: CardDetailsResponse) => {
    setConfirmDeleteBlockId((prev) => (prev !== null && !next.blocks.some((block) => block.id === prev) ? null : prev));
    setConfirmDeleteFactItemId((prev) => {
      if (prev === null) return prev;
      const hasItem = next.blocks.some(
        (block) => block.block_type === 'facts' && block.items.some((item) => item.id === prev)
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
    setDetails(next);
  };

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
      showTopAlarm(getApiErrorMessage(error, 'Не удалось сохранить текстовый блок'));
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
      const message = getApiErrorMessage(error, 'Не удалось заменить картинку блока');
      const normalizedMessage = message.toLowerCase();
      if (
        normalizedMessage.includes('5mb') ||
        normalizedMessage.includes('5 mb') ||
        normalizedMessage.includes('слишком большой') ||
        normalizedMessage.includes('too large') ||
        normalizedMessage.includes('file too large')
      ) {
        showTopAlarm(IMAGE_BLOCK_TOO_LARGE_MESSAGE);
        return;
      }
      showTopAlarm(message);
    }
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
      showTopAlarm(getApiErrorMessage(error, 'Не удалось сохранить описание картинки'));
    } finally {
      setEditingCaptionBlockId(null);
      setEditingCaptionValue('');
    }
  };

  const saveListDraft = async (draftId: string, type: 'facts' | 'checklist', items: string[]) => {
    if (!canEditCards || !isLoggedIn) return;
    const normalizedItems = items.map((item) => trimValue(item)).filter(Boolean);
    if (!normalizedItems.length) {
      removeDraftBlock(draftId);
      return;
    }

    const { data: createdBlock } = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks`, { type });
    const created = createdBlock.blocks[createdBlock.blocks.length - 1];
    if (!created || created.block_type !== type) {
      reloadFromResponse(createdBlock);
      removeDraftBlock(draftId);
      return;
    }

    let latest = createdBlock;
    for (const item of normalizedItems) {
      const response = await axiosInstance.post<CardDetailsResponse>(`${buildDetailsPath(selectedCardDetails, true)}/blocks/${created.id}/items`, {
        content: item,
      });
      latest = response.data;
    }

    removeDraftBlock(draftId);
    reloadFromResponse(latest);
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
      showTopAlarm(getApiErrorMessage(error, 'Не удалось сохранить факт'));
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
      showTopAlarm(getApiErrorMessage(error, 'Не удалось удалить факт'));
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
        {blocks.map((block) => {
          if (block.block_type === 'image') {
            const src = resolveImageSrc(block.image_path ?? null);
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
                    void replaceImageBlock(block.id, file);
                  }}
                />
                {canEditCards && isLoggedIn ? (
                  <>
                    <div className={`${classes.image_block_media} ${isDeleteConfirmOpen ? classes.image_block_media_actions_open : ''}`.trim()}>
                      <div className={`${classes.image_block_actions_top} ${__PLATFORM__ === 'desktop' ? classes.image_block_actions_top_desktop : classes.image_block_actions_top_mobile} ${isDeleteConfirmOpen ? classes.image_block_actions_top_open : ''}`.trim()}>
                        <DropdownWrapper right middleleftTop closeOnClick={false} isOpen={isDeleteConfirmOpen} onClose={() => setConfirmDeleteBlockId(null)}>
                          {[
                            <button
                              key="trigger"
                              type="button"
                              className={classes.image_block_icon_btn}
                              onClick={() => setConfirmDeleteBlockId((prev) => (prev === block.id ? null : block.id))}
                              aria-label="Удалить блок картинки"
                            >
                              <DeleteIcon />
                            </button>,
                            <div key="menu">
                              <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteDetailsBlock(block.id)}>
                                Да, удалить
                              </button>
                              <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteBlockId(null)}>
                                Отмена
                              </button>
                            </div>,
                          ]}
                        </DropdownWrapper>
                        {__PLATFORM__ !== 'desktop' ? (
                          <button type="button" className={classes.image_block_icon_btn} onClick={() => imageBlockInputRefs.current[block.id]?.click()} aria-label="Изменить картинку блока">
                            <Edit />
                          </button>
                        ) : null}
                      </div>
                      {__PLATFORM__ === 'desktop' ? (
                        <button
                          type="button"
                          className={`${classes.image_block_edit_center} ${isDeleteConfirmOpen ? classes.image_block_edit_center_open : ''}`.trim()}
                          onClick={() => imageBlockInputRefs.current[block.id]?.click()}
                          aria-label="Изменить картинку блока"
                        >
                          <Edit />
                        </button>
                      ) : null}
                      {src ? <img src={src} alt={block.caption ?? heading} /> : <Default />}
                    </div>
                  </>
                ) : null}
                {!canEditCards || !isLoggedIn ? (src ? <img src={src} alt={block.caption ?? heading} /> : <Default />) : null}
                <div
                  className={`${classes.image_block_caption_row} ${isCaptionEditing ? classes.image_block_caption_row_editing : ''}`.trim()}
                >
                  {isCaptionEditing ? (
                    <textarea
                      className={`${classes.image_block_caption} ${classes.image_block_caption_editing}`.trim()}
                      value={editingCaptionValue}
                      placeholder="Описание"
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
                    <span className={classes.image_block_caption}>{savedCaption || 'Описание'}</span>
                  )}
                  {canEditCards && isLoggedIn && !isCaptionEditing ? (
                    <button
                      type="button"
                      className={classes.image_block_caption_edit_btn}
                      aria-label="Изменить описание картинки"
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
                    placeholder="Текст"
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
                          aria-label="Изменить текстовый блок"
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
                              aria-label="Удалить текстовый блок"
                              onClick={() => setConfirmDeleteBlockId((prev) => (prev === block.id ? null : block.id))}
                            >
                              <DeleteIcon />
                            </button>,
                            <div key="menu">
                              <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteDetailsBlock(block.id)}>
                                Да, удалить
                              </button>
                              <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteBlockId(null)}>
                                Отмена
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
                {block.items.map((item) => {
                  const isFactEditing = editingFactItemId === item.id;
                  const isDeleteConfirmOpen = confirmDeleteFactItemId === item.id;
                  return (
                    <div key={item.id} className={classes.facts_item}>
                      {isFactEditing ? (
                        <input
                          className={`${classes.details_item_input} ${classes.facts_item_input}`.trim()}
                          value={editingFactValue}
                          autoFocus
                          placeholder="Факт"
                          maxLength={FACT_ITEM_MAX_LENGTH}
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
                            const nextValue = event.currentTarget.value.slice(0, FACT_ITEM_MAX_LENGTH);
                            setEditingFactValue(nextValue);
                          }}
                          onKeyDown={(event) => {
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
                            aria-label="Изменить факт"
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
                                aria-label="Удалить факт"
                                onClick={() => setConfirmDeleteFactItemId((prev) => (prev === item.id ? null : item.id))}
                              >
                                <DeleteIcon />
                              </button>,
                              <div key="menu">
                                <button type="button" data-dropdown-class={classes.participant_confirm_danger} onClick={() => void deleteFactItem(block.id, item.id)}>
                                  Да, удалить
                                </button>
                                <button type="button" data-dropdown-class={classes.participant_confirm_cancel} onClick={() => setConfirmDeleteFactItemId(null)}>
                                  Отмена
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
                    <input
                      ref={(node) => {
                        factInputRefs.current[block.id] = node;
                      }}
                      className={`${classes.details_item_input} ${classes.facts_item_input}`.trim()}
                      value={draftValue}
                      placeholder="Новый факт"
                      maxLength={FACT_ITEM_MAX_LENGTH}
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value.slice(0, FACT_ITEM_MAX_LENGTH);
                        setFactDraftValues((prev) => ({ ...prev, [block.id]: nextValue }));
                      }}
                      onKeyDown={(event) => {
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
              {block.items.map((item) => (
                <div key={item.id} className={classes.checklist_row}>
                  <span className={classes.checklist_box}>
                    <span className={`${classes.checklist_indicator} ${Boolean(item.is_checked) ? classes.checklist_indicator_checked : ''}`.trim()} />
                  </span>
                  <span className={classes.checklist_text}>{item.content}</span>
                </div>
              ))}
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
                  placeholder="Текст"
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
                    updateDraftBlock(draft.id, (current) => {
                      if (current.type !== 'image') return current;
                      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
                      return {
                        ...current,
                        file,
                        previewUrl: file ? URL.createObjectURL(file) : null,
                      };
                    });
                    if (!file) {
                      removeDraftBlock(draft.id);
                      return;
                    }
                    void saveImageDraft(draft.id, file);
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
                <input
                  className={`${classes.details_item_input} ${classes.facts_item_input}`.trim()}
                  value={value}
                  autoFocus
                  placeholder="Новый факт"
                  maxLength={FACT_ITEM_MAX_LENGTH}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      removeDraftBlock(draft.id);
                    }
                  }}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value.slice(0, FACT_ITEM_MAX_LENGTH);
                    updateDraftBlock(draft.id, () => ({ ...draft, items: [nextValue] }));
                  }}
                  onBlur={(event) => {
                    void saveFactsDraft(draft.id, event.currentTarget.value);
                  }}
                />
              </div>
            );
          }

          return (
            <div key={draft.id} className={classes.details_editor_block}>
              <div className={classes.details_list_draft}>
                {draft.items.map((item, index) => (
                  <div key={`${draft.id}-${index}`} className={classes.details_list_row}>
                    <span className={classes.checklist_box}>
                      <span className={classes.checklist_indicator} />
                    </span>
                    <input
                      className={classes.checklist_text_input}
                      value={item}
                      autoFocus={index === draft.items.length - 1}
                      placeholder="Новый пункт"
                      onChange={(event) => {
                        const nextValue = event.currentTarget.value;
                        updateDraftBlock(draft.id, (current) => {
                          if (current.type !== draft.type) return current;
                          const nextItems = [...current.items];
                          nextItems[index] = nextValue;
                          return { ...current, items: nextItems };
                        });
                      }}
                      onBlur={(event) => {
                        if (trimValue(event.currentTarget.value)) return;
                        updateDraftBlock(draft.id, (current) => {
                          if (current.type !== draft.type) return current;
                          const nextItems = current.items.filter((_, itemIndex) => itemIndex !== index);
                          if (!nextItems.length) {
                            window.setTimeout(() => removeDraftBlock(draft.id), 0);
                            return current;
                          }
                          return { ...current, items: nextItems };
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className={classes.details_editor_actions}>
                <button
                  type="button"
                  className={classes.details_inline_btn}
                  onClick={() =>
                    updateDraftBlock(draft.id, (current) => {
                      if (current.type !== draft.type) return current;
                      return { ...current, items: [...current.items, ''] };
                    })
                  }
                >
                  Еще пункт
                </button>
                <button type="button" className={classes.details_inline_btn} onClick={() => void saveListDraft(draft.id, draft.type, draft.items)}>
                  Сохранить
                </button>
              </div>
            </div>
          );
        })}

        {!loading && !blocks.length && !draftBlocks.length ? <div className={classes.details_empty}>Добавьте заметки в меню снизу экрана</div> : null}
      </div>

      <div className={classes.details_btn}>
        <button type="button" onClick={() => addDraftBlock('image')} disabled={!canEditCards || !isLoggedIn}>
          <Default />
        </button>
        <button type="button" onClick={() => addDraftBlock('text')} disabled={!canEditCards || !isLoggedIn}>
          <Default />
        </button>
        <button type="button" onClick={() => addDraftBlock('facts')} disabled={!canEditCards || !isLoggedIn}>
          <Default />
        </button>
        <button type="button" onClick={() => addDraftBlock('checklist')} disabled={!canEditCards || !isLoggedIn}>
          <Default />
        </button>
      </div>
    </div>
  );
};
