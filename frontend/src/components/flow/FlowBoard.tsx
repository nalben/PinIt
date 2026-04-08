import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { useLayoutEffect } from 'react';
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
import { HexColorPicker } from 'react-colorful';
import classes from './FlowBoard.module.scss';
import axiosInstance from '@/api/axiosInstance';
import Mainbtn from '@/components/_UI/mainbtn/Mainbtn';
import DropdownWrapper from '@/components/_UI/dropdownwrapper/DropdownWrapper';
import ImageCropModal from '@/components/_UI/imagecropmodal/ImageCropModal';
import UnsavedChangesModal from '@/components/_UI/unsavedchangesmodal/UnsavedChangesModal';
import LockClose from '@/assets/icons/monochrome/lock_close.svg';
import LockOpen from '@/assets/icons/monochrome/lock_open.svg';
import Details from '@/assets/icons/monochrome/details.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import ColorIcon from '@/assets/icons/monochrome/color.svg';
import { BOARD_MENU_WIDE_MIN_WIDTH, useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { ApiCard, ApiCardLink, ApiLinkStyle, FlowNodeData, FlowNodeType } from './flowBoardModel';
import {
  buildEdgeFromLink,
  getBoundaryPoint,
  getInitialViewportForDenseArea,
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
import { useFlowBoardMenuTransitions } from '@/components/flowboard/hooks/useFlowBoardMenuTransitions';
import { FlowLinkModeAlarm } from '@/components/flowboard/components/FlowLinkModeAlarm';
import { useFlowCardFavoriteColors } from '@/components/flowboard/hooks/useFlowCardFavoriteColors';
import { getCardImageCropPreset } from '@/utils/imageCropPresets';
import { useEscapeHandler } from '@/hooks/useEscapeHandler';

export type FlowBoardHandle = {
  createDraftNodeAtCenter: () => void;
  startLinkMode: () => void;
};

const DEFAULT_LINK_STYLE: ApiLinkStyle = 'line';
const DEFAULT_LINK_COLOR = 'var(--pink)';

const MAX_CARD_IMAGE_SIZE_MB = 5;
const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;
const DEFAULT_CARD_PICKER_COLOR = '#E7CD73';
const PRESET_CARD_COLORS = ['#F28B82', '#F7C66F', '#F2E394', '#9FD3C7', '#7AC7E3', '#9DB7FF', '#C7A6FF', '#F3A6C8'] as const;

const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const color = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : null;
};

const collectUniqueHexColors = (colors: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  colors.forEach((value) => {
    const color = normalizeHexColor(value);
    if (!color || seen.has(color)) return;
    seen.add(color);
    result.push(color);
  });

  return result;
};

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

const ConnectionHandles = ({ isConnectable, shape, isLocked = false }: { isConnectable: boolean; shape: FlowNodeType; isLocked?: boolean }) => {
  const sourceClass = `${classes.flow_link_handle} ${classes.flow_link_handle_source} nodrag`.trim();
  const targetClass = `${classes.flow_link_handle} ${classes.flow_link_handle_target} nodrag`.trim();
  const style = getLinkHandleStyle(shape, { isLocked });
  return (
    <>
      <Handle type="source" id="s" position={Position.Top} className={sourceClass} style={style} isConnectable={isConnectable} />
      <Handle type="target" id="t" position={Position.Top} className={targetClass} style={style} isConnectable={isConnectable} />
    </>
  );
};

type NodeFloatMotion = {
  style: React.CSSProperties;
};

type NodeFloatVector = {
  x: number;
  y: number;
  rotate: number;
};

type NodeFloatPathPoint = {
  t: number;
  x: number;
  y: number;
  rotate: number;
};

const NODE_FLOAT_PATHS: readonly (readonly NodeFloatPathPoint[])[] = [
  [
    { t: 0, x: 0, y: 0, rotate: 0 },
    { t: 0.19, x: 0.55, y: -0.45, rotate: -0.6 },
    { t: 0.38, x: -0.35, y: -0.9, rotate: 0.8 },
    { t: 0.61, x: 0.9, y: 0.2, rotate: -0.45 },
    { t: 0.83, x: -0.6, y: 0.8, rotate: 0.55 },
    { t: 1, x: 0, y: 0, rotate: 0 },
  ],
  [
    { t: 0, x: 0, y: 0, rotate: 0 },
    { t: 0.16, x: -0.75, y: 0.15, rotate: 0.6 },
    { t: 0.33, x: -0.25, y: -0.95, rotate: -0.55 },
    { t: 0.57, x: 0.8, y: -0.2, rotate: 0.35 },
    { t: 0.78, x: 0.3, y: 0.85, rotate: -0.75 },
    { t: 1, x: 0, y: 0, rotate: 0 },
  ],
  [
    { t: 0, x: 0, y: 0, rotate: 0 },
    { t: 0.14, x: 0.2, y: -0.85, rotate: -0.65 },
    { t: 0.29, x: -0.9, y: -0.25, rotate: 0.55 },
    { t: 0.54, x: 0.65, y: 0.35, rotate: -0.35 },
    { t: 0.72, x: -0.2, y: 0.95, rotate: 0.75 },
    { t: 0.89, x: 0.85, y: -0.15, rotate: -0.45 },
    { t: 1, x: 0, y: 0, rotate: 0 },
  ],
  [
    { t: 0, x: 0, y: 0, rotate: 0 },
    { t: 0.18, x: -0.45, y: -0.7, rotate: 0.65 },
    { t: 0.36, x: 0.95, y: -0.1, rotate: -0.35 },
    { t: 0.58, x: 0.15, y: 0.9, rotate: 0.8 },
    { t: 0.76, x: -0.85, y: 0.35, rotate: -0.6 },
    { t: 1, x: 0, y: 0, rotate: 0 },
  ],
] as const;

const FLOAT_CLOCK = (() => {
  let now = 0;
  let frameId: number | null = null;
  const listeners = new Set<() => void>();

  const tick = () => {
    now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    listeners.forEach((listener) => listener());
    frameId = listeners.size ? window.requestAnimationFrame(tick) : null;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1 && typeof window !== 'undefined') {
        now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        frameId = window.requestAnimationFrame(tick);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size && frameId !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
      };
    },
    getSnapshot: () => now,
    getServerSnapshot: () => 0,
  };
})();

const useNodeFloatNow = () =>
  useSyncExternalStore(FLOAT_CLOCK.subscribe, FLOAT_CLOCK.getSnapshot, FLOAT_CLOCK.getServerSnapshot);

