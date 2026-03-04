import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionLineComponentProps,
  BaseEdge,
  Edge,
  EdgeProps,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  MiniMapNodeProps,
  Node as RFNode,
  NodeProps,
  Position,
  MarkerType,
  SelectionMode,
  applyNodeChanges,
  ReactFlowInstance,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import classes from './FlowBoard.module.scss';
import axiosInstance from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import LockClose from '@/assets/icons/monochrome/lock_close.svg';
import LockOpen from '@/assets/icons/monochrome/lock_open.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { ApiCard, ApiCardLink, ApiLinkStyle, FlowNodeData, FlowNodeType } from './flowBoardModel';
import {
  buildEdgeFromLink,
  getBoundaryPoint,
  getLinkHandleStyle,
  getNodeRect,
  NODE_SIZES,
  mapApiTypeToNodeType,
  resolveImageSrc
} from './flowBoardUtils';
import { useFlowBoardBoardsUpdatedSocket } from './useFlowBoardBoardsUpdatedSocket';
import { useFlowBoardContextMenu } from './useFlowBoardContextMenu';
import { useFlowBoardPointerGestures } from './useFlowBoardPointerGestures';
import { useFlowBoardLinkMode } from './useFlowBoardLinkMode';
import { useFlowSelection } from '@/components/flowboard/hooks/useFlowSelection';
import { parseFlowEdgeData } from '@/components/flowboard/utils/flowEdgeData';
import { FlowLinkModeAlarm } from '@/components/flowboard/components/FlowLinkModeAlarm';

export type FlowBoardHandle = {
  createDraftNodeAtCenter: () => void;
  startLinkMode: () => void;
};

const DEFAULT_LINK_STYLE: ApiLinkStyle = 'line';
const DEFAULT_LINK_COLOR = '#e7cd73';

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

const ConnectionHandles = ({ isConnectable, shape }: { isConnectable: boolean; shape: FlowNodeType }) => {
  const sourceClass = `${classes.flow_link_handle} ${classes.flow_link_handle_source} nodrag`.trim();
  const targetClass = `${classes.flow_link_handle} ${classes.flow_link_handle_target} nodrag`.trim();
  const style = getLinkHandleStyle(shape);
  return (
    <>
      <Handle type="source" id="s" position={Position.Top} className={sourceClass} style={style} isConnectable={isConnectable} />
      <Handle type="target" id="t" position={Position.Top} className={targetClass} style={style} isConnectable={isConnectable} />
    </>
  );
};

const RectangleNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  return (
    <div
      className={classes.node_rectangle}
    >
      {hasImage ? (
        <div
          className={classes.node_image_layer}
          style={{ backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          aria-hidden="true"
        />
      ) : null}
      {isDraft ? null : <ConnectionHandles shape="rectangle" isConnectable={!data.isLocked} />}
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

const RhombusNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  return (
    <div className={classes.node_rhombus}>
      {isDraft ? null : <ConnectionHandles shape="rhombus" isConnectable={!data.isLocked} />}
      <div
        className={classes.rhombus_content}
      >
        {hasImage ? (
          <div
            className={classes.node_image_layer}
            style={{ backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            aria-hidden="true"
          />
        ) : null}
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

const CircleNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  return (
    <div className={`${classes.node_circle} ${data.imageSrc && data.imageLoaded ? classes.node_circle_has_image : ''}`.trim()}>
      {isDraft ? null : <ConnectionHandles shape="circle" isConnectable={!data.isLocked} />}
      <div
        className={classes.circle_content}
      >
        {hasImage ? (
          <div
            className={classes.node_image_layer}
            style={{ backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            aria-hidden="true"
          />
        ) : null}
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

const FlowStraightEdge: React.FC<EdgeProps> = (props) => {
  const { id, source, target, style, markerEnd, sourceX, sourceY, targetX, targetY, data } = props;
  const rf = useReactFlow();
  const isSelected = Boolean((props as unknown as { selected?: boolean })?.selected);
  const [isHovered, setIsHovered] = useState(false);

  const sNode = rf.getNode(source);
  const tNode = rf.getNode(target);
  const sRect = getNodeRect(sNode);
  const tRect = getNodeRect(tNode);

  let sx = sourceX;
  let sy = sourceY;
  let tx = targetX;
  let ty = targetY;

  const MIN_EDGE_RENDER_LEN_PX = 12;
  const OVERLAP_HIDE_AABB_PAD_PX = 8;

  if (sRect && tRect) {
    const sType = (sNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const tType = (tNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const dx = tRect.cx - sRect.cx;
    const dy = tRect.cy - sRect.cy;

    const overlapsOrTouchesAabb =
      Math.abs(dx) <= sRect.hw + tRect.hw + OVERLAP_HIDE_AABB_PAD_PX &&
      Math.abs(dy) <= sRect.hh + tRect.hh + OVERLAP_HIDE_AABB_PAD_PX;

    if (overlapsOrTouchesAabb) return null;

    const p1 = getBoundaryPoint(sType, sRect.cx, sRect.cy, dx, dy, sRect.hw, sRect.hh);
    const p2 = getBoundaryPoint(tType, tRect.cx, tRect.cy, -dx, -dy, tRect.hw, tRect.hh);
    sx = p1.x;
    sy = p1.y;
    tx = p2.x;
    ty = p2.y;
  }

  if (Math.hypot(tx - sx, ty - sy) < MIN_EDGE_RENDER_LEN_PX) return null;

  const labelRaw = (data as unknown as { label?: unknown })?.label;
  const isLabelVisibleRaw = (data as unknown as { isLabelVisible?: unknown })?.isLabelVisible;
  const isLabelVisible = isLabelVisibleRaw === undefined ? true : Boolean(isLabelVisibleRaw);
  const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
  const shouldRenderLabel = Boolean(label);
  const labelOpacity = isLabelVisible || isHovered || isSelected ? 1 : 0;
  const labelClass = classes.flow_edge_label_html;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  const dataStyleRaw = (data as unknown as { style?: unknown })?.style;
  const isArrow =
    dataStyleRaw === 'arrow' ? true : dataStyleRaw === 'line' ? false : Boolean(markerEnd);

  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy);
  const ux = Number.isFinite(len) && len > 0.0001 ? dx / len : 0;
  const uy = Number.isFinite(len) && len > 0.0001 ? dy / len : 0;

  const ARROW_LEN = 16;
  const ARROW_W = 14;

  const tipX = tx;
  const tipY = ty;
  const baseX = tipX - ux * ARROW_LEN;
  const baseY = tipY - uy * ARROW_LEN;

  const px = -uy;
  const py = ux;

  const lx = baseX + px * (ARROW_W / 2);
  const ly = baseY + py * (ARROW_W / 2);
  const rx = baseX - px * (ARROW_W / 2);
  const ry = baseY - py * (ARROW_W / 2);

  const lineEndX = isArrow ? baseX : tx;
  const lineEndY = isArrow ? baseY : ty;
  const path = `M${sx},${sy}L${lineEndX},${lineEndY}`;

  const renderedStyle = isSelected ? { ...(style ?? {}), stroke: '#ffffff' } : style;
  const strokeColor = typeof (renderedStyle as { stroke?: unknown } | undefined)?.stroke === 'string'
    ? String((renderedStyle as { stroke?: unknown }).stroke)
    : typeof (style as { stroke?: unknown } | undefined)?.stroke === 'string'
      ? String((style as { stroke?: unknown }).stroke)
      : '#ffffff';

  const renderedStyleWithCap = isArrow ? { ...(renderedStyle ?? {}), strokeLinecap: 'butt' as const } : renderedStyle;

  const arrowHead = isArrow ? (
    <path className={classes.flow_edge_arrowhead} d={`M ${tipX} ${tipY} L ${lx} ${ly} L ${rx} ${ry} Z`} fill={strokeColor} />
  ) : null;

  return (
    <g onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <BaseEdge id={id} path={path} style={renderedStyleWithCap} />
      {arrowHead}
      {shouldRenderLabel ? (
        <EdgeLabelRenderer>
          <div
            className={labelClass}
            style={{
              opacity: labelOpacity,
              transform: `translate(-50%, -50%) translate(${mx}px,${my}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
};

const EDGE_TYPES = { flowStraight: FlowStraightEdge } as const;

const FlowBoard = React.forwardRef<FlowBoardHandle, { canEditCards?: boolean }>(({ canEditCards = false }, ref) => {
  const { boardId } = useParams<{ boardId: string }>();
  const numericBoardId = Number(boardId);
  const isAuth = useAuthStore((s) => s.isAuth);
  const hasToken = useAuthStore((s) => s.hasToken);
  const [selectionModifierPressed, setSelectionModifierPressed] = useState(false);

  useEffect(() => {
    if (__PLATFORM__ !== 'desktop') return;

    const updateFromEvent = (e: KeyboardEvent, pressed: boolean) => {
      if (e.key !== 'Control' && e.key !== 'Meta') return;
      setSelectionModifierPressed(pressed);
    };

    const onKeyDownCapture = (e: KeyboardEvent) => updateFromEvent(e, true);
    const onKeyUpCapture = (e: KeyboardEvent) => updateFromEvent(e, false);
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0) return;
      setSelectionModifierPressed(Boolean(e.ctrlKey || e.metaKey));
    };
    const onBlur = () => setSelectionModifierPressed(false);

    window.addEventListener('keydown', onKeyDownCapture, true);
    window.addEventListener('keyup', onKeyUpCapture, true);
    window.addEventListener('pointerdown', onPointerDownCapture, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
      window.removeEventListener('keyup', onKeyUpCapture, true);
      window.removeEventListener('pointerdown', onPointerDownCapture, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreloadStartedRef = useRef<Set<string>>(new Set());
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<RFNode<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const draggingNodeIdRef = useRef<string | null>(null);
  const draggingNodeStartPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragStartSelectedPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [reloadLinksSeq, setReloadLinksSeq] = useState(0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingSourceNodeId, setConnectingSourceNodeId] = useState<string | null>(null);
  const connectingFromNodeIdRef = useRef<string | null>(null);
  const connectingHoverTargetNodeIdRef = useRef<string | null>(null);
  const [connectingHoverTargetNodeId, setConnectingHoverTargetNodeId] = useState<string | null>(null);
  const createdViaOnConnectRef = useRef(false);
  const [linkSourceNodeId, setLinkSourceNodeId] = useState<string | null>(null);
  const {
    clearSelectedElements,
    clearSelectedEdges,
    setSelectedNodeOnly,
    selectEdgeAndNodes,
    setEdgeHighlightBySelectedNodes,
  } = useFlowSelection<FlowNodeData>({ setNodes, setEdges });
  const flowCardSettingsOpen = useUIStore((s) => s.flowCardSettingsOpen);
  const flowCardSettings = useUIStore((s) => s.flowCardSettings);
  const flowCardSettingsDraft = useUIStore((s) => s.flowCardSettingsDraft);
  const openFlowCardSettings = useUIStore((s) => s.openFlowCardSettings);
  const closeFlowCardSettings = useUIStore((s) => s.closeFlowCardSettings);
  const setFlowCardSettingsDraft = useUIStore((s) => s.setFlowCardSettingsDraft);
  const openLinkInspector = useUIStore((s) => s.openLinkInspector);
  const closeLinkInspector = useUIStore((s) => s.closeLinkInspector);
  const boardMenuView = useUIStore((s) => s.boardMenuView);
  const selectedLink = useUIStore((s) => s.selectedLink);
  const selectedLinkDraft = useUIStore((s) => s.selectedLinkDraft);
  const lastSelectedEdgeIdRef = useRef<string | null>(null);
  const lastSelectedLinkNodeIdsRef = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!selectedLink) return;
    lastSelectedEdgeIdRef.current = `link-${selectedLink.linkId}`;
    lastSelectedLinkNodeIdsRef.current = { from: String(selectedLink.fromCardId), to: String(selectedLink.toCardId) };
  }, [selectedLink?.fromCardId, selectedLink?.linkId, selectedLink?.toCardId]);

  useEffect(() => {
    if (boardMenuView === 'link') return;
    const edgeId = lastSelectedEdgeIdRef.current;
    const ids = lastSelectedLinkNodeIdsRef.current;
    if (!edgeId || !ids) return;
    setEdges((prev) =>
      prev.map((e) => {
        if (String(e.id) !== edgeId) return e;
        const prevData = (e as unknown as { data?: Record<string, unknown> }).data ?? {};
        const nextData = {
          ...prevData,
          fromCardId: Number(ids.from),
          toCardId: Number(ids.to),
        };

        const shouldDeselect = Boolean((e as unknown as { selected?: boolean }).selected);
        const shouldRestoreDir = String(e.source) !== ids.from || String(e.target) !== ids.to;
        if (!shouldDeselect && !shouldRestoreDir && prevData === nextData) return e;
        return {
          ...e,
          selected: shouldDeselect ? false : (e as unknown as { selected?: boolean }).selected,
          source: ids.from,
          target: ids.to,
          data: nextData,
        };
      })
    );
  }, [boardMenuView, setEdges]);

  useEffect(() => {
    if (boardMenuView === 'link') return;
    const ids = lastSelectedLinkNodeIdsRef.current;
    if (!ids) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (!Boolean((n as unknown as { selected?: boolean }).selected)) return n;
        const id = String(n.id);
        if (id !== ids.from && id !== ids.to) return n;
        return { ...n, selected: false };
      })
    );
  }, [boardMenuView, setNodes]);

  useEffect(() => {
    if (boardMenuView !== 'link') return;
    if (!selectedLink) return;
    const edgeId = `link-${selectedLink.linkId}`;
    const from = String(selectedLinkDraft?.fromCardId ?? selectedLink.fromCardId);
    const to = String(selectedLinkDraft?.toCardId ?? selectedLink.toCardId);

    setEdges((prev) =>
      prev.map((e) => {
        if (String(e.id) !== edgeId) return e;
        const prevData = (e as unknown as { data?: Record<string, unknown> }).data ?? {};
        const nextData = {
          ...prevData,
          fromCardId: Number(from),
          toCardId: Number(to),
        };

        const same = String(e.source) === from && String(e.target) === to;
        if (same) return (prevData === nextData ? e : { ...e, data: nextData });
        return { ...e, source: from, target: to, data: nextData };
      })
    );
  }, [boardMenuView, selectedLink?.linkId, selectedLinkDraft?.fromCardId, selectedLinkDraft?.toCardId, selectedLink?.fromCardId, selectedLink?.toCardId]);

  const edgesForRender = React.useMemo(() => {
    const selectedEdgeId = boardMenuView === 'link' && selectedLink ? `link-${selectedLink.linkId}` : null;
    const hasDraft = Boolean(boardMenuView === 'link' && selectedLink && selectedLinkDraft);

    return edges.map((e) => {
      const className = typeof e.className === 'string' ? e.className : '';
      const isHighlight = className.split(/\s+/).includes('flow_edge_highlight');
      const isSelectedEdge = Boolean((e as unknown as { selected?: boolean }).selected) || (selectedEdgeId && String(e.id) === selectedEdgeId);
      const shouldForceWhite = Boolean(isHighlight || isSelectedEdge);

      let next = e as Edge;

      if (shouldForceWhite) {
        next = {
          ...next,
          style: { ...(next.style ?? {}), stroke: '#ffffff' },
        };
      }

      if (hasDraft && selectedEdgeId && String(e.id) === selectedEdgeId && selectedLink && selectedLinkDraft) {
        const prevData = (next as unknown as { data?: Record<string, unknown> }).data ?? {};
        const nextData = {
          ...prevData,
          fromCardId: selectedLink.fromCardId,
          toCardId: selectedLink.toCardId,
          style: selectedLinkDraft.style,
          label: selectedLinkDraft.label,
          isLabelVisible: selectedLinkDraft.isLabelVisible,
        };

        next = {
          ...next,
          selected: true,
          style: { ...(next.style ?? {}), stroke: '#ffffff' },
          data: nextData,
        };
      }

      return next;
    });
  }, [boardMenuView, edges, selectedLink, selectedLinkDraft]);

  const activeNodeId = flowCardSettingsOpen ? flowCardSettings?.nodeId ?? null : null;
  const isEditing = Boolean(flowCardSettingsOpen && flowCardSettings && flowCardSettingsDraft && activeNodeId);
  const editingStateRef = useRef<{ isEditing: boolean; activeNodeId: string | null }>({ isEditing: false, activeNodeId: null });
  const visualDraftRef = useRef<Omit<NonNullable<typeof flowCardSettingsDraft>, never> | null>(null);
  const [visualEditing, setVisualEditing] = useState(false);
  const visualEditingTimeoutRef = useRef<number | null>(null);

  const { contextMenu, closeContextMenu, openContextMenuAt, handleContextMenu, handleMouseDown } = useFlowBoardContextMenu({
    canEditCards,
    containerRef,
    contextMenuRef,
  });

  const { linkModeStep, startLinkMode, cancelLinkMode, handleNodeClickInLinkMode } = useFlowBoardLinkMode({});

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

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const id = String(n.id);
        const nextClassParts = ['flow_node_wrapper'];
        if (isConnecting) {
          if (connectingSourceNodeId && id === String(connectingSourceNodeId)) nextClassParts.push('flow_node_link_source');
        } else {
          if (linkSourceNodeId && id === String(linkSourceNodeId)) nextClassParts.push('flow_node_link_source');
        }
        if (isConnecting && connectingHoverTargetNodeId && id === String(connectingHoverTargetNodeId)) nextClassParts.push('flow_node_link_hover');
        const nextClass = nextClassParts.join(' ');
        if (String(n.className || '') === nextClass) return n;
        return { ...n, className: nextClass };
      })
    );
  }, [connectingHoverTargetNodeId, connectingSourceNodeId, isConnecting, linkSourceNodeId]);

  const pickNodeIdAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const elements = document.elementsFromPoint(clientX, clientY) as unknown as HTMLElement[];
    if (!elements?.length) return null;

    let nodeId: string | null = null;
    for (const el of elements) {
      const nodeEl = el?.closest?.('.react-flow__node') as HTMLElement | null;
      const id = nodeEl?.dataset?.id ? String(nodeEl.dataset.id) : null;
      if (id) {
        nodeId = id;
        break;
      }
    }

    if (!nodeId) return null;
    const sourceId = connectingFromNodeIdRef.current;
    if (sourceId && nodeId === String(sourceId)) return null;
    return nodeId;
  }, []);

  useEffect(() => {
    if (!isConnecting) return;

    const onPointerMoveCapture = (e: PointerEvent) => {
      const next = pickNodeIdAtClientPoint(e.clientX, e.clientY);
      const prev = connectingHoverTargetNodeIdRef.current;
      if (String(prev || '') === String(next || '')) return;
      connectingHoverTargetNodeIdRef.current = next;
      setConnectingHoverTargetNodeId(next);
    };

    window.addEventListener('pointermove', onPointerMoveCapture, true);
    return () => window.removeEventListener('pointermove', onPointerMoveCapture, true);
  }, [isConnecting, pickNodeIdAtClientPoint]);

  const HoverConnectionLine: React.FC<ConnectionLineComponentProps> = (props) => {
    const { fromX, fromY, toX, toY } = props;
    const rf = useReactFlow();
    const hoverId = connectingHoverTargetNodeId;

    let finalToX = toX;
    let finalToY = toY;
    let finalFromX = fromX;
    let finalFromY = fromY;

    const MIN_EDGE_RENDER_LEN_PX = 12;
    const OVERLAP_AABB_TOLERANCE_PX = 4;

    const sourceId = connectingFromNodeIdRef.current;
    const sNode = sourceId ? rf.getNode(sourceId) : null;
    const sRect = getNodeRect(sNode);

    if (hoverId && sRect) {
      const tNode = rf.getNode(hoverId);
      const tRect = getNodeRect(tNode);
      if (tRect) {
        const sType = (sNode?.type as FlowNodeType | undefined) ?? 'rectangle';
        const tType = (tNode?.type as FlowNodeType | undefined) ?? 'rectangle';
        const dx = tRect.cx - sRect.cx;
        const dy = tRect.cy - sRect.cy;

        const overlapsAabb =
          Math.abs(dx) < sRect.hw + tRect.hw - OVERLAP_AABB_TOLERANCE_PX &&
          Math.abs(dy) < sRect.hh + tRect.hh - OVERLAP_AABB_TOLERANCE_PX;
        if (overlapsAabb) return null;

        const p1 = getBoundaryPoint(sType, sRect.cx, sRect.cy, dx, dy, sRect.hw, sRect.hh);
        const p2 = getBoundaryPoint(tType, tRect.cx, tRect.cy, -dx, -dy, tRect.hw, tRect.hh);
        finalFromX = p1.x;
        finalFromY = p1.y;
        finalToX = p2.x;
        finalToY = p2.y;
      }
    } else if (hoverId) {
      const n = rf.getNode(hoverId);
      const tRect = getNodeRect(n);
      if (tRect) {
        finalToX = tRect.cx;
        finalToY = tRect.cy;
      }
    }

    if (Math.hypot(finalToX - finalFromX, finalToY - finalFromY) < MIN_EDGE_RENDER_LEN_PX) return null;

    return (
      <g>
        <path d={`M${finalFromX},${finalFromY}L${finalToX},${finalToY}`} fill="none" stroke={DEFAULT_LINK_COLOR} strokeWidth={2} />
      </g>
    );
  };

  const mergeLoadedNodes = useCallback((prev: RFNode<FlowNodeData>[], loaded: RFNode<FlowNodeData>[]) => {
    const editing = editingStateRef.current;
    const draft = prev.filter((n) => String(n.id).startsWith('draft-'));
    const draftIds = new Set(draft.map((n) => String(n.id)));
    const prevById = new Map<string, RFNode<FlowNodeData>>(prev.map((n) => [String(n.id), n]));
    const preserveActive =
      editing.isEditing && editing.activeNodeId && !String(editing.activeNodeId).startsWith('draft-')
        ? prev.find((n) => String(n.id) === String(editing.activeNodeId)) ?? null
        : null;

    const preserveIds = new Set<string>(draftIds);
    if (preserveActive) preserveIds.add(String(preserveActive.id));

    const mergedLoaded = loaded.map((n) => {
      const prevNode = prevById.get(String(n.id));
      if (!prevNode) return n;

      const sameImage = prevNode.data.imageSrc === n.data.imageSrc;
      const imageLoaded = sameImage ? Boolean(prevNode.data.imageLoaded) : Boolean(n.data.imageLoaded);

      return {
        ...n,
        selected: typeof prevNode.selected === 'boolean' ? prevNode.selected : n.selected,
        data: { ...n.data, imageLoaded },
      };
    });

    return [
      ...draft,
      ...(preserveActive && !draftIds.has(String(preserveActive.id)) ? [preserveActive] : []),
      ...mergedLoaded.filter((n) => !preserveIds.has(String(n.id))),
    ];
  }, []);

  useEffect(() => {
    editingStateRef.current = { isEditing, activeNodeId };
  }, [activeNodeId, isEditing]);

  // показываем/скрываем узлы связей чисто через CSS (selected + "connecting" класс на контейнере)

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
    if (isAuth) return;

    const id = window.setInterval(() => {
      setReloadSeq((v) => v + 1);
      setReloadLinksSeq((v) => v + 1);
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

  const addEdgeFromLink = useCallback((link: ApiCardLink) => {
    setEdges((prev) => {
      const edge = buildEdgeFromLink(link);
      if (prev.some((e) => String(e.id) === String(edge.id))) return prev;
      return [...prev, edge];
    });
  }, []);

  useFlowBoardBoardsUpdatedSocket({
    numericBoardId,
    isAuth,
    canEditCards,
    getNodeDragHandleSelector,
    defaultLinkStyle: DEFAULT_LINK_STYLE,
    defaultLinkColor: DEFAULT_LINK_COLOR,
    suppressSocketReloadByCardIdRef,
    setNodes,
    setEdges,
    setReloadSeq,
    addEdgeFromLink,
  });

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

  const persistLinkCreate = useCallback(
    async (fromId: string, toId: string, style: ApiLinkStyle = DEFAULT_LINK_STYLE, color: string = DEFAULT_LINK_COLOR) => {
      if (!canEditCards) return null;
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return null;
      if (!hasToken) return null;
      if (!fromId || !toId) return null;
      if (fromId === toId) return null;
      if (String(fromId).startsWith('draft-') || String(toId).startsWith('draft-')) return null;

      try {
        const res = await axiosInstance.post<ApiCardLink>(`/api/boards/${numericBoardId}/links`, {
          from_card_id: Number(fromId),
          to_card_id: Number(toId),
          style,
          color,
        });
        return res.data ?? null;
      } catch {
        reportError('Не удалось создать связь.');
        return null;
      }
    },
    [canEditCards, hasToken, numericBoardId, reportError]
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
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    let cancelled = false;
    const loadLinks = async () => {
      try {
        const url = hasToken
          ? `/api/boards/${numericBoardId}/links`
          : `/api/boards/public/${numericBoardId}/links`;
        const res = await axiosInstance.get<ApiCardLink[]>(url);
        const links = Array.isArray(res.data) ? res.data : [];
        const nextEdges = links.map(buildEdgeFromLink);
        if (cancelled) return;
        setEdges(nextEdges);
      } catch {
        // ignore
      }
    };

    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [hasToken, numericBoardId, reloadLinksSeq]);

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
    [canEditCards, getNodeDragHandleSelector]
  );

  useEffect(() => {
    nodes.forEach((n) => {
      const src = n.data.imageSrc;
      if (!src) return;
      if (n.data.imageLoaded) return;
      const key = `${String(n.id)}|${src}`;
      if (imagePreloadStartedRef.current.has(key)) return;
      imagePreloadStartedRef.current.add(key);

      const markLoaded = () => {
        setNodes((prev) =>
          prev.map((p) => {
            if (String(p.id) !== String(n.id)) return p;
            if (p.data.imageSrc !== src) return p;
            if (p.data.imageLoaded) return p;
            return { ...p, data: { ...p.data, imageLoaded: true } };
          })
        );
      };

      const img = new Image();
      img.onload = markLoaded;
      img.onerror = markLoaded;
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

  const pointerGestures = useFlowBoardPointerGestures({
    canEditCards,
    reactFlow,
    containerRef,
    contextMenuRef,
    createPanelRef,
    closeContextMenu,
    openContextMenuAt,
    flowCardSettingsOpen,
    cancelCardSettings,
    nodeRectangleSelector: `.${classes.node_rectangle}`,
    dragHandleSelector: `.${classes.flow_drag_handle}`,
  });

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
      startLinkMode: () => {
        if (!canEditCards) return;
        if (flowCardSettingsOpen) cancelCardSettings();
        closeContextMenu();
        setSelectedNodeOnly(null);
        startLinkMode();
      },
    }),
    [canEditCards, cancelCardSettings, closeContextMenu, createDraftNodeAt, flowCardSettingsOpen, setSelectedNodeOnly, startLinkMode]
  );

  const setDraftTitleLive = (title: string) => {
    if (!activeNodeId) return;
    const next = String(title ?? '').slice(0, 50);
    setFlowCardSettingsDraft({ title: next });
    applyPreviewToNode(activeNodeId, { title: next });
  };

  const isTouchLikeDevice = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

  const dismissTitleKeyboard = (input: HTMLInputElement | null) => {
    if (!input) return;
    if (!isTouchLikeDevice()) return;

    input.blur();
    window.setTimeout(() => {
      input.blur();
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement && activeEl !== document.body) {
        activeEl.blur();
      }
    }, 0);
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
        suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);

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
      const isTitleInputTarget = Boolean(targetEl) && targetEl === titleInputRef.current;

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

      if (isTitleInputTarget && isTouchLikeDevice()) {
        e.preventDefault();
        e.stopPropagation();
        dismissTitleKeyboard(titleInputRef.current);
        return;
      }

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
      className={`${classes.space_container} ${__PLATFORM__ === 'desktop' ? classes.space_container_desktop : ''} ${__PLATFORM__ === 'desktop' && selectionModifierPressed ? classes.space_container_selecting : ''} ${canEditCards ? classes.space_container_can_edit : ''} ${!canEditCards ? classes.space_container_readonly : ''} ${isConnecting ? classes.space_container_connecting : ''}`.trim()}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onClickCapture={pointerGestures.handleClickCapture}
      onPointerDownCapture={pointerGestures.handlePointerDownCapture}
      onPointerDown={pointerGestures.handlePointerDown}
      onPointerMove={pointerGestures.handlePointerMove}
      onPointerUp={pointerGestures.handlePointerUp}
      onPointerCancel={pointerGestures.handlePointerCancel}
      onWheelCapture={() => closeContextMenu()}
    >
      <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edgesForRender}
            fitView
            zoomOnDoubleClick={false}
            selectionKeyCode={null}
            selectionOnDrag={__PLATFORM__ === 'desktop' ? selectionModifierPressed : false}
            panOnDrag={__PLATFORM__ === 'desktop' ? !selectionModifierPressed : true}
            selectionMode={SelectionMode.Partial}
            connectionLineType={ConnectionLineType.Straight}
            connectionLineComponent={HoverConnectionLine}
            connectionRadius={1}
            nodesConnectable={canEditCards}
            proOptions={{ hideAttribution: true }}
            onMoveStart={() => closeContextMenu()}
            onInit={setReactFlow}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onSelectionStart={(event) => {
              if (__PLATFORM__ === 'desktop' && !(event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                event.stopPropagation();
                setSelectionModifierPressed(false);
                clearSelectedElements();
                return;
              }

              if (boardMenuView === 'link' && selectedLink) {
                closeLinkInspector();
                clearSelectedEdges();
              }
            }}
            onConnectStart={(_, params) => {
              if (!canEditCards) return;
              const sourceId = params?.nodeId ? String(params.nodeId) : null;
              connectingFromNodeIdRef.current = sourceId;
              setConnectingSourceNodeId(sourceId);
              connectingHoverTargetNodeIdRef.current = null;
              setConnectingHoverTargetNodeId(null);
              createdViaOnConnectRef.current = false;
              setIsConnecting(true);
            }}
            onConnectEnd={async () => {
              const source = connectingFromNodeIdRef.current;
              const target = connectingHoverTargetNodeIdRef.current;
              connectingFromNodeIdRef.current = null;
              setConnectingSourceNodeId(null);
              connectingHoverTargetNodeIdRef.current = null;
              setConnectingHoverTargetNodeId(null);
              setIsConnecting(false);
              if (createdViaOnConnectRef.current) {
                createdViaOnConnectRef.current = false;
                return;
              }
              if (!source || !target) return;
              const link = await persistLinkCreate(source, target, DEFAULT_LINK_STYLE, DEFAULT_LINK_COLOR);
              if (!link) return;
              addEdgeFromLink(link);
            }}
            onConnect={async (params) => {
              const source = params?.source ? String(params.source) : '';
              const target = params?.target ? String(params.target) : '';
              if (!source || !target) return;
              createdViaOnConnectRef.current = true;
              const link = await persistLinkCreate(source, target, DEFAULT_LINK_STYLE, DEFAULT_LINK_COLOR);
              if (!link) return;
              addEdgeFromLink(link);
            }}
            onSelectionChange={(sel) => {
              const selectedNodes = sel?.nodes ?? [];
              if (selectedNodes.length === 1) setLinkSourceNodeId(String(selectedNodes[0].id));
              else setLinkSourceNodeId(null);

              const edgeIsActive = boardMenuView === 'link' && Boolean(selectedLink);
              if (edgeIsActive) {
                setEdgeHighlightBySelectedNodes(new Set());
                return;
              }

              setEdgeHighlightBySelectedNodes(new Set(selectedNodes.map((n) => String(n.id))));
            }}
            onPaneClick={() => {
              closeLinkInspector();
              closeContextMenu();
              clearSelectedElements();
            }}
            onEdgeClick={(event, edge) => {
              if (!canEditCards || !hasToken) return;

              event.preventDefault();
              event.stopPropagation();

              const parsed = parseFlowEdgeData({ edge, defaultColor: DEFAULT_LINK_COLOR });
              if (!parsed) return;

              const { linkId, fromCardId, toCardId, style, color, label, isLabelVisible } = parsed;

              const fromTitle = nodes.find((n) => String(n.id) === String(edge.source))?.data?.title ?? null;
              const toTitle = nodes.find((n) => String(n.id) === String(edge.target))?.data?.title ?? null;

              if (flowCardSettingsOpen) closeFlowCardSettings();

              setEdgeHighlightBySelectedNodes(new Set());

              const edgeId = `link-${linkId}`;
              selectEdgeAndNodes({
                edgeId,
                fromNodeId: String(fromCardId),
                toNodeId: String(toCardId),
              });

              openLinkInspector({
                linkId,
                boardId: numericBoardId,
                fromCardId,
                toCardId,
                style,
                color,
                label,
                isLabelVisible,
                fromTitle,
                toTitle,
              });
            }}
            onNodeDragStart={(_, node) => {
              const typed = node as RFNode<FlowNodeData>;
              const id = String(typed.id);
              draggingNodeIdRef.current = id;
              draggingNodeStartPosRef.current = {
              id,
              x: Number(typed.position?.x) || 0,
              y: Number(typed.position?.y) || 0,
            };

            const currentNodes = reactFlow?.getNodes?.() ?? nodes;
            const selected = currentNodes.filter((n) => Boolean((n as RFNode<FlowNodeData>).selected));
            const toTrack = selected.length ? selected : [typed];
            dragStartSelectedPositionsRef.current = new Map(
              toTrack.map((n) => [String(n.id), { x: Number(n.position?.x) || 0, y: Number(n.position?.y) || 0 }])
            );
          }}
          onNodeDragStop={(_, node) => {
            const typed = node as RFNode<FlowNodeData>;
            const id = String(typed.id);
            if (draggingNodeIdRef.current !== id) return;
            draggingNodeIdRef.current = null;
            const start = draggingNodeStartPosRef.current;
            draggingNodeStartPosRef.current = null;
            const startSelected = dragStartSelectedPositionsRef.current;
            dragStartSelectedPositionsRef.current = null;

            const x = Number(typed.position?.x);
            const y = Number(typed.position?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;

            const currentNodes = reactFlow?.getNodes?.() ?? nodes;

            if (startSelected && startSelected.size) {
              const byId = new Map(currentNodes.map((n) => [String(n.id), n]));
              const updates = Array.from(startSelected.entries())
                .map(([nodeId, pos]) => {
                  const cur = byId.get(nodeId) as RFNode<FlowNodeData> | undefined;
                  if (!cur) return null;
                  if (String(nodeId).startsWith('draft-')) return null;
                  const nx = Number(cur.position?.x);
                  const ny = Number(cur.position?.y);
                  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
                  const moved = Math.hypot(nx - pos.x, ny - pos.y) >= 1;
                  if (!moved) return null;
                  return { nodeId, x: nx, y: ny };
                })
                .filter(Boolean) as Array<{ nodeId: string; x: number; y: number }>;

              if (!updates.length) return;
              void Promise.allSettled(updates.map((u) => persistCardPosition(u.nodeId, u.x, u.y)));
              return;
            }

            if (start && start.id === id) {
              const moved = Math.hypot(x - start.x, y - start.y) >= 1;
              if (!moved) return;
            }
            void persistCardPosition(String(typed.id), x, y);
          }}
          onNodeClick={(event, node) => {
            if (linkModeStep !== 'off') {
              event.preventDefault();
              event.stopPropagation();

              const typed = node as RFNode<FlowNodeData>;
              const clickedId = String(typed.id);
              if (!clickedId || clickedId.startsWith('draft-')) return;
              if (linkModeStep === 'first') setLinkSourceNodeId(clickedId);

              void handleNodeClickInLinkMode<ApiCardLink>(clickedId, {
                setSelectedNodeOnly,
                persistLinkCreate: (fromId, toId) => persistLinkCreate(fromId, toId, DEFAULT_LINK_STYLE, DEFAULT_LINK_COLOR),
                onLinkCreated: (link) => addEdgeFromLink(link),
              });

              return;
            }

            const typed = node as RFNode<FlowNodeData>;
            const clickedId = String(typed.id);

            if ((event as unknown as { ctrlKey?: boolean; metaKey?: boolean }).ctrlKey || (event as unknown as { metaKey?: boolean }).metaKey) return;
            const targetEl = event.target as Element | null;
            if (targetEl?.closest?.('.react-flow__handle')) return;
            const clickedShape =
              Boolean(targetEl?.closest(`.${classes.flow_drag_handle}`)) ||
              (String(typed.type) === 'rectangle' && Boolean(targetEl?.closest(`.${classes.node_rectangle}`)));
            if (!clickedShape) return;
            if (
              boardMenuView === 'link' &&
              selectedLink &&
              clickedId &&
              !clickedId.startsWith('draft-')
            ) {
              closeLinkInspector();
              clearSelectedEdges();
              setNodes((prev) => prev.map((n) => ({ ...n, selected: String(n.id) === clickedId })));
              setEdgeHighlightBySelectedNodes(new Set([clickedId]));
            }
            setLinkSourceNodeId(String(typed.id));
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
      <FlowLinkModeAlarm step={linkModeStep} onCancel={cancelLinkMode} />
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
            <form
              className={classes.form_field}
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissTitleKeyboard(titleInputRef.current);
              }}
            >
              <div className={classes.form_label}>Название</div>
              <input
                className={classes.create_panel_input}
                ref={titleInputRef}
                value={displayTitle}
                onChange={e => setDraftTitleLive(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                  if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (!isTouchLikeDevice()) return;
                  e.preventDefault();
                  e.stopPropagation();
                  dismissTitleKeyboard(e.currentTarget);
                }}
                onKeyUp={(e) => {
                  if (e.key !== 'Enter') return;
                  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                  if ((e.nativeEvent as KeyboardEvent).isComposing) return;
                  if (!isTouchLikeDevice()) return;
                  e.preventDefault();
                  e.stopPropagation();
                  dismissTitleKeyboard(e.currentTarget);
                }}
                onBeforeInput={(e) => {
                  const nativeEvent = e.nativeEvent as InputEvent;
                  if (nativeEvent.inputType !== 'insertLineBreak') return;
                  if (!isTouchLikeDevice()) return;
                  e.preventDefault();
                  e.stopPropagation();
                  dismissTitleKeyboard(e.currentTarget);
                }}
                enterKeyHint="done"
                placeholder={visualEditing ? 'Название' : 'Выберите запись'}
                maxLength={50}
                disabled={!isEditing}
              />
              <button
                type="submit"
                aria-hidden="true"
                tabIndex={-1}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1, padding: 0, border: 0 }}
              />
            </form>

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
              <div className={classes.danger_action_row}>
                <DropdownWrapper upDel closeOnClick={false} isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
                {[
                  <button
                    key="trigger"
                    type="button"
                    className={classes.danger_action_trigger}
                    onClick={() => setDeleteConfirmOpen((prev) => !prev)}
                    disabled={!isEditing || draftSaving || imageUploading}
                    aria-label="Удалить запись"
                  >
                    Удалить
                  </button>,
                  <div key="menu">
                    <button
                      type="button"
                      data-dropdown-class={classes.confirm_danger}
                      onClick={() => void deleteActive()}
                      disabled={!isEditing || draftSaving || imageUploading}
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      data-dropdown-class={classes.confirm_cancel}
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
