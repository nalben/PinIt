import { useEffect } from 'react';
import type React from 'react';
import type { Edge, Node as RFNode } from 'reactflow';
import { connectSocket } from '@/services/socketManager';
import type { ApiBoardDrawing, ApiCardLink, ApiLinkStyle, FlowNodeData, FlowNodeType } from './flowBoardModel';
import { buildEdgeFromLink, resolveImageSrc } from './flowBoardUtils';
import { parseLinkFromBoardsUpdated } from '@/components/flowboard/utils/linkSocketPayload';

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
  color?: unknown;
  link_id?: unknown;
  from_card_id?: unknown;
  to_card_id?: unknown;
  style?: unknown;
  label?: unknown;
  is_label_visible?: unknown;
  user_id?: unknown;
  drawing_id?: unknown;
  stroke_width?: unknown;
  path_d?: unknown;
  client_draw_id?: unknown;
  sort_order?: unknown;
  group_key?: unknown;
  drawings?: unknown;
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
  upsertDrawingFromSocket: (drawing: ApiBoardDrawing, clientDrawId: string | null) => void;
  removeDrawingFromSocket: (drawingId: number) => void;
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
    upsertDrawingFromSocket,
    removeDrawingFromSocket,
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
            const patchColor =
              typeof cmd?.color === 'string' || cmd?.color === null ? (cmd.color as string | null) : undefined;

            const patchType: FlowNodeType | undefined =
              patchTypeRaw === 'diamond' ? 'rhombus' : patchTypeRaw === 'circle' || patchTypeRaw === 'rectangle' ? patchTypeRaw : undefined;

            const hasAnyPatch =
              patchTitle !== undefined ||
              patchType !== undefined ||
              patchLocked !== undefined ||
              hasXY ||
              patchImagePath !== undefined ||
              patchColor !== undefined;

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
                  const nextColor = patchColor === undefined ? n.data.color : patchColor;

                  return {
                    ...n,
                    type: nextType,
                    dragHandle: nextDragHandle,
                    position: nextPos,
                    draggable: canEditCards && !nextLocked,
                    data: {
                      ...n.data,
                      title: nextTitle,
                      isLocked: nextLocked,
                      imageSrc: nextImageSrc,
                      imageLoaded: nextImageLoaded,
                      color: nextColor,
                    }
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
          const link = parseLinkFromBoardsUpdated({
            cmd,
            numericBoardId,
            defaultLinkStyle,
            defaultLinkColor,
          });
          if (!link) return;
          addEdgeFromLink(link);
          return;
        }

        if (reason === 'link_updated') {
          const link = parseLinkFromBoardsUpdated({
            cmd,
            numericBoardId,
            defaultLinkStyle,
            defaultLinkColor,
          });
          if (!link) return;
          const edgeId = `link-${link.id}`;
          setEdges((prev) =>
            prev.map((e) => {
              if (String(e.id) !== edgeId) return e;
              const rebuilt = buildEdgeFromLink(link);
              return { ...rebuilt, selected: (e as unknown as { selected?: boolean }).selected };
            })
          );
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

        if (reason === 'drawing_created' || reason === 'drawing_updated') {
          const drawingIdRaw = cmd?.drawing_id;
          const drawingId = typeof drawingIdRaw === 'number' ? drawingIdRaw : Number(drawingIdRaw);
          const authorIdRaw = cmd?.user_id;
          const user_id = typeof authorIdRaw === 'number' ? authorIdRaw : Number(authorIdRaw);
          const color = typeof cmd?.color === 'string' ? cmd.color : null;
          const stroke_width = Number(cmd?.stroke_width);
          const path_d = typeof cmd?.path_d === 'string' ? cmd.path_d : null;
          const client_draw_id = typeof cmd?.client_draw_id === 'string' ? cmd.client_draw_id : null;
          const sort_order = Number(cmd?.sort_order);
          const group_key = typeof cmd?.group_key === 'string' && cmd.group_key.trim() ? cmd.group_key.trim().toLowerCase() : null;

          if (!Number.isFinite(drawingId) || drawingId <= 0) return;
          if (!Number.isFinite(user_id) || user_id <= 0) return;
          if (!color || !Number.isFinite(stroke_width) || !path_d || !Number.isFinite(sort_order) || sort_order <= 0) return;

          upsertDrawingFromSocket(
            {
              id: drawingId,
              board_id: numericBoardId,
              user_id,
              color,
              stroke_width,
              path_d,
              sort_order,
              group_key,
              created_at: '',
              client_draw_id,
            },
            client_draw_id
          );
          return;
        }

        if (reason === 'drawings_updated') {
          const drawings = Array.isArray(cmd?.drawings) ? cmd.drawings : null;
          if (!drawings?.length) return;

          drawings.forEach((item) => {
            const drawingId = Number((item as { id?: unknown })?.id);
            const user_id = Number((item as { user_id?: unknown })?.user_id);
            const color = typeof (item as { color?: unknown })?.color === 'string' ? String((item as { color?: unknown }).color) : null;
            const stroke_width = Number((item as { stroke_width?: unknown })?.stroke_width);
            const path_d = typeof (item as { path_d?: unknown })?.path_d === 'string' ? String((item as { path_d?: unknown }).path_d) : null;
            const sort_order = Number((item as { sort_order?: unknown })?.sort_order);
            const group_key =
              typeof (item as { group_key?: unknown })?.group_key === 'string' && String((item as { group_key?: unknown }).group_key).trim()
                ? String((item as { group_key?: unknown }).group_key).trim().toLowerCase()
                : null;

            if (!Number.isFinite(drawingId) || drawingId <= 0) return;
            if (!Number.isFinite(user_id) || user_id <= 0) return;
            if (!color || !Number.isFinite(stroke_width) || !path_d || !Number.isFinite(sort_order) || sort_order <= 0) return;

            upsertDrawingFromSocket(
              {
                id: drawingId,
                board_id: numericBoardId,
                user_id,
                color,
                stroke_width,
                path_d,
                sort_order,
                group_key,
                created_at: '',
              },
              null
            );
          });
          return;
        }

        if (reason === 'drawing_deleted') {
          const drawingIdRaw = cmd?.drawing_id;
          const drawingId = typeof drawingIdRaw === 'number' ? drawingIdRaw : Number(drawingIdRaw);
          if (!Number.isFinite(drawingId) || drawingId <= 0) return;
          removeDrawingFromSocket(drawingId);
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
    removeDrawingFromSocket,
    upsertDrawingFromSocket,
  ]);
};