const hashNodeFloatSeed = (nodeId: string) => {
  let hash = 2166136261;
  for (let i = 0; i < nodeId.length; i += 1) {
    hash ^= nodeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const sampleNodeFloatPath = (path: readonly NodeFloatPathPoint[], progress: number): NodeFloatPathPoint => {
  if (progress <= 0) return path[0];
  if (progress >= 1) return path[path.length - 1];

  for (let i = 1; i < path.length; i += 1) {
    const prev = path[i - 1];
    const next = path[i];
    if (progress > next.t) continue;

    const range = next.t - prev.t || 1;
    const localT = (progress - prev.t) / range;
    const easedT = localT * localT * (3 - 2 * localT);
    return {
      t: progress,
      x: prev.x + (next.x - prev.x) * easedT,
      y: prev.y + (next.y - prev.y) * easedT,
      rotate: prev.rotate + (next.rotate - prev.rotate) * easedT,
    };
  }

  return path[path.length - 1];
};

const getNodeFloatVector = (nodeId: string, now: number): NodeFloatVector => {
  const seed = hashNodeFloatSeed(nodeId);
  const durationSeconds = 14 + (seed % 8);
  const durationMs = durationSeconds * 1000;
  const phaseMs = (seed >>> 4) % durationMs;
  const amplitudeX = 2 + ((seed >>> 8) % 4);
  const amplitudeY = 2 + ((seed >>> 12) % 4);
  const rotationDeg = (18 + ((seed >>> 16) % 16)) / 100;
  const path = NODE_FLOAT_PATHS[seed % NODE_FLOAT_PATHS.length] ?? NODE_FLOAT_PATHS[0];
  const progress = durationMs > 0 ? ((now + phaseMs) % durationMs) / durationMs : 0;
  const sample = sampleNodeFloatPath(path, progress);
  return {
    x: sample.x * amplitudeX,
    y: sample.y * amplitudeY,
    rotate: sample.rotate * rotationDeg,
  };
};

const getNodeFloatMotion = (nodeId: string, now: number): NodeFloatMotion => {
  const vector = getNodeFloatVector(nodeId, now);
  return {
    style: {
      transform: `translate3d(${vector.x.toFixed(2)}px, ${vector.y.toFixed(2)}px, 0) rotate(${vector.rotate.toFixed(3)}deg)`,
    },
  };
};

const RectangleNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  const floatNow = useNodeFloatNow();
  const floatMotion = useMemo(() => getNodeFloatMotion(String(id), floatNow), [floatNow, id]);
  const nodeStyle = !hasImage && data.color ? { backgroundColor: data.color } : undefined;
  return (
    <div className={classes.node_rectangle_shell}>
      <div className={classes.flow_node_float} style={floatMotion.style}>
        <div className={classes.node_rectangle} style={nodeStyle}>
          {hasImage ? (
            <div
              className={classes.node_image_layer}
              style={{ backgroundImage: `url(${data.imageSrc})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              aria-hidden="true"
            />
          ) : null}
          {isDraft ? null : <ConnectionHandles shape="rectangle" isConnectable={!data.isLocked} isLocked={Boolean(data.isLocked)} />}
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
      </div>
    </div>
  );
};

const RhombusNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  const floatNow = useNodeFloatNow();
  const floatMotion = useMemo(() => getNodeFloatMotion(String(id), floatNow), [floatNow, id]);
  const nodeStyle = !hasImage && data.color ? { backgroundColor: data.color } : undefined;
  return (
    <div className={classes.node_rhombus_shell}>
      <div className={classes.flow_node_float} style={floatMotion.style}>
        <div className={classes.node_rhombus}>
          {isDraft ? null : <ConnectionHandles shape="rhombus" isConnectable={!data.isLocked} />}
          <div
            className={classes.rhombus_content}
            style={nodeStyle}
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
      </div>
    </div>
  );
};

const CircleNode: React.FC<NodeProps<FlowNodeData>> = ({ data, id }) => {
  const showSkeleton = Boolean(data.imageSrc && !data.imageLoaded);
  const isDraft = String(id).startsWith('draft-');
  const hasImage = Boolean(data.imageSrc && data.imageLoaded);
  const floatNow = useNodeFloatNow();
  const floatMotion = useMemo(() => getNodeFloatMotion(String(id), floatNow), [floatNow, id]);
  const nodeStyle = !hasImage && data.color ? { backgroundColor: data.color } : undefined;
  return (
    <div className={classes.node_circle_shell}>
      <div className={classes.flow_node_float} style={floatMotion.style}>
        <div className={`${classes.node_circle} ${data.imageSrc && data.imageLoaded ? classes.node_circle_has_image : ''}`.trim()}>
          {isDraft ? null : <ConnectionHandles shape="circle" isConnectable={!data.isLocked} />}
          <div
            className={classes.circle_content}
            style={nodeStyle}
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
      </div>
    </div>
  );
};

const NODE_TYPES = { rectangle: RectangleNode, rhombus: RhombusNode, circle: CircleNode } as const;

const FlowStraightEdge: React.FC<EdgeProps> = (props) => {
  const { id, source, target, style, markerEnd, sourceX, sourceY, targetX, targetY, data } = props;
  const rf = useReactFlow();
  const floatNow = useNodeFloatNow();
  const isSelected = Boolean((props as unknown as { selected?: boolean })?.selected);
  const [isHovered, setIsHovered] = useState(false);
  const isDesktopHover = __PLATFORM__ === 'desktop';
  const sourceFloat = useMemo(() => getNodeFloatVector(String(source), floatNow), [floatNow, source]);
  const targetFloat = useMemo(() => getNodeFloatVector(String(target), floatNow), [floatNow, target]);

  const sNode = rf.getNode(source);
  const tNode = rf.getNode(target);
  const sRect = getNodeRect(sNode);
  const tRect = getNodeRect(tNode);

  let sx = sourceX + sourceFloat.x;
  let sy = sourceY + sourceFloat.y;
  let tx = targetX + targetFloat.x;
  let ty = targetY + targetFloat.y;

  const MIN_EDGE_RENDER_LEN_PX = 12;
  const OVERLAP_HIDE_AABB_PAD_PX = 8;

  if (sRect && tRect) {
    const sType = (sNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const tType = (tNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const sourceCx = sRect.cx + sourceFloat.x;
    const sourceCy = sRect.cy + sourceFloat.y;
    const targetCx = tRect.cx + targetFloat.x;
    const targetCy = tRect.cy + targetFloat.y;
    const dx = targetCx - sourceCx;
    const dy = targetCy - sourceCy;

    const overlapsOrTouchesAabb =
      Math.abs(dx) <= sRect.hw + tRect.hw + OVERLAP_HIDE_AABB_PAD_PX &&
      Math.abs(dy) <= sRect.hh + tRect.hh + OVERLAP_HIDE_AABB_PAD_PX;

    if (overlapsOrTouchesAabb) return null;

    const p1 = getBoundaryPoint(sType, sourceCx, sourceCy, dx, dy, sRect.hw, sRect.hh);
    const p2 = getBoundaryPoint(tType, targetCx, targetCy, -dx, -dy, tRect.hw, tRect.hh);
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

  const renderedStyle = isSelected ? { ...(style ?? {}), stroke: 'var(--white)' } : style;
  const strokeColor = typeof (renderedStyle as { stroke?: unknown } | undefined)?.stroke === 'string'
    ? String((renderedStyle as { stroke?: unknown }).stroke)
    : typeof (style as { stroke?: unknown } | undefined)?.stroke === 'string'
      ? String((style as { stroke?: unknown }).stroke)
      : 'var(--pink)';

  const renderedStyleWithCap = isArrow ? { ...(renderedStyle ?? {}), strokeLinecap: 'butt' as const } : renderedStyle;

  const arrowHead = isArrow ? (
    <path className={classes.flow_edge_arrowhead} d={`M ${tipX} ${tipY} L ${lx} ${ly} L ${rx} ${ry} Z`} fill={strokeColor} />
  ) : null;

  return (
    <g
      onMouseEnter={isDesktopHover ? () => setIsHovered(true) : undefined}
      onMouseLeave={isDesktopHover ? () => setIsHovered(false) : undefined}
    >
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

type FlowBoardProps = {
  canEditCards?: boolean;
  boardMenuRef?: React.RefObject<HTMLDivElement | null>;
  onRequestBoardMenuBlur?: () => boolean;
  onRequestImplicitLinkInspectorClose?: () => boolean;
};

const FlowBoard = React.forwardRef<FlowBoardHandle, FlowBoardProps>(({
  canEditCards = false,
  boardMenuRef,
  onRequestBoardMenuBlur,
  onRequestImplicitLinkInspectorClose,
}, ref) => {
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
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const colorPaletteBodyRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreloadStartedRef = useRef<Set<string>>(new Set());
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes] = useState<RFNode<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const initialViewportAppliedRef = useRef(false);
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
  const openFlowCardSettingsFromNode = useUIStore((s) => s.openFlowCardSettingsFromNode);
  const closeFlowCardSettings = useUIStore((s) => s.closeFlowCardSettings);
  const setFlowCardSettingsDraft = useUIStore((s) => s.setFlowCardSettingsDraft);
  const openLinkInspector = useUIStore((s) => s.openLinkInspector);
  const closeLinkInspector = useUIStore((s) => s.closeLinkInspector);
  const openCardDetails = useUIStore((s) => s.openCardDetails);
  const openCardDetailsFromNode = useUIStore((s) => s.openCardDetailsFromNode);
  const patchSelectedCardDetails = useUIStore((s) => s.patchSelectedCardDetails);
  const closeCardDetails = useUIStore((s) => s.closeCardDetails);
  const handleBoardMenuBlur = useUIStore((s) => s.handleBoardMenuBlur);
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
  const activeCardId = useMemo(() => {
    if (!activeNodeId) return null;
    if (String(activeNodeId).startsWith('draft-')) return null;
    const id = Number(activeNodeId);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [activeNodeId]);
  const isEditing = Boolean(flowCardSettingsOpen && flowCardSettings && flowCardSettingsDraft && activeNodeId);
  const canOpenDetails = Boolean(activeCardId && Number.isFinite(numericBoardId) && numericBoardId > 0);
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

  const getNodeWrapperClassName = useCallback(
    (nodeId: string, isSelected: boolean) => {
      const nextClassParts = [classes.flow_node_wrapper];
      if (isSelected) nextClassParts.push(classes.flow_node_selected);

      if (isConnecting) {
        if (connectingSourceNodeId && nodeId === String(connectingSourceNodeId)) nextClassParts.push(classes.flow_node_link_source);
      } else if (linkSourceNodeId && nodeId === String(linkSourceNodeId)) {
        nextClassParts.push(classes.flow_node_link_source);
      }

      if (isConnecting && connectingHoverTargetNodeId && nodeId === String(connectingHoverTargetNodeId)) {
        nextClassParts.push(classes.flow_node_link_hover);
      }

      return nextClassParts.join(' ');
    },
    [connectingHoverTargetNodeId, connectingSourceNodeId, isConnecting, linkSourceNodeId]
  );

  const cardToNode = useCallback(
    (c: ApiCard): RFNode<FlowNodeData> => {
      const nodeType = mapApiTypeToNodeType(c.type);
      const imageSrc = resolveImageSrc(c.image_path ?? null);
      const color = normalizeHexColor(c.color);
      const imageLoaded = !imageSrc;
      return {
        id: String(c.id),
        type: nodeType,
        className: classes.flow_node_wrapper,
        dragHandle: getNodeDragHandleSelector(nodeType),
        position: { x: Number(c.x) || 0, y: Number(c.y) || 0 },
        draggable: canEditCards && !Boolean(c.is_locked),
        data: {
          title: (c.title ?? 'title').trim() || 'title',
          imageSrc,
          color,
          isLocked: Boolean(c.is_locked),
          imageLoaded,
        },
      };
    },
    [canEditCards, getNodeDragHandleSelector]
  );

  const cardToNodeRef = useRef(cardToNode);
  useEffect(() => {
    cardToNodeRef.current = cardToNode;
  }, [cardToNode]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const id = String(n.id);
        const nextClass = getNodeWrapperClassName(id, Boolean(n.selected));
        if (String(n.className || '') === nextClass) return n;
        return { ...n, className: nextClass };
      })
    );
  }, [getNodeWrapperClassName, nodes]);

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
    const floatNow = useNodeFloatNow();
    const hoverId = connectingHoverTargetNodeId;

    const sourceId = connectingFromNodeIdRef.current;
    const sNode = sourceId ? rf.getNode(sourceId) : null;
    const sRect = getNodeRect(sNode);
    const sourceFloat = sourceId ? getNodeFloatVector(sourceId, floatNow) : { x: 0, y: 0, rotate: 0 };
    const hoverFloat = hoverId ? getNodeFloatVector(hoverId, floatNow) : { x: 0, y: 0, rotate: 0 };

    let finalToX = toX;
    let finalToY = toY;
    let finalFromX = fromX + sourceFloat.x;
    let finalFromY = fromY + sourceFloat.y;

    const MIN_EDGE_RENDER_LEN_PX = 12;
    const OVERLAP_AABB_TOLERANCE_PX = 4;

    if (hoverId && sRect) {
      const tNode = rf.getNode(hoverId);
      const tRect = getNodeRect(tNode);
      if (tRect) {
        const sType = (sNode?.type as FlowNodeType | undefined) ?? 'rectangle';
        const tType = (tNode?.type as FlowNodeType | undefined) ?? 'rectangle';
        const sourceCx = sRect.cx + sourceFloat.x;
        const sourceCy = sRect.cy + sourceFloat.y;
        const targetCx = tRect.cx + hoverFloat.x;
        const targetCy = tRect.cy + hoverFloat.y;
        const dx = targetCx - sourceCx;
        const dy = targetCy - sourceCy;

        const overlapsAabb =
          Math.abs(dx) < sRect.hw + tRect.hw - OVERLAP_AABB_TOLERANCE_PX &&
          Math.abs(dy) < sRect.hh + tRect.hh - OVERLAP_AABB_TOLERANCE_PX;
        if (overlapsAabb) return null;

        const p1 = getBoundaryPoint(sType, sourceCx, sourceCy, dx, dy, sRect.hw, sRect.hh);
        const p2 = getBoundaryPoint(tType, targetCx, targetCy, -dx, -dy, tRect.hw, tRect.hh);
        finalFromX = p1.x;
        finalFromY = p1.y;
        finalToX = p2.x;
        finalToY = p2.y;
      }
    } else if (hoverId) {
      const n = rf.getNode(hoverId);
      const tRect = getNodeRect(n);
      if (tRect) {
        finalToX = tRect.cx + hoverFloat.x;
        finalToY = tRect.cy + hoverFloat.y;
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
  const displayColor = normalizeHexColor(visualDraft?.color);
  const hasVisualSelection = Boolean(displayImagePreview || displayColor);
  const boardColorOptions = useMemo(() => collectUniqueHexColors(nodes.map((node) => node.data.color)), [nodes]);
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false);
  const [colorPaletteDraft, setColorPaletteDraft] = useState<string | null>(null);
  const [colorPaletteLayout, setColorPaletteLayout] = useState<{
    left: number;
    bottom: number;
    width: number;
    maxHeight: number;
    height: number | null;
    isConstrained: boolean;
  } | null>(null);

  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const pendingObjectUrlRef = useRef<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cardCloseConfirmOpen, setCardCloseConfirmOpen] = useState(false);
  const hasUnsavedCardSettingsChanges = useMemo(() => {
    if (!flowCardSettingsOpen || !flowCardSettings || !flowCardSettingsDraft || !activeNodeId) return false;
    if (String(activeNodeId).startsWith('draft-')) return true;
    return (
      flowCardSettings.title !== flowCardSettingsDraft.title ||
      flowCardSettings.type !== flowCardSettingsDraft.type ||
      flowCardSettings.isLocked !== flowCardSettingsDraft.isLocked ||
      (flowCardSettings.imageSrc ?? null) !== (flowCardSettingsDraft.imageSrc ?? null) ||
      normalizeHexColor(flowCardSettings.color) !== normalizeHexColor(flowCardSettingsDraft.color) ||
      Boolean(pendingImageFile) ||
      Boolean(cropSourceFile)
    );
  }, [activeNodeId, cropSourceFile, flowCardSettings, flowCardSettingsDraft, flowCardSettingsOpen, pendingImageFile]);
  const showTopAlarm = useUIStore((s) => s.showTopAlarm);
  const suppressSocketReloadByCardIdRef = useRef<Map<string, number>>(new Map());

  const reportError = useCallback(
    (message: string, error?: unknown) => {
      showTopAlarm(message);
      if (process.env.NODE_ENV !== 'production' && error) console.error(error);
    },
    [showTopAlarm]
  );
  const {
    favoriteColors,
    favoritesLoading,
    ensureFavoriteColorsLoaded,
    addFavoriteColor,
    removeFavoriteColor,
    resetFavoriteColors,
  } = useFlowCardFavoriteColors({
    numericBoardId,
    hasToken,
    onError: reportError,
  });
  const paletteDisplayColor = normalizeHexColor(colorPaletteDraft);
  const palettePickerColorValue = paletteDisplayColor ?? displayColor ?? DEFAULT_CARD_PICKER_COLOR;
  const isPaletteColorFavorite = Boolean(paletteDisplayColor && favoriteColors.includes(paletteDisplayColor));

  useEffect(() => {
    setColorPaletteOpen(false);
    setColorPaletteDraft(null);
  }, [activeNodeId, isEditing]);

  useEffect(() => {
    resetFavoriteColors();
  }, [hasToken, numericBoardId, resetFavoriteColors]);

  useLayoutEffect(() => {
    if (!colorPaletteOpen) {
      setColorPaletteLayout(null);
      return;
    }

    let rafId = 0;

    const measure = () => {
      const panelEl = createPanelRef.current;
      const paletteEl = colorPaletteRef.current;
      const paletteBodyEl = colorPaletteBodyRef.current;
      if (!panelEl || !paletteEl || !paletteBodyEl) return;

      const panelRect = panelEl.getBoundingClientRect();
      const viewportPadding = 12;
      const expandedFitSlackPx = 28;
      const modeHysteresisPx = 12;
      const availableHeight = Math.max(240, panelRect.bottom - viewportPadding);
      const constrainedHeight = Math.max(240, Math.min(panelRect.height, availableHeight));
      const paletteChromeHeight = Math.max(0, paletteEl.offsetHeight - paletteBodyEl.clientHeight);
      const naturalHeight = paletteBodyEl.scrollHeight + paletteChromeHeight;
      const expandedThreshold = availableHeight - expandedFitSlackPx;

      setColorPaletteLayout((prev) => {
        let isConstrained = prev?.isConstrained ?? naturalHeight > expandedThreshold;

        if (isConstrained) {
          if (naturalHeight <= expandedThreshold - modeHysteresisPx) {
            isConstrained = false;
          }
        } else if (naturalHeight >= expandedThreshold + modeHysteresisPx) {
          isConstrained = true;
        }

        return {
          left: panelRect.left,
          bottom: Math.max(12, window.innerHeight - panelRect.bottom),
          width: panelRect.width,
          maxHeight: availableHeight,
          height: isConstrained ? constrainedHeight : null,
          isConstrained,
        };
      });
    };

    const requestMeasure = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener('resize', requestMeasure);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', requestMeasure);
    };
  }, [boardColorOptions.length, colorPaletteOpen, favoriteColors.length]);

  const colorPaletteStyle = useMemo<React.CSSProperties>(() => {
    if (!colorPaletteLayout) {
      return { visibility: 'hidden' };
    }

    return {
      left: `${colorPaletteLayout.left}px`,
      bottom: `${colorPaletteLayout.bottom}px`,
      width: `${colorPaletteLayout.width}px`,
      maxHeight: `${colorPaletteLayout.maxHeight}px`,
      height: colorPaletteLayout.isConstrained && colorPaletteLayout.height ? `${colorPaletteLayout.height}px` : undefined,
    };
  }, [colorPaletteLayout]);
  const isColorPaletteConstrained = Boolean(colorPaletteLayout?.isConstrained);

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
    initialViewportAppliedRef.current = false;
  }, [numericBoardId]);

  useLayoutEffect(() => {
    if (initialViewportAppliedRef.current) return;
    if (!reactFlow) return;
    if (nodes.length === 0) return;

    const width = containerRef.current?.clientWidth ?? 0;
    const height = containerRef.current?.clientHeight ?? 0;
    const nextViewport = getInitialViewportForDenseArea(nodes, { width, height });
    if (!nextViewport) return;

    initialViewportAppliedRef.current = true;
    reactFlow.setViewport(nextViewport, { duration: 0 });
  }, [nodes, reactFlow]);

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
        const nextNodes = cards.map(cardToNodeRef.current);

        if (cancelled) return;
        setNodes((prev) => mergeLoadedNodes(prev, nextNodes));
      } catch (e) {
        if (!hasToken) return;
        try {
          const res = await axiosInstance.get<ApiCard[]>(`/api/boards/public/${numericBoardId}/cards`);
          const cards = Array.isArray(res.data) ? res.data : [];
          const nextNodes = cards.map(cardToNodeRef.current);
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
  }, [hasToken, mergeLoadedNodes, numericBoardId, reloadSeq]);

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
        if (!hasToken) return;
        try {
          const res = await axiosInstance.get<ApiCardLink[]>(`/api/boards/public/${numericBoardId}/links`);
          const links = Array.isArray(res.data) ? res.data : [];
          const nextEdges = links.map(buildEdgeFromLink);
          if (cancelled) return;
          setEdges(nextEdges);
        } catch {
          // ignore
        }
      }
    };

    loadLinks();
    return () => {
      cancelled = true;
    };
  }, [hasToken, numericBoardId, reloadLinksSeq]);

  const applyPreviewToNode = useCallback(
    (nodeId: string, patch: Partial<{ type: FlowNodeType; title: string; isLocked: boolean; imageSrc: string | null; color: string | null }>) => {
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
          const imageChanged = nextImageSrc !== n.data.imageSrc;
          if (imageChanged && nextImageSrc) {
            imagePreloadStartedRef.current.delete(`${String(n.id)}|${nextImageSrc}`);
          }
          const nextImageLoaded = imageChanged ? !nextImageSrc : Boolean(n.data.imageLoaded);
          const nextColor = patch.color !== undefined ? patch.color : n.data.color;

          return {
            ...n,
            type: nextType,
            dragHandle: nextDragHandle,
            position,
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
    setCropSourceFile(null);
    setPendingImageFile(null);
  }, []);

  const openSettingsForNode = useCallback(
    (node: RFNode<FlowNodeData>) => {
      if (!canEditCards) return;
      clearPendingImage();
      openFlowCardSettingsFromNode({
        nodeId: String(node.id),
        type: node.type as FlowNodeType,
        title: node.data.title,
        isLocked: Boolean(node.data.isLocked),
        imageSrc: node.data.imageSrc,
        color: node.data.color,
      });
    },
    [canEditCards, clearPendingImage, openFlowCardSettingsFromNode]
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
        imageSrc: flowCardSettings.imageSrc,
        color: flowCardSettings.color,
      });
    }

    clearPendingImage();
    closeFlowCardSettings();
  }, [applyPreviewToNode, clearPendingImage, closeFlowCardSettings, flowCardSettings]);

  const requestImplicitCardSettingsClose = useCallback(() => {
    if (!flowCardSettingsOpen) return false;
    if (draftSaving || imageUploading) return true;
    if (hasUnsavedCardSettingsChanges) {
      setCardCloseConfirmOpen(true);
      return true;
    }
    cancelCardSettings();
    return false;
  }, [cancelCardSettings, draftSaving, flowCardSettingsOpen, hasUnsavedCardSettingsChanges, imageUploading]);

  useEscapeHandler({
    id: 'flow-board:card-close-confirm',
    priority: 1250,
    isOpen: cardCloseConfirmOpen,
    onEscape: () => setCardCloseConfirmOpen(false),
  });

  const { handleEdgeClick, handleNodeClick } = useFlowBoardMenuTransitions({
    activeNodeId,
    boardMenuView,
    canEditCards,
    closeCardDetails,
    closeContextMenu,
    flowDragHandleClassName: classes.flow_drag_handle,
    flowCardSettingsOpen,
    hasToken,
    nodeRectangleClassName: classes.node_rectangle,
    nodes,
    numericBoardId,
    openCardDetailsFromNode,
    openLinkInspector,
    openSettingsForNode,
    selectedLink,
    selectEdgeAndNodes,
    setEdgeHighlightBySelectedNodes,
    setLinkSourceNodeId,
    setNodes,
    setSelectedNodeOnly,
    clearSelectedEdges,
    defaultLinkColor: DEFAULT_LINK_COLOR,
    requestImplicitFlowCardSettingsClose: requestImplicitCardSettingsClose,
    requestImplicitLinkInspectorClose: onRequestImplicitLinkInspectorClose ?? (() => false),
  });

  useEffect(() => {
    if (flowCardSettingsOpen) return;
    setCardCloseConfirmOpen(false);
  }, [flowCardSettingsOpen]);

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
      if (targetEl?.closest?.('[data-modal-scope="image-crop"]')) return;
      if (targetEl?.closest?.('[data-modal-scope="color-palette"]')) return;
      if (targetEl?.closest?.('[data-modal-scope="unsaved-changes"]')) return;
      const shouldIgnoreBoardMenuClick = typeof window !== 'undefined' && window.innerWidth >= BOARD_MENU_WIDE_MIN_WIDTH;
      const menuEl = boardMenuRef?.current;
      if (shouldIgnoreBoardMenuClick && menuEl && target && menuEl.contains(target)) return;
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
      if (targetEl?.closest?.('[data-modal-scope="image-crop"]')) return;
      if (targetEl?.closest?.('[data-modal-scope="color-palette"]')) return;
      if (targetEl?.closest?.('[data-modal-scope="unsaved-changes"]')) return;
      const shouldIgnoreBoardMenuClick = typeof window !== 'undefined' && window.innerWidth >= BOARD_MENU_WIDE_MIN_WIDTH;
      const menuEl = boardMenuRef?.current;
      if (shouldIgnoreBoardMenuClick && menuEl && target && menuEl.contains(target)) return;
      if (targetEl?.closest?.('.react-flow__node')) return;

      if (!moved) requestImplicitCardSettingsClose();
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
  }, [activeNodeId, boardMenuRef, flowCardSettingsOpen, requestImplicitCardSettingsClose]);

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
      className: getNodeWrapperClassName(id, false),
      dragHandle: `.${classes.node_rectangle}`,
      position,
      data: { title: startTitle, imageSrc: null, color: null, isLocked: false },
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
  }, [canEditCards, closeContextMenu, getNodeWrapperClassName, nodes, openSettingsForNode, reactFlow]);

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
    if (!String(activeNodeId).startsWith('draft-')) {
      const cardId = Number(activeNodeId);
      if (Number.isFinite(cardId) && cardId > 0) {
        patchSelectedCardDetails({ cardId, boardId: numericBoardId, title: next });
      }
    }
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

  const openDetailsFromPanel = () => {
    if (!activeCardId) return;
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    const title = String(flowCardSettingsDraft?.title ?? flowCardSettings?.title ?? '').trim();
    const wideBoardMenu = typeof window !== 'undefined' && window.innerWidth >= BOARD_MENU_WIDE_MIN_WIDTH;
    openCardDetails({
      cardId: activeCardId,
      boardId: numericBoardId,
      title
    });
    if (!wideBoardMenu) {
      closeFlowCardSettings();
    }
  };

  const syncSavedVisualsToActiveSettings = useCallback((next: { imageSrc?: string | null; color?: string | null }) => {
    useUIStore.setState((s) => ({
      flowCardSettings: s.flowCardSettings ? { ...s.flowCardSettings, ...next } : s.flowCardSettings,
      flowCardSettingsDraft: s.flowCardSettingsDraft ? { ...s.flowCardSettingsDraft, ...next } : s.flowCardSettingsDraft,
    }));
  }, []);

  const applyPendingCroppedImage = useCallback((file: File) => {
    if (!activeNodeId) return;

    clearPendingImage();
    const preview = URL.createObjectURL(file);
    pendingObjectUrlRef.current = preview;
    setPendingImageFile(file);
    setFlowCardSettingsDraft({ imageSrc: preview, color: null });
    applyPreviewToNode(activeNodeId, { imageSrc: preview, color: null });
  }, [activeNodeId, applyPreviewToNode, clearPendingImage, setFlowCardSettingsDraft]);

  const persistImageForActiveNode = useCallback(async (file: File) => {
    if (!activeNodeId) return;
    if (!canEditCards) return;

    const nodeId = String(activeNodeId);
    if (nodeId.startsWith('draft-')) {
      applyPendingCroppedImage(file);
      return;
    }

    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;
    if (!hasToken) return;

    setImageUploading(true);
    try {
      suppressSocketReloadByCardIdRef.current.set(nodeId, Date.now() + 1500);

      const form = new FormData();
      form.append('image', file);
      const res = await axiosInstance.patch<{ image_path: string | null; color?: string | null }>(
        `/api/boards/${numericBoardId}/cards/${nodeId}/image`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      const nextImageSrc = resolveImageSrc(res.data?.image_path ?? null);
      const nextColor = Object.prototype.hasOwnProperty.call(res.data || {}, 'color') ? normalizeHexColor(res.data?.color) : null;
      clearPendingImage();
      syncSavedVisualsToActiveSettings({ imageSrc: nextImageSrc ?? null, color: nextColor });
      applyPreviewToNode(nodeId, { imageSrc: nextImageSrc ?? null, color: nextColor });
    } catch (e) {
      reportError('Не удалось сохранить изображение карточки.', e);
    } finally {
      setImageUploading(false);
    }
  }, [activeNodeId, applyPendingCroppedImage, applyPreviewToNode, canEditCards, clearPendingImage, hasToken, numericBoardId, reportError, syncSavedVisualsToActiveSettings]);

  const handleImageSelected = (file: File | null) => {
    if (!activeNodeId) return;
    if (!file) return;
    if (file.size > MAX_CARD_IMAGE_SIZE_BYTES) {
      showTopAlarm(`Вес слишком большой, выберите изображение весом до ${MAX_CARD_IMAGE_SIZE_MB} МБ.`);
      return;
    }
    setCropSourceFile(file);
  };

  const restoreDraftPreview = useCallback(() => {
    if (!activeNodeId) return;
    applyPreviewToNode(activeNodeId, {
      imageSrc: flowCardSettingsDraft?.imageSrc ?? null,
      color: normalizeHexColor(flowCardSettingsDraft?.color),
    });
  }, [activeNodeId, applyPreviewToNode, flowCardSettingsDraft]);

  const closeColorPalette = useCallback(() => {
    setColorPaletteOpen(false);
    setColorPaletteDraft(null);
  }, []);

  const openColorPalette = useCallback(() => {
    if (!isEditing || draftSaving || imageUploading) return;
    void ensureFavoriteColorsLoaded();
    setColorPaletteDraft(normalizeHexColor(flowCardSettingsDraft?.color));
    setColorPaletteOpen(true);
  }, [draftSaving, ensureFavoriteColorsLoaded, flowCardSettingsDraft?.color, imageUploading, isEditing]);

  const cancelColorPalette = useCallback(() => {
    restoreDraftPreview();
    closeColorPalette();
  }, [closeColorPalette, restoreDraftPreview]);

  const removeImageLive = () => {
    if (!activeNodeId) return;
    closeColorPalette();
    clearPendingImage();
    setFlowCardSettingsDraft({ imageSrc: null, color: null });
    applyPreviewToNode(activeNodeId, { imageSrc: null, color: null });
  };

  const setPaletteColorLive = (color: string) => {
    if (!activeNodeId) return;
    const nextColor = normalizeHexColor(color);
    if (!nextColor) return;
    setColorPaletteDraft(nextColor);
    applyPreviewToNode(activeNodeId, { color: nextColor, imageSrc: null });
  };

  const saveColorPalette = useCallback(async () => {
    if (!activeNodeId) return;

    const nextColor = normalizeHexColor(colorPaletteDraft);
    if (!nextColor) {
      restoreDraftPreview();
      closeColorPalette();
      return;
    }

    const nodeId = String(activeNodeId);
    const isDraft = nodeId.startsWith('draft-');

    if (isDraft) {
      clearPendingImage();
      setFlowCardSettingsDraft({ color: nextColor, imageSrc: null });
      applyPreviewToNode(nodeId, { color: nextColor, imageSrc: null });
      closeColorPalette();
      return;
    }

    if (!hasToken) return;
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    setDraftSaving(true);
    try {
      suppressSocketReloadByCardIdRef.current.set(nodeId, Date.now() + 1500);
      const res = await axiosInstance.patch<Partial<{ image_path: string | null; color: string | null }>>(
        `/api/boards/${numericBoardId}/cards/${nodeId}`,
        { color: nextColor }
      );

      clearPendingImage();

      const nextImageSrc = Object.prototype.hasOwnProperty.call(res.data || {}, 'image_path')
        ? resolveImageSrc(res.data?.image_path ?? null)
        : null;
      const savedColor = Object.prototype.hasOwnProperty.call(res.data || {}, 'color')
        ? normalizeHexColor(res.data?.color)
        : nextColor;

      syncSavedVisualsToActiveSettings({ imageSrc: nextImageSrc ?? null, color: savedColor });
      applyPreviewToNode(nodeId, { imageSrc: nextImageSrc ?? null, color: savedColor });
      closeColorPalette();
    } catch (e) {
      restoreDraftPreview();
      reportError('Не удалось сохранить цвет карточки.', e);
    } finally {
      setDraftSaving(false);
    }
  }, [
    activeNodeId,
    applyPreviewToNode,
    clearPendingImage,
    closeColorPalette,
    colorPaletteDraft,
    hasToken,
    numericBoardId,
    reportError,
    restoreDraftPreview,
    setFlowCardSettingsDraft,
    syncSavedVisualsToActiveSettings,
  ]);

  const toggleCurrentColorFavorite = async () => {
    if (!paletteDisplayColor) return;
    if (isPaletteColorFavorite) {
      await removeFavoriteColor(paletteDisplayColor);
      return;
    }
    await addFavoriteColor(paletteDisplayColor);
  };

  useEffect(() => {
    if (!colorPaletteOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelColorPalette();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelColorPalette, colorPaletteOpen]);

  const pickerColorValue = palettePickerColorValue;
  const setDraftColorLive = setPaletteColorLive;
  const isDisplayColorFavorite = isPaletteColorFavorite;

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
      let nextImageSrc = flowCardSettingsDraft.imageSrc;
      let nextColor = flowCardSettingsDraft.color ?? null;

      if (isDraft) {
        const { data } = await axiosInstance.post<{ id: number }>(`/api/boards/${numericBoardId}/cards`, {
          type: typeForDb,
          title,
          color: flowCardSettingsDraft.color,
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
        const patch = {} as Partial<{ title: string; type: string; is_locked: boolean; x: number; y: number; color: string | null }>;
        if (flowCardSettings.title !== title) patch.title = title;
        if (flowCardSettings.type !== flowCardSettingsDraft.type) {
          patch.type = typeForDb;
          patch.x = node.position.x;
          patch.y = node.position.y;
        }
        if (flowCardSettings.isLocked !== flowCardSettingsDraft.isLocked) patch.is_locked = Boolean(flowCardSettingsDraft.isLocked);
        if ((flowCardSettings.color ?? null) !== (flowCardSettingsDraft.color ?? null)) patch.color = flowCardSettingsDraft.color ?? null;

        if (Object.keys(patch).length) {
          suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);
          const res = await axiosInstance.patch<Partial<{ image_path: string | null; color: string | null }>>(
            `/api/boards/${numericBoardId}/cards/${serverNodeId}`,
            patch
          );
          if (Object.prototype.hasOwnProperty.call(res.data || {}, 'image_path')) {
            nextImageSrc = resolveImageSrc(res.data?.image_path ?? null);
          }
          if (Object.prototype.hasOwnProperty.call(res.data || {}, 'color')) {
            nextColor = normalizeHexColor(res.data?.color);
          }
        }
      }

      if (pendingImageFile) {
        suppressSocketReloadByCardIdRef.current.set(String(serverNodeId), Date.now() + 1500);
        setImageUploading(true);
        const form = new FormData();
        form.append('image', pendingImageFile);
        const res = await axiosInstance.patch<{ image_path: string | null; color?: string | null }>(
          `/api/boards/${numericBoardId}/cards/${serverNodeId}/image`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        nextImageSrc = resolveImageSrc(res.data?.image_path ?? null);
        if (Object.prototype.hasOwnProperty.call(res.data || {}, 'color')) {
          nextColor = normalizeHexColor(res.data?.color);
        }
      } else if (flowCardSettings.imageSrc && !flowCardSettingsDraft.imageSrc && !flowCardSettingsDraft.color) {
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
        color: nextColor,
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
      if (cardCloseConfirmOpen) return;
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
  }, [cancelCardSettings, cardCloseConfirmOpen, deleteActive, deleteConfirmOpen, displayTitle, isEditing, saveActive]);

  return (
    <div
      ref={containerRef}
      className={`${classes.space_container} ${__PLATFORM__ === 'desktop' ? classes.space_container_desktop : classes.space_container_mobile} ${__PLATFORM__ === 'desktop' && selectionModifierPressed ? classes.space_container_selecting : ''} ${canEditCards ? classes.space_container_can_edit : ''} ${!canEditCards ? classes.space_container_readonly : ''} ${isConnecting ? classes.space_container_connecting : ''}`.trim()}
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
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
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
              const selectedEdges = sel?.edges ?? [];
              if (selectedNodes.length === 1) setLinkSourceNodeId(String(selectedNodes[0].id));
              else setLinkSourceNodeId(null);
              if (selectedEdges.length > 0) {
                setEdgeHighlightBySelectedNodes(new Set());
                return;
              }
              setEdgeHighlightBySelectedNodes(new Set(selectedNodes.map((n) => String(n.id))));
            }}
            onPaneClick={() => {
              if (requestImplicitCardSettingsClose()) {
                closeContextMenu();
                return;
              }
              if ((onRequestBoardMenuBlur ?? (() => {
                handleBoardMenuBlur();
                return false;
              }))()) {
                closeContextMenu();
                return;
              }
              closeContextMenu();
              clearSelectedElements();
            }}
            onEdgeClick={handleEdgeClick}
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
            handleNodeClick(event, node as RFNode<FlowNodeData>);
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
          <div className={classes.create_panel_actions}>
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text={<Details />}
              onClick={openDetailsFromPanel}
              disabled={!isEditing || draftSaving || imageUploading || !canOpenDetails}
              className={`${classes.create_panel_lock} ${classes.create_panel_details}`.trim()}
            />
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
                    displayType === 'rectangle'
                      ? {
                          ...(displayColor ? { backgroundColor: displayColor } : {}),
                          ...(displayImagePreview ? { backgroundImage: `url(${displayImagePreview})` } : {})
                        }
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
                    displayType === 'circle'
                      ? {
                          ...(displayColor ? { backgroundColor: displayColor } : {}),
                          ...(displayImagePreview ? { backgroundImage: `url(${displayImagePreview})` } : {})
                        }
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
                    displayType === 'rhombus'
                      ? {
                          ...(displayColor ? { backgroundColor: displayColor } : {}),
                          ...(displayImagePreview ? { backgroundImage: `url(${displayImagePreview})` } : {})
                        }
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
              <div className={classes.form_label}>{'Название'}</div>
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
              <div className={classes.form_label}>{'Изображение'}</div>
              <div className={classes.form_row}>
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={'Выбрать'}
                  onClick={() => imageInputRef.current?.click()}
                  disabled={!isEditing || draftSaving || imageUploading}
                />
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={
                    <span className={classes.color_palette_trigger_inner}>
                      <ColorIcon />
                      <span
                        className={`${classes.color_palette_trigger_swatch} ${displayColor ? '' : classes.color_palette_trigger_swatch_default}`.trim()}
                        style={displayColor ? { backgroundColor: displayColor } : undefined}
                      />
                    </span>
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    openColorPalette();
                  }}
                  disabled={!isEditing || draftSaving || imageUploading}
                  className={`${classes.icon_btn} ${classes.icon_btn_trash} ${displayColor ? classes.icon_btn_active : ''}`.trim()}
                />
                {false ? (
                <DropdownWrapper upDel closeOnClick={false} isOpen={colorPaletteOpen} onClose={() => setColorPaletteOpen(false)}>
                {[
                  <Mainbtn
                    key="trigger"
                    variant="mini"
                    kind="button"
                    type="button"
                    text={
                      <span className={classes.color_palette_trigger_inner}>
                        <ColorIcon />
                        <span
                          className={`${classes.color_palette_trigger_swatch} ${displayColor ? '' : classes.color_palette_trigger_swatch_default}`.trim()}
                          style={displayColor ? { backgroundColor: displayColor } : undefined}
                        />
                      </span>
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!isEditing || draftSaving || imageUploading) return;
                      if (!colorPaletteOpen) {
                        void ensureFavoriteColorsLoaded();
                      }
                      setColorPaletteOpen((prev) => !prev);
                    }}
                    disabled={!isEditing || draftSaving || imageUploading}
                    className={`${classes.icon_btn} ${displayColor ? classes.icon_btn_active : ''} ${classes.icon_btn_palette}`.trim()}
                  />,
                  <div key="menu">
                    <div data-dropdown-class={classes.color_palette_menu_item}>
                      <div className={classes.color_palette_panel}>
                        <div className={classes.color_palette_picker}>
                          <HexColorPicker color={pickerColorValue} onChange={setDraftColorLive} />
                        </div>

                        <div className={classes.color_palette_current}>
                          <div className={classes.color_palette_current_label}>Текущий цвет</div>
                          <div className={classes.color_palette_current_value_row}>
                            <span
                              className={`${classes.color_palette_current_swatch} ${displayColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
                              style={displayColor ? { backgroundColor: displayColor } : undefined}
                            />
                            <span className={classes.color_palette_current_value}>{displayColor ?? 'Стандартный'}</span>
                          </div>
                          <button
                            type="button"
                            className={classes.color_palette_favorite_btn}
                            onClick={() => void toggleCurrentColorFavorite()}
                            disabled={!displayColor || favoritesLoading}
                          >
                            {isDisplayColorFavorite ? 'Убрать из избранного' : 'В избранное'}
                          </button>
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>Базовые цвета</div>
                          <div className={classes.color_palette_swatch_grid}>
                            {PRESET_CARD_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                style={{ backgroundColor: color }}
                                onClick={() => setDraftColorLive(color)}
                                aria-label={`Выбрать цвет ${color}`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>Цвета на доске</div>
                          {boardColorOptions.length ? (
                            <div className={classes.color_palette_swatch_grid}>
                              {boardColorOptions.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setDraftColorLive(color)}
                                  aria-label={`Выбрать цвет ${color}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className={classes.color_palette_empty}>Пока нет цветных нодов.</div>
                          )}
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>Избранные цвета</div>
                          {favoriteColors.length ? (
                            <div className={classes.color_palette_swatch_grid}>
                              {favoriteColors.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setDraftColorLive(color)}
                                  aria-label={`Выбрать цвет ${color}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className={classes.color_palette_empty}>
                              {favoritesLoading ? 'Загрузка...' : 'Избранных цветов пока нет.'}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>,
                ]}
                </DropdownWrapper>
                ) : null}
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={<DeleteIcon />}
                  onClick={removeImageLive}
                  disabled={!isEditing || draftSaving || imageUploading || !hasVisualSelection}
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
              <ImageCropModal
                isOpen={Boolean(isEditing && cropSourceFile)}
                sourceFile={cropSourceFile}
                config={getCardImageCropPreset(displayType)}
                onClose={() => setCropSourceFile(null)}
                onApply={persistImageForActiveNode}
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
                    aria-label={'Удалить запись'}
                  >
                    {'Удалить'}
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
      <UnsavedChangesModal
        isOpen={cardCloseConfirmOpen}
        wide
        onSaveAndClose={() => {
          setCardCloseConfirmOpen(false);
          void saveActive();
        }}
        onDiscardChanges={() => {
          setCardCloseConfirmOpen(false);
          cancelCardSettings();
        }}
        onContinueEditing={() => setCardCloseConfirmOpen(false)}
      />
      {colorPaletteOpen && isEditing ? (
        <div
          ref={colorPaletteRef}
          className={`${classes.color_palette_modal} ${isColorPaletteConstrained ? classes.color_palette_modal_constrained : classes.color_palette_modal_expanded}`.trim()}
          data-modal-scope="color-palette"
          style={colorPaletteStyle}
          role="dialog"
          aria-modal="true"
          aria-label={'Выбор цвета записи'}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={classes.color_palette_modal_header}>
            {'Цвет записи'}
          </div>
          <div ref={colorPaletteBodyRef} className={classes.color_palette_modal_body}>
            <div className={classes.color_palette_modal_primary}>
              <div className={classes.color_palette_picker}>
                <HexColorPicker color={palettePickerColorValue} onChange={setPaletteColorLive} />
              </div>
              <button
                type="button"
                className={classes.color_palette_favorite_btn}
                onClick={() => void toggleCurrentColorFavorite()}
                disabled={!paletteDisplayColor || favoritesLoading}
              >
                {isPaletteColorFavorite
                  ? 'Убрать из избранного'
                  : 'Добавить в избранное'}
              </button>
            </div>

            <div className={classes.color_palette_modal_secondary}>
              <div className={classes.color_palette_current}>
                <div className={classes.color_palette_current_label}>{'Текущий цвет'}</div>
                <div className={classes.color_palette_current_value_row}>
                  <span
                    className={`${classes.color_palette_current_swatch} ${paletteDisplayColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
                    style={paletteDisplayColor ? { backgroundColor: paletteDisplayColor } : undefined}
                  />
                  <span className={classes.color_palette_current_value}>
                    {paletteDisplayColor ?? 'Стандартный'}
                  </span>
                </div>
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'Базовые цвета'}</div>
                <div className={classes.color_palette_swatch_grid}>
                  {PRESET_CARD_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                      style={{ backgroundColor: color }}
                      onClick={() => setPaletteColorLive(color)}
                      aria-label={`Выбрать цвет ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'Цвета на доске'}</div>
                {boardColorOptions.length ? (
                  <div className={classes.color_palette_swatch_grid}>
                    {boardColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                        style={{ backgroundColor: color }}
                        onClick={() => setPaletteColorLive(color)}
                        aria-label={`Выбрать цвет ${color}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={classes.color_palette_empty}>{'Пока нет цветных нодов.'}</div>
                )}
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'Избранные цвета'}</div>
                {favoriteColors.length ? (
                  <div className={classes.color_palette_swatch_grid}>
                    {favoriteColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                        style={{ backgroundColor: color }}
                        onClick={() => setPaletteColorLive(color)}
                        aria-label={`Выбрать цвет ${color}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={classes.color_palette_empty}>
                    {favoritesLoading ? 'Загрузка...' : 'Избранных цветов пока нет.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={classes.color_palette_modal_actions}>
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text={'Отмена'}
              onClick={cancelColorPalette}
              disabled={draftSaving || imageUploading}
            />
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text={'Сохранить'}
              onClick={saveColorPalette}
              disabled={draftSaving || imageUploading}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default FlowBoard;
