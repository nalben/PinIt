import React, { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Edge,
  MiniMap,
  MiniMapNodeProps,
  Node as RFNode,
  NodeProps,
  SelectionMode,
  applyNodeChanges,
  ReactFlowInstance,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import LockClose from '@/assets/icons/monochrome/lock_close.svg';
import LockOpen from '@/assets/icons/monochrome/lock_open.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import boardClasses from '@/pages/board/Board.module.scss';
import { FlowCardShape, useUIStore } from '@/store/uiStore';
import { connectSocket } from '@/services/socketManager';
import { useAuthStore } from '@/store/authStore';

type FlowNodeType = FlowCardShape;
type FlowNodeData = { title: string; imageSrc: string | null; isLocked: boolean; imageLoaded?: boolean };

export type FlowBoardHandle = {
  createDraftNodeAtCenter: () => void;
};

type ApiCardType = 'circle' | 'rectangle' | 'diamond';
type ApiCard = {
  id: number;
  board_id: number;
  type: ApiCardType;
  title: string | null;
  image_path: string | null;
  is_locked: number | boolean | null;
  x: number;
  y: number;
  created_at: string;
};

const MAX_CARD_IMAGE_SIZE_MB = 5;
const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;

const MiniMapNode: React.FC<MiniMapNodeProps> = (props) => {
  const { id, x, y, width, height, className, color, strokeColor, strokeWidth, shapeRendering, style, onClick } = props;

  const commonProps = {
    className,
    style,
    fill: color,
    stroke: strokeColor,
    strokeWidth,
    shapeRendering,
    onClick: onClick ? (e: React.MouseEvent<SVGElement>) => onClick(e, id) : undefined,
  };

  if (className.includes('minimap_circle')) {
    const r = Math.min(width, height) / 2;
    return <circle {...commonProps} cx={x + width / 2} cy={y + height / 2} r={r} />;
  }

  if (className.includes('minimap_rhombus')) {
    const points = [
      `${x + width / 2},${y}`,
      `${x + width},${y + height / 2}`,
      `${x + width / 2},${y + height}`,
      `${x},${y + height / 2}`,
    ].join(' ');
    return <polygon {...commonProps} points={points} />;
  }

  return <rect {...commonProps} x={x} y={y} width={width} height={height} rx={props.borderRadius} ry={props.borderRadius} />;
};

const NODE_SIZES: Record<FlowNodeType, { width: number; height: number }> = {
  rectangle: { width: 240, height: 80 },
  rhombus: { width: 120, height: 120 },
  circle: { width: 120, height: 120 }
};

const RectangleNode: React.FC<NodeProps<FlowNodeData>> = ({ data }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  return (
    <div
      className={classes.node_rectangle}
      style={
        data.imageSrc && data.imageLoaded
          ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      {showSkeleton ? <div className={`${classes.node_image_skeleton} ${classes.node_image_skeleton_rect}`.trim()} aria-hidden="true" /> : null}
      <svg className={classes.flow_hit_svg} viewBox="0 0 240 80" aria-hidden="true">
        <rect className={classes.flow_drag_handle} x="0" y="0" width="240" height="80" rx="10" ry="10" />
      </svg>
      {data.isLocked ? (
        <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_rectangle}`}>
          <LockClose />
        </div>
      ) : null}
      <div className={`${classes.node_rectangle_title} ${classes.flow_drag_handle}`.trim()}>{data.title}</div>
    </div>
  );
};

const RhombusNode: React.FC<NodeProps<FlowNodeData>> = ({ data }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  return (
    <div className={classes.node_rhombus}>
      <div
        className={classes.rhombus_content}
        style={
          data.imageSrc && data.imageLoaded
            ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {showSkeleton ? <div className={`${classes.node_image_skeleton} ${classes.node_image_skeleton_round}`.trim()} aria-hidden="true" /> : null}
        <svg className={classes.flow_hit_svg} viewBox="0 0 120 120" aria-hidden="true">
          <polygon className={classes.flow_drag_handle} points="60,0 120,60 60,120 0,60" />
        </svg>
      </div>
      {data.isLocked ? (
        <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_rhombus}`}>
          <LockClose />
        </div>
      ) : null}
      <span>{data.title}</span>
    </div>
  );
};

