import { useEffect } from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import { connectSocket } from '@/services/socketManager';
import type { ApiCardLink, ApiLinkStyle, FlowNodeData, FlowNodeType } from './flowBoardModel';
import { resolveImageSrc } from './flowBoardUtils';

type BoardsUpdatedCmd = {
  reason?: unknown;
  board_id?: unknown;
  card_id?: unknown;
  x?: unknown;
  y?: unknown;
  title?: unknown;
  type?: unknown;
  is_locked?: unknown;
  image_path?: unknown;
  link_id?: unknown;
  from_card_id?: unknown;
  to_card_id?: unknown;
  style?: unknown;
  color?: unknown;
};

export const useFlowBoardBoardsUpdatedSocket = (params: {
  numericBoardId: number;
  isAuth: boolean;
  canEditCards: boolean;
  getNodeDragHandleSelector: (nodeType: FlowNodeType) => string;
  defaultLinkStyle: ApiLinkStyle;
  defaultLinkColor: string;
  suppressSocketReloadByCardIdRef: React.MutableRefObject<Map<string, number>>;
  setNodes: React.Dispatch<React.SetStateAction<RFNode<FlowNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  setReloadSeq: React.Dispatch<React.SetStateAction<number>>;
  addEdgeFromLink: (link: ApiCardLink) => void;
}) => {
  const {
    numericBoardId,
    isAuth,
    canEditCards,
    getNodeDragHandleSelector,
    defaultLinkStyle,
    defaultLinkColor,
    suppressSocketReloadByCardIdRef,
    setNodes,
    setEdges,
    setReloadSeq,
    addEdgeFromLink,
  } = params;

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    if (!isAuth) return;

    const unsubscribe = connectSocket({
      onBoardsUpdate: (data) => {
        const cmd = data as BoardsUpdatedCmd;
        const boardIdRaw = cmd?.board_id;
        const boardIdParsed = typeof boardIdRaw === 'number' ? boardIdRaw : Number(boardIdRaw);
        if (!Number.isFinite(boardIdParsed) || boardIdParsed !== numericBoardId) return;

        const reason = typeof cmd?.reason === 'string' ? cmd.reason : '';

        if (reason === 'card_deleted') {
          const cardIdRaw = cmd?.card_id;
          const cardId = typeof cardIdRaw === 'number' ? String(cardIdRaw) : String(cardIdRaw || '');
          if (!cardId) return;
          setNodes((prev) => prev.filter((n) => String(n.id) !== cardId));
          setEdges((prev) => prev.filter((e) => String(e.source) !== cardId && String(e.target) !== cardId));
          return;
        }

        if (reason === 'card_moved') {
          const cardIdRaw = cmd?.card_id;
          const cardId = typeof cardIdRaw === 'number' ? String(cardIdRaw) : String(cardIdRaw || '');
          const x = Number(cmd?.x);
          const y = Number(cmd?.y);
          if (!cardId || !Number.isFinite(x) || !Number.isFinite(y)) return;
          setNodes((prev) => prev.map((n) => (String(n.id) === cardId ? { ...n, position: { x, y } } : n)));
          return;
        }

        if (reason === 'card_updated') {
          const cardIdRaw = cmd?.card_id;
          const cardId = typeof cardIdRaw === 'number' ? String(cardIdRaw) : String(cardIdRaw || '');

          if (cardId) {
            const patchTitle = typeof cmd?.title === 'string' ? cmd.title : undefined;
            const patchTypeRaw = typeof cmd?.type === 'string' ? cmd.type : undefined;
            const patchLockedRaw = cmd?.is_locked;
            const patchLocked =
              typeof patchLockedRaw === 'number'
                ? Boolean(patchLockedRaw)
                : typeof patchLockedRaw === 'boolean'
                  ? patchLockedRaw
                  : undefined;
            const patchX = Number(cmd?.x);
            const patchY = Number(cmd?.y);
            const hasXY = Number.isFinite(patchX) && Number.isFinite(patchY);
            const patchImagePath =
              typeof cmd?.image_path === 'string' || cmd?.image_path === null ? (cmd.image_path as string | null) : undefined;

            const patchType: FlowNodeType | undefined =
              patchTypeRaw === 'diamond' ? 'rhombus' : patchTypeRaw === 'circle' || patchTypeRaw === 'rectangle' ? patchTypeRaw : undefined;

            const hasAnyPatch =
              patchTitle !== undefined ||
              patchType !== undefined ||
              patchLocked !== undefined ||
              hasXY ||
              patchImagePath !== undefined;

            if (hasAnyPatch) {
              setNodes((prev) =>
                prev.map((n) => {
                  if (String(n.id) !== cardId) return n;

                  const nextType = patchType ?? (n.type as FlowNodeType);
                  const nextPos = hasXY ? { x: patchX, y: patchY } : n.position;
                  const nextTitle = patchTitle ?? n.data.title;
                  const nextLocked = patchLocked ?? n.data.isLocked;
                  const nextDragHandle = getNodeDragHandleSelector(nextType);

                  const nextImageSrc = patchImagePath === undefined ? n.data.imageSrc : resolveImageSrc(patchImagePath);
                  const nextImageLoaded = nextImageSrc === n.data.imageSrc ? Boolean(n.data.imageLoaded) : !nextImageSrc;

                  return {
                    ...n,
                    type: nextType,
                    dragHandle: nextDragHandle,
                    position: nextPos,
                    draggable: canEditCards && !nextLocked,
                    data: { ...n.data, title: nextTitle, isLocked: nextLocked, imageSrc: nextImageSrc, imageLoaded: nextImageLoaded }
                  };
                })
              );
              return;
            }
          }

          const until = suppressSocketReloadByCardIdRef.current.get(cardId);
          if (cardId && until && until > Date.now()) return;
          if (cardId && until) suppressSocketReloadByCardIdRef.current.delete(cardId);
        }

        if (reason === 'card_created') {
          const cardIdRaw = cmd?.card_id;
          const cardId = typeof cardIdRaw === 'number' ? String(cardIdRaw) : String(cardIdRaw || '');
          const until = cardId ? suppressSocketReloadByCardIdRef.current.get(cardId) : undefined;
          if (cardId && until && until > Date.now()) return;
          if (cardId && until) suppressSocketReloadByCardIdRef.current.delete(cardId);
        }

        if (reason === 'card_created' || reason === 'card_updated' || reason === 'cards_changed') {
          setReloadSeq((v) => v + 1);
        }

        if (reason === 'link_created') {
          const linkIdRaw = cmd?.link_id;
          const fromRaw = cmd?.from_card_id;
          const toRaw = cmd?.to_card_id;
          const styleRaw = cmd?.style;
          const colorRaw = cmd?.color;
          const link_id = typeof linkIdRaw === 'number' ? linkIdRaw : Number(linkIdRaw);
          const from_card_id = typeof fromRaw === 'number' ? fromRaw : Number(fromRaw);
          const to_card_id = typeof toRaw === 'number' ? toRaw : Number(toRaw);
          const style = styleRaw === 'arrow' || styleRaw === 'line' ? (styleRaw as ApiLinkStyle) : defaultLinkStyle;
          const color = typeof colorRaw === 'string' ? colorRaw : defaultLinkColor;

          if (!Number.isFinite(link_id) || !Number.isFinite(from_card_id) || !Number.isFinite(to_card_id)) return;
          addEdgeFromLink({ id: link_id, board_id: numericBoardId, from_card_id, to_card_id, style, color, created_at: '' });
          return;
        }

        if (reason === 'link_deleted') {
          const linkIdRaw = cmd?.link_id;
          const link_id = typeof linkIdRaw === 'number' ? linkIdRaw : Number(linkIdRaw);
          if (!Number.isFinite(link_id)) return;
          const id = `link-${link_id}`;
          setEdges((prev) => prev.filter((e) => String(e.id) !== id));
          return;
        }
      },
    });

    return () => unsubscribe?.();
  }, [
    addEdgeFromLink,
    canEditCards,
    defaultLinkColor,
    defaultLinkStyle,
    getNodeDragHandleSelector,
    isAuth,
    numericBoardId,
    setEdges,
    setNodes,
    setReloadSeq,
    suppressSocketReloadByCardIdRef,
  ]);
};

