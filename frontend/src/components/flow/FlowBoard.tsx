import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Edge,
  Node as RFNode,
  NodeProps,
  applyNodeChanges,
  ReactFlowInstance,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss';
import axiosInstance, { API_URL } from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import LockClose from '@/assets/icons/monochrome/lock_close.svg';
import LockOpen from '@/assets/icons/monochrome/lock_open.svg';
import { FlowCardShape, useUIStore } from '@/store/uiStore';

type FlowNodeType = FlowCardShape;
type FlowNodeData = { title: string; imageSrc: string | null; isLocked: boolean };

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

const NODE_SIZES: Record<FlowNodeType, { width: number; height: number }> = {
  rectangle: { width: 240, height: 80 },
  rhombus: { width: 120, height: 120 },
  circle: { width: 120, height: 120 }
};

const RectangleNode: React.FC<NodeProps<FlowNodeData>> = ({ data }) => {
  return (
    <div
      className={classes.node_rectangle}
      style={
        data.imageSrc
          ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      {data.isLocked ? (
        <div className={`${classes.node_lock_overlay} ${classes.node_lock_overlay_rectangle}`}>
          <LockClose />
        </div>
      ) : null}
      <div className={classes.node_rectangle_title}>{data.title}</div>
    </div>
  );
};

const RhombusNode: React.FC<NodeProps<FlowNodeData>> = ({ data }) => {
  return (
    <div className={classes.node_rhombus}>
      <div
        className={classes.rhombus_content}
        style={
          data.imageSrc
            ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      />
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
  return (
    <div className={classes.node_circle}>
      <div
        className={classes.circle_content}
        style={
          data.imageSrc
            ? { backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
      />
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

const FlowBoard: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const numericBoardId = Number(boardId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
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
  const flowCardSettingsOpen = useUIStore((s) => s.flowCardSettingsOpen);
  const flowCardSettings = useUIStore((s) => s.flowCardSettings);
  const flowCardSettingsDraft = useUIStore((s) => s.flowCardSettingsDraft);
  const openFlowCardSettings = useUIStore((s) => s.openFlowCardSettings);
  const closeFlowCardSettings = useUIStore((s) => s.closeFlowCardSettings);
  const setFlowCardSettingsDraft = useUIStore((s) => s.setFlowCardSettingsDraft);

  const activeNodeId = flowCardSettingsOpen ? flowCardSettings?.nodeId ?? null : null;
  const isEditing = Boolean(flowCardSettingsOpen && flowCardSettings && flowCardSettingsDraft && activeNodeId);
  const visualDraftRef = useRef<Omit<NonNullable<typeof flowCardSettingsDraft>, never> | null>(null);
  const [visualEditing, setVisualEditing] = useState(false);
  const visualEditingTimeoutRef = useRef<number | null>(null);

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

  const visualDraft = isEditing ? flowCardSettingsDraft : visualDraftRef.current;
  const displayType: FlowNodeType = visualDraft?.type ?? 'rectangle';
  const displayTitle = visualDraft?.title ?? '';
  const displayLocked = Boolean(visualDraft?.isLocked);
  const displayImagePreview = visualDraft?.imageSrc ?? null;

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingObjectUrlRef = useRef<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);

  const onNodesChange = useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    setNodes((prev) => applyNodeChanges(changes, prev));
  }, []);

  const mapApiTypeToNodeType = (type: ApiCardType): FlowNodeType => {
    if (type === 'diamond') return 'rhombus';
    return type;
  };

  const resolveImageSrc = (image_path: string | null) => {
    if (!image_path) return null;
    if (image_path.startsWith('/uploads/')) return `${API_URL}${image_path}`;
    return image_path;
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    let cancelled = false;
    const load = async () => {
      try {
        const hasToken = Boolean(localStorage.getItem('token'));
        const url = hasToken
          ? `/api/boards/${numericBoardId}/cards`
          : `/api/boards/public/${numericBoardId}/cards`;

        const res = await axiosInstance.get<ApiCard[]>(url);
        const cards = Array.isArray(res.data) ? res.data : [];

        const nextNodes: RFNode<FlowNodeData>[] = cards.map((c) => ({
          id: String(c.id),
          type: mapApiTypeToNodeType(c.type),
          position: { x: Number(c.x) || 0, y: Number(c.y) || 0 },
          draggable: !(Boolean(c.is_locked)),
          data: {
            title: (c.title ?? 'title').trim() || 'title',
            imageSrc: resolveImageSrc(c.image_path ?? null),
            isLocked: Boolean(c.is_locked),
          },
        }));

        if (cancelled) return;
        setNodes((prev) => {
          const draft = prev.filter((n) => String(n.id).startsWith('draft-'));
          const draftIds = new Set(draft.map((n) => String(n.id)));
          const merged = [...draft, ...nextNodes.filter((n) => !draftIds.has(String(n.id)))];
          return merged;
        });
      } catch (e) {
        try {
          const res = await axiosInstance.get<ApiCard[]>(`/api/boards/public/${numericBoardId}/cards`);
          const cards = Array.isArray(res.data) ? res.data : [];
          const nextNodes: RFNode<FlowNodeData>[] = cards.map((c) => ({
            id: String(c.id),
            type: mapApiTypeToNodeType(c.type),
            position: { x: Number(c.x) || 0, y: Number(c.y) || 0 },
            draggable: !(Boolean(c.is_locked)),
            data: {
              title: (c.title ?? 'title').trim() || 'title',
              imageSrc: resolveImageSrc(c.image_path ?? null),
              isLocked: Boolean(c.is_locked),
            },
          }));
          if (cancelled) return;
          setNodes((prev) => {
            const draft = prev.filter((n) => String(n.id).startsWith('draft-'));
            const draftIds = new Set(draft.map((n) => String(n.id)));
            return [...draft, ...nextNodes.filter((n) => !draftIds.has(String(n.id)))];
          });
        } catch (e2) {
          // ignore
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [numericBoardId]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeContextMenu, contextMenu.isOpen]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const onResize = () => closeContextMenu();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [closeContextMenu, contextMenu.isOpen]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      const target = e.target as globalThis.Node | null;
      const menuEl = contextMenuRef.current;
      if (menuEl && target && menuEl.contains(target)) return;
      closeContextMenu();
    };
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => window.removeEventListener('pointerdown', onPointerDownCapture, true);
  }, [closeContextMenu, contextMenu.isOpen]);

  useEffect(() => {
    if (!contextMenu.isOpen) return;
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
    window.addEventListener('contextmenu', onContextMenuCapture, true);
    return () => window.removeEventListener('contextmenu', onContextMenuCapture, true);
  }, [closeContextMenu, contextMenu.isOpen]);

  useLayoutEffect(() => {
    if (!contextMenu.isOpen) return;
    const el = contextMenuRef.current;
    if (!el) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const margin = 16;
    let x = contextMenu.x;
    let y = contextMenu.y;

    const menuWidth = el.offsetWidth;
    const menuHeight = el.offsetHeight;
    const containerRect = containerEl.getBoundingClientRect();

    const maxX = containerRect.width - menuWidth - margin;
    const maxY = containerRect.height - menuHeight - margin;

    if (x > maxX) x = maxX;
    if (y > maxY) y = maxY;
    if (x < margin) x = margin;
    if (y < margin) y = margin;

    if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu(prev => ({ ...prev, x, y }));
  }, [contextMenu.isOpen, contextMenu.x, contextMenu.y]);

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const x = containerRect ? e.clientX - containerRect.left : e.clientX;
    const y = containerRect ? e.clientY - containerRect.top : e.clientY;
    setContextMenu({ isOpen: true, x, y, anchorX: x, anchorY: y });
  };

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

          return {
            ...n,
            type: nextType,
            position,
            draggable: !nextLocked,
            data: { ...n.data, title: nextTitle, isLocked: nextLocked, imageSrc: nextImageSrc }
          };
        })
      );
    },
    []
  );

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
      clearPendingImage();
      openFlowCardSettings({
        nodeId: String(node.id),
        type: node.type as FlowNodeType,
        title: node.data.title,
        isLocked: Boolean(node.data.isLocked),
        imageSrc: node.data.imageSrc,
      });
    },
    [clearPendingImage, openFlowCardSettings]
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

  const createDraftNode = () => {
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
    const flowPosition = reactFlow.project({ x: contextMenu.anchorX, y: contextMenu.anchorY });
    const position = isFirstNodeOnBoard
      ? { x: 0, y: 0 }
      : { x: flowPosition.x - size.width / 2, y: flowPosition.y - size.height / 2 };

    const draftNode: RFNode<FlowNodeData> = {
      id,
      type: startType,
      position,
      data: { title: startTitle, imageSrc: null, isLocked: false },
      draggable: true,
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
          x: contextMenu.anchorX - (size.width / 2) * zoom,
          y: contextMenu.anchorY - (size.height / 2) * zoom,
          zoom,
        },
        { duration: 0 }
      );
    }
  };

  const setDraftTitleLive = (title: string) => {
    if (!activeNodeId) return;
    setFlowCardSettingsDraft({ title });
    applyPreviewToNode(activeNodeId, { title });
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
    if (file.size > 5 * 1024 * 1024) return;

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

  const saveActive = async () => {
    if (!flowCardSettings || !flowCardSettingsDraft) return;
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

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
        if (flowCardSettings.title !== title) {
          await axiosInstance.patch(`/api/boards/${numericBoardId}/cards/${serverNodeId}/title`, { title });
        }
        if (flowCardSettings.type !== flowCardSettingsDraft.type) {
          await axiosInstance.patch(`/api/boards/${numericBoardId}/cards/${serverNodeId}/type`, { type: typeForDb });
        }
        if (flowCardSettings.isLocked !== flowCardSettingsDraft.isLocked) {
          await axiosInstance.patch(`/api/boards/${numericBoardId}/cards/${serverNodeId}/lock`, { is_locked: flowCardSettingsDraft.isLocked });
        }
      }

      let nextImageSrc = flowCardSettingsDraft.imageSrc;

      if (pendingImageFile) {
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
      console.error(e);
    } finally {
      setImageUploading(false);
      setDraftSaving(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={classes.space_container}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onWheelCapture={() => closeContextMenu()}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
          onMoveStart={() => closeContextMenu()}
          onInit={setReactFlow}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            const typed = node as RFNode<FlowNodeData>;
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
        <div className={classes.create_panel_title}>Настройте вид записи:</div>
        <div className={classes.create_panel_radios}>
          <label className={`${classes.create_panel_radio} ${displayType === 'rectangle' ? classes.radio_active : ''}`}>
            <input
              type="radio"
              name="nodeShape"
              value="rectangle"
              checked={displayType === 'rectangle'}
              onChange={() => setDraftTypeLive('rectangle')}
              disabled={!isEditing}
            />
            Прямоугольник
          </label>
          <label className={`${classes.create_panel_radio} ${displayType === 'rhombus' ? classes.radio_active : ''}`}>
            <input
              type="radio"
              name="nodeShape"
              value="rhombus"
              checked={displayType === 'rhombus'}
              onChange={() => setDraftTypeLive('rhombus')}
              disabled={!isEditing}
            />
            Ромб
          </label>
          <label className={`${classes.create_panel_radio} ${displayType === 'circle' ? classes.radio_active : ''}`}>
            <input
              type="radio"
              name="nodeShape"
              value="circle"
              checked={displayType === 'circle'}
              onChange={() => setDraftTypeLive('circle')}
              disabled={!isEditing}
            />
            Круг
          </label>
        </div>
        <div className={classes.create_panel_row}>
          <input
            className={classes.create_panel_input}
            value={displayTitle}
            onChange={e => {
              const value = e.target.value;
              setDraftTitleLive(value);
            }}
            placeholder={visualEditing ? 'Название' : 'Выберите запись'}
            disabled={!isEditing}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className={classes.hidden_file_input}
            onChange={(e) => handleImageSelected(e.target.files?.[0] ?? null)}
            disabled={!isEditing}
          />
          <div className={classes.create_panel_tools}>
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text={displayLocked ? <LockClose /> : <LockOpen />}
              onClick={toggleLockLive}
              disabled={!isEditing || draftSaving || imageUploading}
              className={`${classes.icon_btn} ${displayLocked ? classes.icon_btn_active : ''}`.trim()}
            />
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text="Картинка"
              onClick={() => imageInputRef.current?.click()}
              disabled={!isEditing || draftSaving || imageUploading}
            />
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text="Убрать"
              onClick={removeImageLive}
              disabled={!isEditing || draftSaving || imageUploading || !displayImagePreview}
            />
          </div>
          <div className={classes.create_panel_actions}>
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text="Сохранить"
              onClick={saveActive}
              disabled={!isEditing || draftSaving || !displayTitle.trim()}
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
  );
};

export default FlowBoard;