const CircleNode: React.FC<NodeProps<FlowNodeData>> = ({ data }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  return (
    <div className={`${classes.node_circle} ${data.imageSrc && data.imageLoaded ? classes.node_circle_has_image : ''}`.trim()}>
      <div
        className={classes.circle_content}
        style={
          data.imageSrc && data.imageLoaded
            ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      >
        {showSkeleton ? <div className={`${classes.node_image_skeleton} ${classes.node_image_skeleton_round}`.trim()} aria-hidden="true" /> : null}
        <svg className={classes.flow_hit_svg} viewBox="0 0 120 120" aria-hidden="true">
          <circle className={classes.flow_drag_handle} cx="60" cy="60" r="60" />
        </svg>
      </div>
      {data.isLocked ? (
        <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_circle}`}>
          <LockClose />
        </div>
      ) : null}
      <span>{data.title}</span>
    </div>
  );
};

const NODE_TYPES = { rectangle: RectangleNode, rhombus: RhombusNode, circle: CircleNode } as const;

const mapApiTypeToNodeType = (type: ApiCardType): FlowNodeType => {
  if (type === 'diamond') return 'rhombus';
  return type;
};

const resolveImageSrc = (image_path: string | null) => {
  if (!image_path) return null;
  if (image_path.startsWith('/uploads/')) return `${API_URL}${image_path}`;
  return image_path;
};

const FlowBoard = React.forwardRef<FlowBoardHandle, { canEditCards?: boolean }>(({ canEditCards = false }, ref) => {
  const { boardId } = useParams<{ boardId: string }>();
  const numericBoardId = Number(boardId);
  const isAuth = useAuthStore((s) => s.isAuth);
  const hasToken = Boolean(localStorage.getItem('token'));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const suppressClickRef = useRef(false);
  const imagePreloadStartedRef = useRef<Set<string>>(new Set());
  const manualPanRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewport: { x: number; y: number; zoom: number };
    moved: boolean;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number; // viewport (fixed) coordinates
    y: number; // viewport (fixed) coordinates
    anchorX: number;
    anchorY: number;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0
  });
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<RFNode<FlowNodeData>[]>([]);
  const [edges] = useState<Edge[]>([]);
  const draggingNodeIdRef = useRef<string | null>(null);
  const draggingNodeStartPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const flowCardSettingsOpen = useUIStore((s) => s.flowCardSettingsOpen);
  const flowCardSettings = useUIStore((s) => s.flowCardSettings);
  const flowCardSettingsDraft = useUIStore((s) => s.flowCardSettingsDraft);
  const openFlowCardSettings = useUIStore((s) => s.openFlowCardSettings);
  const closeFlowCardSettings = useUIStore((s) => s.closeFlowCardSettings);
  const setFlowCardSettingsDraft = useUIStore((s) => s.setFlowCardSettingsDraft);

  const activeNodeId = flowCardSettingsOpen ? flowCardSettings?.nodeId ?? null : null;
  const isEditing = Boolean(flowCardSettingsOpen && flowCardSettings && flowCardSettingsDraft && activeNodeId);
  const editingStateRef = useRef<{ isEditing: boolean; activeNodeId: string | null }>({ isEditing: false, activeNodeId: null });
  const visualDraftRef = useRef<Omit<NonNullable<typeof flowCardSettingsDraft>, never> | null>(null);
  const [visualEditing, setVisualEditing] = useState(false);
  const visualEditingTimeoutRef = useRef<number | null>(null);

  const getNodeDragHandleSelector = useCallback(
    (nodeType: FlowNodeType) =>
      nodeType === 'rectangle' ? `.${classes.node_rectangle}` : `.${classes.flow_drag_handle}`,
    []
  );

  const cardToNode = useCallback(
    (c: ApiCard): RFNode<FlowNodeData> => {
      const nodeType = mapApiTypeToNodeType(c.type);
      const imageSrc = resolveImageSrc(c.image_path ?? null);
      const imageLoaded = !imageSrc;
      return {
        id: String(c.id),
        type: nodeType,
        className: 'flow_node_wrapper',
        dragHandle: getNodeDragHandleSelector(nodeType),
        position: { x: Number(c.x) || 0, y: Number(c.y) || 0 },
        draggable: canEditCards && !Boolean(c.is_locked),
        data: {
          title: (c.title ?? 'title').trim() || 'title',
          imageSrc,
          isLocked: Boolean(c.is_locked),
          imageLoaded,
        },
      };
    },
    [canEditCards, getNodeDragHandleSelector]
  );

  const mergeLoadedNodes = useCallback((prev: RFNode<FlowNodeData>[], loaded: RFNode<FlowNodeData>[]) => {
    const editing = editingStateRef.current;
    const draft = prev.filter((n) => String(n.id).startsWith('draft-'));
    const draftIds = new Set(draft.map((n) => String(n.id)));
    const preserveActive =
      editing.isEditing && editing.activeNodeId && !String(editing.activeNodeId).startsWith('draft-')
        ? prev.find((n) => String(n.id) === String(editing.activeNodeId)) ?? null
        : null;

    const preserveIds = new Set<string>(draftIds);
    if (preserveActive) preserveIds.add(String(preserveActive.id));

    return [
      ...draft,
      ...(preserveActive && !draftIds.has(String(preserveActive.id)) ? [preserveActive] : []),
      ...loaded.filter((n) => !preserveIds.has(String(n.id))),
    ];
  }, []);

  useEffect(() => {
    editingStateRef.current = { isEditing, activeNodeId };
  }, [activeNodeId, isEditing]);

  useEffect(() => {
    if (isEditing && flowCardSettingsDraft) {
      visualDraftRef.current = flowCardSettingsDraft;
      setVisualEditing(true);
      if (visualEditingTimeoutRef.current) {
        window.clearTimeout(visualEditingTimeoutRef.current);
        visualEditingTimeoutRef.current = null;
      }
      return;
    }

    if (!visualEditing) return;
    if (visualEditingTimeoutRef.current) window.clearTimeout(visualEditingTimeoutRef.current);
    visualEditingTimeoutRef.current = window.setTimeout(() => {
      setVisualEditing(false);
      visualEditingTimeoutRef.current = null;
    }, 1000);
    return () => {
      if (visualEditingTimeoutRef.current) {
        window.clearTimeout(visualEditingTimeoutRef.current);
        visualEditingTimeoutRef.current = null;
      }
    };
  }, [flowCardSettingsDraft, isEditing, visualEditing]);

  useEffect(() => {
    if (!isEditing) return;
    if (!activeNodeId) return;
    if (!String(activeNodeId).startsWith('draft-')) return;

    const raf = requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input || input.disabled) return;
      input.focus();
      try {
        input.select();
      } catch {
        // ignore
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeNodeId, isEditing]);

  useEffect(() => {
    setNodes((prev) =>
      prev
        .filter((n) => (canEditCards ? true : !String(n.id).startsWith('draft-')))
        .map((n) => {
          const isDraft = String(n.id).startsWith('draft-');
          const locked = Boolean(n.data?.isLocked);
          return { ...n, draggable: isDraft ? canEditCards : canEditCards && !locked };
        })
    );
  }, [canEditCards]);

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    if (!isAuth) return;

    const unsubscribe = connectSocket({
      onBoardsUpdate: (data) => {
        const cmd = data as {
          reason?: unknown;
          board_id?: unknown;
          card_id?: unknown;
          x?: unknown;
          y?: unknown;
          title?: unknown;
          type?: unknown;
          is_locked?: unknown;
          image_path?: unknown;
        };
        const boardIdRaw = cmd?.board_id;
        const boardIdParsed = typeof boardIdRaw === 'number' ? boardIdRaw : Number(boardIdRaw);
        if (!Number.isFinite(boardIdParsed) || boardIdParsed !== numericBoardId) return;

        const reason = typeof cmd?.reason === 'string' ? cmd.reason : '';

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

                  const nextImageSrc =
                    patchImagePath === undefined
                      ? n.data.imageSrc
                      : !patchImagePath
                        ? null
                        : patchImagePath.startsWith('/uploads/')
                          ? `${API_URL}${patchImagePath}`
                          : patchImagePath;
                  const nextImageLoaded =
                    nextImageSrc === n.data.imageSrc ? Boolean(n.data.imageLoaded) : !nextImageSrc;

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

        if (reason === 'card_created' || reason === 'card_updated' || reason === 'card_deleted' || reason === 'cards_changed') {
          setReloadSeq((v) => v + 1);
        }
      },
    });

    return () => unsubscribe?.();
  }, [canEditCards, isAuth, numericBoardId]);

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    if (isAuth) return;

    const id = window.setInterval(() => {
      setReloadSeq((v) => v + 1);
    }, 10_000);

    return () => window.clearInterval(id);
  }, [isAuth, numericBoardId]);

  const visualDraft = isEditing ? flowCardSettingsDraft : visualDraftRef.current;
  const displayType: FlowNodeType = visualDraft?.type ?? 'rectangle';
  const displayTitle = visualDraft?.title ?? '';
  const displayLocked = Boolean(visualDraft?.isLocked);
  const displayImagePreview = visualDraft?.imageSrc ?? null;

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingObjectUrlRef = useRef<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const showTopAlarm = useUIStore((s) => s.showTopAlarm);
  const suppressSocketReloadByCardIdRef = useRef<Map<string, number>>(new Map());

  const reportError = useCallback(
    (message: string, error?: unknown) => {
      showTopAlarm(message);
      if (process.env.NODE_ENV !== 'production' && error) console.error(error);
    },
    [showTopAlarm]
  );

  const onNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  useEffect(() => {
    if (canEditCards) return;
    closeContextMenu();
  }, [canEditCards, closeContextMenu]);

  const handleMiniMapClick = useCallback(
    (event: React.MouseEvent, position: { x: number; y: number }) => {
      if (!reactFlow) return;
      event.preventDefault();
      event.stopPropagation();
      const viewport = reactFlow.getViewport();
      reactFlow.setCenter(position.x, position.y, { zoom: viewport.zoom, duration: 200 });
    },
    [reactFlow]
  );

  const persistCardPosition = useCallback(
    async (cardId: string, x: number, y: number) => {
      if (!canEditCards) return;
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
      if (!cardId || String(cardId).startsWith('draft-')) return;
      if (!hasToken) return;

      try {
        await axiosInstance.patch(`/api/boards/${numericBoardId}/cards/${cardId}/position`, { x, y });
      } catch (e) {
        // ignore (no access / offline)
      }
    },
    [canEditCards, hasToken, numericBoardId]
  );

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        const url = hasToken
          ? `/api/boards/${numericBoardId}/cards`
          : `/api/boards/public/${numericBoardId}/cards`;

        const res = await axiosInstance.get<ApiCard[]>(url);
        const cards = Array.isArray(res.data) ? res.data : [];
        const nextNodes = cards.map(cardToNode);

        if (cancelled) return;
        setNodes((prev) => mergeLoadedNodes(prev, nextNodes));
      } catch (e) {
        if (!hasToken) return;
        try {
          const res = await axiosInstance.get<ApiCard[]>(`/api/boards/public/${numericBoardId}/cards`);
          const cards = Array.isArray(res.data) ? res.data : [];
          const nextNodes = cards.map(cardToNode);
          if (cancelled) return;
          setNodes((prev) => mergeLoadedNodes(prev, nextNodes));
        } catch {
          // ignore
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [canEditCards, cardToNode, hasToken, isAuth, mergeLoadedNodes, numericBoardId, reloadSeq]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };

    const onResize = () => closeContextMenu();

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) return;
      closeContextMenu();
    };

    const onContextMenuCapture = (e: MouseEvent) => {
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const containerEl = containerRef.current;
      if (containerEl && target && containerEl.contains(target)) return;

      closeContextMenu();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('contextmenu', onContextMenuCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('contextmenu', onContextMenuCapture, true);
    };
  }, [closeContextMenu, contextMenu.isOpen]);

  const getContainerScale = useCallback(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return { scaleX: 1, scaleY: 1, rect: null as DOMRect | null };
    const rect = containerEl.getBoundingClientRect();
    const scaleX = containerEl.offsetWidth ? rect.width / containerEl.offsetWidth : 1;
    const scaleY = containerEl.offsetHeight ? rect.height / containerEl.offsetHeight : 1;
    return { scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1, scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1, rect };
  }, []);

  const clampToViewport = useCallback((x: number, y: number, menuWidth: number, menuHeight: number) => {
    const margin = 16;
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;

    let nextX = x;
    let nextY = y;

    const maxX = viewportWidth - menuWidth - margin;
    const maxY = viewportHeight - menuHeight - margin;

    if (nextX > maxX) nextX = maxX;
    if (nextY > maxY) nextY = maxY;
    if (nextX < margin) nextX = margin;
    if (nextY < margin) nextY = margin;

    return { x: nextX, y: nextY };
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu.isOpen) return;
    const el = contextMenuRef.current;
    if (!el) return;

    const menuWidth = el.offsetWidth;
    const menuHeight = el.offsetHeight;
    if (!menuWidth || !menuHeight) return;

    setContextMenu((prev) => {
      if (!prev.isOpen) return prev;
      const { x, y } = clampToViewport(prev.x, prev.y, menuWidth, menuHeight);
      if (x === prev.x && y === prev.y) return prev;
      return { ...prev, x, y };
    });
  }, [clampToViewport, contextMenu.isOpen]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const el = contextMenuRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver(() => {
      const menuWidth = el.offsetWidth;
      const menuHeight = el.offsetHeight;
      if (!menuWidth || !menuHeight) return;

      setContextMenu((prev) => {
        if (!prev.isOpen) return prev;
        const { x, y } = clampToViewport(prev.x, prev.y, menuWidth, menuHeight);
        if (x === prev.x && y === prev.y) return prev;
        return { ...prev, x, y };
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [clampToViewport, contextMenu.isOpen]);

  const openContextMenuAt = useCallback((clientX: number, clientY: number) => {
    const { scaleX, scaleY, rect } = getContainerScale();
    const anchorX = rect ? (clientX - rect.left) / scaleX : clientX;
    const anchorY = rect ? (clientY - rect.top) / scaleY : clientY;
    setContextMenu({ isOpen: true, x: clientX, y: clientY, anchorX, anchorY });
  }, [getContainerScale]);

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEditCards) {
      closeContextMenu();
      return;
    }
    openContextMenuAt(e.clientX, e.clientY);
  };

  const cancelLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  const handlePointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!reactFlow) return;
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) return;

    const targetEl = e.target as Element | null;
    const panelEl = createPanelRef.current;
    const menuEl = contextMenuRef.current;
    if (panelEl && targetEl && panelEl.contains(targetEl)) return;
    if (menuEl && targetEl && menuEl.contains(targetEl)) return;

    const nodeEl = targetEl?.closest('.react-flow__node.flow_node_wrapper');
    if (!nodeEl) return;
    if (targetEl?.closest(`.${classes.node_rectangle}`)) return;
    if (targetEl?.closest(`.${classes.flow_drag_handle}`)) return;

    manualPanRef.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      viewport: reactFlow.getViewport(),
      moved: false,
    };
    containerRef.current?.setPointerCapture(e.pointerId);

    closeContextMenu();
    e.preventDefault();
    e.stopPropagation();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    if (!e.isPrimary) return;
    if (!canEditCards) return;

    const target = e.target as globalThis.Node | null;
    const panelEl = createPanelRef.current;
    const menuEl = contextMenuRef.current;
    if (panelEl && target && panelEl.contains(target)) return;
    if (menuEl && target && menuEl.contains(target)) return;

    cancelLongPress();

    longPressStartRef.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    longPressTimeoutRef.current = window.setTimeout(() => {
      const start = longPressStartRef.current;
      if (!start) return;
      longPressTimeoutRef.current = null;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 1000);
      openContextMenuAt(start.clientX, start.clientY);
    }, 450);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = manualPanRef.current;
    if (pan && e.pointerId === pan.pointerId) {
      const dx = e.clientX - pan.clientX;
      const dy = e.clientY - pan.clientY;
      if (!pan.moved && Math.hypot(dx, dy) > 2) pan.moved = true;
      reactFlow?.setViewport(
        { x: pan.viewport.x + dx, y: pan.viewport.y + dy, zoom: pan.viewport.zoom },
        { duration: 0 }
      );
      e.preventDefault();
      return;
    }

    const start = longPressStartRef.current;
    if (!start) return;
    if (e.pointerId !== start.pointerId) return;
    if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 10) cancelLongPress();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = manualPanRef.current;
    if (pan && e.pointerId === pan.pointerId) {
      manualPanRef.current = null;
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      if (!pan.moved) {
        closeContextMenu();
        if (flowCardSettingsOpen) cancelCardSettings();
      }

      e.preventDefault();
      return;
    }

    const start = longPressStartRef.current;
    if (!start) return;
    if (e.pointerId !== start.pointerId) return;
    cancelLongPress();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = manualPanRef.current;
    if (pan && e.pointerId === pan.pointerId) {
      manualPanRef.current = null;
      try {
        containerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      e.preventDefault();
    }
    cancelLongPress();
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;

    const target = e.target as globalThis.Node | null;
    const menuEl = contextMenuRef.current;
    const panelEl = createPanelRef.current;
    if (menuEl && target && menuEl.contains(target)) return;
    if (panelEl && target && panelEl.contains(target)) return;

    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!contextMenu.isOpen) return;
    if (e.button !== 0) return;
    const target = e.target as globalThis.Node | null;
    const menuEl = contextMenuRef.current;
    if (menuEl && target && menuEl.contains(target)) return;
    closeContextMenu();
  };

  const applyPreviewToNode = useCallback(
    (nodeId: string, patch: Partial<{ type: FlowNodeType; title: string; isLocked: boolean; imageSrc: string | null }>) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (String(n.id) !== String(nodeId)) return n;

          const prevType = n.type as FlowNodeType;
          const nextType = patch.type ?? prevType;
          const nextDragHandle = getNodeDragHandleSelector(nextType);
          const position =
            nextType === prevType
              ? n.position
              : {
                  x: n.position.x + (NODE_SIZES[prevType].width - NODE_SIZES[nextType].width) / 2,
                  y: n.position.y + (NODE_SIZES[prevType].height - NODE_SIZES[nextType].height) / 2
                };

          const nextTitle = patch.title ?? n.data.title;
          const nextLocked = patch.isLocked ?? n.data.isLocked;
          const nextImageSrc = patch.imageSrc !== undefined ? patch.imageSrc : n.data.imageSrc;
          const nextImageLoaded = nextImageSrc === n.data.imageSrc ? Boolean(n.data.imageLoaded) : !nextImageSrc;

          return {
            ...n,
            type: nextType,
            dragHandle: nextDragHandle,
            position,
            draggable: canEditCards && !nextLocked,
            data: { ...n.data, title: nextTitle, isLocked: nextLocked, imageSrc: nextImageSrc, imageLoaded: nextImageLoaded }
          };
        })
      );
    },
    [canEditCards]
  );

  useEffect(() => {
    nodes.forEach((n) => {
      const src = n.data.imageSrc;
      if (!src) return;
      if (n.data.imageLoaded) return;
      const key = `${String(n.id)}|${src}`;
      if (imagePreloadStartedRef.current.has(key)) return;
      imagePreloadStartedRef.current.add(key);

      const img = new Image();
      img.onload = () => {
        setNodes((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(n.id)) return p;
            if (p.data.imageSrc !== src) return p;
            if (p.data.imageLoaded) return p;
            return { ...p, data: { ...p.data, imageLoaded: true } };
          })
        );
      };
      img.onerror = () => {
        setNodes((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(n.id)) return p;
            if (p.data.imageSrc !== src) return p;
            if (p.data.imageLoaded) return p;
            return { ...p, data: { ...p.data, imageLoaded: true } };
          })
        );
      };
      img.src = src;
    });
  }, [nodes]);

  const clearPendingImage = useCallback(() => {
    if (pendingObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(pendingObjectUrlRef.current);
      } catch {
        // ignore
      }
      pendingObjectUrlRef.current = null;
    }
    setPendingImageFile(null);
  }, []);

  const openSettingsForNode = useCallback(
    (node: RFNode<FlowNodeData>) => {
      if (!canEditCards) return;
      clearPendingImage();
      openFlowCardSettings({
        nodeId: String(node.id),
        type: node.type as FlowNodeType,
        title: node.data.title,
        isLocked: Boolean(node.data.isLocked),
        imageSrc: node.data.imageSrc,
      });
    },
    [canEditCards, clearPendingImage, openFlowCardSettings]
  );

  const cancelCardSettings = useCallback(() => {
    if (!flowCardSettings) {
      clearPendingImage();
      closeFlowCardSettings();
      return;
    }

    const nodeId = flowCardSettings.nodeId;
    const isDraft = String(nodeId).startsWith('draft-');

    if (isDraft) {
      setNodes((prev) => prev.filter((n) => String(n.id) !== String(nodeId)));
    } else {
      applyPreviewToNode(nodeId, {
        type: flowCardSettings.type,
        title: flowCardSettings.title,
        isLocked: flowCardSettings.isLocked,
        imageSrc: flowCardSettings.imageSrc
      });
    }

    clearPendingImage();
    closeFlowCardSettings();
  }, [applyPreviewToNode, clearPendingImage, closeFlowCardSettings, flowCardSettings]);

  useEffect(() => {
    if (canEditCards) return;
    if (!flowCardSettingsOpen) return;
    cancelCardSettings();
  }, [canEditCards, cancelCardSettings, flowCardSettingsOpen]);

  useEffect(() => {
    if (!flowCardSettingsOpen || !activeNodeId) return;
    let activePointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let moved = false;
    const moveThreshold = 6;

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      const target = e.target as globalThis.Node | null;
      const panelEl = createPanelRef.current;
      if (panelEl && target && panelEl.contains(target)) return;
      const targetEl = target instanceof HTMLElement ? target : null;
      if (targetEl?.closest?.('.react-flow__node')) return;

      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      moved = false;
    };

    const onPointerMoveCapture = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      if (moved) return;
      if (Math.abs(e.clientX - startX) > moveThreshold || Math.abs(e.clientY - startY) > moveThreshold) {
        moved = true;
      }
    };

    const onPointerUpCapture = (e: PointerEvent) => {
      if (activePointerId === null || e.pointerId !== activePointerId) return;
      activePointerId = null;

      const target = e.target as globalThis.Node | null;
      const panelEl = createPanelRef.current;
      if (panelEl && target && panelEl.contains(target)) return;
      const targetEl = target instanceof HTMLElement ? target : null;
      if (targetEl?.closest?.('.react-flow__node')) return;

      if (!moved) cancelCardSettings();
    };

    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('pointermove', onPointerMoveCapture, true);
    window.addEventListener('pointerup', onPointerUpCapture, true);
    window.addEventListener('pointercancel', onPointerUpCapture, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('pointermove', onPointerMoveCapture, true);
      window.removeEventListener('pointerup', onPointerUpCapture, true);
      window.removeEventListener('pointercancel', onPointerUpCapture, true);
    };
  }, [activeNodeId, cancelCardSettings, flowCardSettingsOpen]);

  const createDraftNodeAt = useCallback((anchorX: number, anchorY: number) => {
    if (!canEditCards) return;
    const hasDraftNode = nodes.some((n) => String(n.id).startsWith('draft-'));
    if (hasDraftNode) {
      closeContextMenu();
      return;
    }
    if (!reactFlow) return;

    const startType: FlowNodeType = 'rectangle';
    const startTitle = 'title';
    const size = NODE_SIZES[startType];
    const id = `draft-${Date.now()}`;
    const isFirstNodeOnBoard = nodes.length === 0;
    const flowPosition = reactFlow.project({ x: anchorX, y: anchorY });
    const position = isFirstNodeOnBoard
      ? { x: 0, y: 0 }
      : { x: flowPosition.x - size.width / 2, y: flowPosition.y - size.height / 2 };

    const draftNode: RFNode<FlowNodeData> = {
      id,
      type: startType,
      className: 'flow_node_wrapper',
      dragHandle: `.${classes.node_rectangle}`,
      position,
      data: { title: startTitle, imageSrc: null, isLocked: false },
      draggable: canEditCards,
      selectable: true
    };

    setNodes((prev) => [...prev, draftNode]);
    openSettingsForNode(draftNode);
    closeContextMenu();

    if (isFirstNodeOnBoard) {
      const viewport = reactFlow.getViewport();
      const zoom = viewport.zoom;
      reactFlow.setViewport(
        {
          x: anchorX - (size.width / 2) * zoom,
          y: anchorY - (size.height / 2) * zoom,
          zoom,
        },
        { duration: 0 }
      );
    }
  }, [canEditCards, closeContextMenu, nodes, openSettingsForNode, reactFlow]);

  const createDraftNode = useCallback(() => {
    createDraftNodeAt(contextMenu.anchorX, contextMenu.anchorY);
  }, [contextMenu.anchorX, contextMenu.anchorY, createDraftNodeAt]);

  useImperativeHandle(
    ref,
    () => ({
      createDraftNodeAtCenter: () => {
        if (!canEditCards) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        createDraftNodeAt(rect.width / 2, rect.height / 2);
      },
    }),
    [canEditCards, createDraftNodeAt]
  );

  const setDraftTitleLive = (title: string) => {
    if (!activeNodeId) return;
    const next = String(title ?? '').slice(0, 50);
    setFlowCardSettingsDraft({ title: next });
    applyPreviewToNode(activeNodeId, { title: next });
  };

  const setDraftTypeLive = (type: FlowNodeType) => {
    if (!activeNodeId) return;
    setFlowCardSettingsDraft({ type });
    applyPreviewToNode(activeNodeId, { type });
  };

  const toggleLockLive = () => {
    if (!activeNodeId || !flowCardSettingsDraft) return;
    const next = !flowCardSettingsDraft.isLocked;
    setFlowCardSettingsDraft({ isLocked: next });
    applyPreviewToNode(activeNodeId, { isLocked: next });
  };

  const handleImageSelected = (file: File | null) => {
    if (!activeNodeId) return;
    if (!file) return;
    if (file.size > MAX_CARD_IMAGE_SIZE_BYTES) {
      showTopAlarm(`Вес слишком большой — выберите изображение весом до ${MAX_CARD_IMAGE_SIZE_MB} МБ.`);
      return;
    }

    clearPendingImage();
    const preview = URL.createObjectURL(file);
    pendingObjectUrlRef.current = preview;
    setPendingImageFile(file);
    setFlowCardSettingsDraft({ imageSrc: preview });
    applyPreviewToNode(activeNodeId, { imageSrc: preview });
  };

  const removeImageLive = () => {
    if (!activeNodeId) return;
    clearPendingImage();
    setFlowCardSettingsDraft({ imageSrc: null });
    applyPreviewToNode(activeNodeId, { imageSrc: null });
  };

  const deleteActive = async () => {
    if (!canEditCards) return;
    if (!flowCardSettings || !Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    const nodeId = flowCardSettings.nodeId;
    const isDraft = String(nodeId).startsWith('draft-');

    if (isDraft) {
      setDeleteConfirmOpen(false);
      cancelCardSettings();
      return;
    }

    if (!hasToken) return;

    try {
      await axiosInstance.delete(`/api/boards/${numericBoardId}/cards/${nodeId}`);
      setNodes((prev) => prev.filter((n) => String(n.id) !== String(nodeId)));
      setDeleteConfirmOpen(false);
      closeFlowCardSettings();
    } catch (e) {
      reportError('Не удалось удалить карточку.', e);
    }
  };

  const saveActive = async () => {
    if (!canEditCards) return;
    if (!flowCardSettings || !flowCardSettingsDraft) return;
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    if (!hasToken) return;

    const nodeId = flowCardSettings.nodeId;
    const node = nodes.find((n) => String(n.id) === String(nodeId));
    if (!node) return;

    const title = String(flowCardSettingsDraft.title || '').trim();
    if (!title) return;

    const typeForDb = flowCardSettingsDraft.type === 'rhombus' ? 'diamond' : flowCardSettingsDraft.type;
    const isDraft = String(nodeId).startsWith('draft-');

    setDraftSaving(true);
    try {
      let serverNodeId = nodeId;

      if (isDraft) {
        const { data } = await axiosInstance.post<{ id: number }>(`/api/boards/${numericBoardId}/cards`, {
          type: typeForDb,
          title,
          x: node.position.x,
          y: node.position.y
        });

        const createdId = String(data?.id ?? '');
        if (!createdId) throw new Error('Invalid create response');
        serverNodeId = createdId;

        setNodes((prev) =>
          prev.map((n) => (String(n.id) === String(nodeId) ? { ...n, id: createdId } : n))
        );
      } else {
        const patch = {} as Partial<{ title: string; type: string; is_locked: boolean; x: number; y: number }>;
        if (flowCardSettings.title !== title) patch.title = title;
        if (flowCardSettings.type !== flowCardSettingsDraft.type) {
          patch.type = typeForDb;
          patch.x = node.position.x;
          patch.y = node.position.y;
        }
        if (flowCardSettings.isLocked !== flowCardSettingsDraft.isLocked) patch.is_locked = Boolean(flowCardSettingsDraft.isLocked);

        if (Object.keys(patch).length) {
          suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);
          await axiosInstance.patch(`/api/boards/${numericBoardId}/cards/${serverNodeId}`, patch);
        }
      }

      let nextImageSrc = flowCardSettingsDraft.imageSrc;

      if (pendingImageFile) {
        suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);
        setImageUploading(true);
        const form = new FormData();
        form.append('image', pendingImageFile);
        const res = await axiosInstance.patch<{ image_path: string | null }>(
          `/api/boards/${numericBoardId}/cards/${serverNodeId}/image`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        nextImageSrc = resolveImageSrc(res.data?.image_path ?? null);
      } else if (flowCardSettings.imageSrc && !flowCardSettingsDraft.imageSrc) {
        suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);
        const res = await axiosInstance.patch<{ image_path: string | null }>(
          `/api/boards/${numericBoardId}/cards/${serverNodeId}/image`,
          { image: null }
        );
        nextImageSrc = resolveImageSrc(res.data?.image_path ?? null);
      }

      applyPreviewToNode(serverNodeId, {
        type: flowCardSettingsDraft.type,
        title,
        isLocked: flowCardSettingsDraft.isLocked,
        imageSrc: nextImageSrc ?? null,
      });

      clearPendingImage();
      setImageUploading(false);

      closeFlowCardSettings();
    } catch (e) {
      reportError('Не удалось сохранить изменения карточки.', e);
    } finally {
      setImageUploading(false);
      setDraftSaving(false);
    }
  };

  useEffect(() => {
    if (!isEditing) return;
    const panelEl = createPanelRef.current;
    if (!panelEl) return;

    const onKeyDownCapture = (e: KeyboardEvent) => {
      const targetEl = e.target as unknown as HTMLElement | null;
      const isFormField =
        Boolean(targetEl) &&
        (targetEl instanceof HTMLInputElement ||
          targetEl instanceof HTMLTextAreaElement ||
          (targetEl as unknown as { isContentEditable?: boolean }).isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (deleteConfirmOpen) setDeleteConfirmOpen(false);
        else cancelCardSettings();
        return;
      }

      if (e.key === 'Delete' && !isFormField) {
        e.preventDefault();
        e.stopPropagation();
        if (!deleteConfirmOpen) setDeleteConfirmOpen(true);
        return;
      }

      if (e.key !== 'Enter') return;
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e as unknown as { isComposing?: boolean }).isComposing) return;

      e.preventDefault();
      e.stopPropagation();

      if (deleteConfirmOpen) {
        void deleteActive();
        return;
      }

      if (!displayTitle.trim()) {
        titleInputRef.current?.focus();
        return;
      }

      void saveActive();
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [cancelCardSettings, deleteActive, deleteConfirmOpen, displayTitle, isEditing, saveActive]);

  return (
    <div
      ref={containerRef}
      className={`${classes.space_container} ${!canEditCards ? classes.space_container_readonly : ''}`.trim()}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onClickCapture={handleClickCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheelCapture={() => closeContextMenu()}
    >
      <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            zoomOnDoubleClick={false}
            selectionKeyCode={['Control', 'Meta']}
            selectionMode={SelectionMode.Partial}
            proOptions={{ hideAttribution: true }}
            onMoveStart={() => closeContextMenu()}
            onInit={setReactFlow}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
          onNodeDragStart={(_, node) => {
            const typed = node as RFNode<FlowNodeData>;
            const id = String(typed.id);
            draggingNodeIdRef.current = id;
            draggingNodeStartPosRef.current = {
              id,
              x: Number(typed.position?.x) || 0,
              y: Number(typed.position?.y) || 0,
            };
          }}
          onNodeDragStop={(_, node) => {
            const typed = node as RFNode<FlowNodeData>;
            const id = String(typed.id);
            if (draggingNodeIdRef.current !== id) return;
            draggingNodeIdRef.current = null;
            const start = draggingNodeStartPosRef.current;
            draggingNodeStartPosRef.current = null;

            const x = Number(typed.position?.x);
            const y = Number(typed.position?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (start && start.id === id) {
              const moved = Math.hypot(x - start.x, y - start.y) >= 1;
              if (!moved) return;
            }
            void persistCardPosition(String(typed.id), x, y);
          }}
          onNodeClick={(event, node) => {
            if ((event as unknown as { ctrlKey?: boolean; metaKey?: boolean }).ctrlKey || (event as unknown as { metaKey?: boolean }).metaKey) return;
            const target = event.target as Element | null;
            const typed = node as RFNode<FlowNodeData>;
            const clickedShape =
              Boolean(target?.closest(`.${classes.flow_drag_handle}`)) ||
              (String(typed.type) === 'rectangle' && Boolean(target?.closest(`.${classes.node_rectangle}`)));
            if (!clickedShape) return;
            if (flowCardSettingsOpen && activeNodeId && String(typed.id) === String(activeNodeId)) {
              closeContextMenu();
              return;
            }
            if (flowCardSettingsOpen && activeNodeId && String(typed.id) !== String(activeNodeId)) {
              cancelCardSettings();
            }
            openSettingsForNode(typed);
            closeContextMenu();
          }}
        >
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            className={classes.minimap}
            maskColor="rgba(0, 0, 0, 0.35)"
            nodeColor="var(--pink)"
            nodeStrokeColor="var(--pink)"
            nodeBorderRadius={2}
            nodeComponent={MiniMapNode}
            nodeClassName={(node) => `minimap_${String(node.type || 'rectangle')}`}
            onClick={handleMiniMapClick}
            style={{
              background: 'rgba(0, 0, 0, 0.35)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 0,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(14px)'
            }}
          />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </ReactFlowProvider>
      {contextMenu.isOpen && (
        <div
          ref={contextMenuRef}
          className={classes.context_menu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <button type="button" className={classes.context_menu_item} onClick={createDraftNode}>
            Создать запись
          </button>
        </div>
      )}
      <div
        className={`${classes.create_panel} ${isEditing ? classes.create_panel_open : ''}`.trim()}
        ref={createPanelRef}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className={classes.create_panel_header}>
          <div className={classes.create_panel_title}>Настройте вид записи:</div>
          <Mainbtn
            variant="mini"
            kind="button"
            type="button"
            text={displayLocked ? <LockClose /> : <LockOpen />}
            onClick={toggleLockLive}
            disabled={!isEditing || draftSaving || imageUploading}
            className={` ${displayLocked ? classes.icon_btn_active : ''} ${classes.create_panel_lock}`.trim()}
          />
        </div>

        <div className={classes.create_panel_body}>
          <div className={classes.create_panel_previews}>
            <div className={classes.preview_grid}>
              
              <button
                type="button"
                className={`${classes.preview_item} ${classes.preview_item_rect}`.trim()}
                onClick={() => (isEditing ? setDraftTypeLive('rectangle') : undefined)}
                disabled={!isEditing}
              >
                <div
                  className={`${classes.preview_shape} ${classes.preview_rectangle} ${
                    displayType === 'rectangle' ? classes.preview_active : classes.preview_inactive
                  }`.trim()}
                  style={
                    displayType === 'rectangle' && displayImagePreview
                      ? { backgroundImage: `url(${displayImagePreview})` }
                      : undefined
                  }
                >
                  {displayLocked ? (
                    <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_rectangle}`}>
                      <LockClose />
                    </div>
                  ) : null}
                  <div className={classes.preview_rect_title}>{displayTitle || 'title'}</div>
                </div>
              </button>
              <button
                type="button"
                className={classes.preview_item}
                onClick={() => (isEditing ? setDraftTypeLive('circle') : undefined)}
                disabled={!isEditing}
              >
                <div
                  className={`${classes.preview_shape} ${classes.preview_circle} ${
                    displayType === 'circle' && displayImagePreview ? classes.preview_circle_has_image : ''
                  } ${displayType === 'circle' ? classes.preview_active : classes.preview_inactive}`.trim()}
                  style={
                    displayType === 'circle' && displayImagePreview
                      ? { backgroundImage: `url(${displayImagePreview})` }
                      : undefined
                  }
                >
                  {displayLocked ? (
                    <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_circle}`}>
                      <LockClose />
                    </div>
                  ) : null}
                </div>
                <div className={classes.preview_caption}>{displayTitle || 'title'}</div>
              </button>

              

              <button
                type="button"
                className={classes.preview_item}
                onClick={() => (isEditing ? setDraftTypeLive('rhombus') : undefined)}
                disabled={!isEditing}
              >
                <div
                  className={`${classes.preview_shape} ${classes.preview_rhombus} ${
                    displayType === 'rhombus' ? classes.preview_active : classes.preview_inactive
                  }`.trim()}
                  style={
                    displayType === 'rhombus' && displayImagePreview
                      ? { backgroundImage: `url(${displayImagePreview})` }
                      : undefined
                  }
                >
                  {displayLocked ? (
                    <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_rhombus}`}>
                      <LockClose />
                    </div>
                  ) : null}
                </div>
                <div className={classes.preview_caption}>{displayTitle || 'title'}</div>
              </button>
            </div>
          </div>

          <div className={classes.create_panel_form}>
            <div className={classes.form_field}>
              <div className={classes.form_label}>Название</div>
              <input
                className={classes.create_panel_input}
                ref={titleInputRef}
                value={displayTitle}
                onChange={e => setDraftTitleLive(e.target.value)}
                placeholder={visualEditing ? 'Название' : 'Выберите запись'}
                maxLength={50}
                disabled={!isEditing}
              />
            </div>

            <div className={classes.form_field}>
              <div className={classes.form_label}>Изображение</div>
              <div className={classes.form_row}>
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text="Выбрать"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!isEditing || draftSaving || imageUploading}
                />
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={<DeleteIcon />}
                  onClick={removeImageLive}
                  disabled={!isEditing || draftSaving || imageUploading || !displayImagePreview}
                  className={`${classes.icon_btn} ${classes.icon_btn_trash}`.trim()}
                />
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className={classes.hidden_file_input}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.currentTarget.value = '';
                  handleImageSelected(file);
                }}
                disabled={!isEditing}
              />
            </div>

            <div className={classes.form_field}>
              <div className={boardClasses.leave_board_row}>
                <DropdownWrapper upDel closeOnClick={false} isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                {[
                  <button
                    key="trigger"
                    type="button"
                    className={boardClasses.leave_board_trigger}
                    onClick={() => setDeleteConfirmOpen((prev) => !prev)}
                    disabled={!isEditing || draftSaving || imageUploading}
                    aria-label="Удалить запись"
                  >
                    Удалить
                  </button>,
                  <div key="menu">
                    <button
                      type="button"
                      data-dropdown-class={boardClasses.participant_confirm_danger}
                      onClick={() => void deleteActive()}
                      disabled={!isEditing || draftSaving || imageUploading}
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      data-dropdown-class={boardClasses.participant_confirm_cancel}
                      onClick={() => setDeleteConfirmOpen(false)}
                      disabled={!isEditing || draftSaving || imageUploading}
                    >
                      Отмена
                    </button>
                  </div>,
                ]}
                </DropdownWrapper>
              </div>
            </div>

            <div className={classes.form_actions}>
              <Mainbtn
                variant="mini"
                kind="button"
                type="button"
                text="Сохранить"
                onClick={() => {
                  if (!isEditing || draftSaving || imageUploading) return;
                  if (!displayTitle.trim()) {
                    titleInputRef.current?.focus();
                    return;
                  }
                  void saveActive();
                }}
                disabled={!isEditing || draftSaving || imageUploading}
                className={`${!displayTitle.trim() ? classes.save_btn_soft_disabled : ''}`.trim()}
              />
              <Mainbtn
                variant="mini"
                kind="button"
                type="button"
                text="Отмена"
                onClick={cancelCardSettings}
                disabled={!isEditing || draftSaving}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default FlowBoard;
