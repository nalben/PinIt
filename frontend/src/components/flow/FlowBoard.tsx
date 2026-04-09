import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
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
import BackIcon from '@/assets/icons/monochrome/back.svg';
import Details from '@/assets/icons/monochrome/details.svg';
import DeleteIcon from '@/assets/icons/monochrome/delete.svg';
import ColorIcon from '@/assets/icons/monochrome/color.svg';
import { BOARD_MENU_WIDE_MIN_WIDTH, useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import type { ApiBoardDrawing, ApiBoardDrawingPoint, ApiCard, ApiCardLink, ApiLinkStyle, FlowNodeData, FlowNodeType } from './flowBoardModel';
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
import { FlowColorPaletteModal } from './FlowColorPaletteModal';

export type FlowBoardHandle = {
  createDraftNodeAtCenter: () => void;
  startLinkMode: () => void;
  startDrawMode: () => void;
  startSelectMode: () => void;
};

const DEFAULT_LINK_STYLE: ApiLinkStyle = 'line';
const DEFAULT_LINK_COLOR = 'var(--pink)';

const MAX_CARD_IMAGE_SIZE_MB = 5;
const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;
const DEFAULT_CARD_PICKER_COLOR = '#E7CD73';
const DEFAULT_DRAW_COLOR = '#F7C66F';
const DEFAULT_DRAW_STROKE_WIDTH = 6;
const MIN_DRAW_POINT_DISTANCE = 0.7;
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

const clampDrawingStrokeWidth = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DRAW_STROKE_WIDTH;
  return Math.min(24, Math.max(2, Math.round(numeric)));
};

const clampFlowZoom = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
};

const makeClientDrawId = () => `draw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const makeDrawingGroupKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const sortBoardDrawings = <TDrawing extends { sort_order: number; id?: number }>(items: TDrawing[]) =>
  items.slice().sort((a, b) => {
    const orderDiff = Number(a.sort_order) - Number(b.sort_order);
    if (orderDiff) return orderDiff;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });

const normalizeDrawingSortOrders = <TDrawing extends { sort_order: number }>(items: TDrawing[]) =>
  items.map((item, index) => ({ ...item, sort_order: index + 1 }));

const roundDrawingCoord = (value: number) => Math.round(value * 100) / 100;

const buildDrawingPathFromPoints = (points: ApiBoardDrawingPoint[]) => {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = roundDrawingCoord((current.x + next.x) / 2);
    const midY = roundDrawingCoord((current.y + next.y) / 2);
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
};

type PendingBoardDrawing = {
  client_draw_id: string;
  board_id: number;
  user_id: number;
  color: string;
  stroke_width: number;
  path_d: string;
  sort_order: number;
  group_key: string | null;
  created_at: string;
  points: ApiBoardDrawingPoint[];
};

type DrawingPersistedSnapshot = {
  id: number;
  board_id: number;
  user_id: number;
  color: string;
  stroke_width: number;
  path_d: string;
  sort_order: number;
  group_key: string | null;
  created_at: string;
};

type DrawingCreateSnapshot = Omit<DrawingPersistedSnapshot, 'id' | 'created_at'> & {
  points?: ApiBoardDrawingPoint[];
  created_at?: string;
};

type DrawingHistoryEntry =
  | {
      kind: 'create';
      snapshot: DrawingPersistedSnapshot;
      restore: DrawingCreateSnapshot;
    }
  | {
      kind: 'delete';
      snapshots: DrawingPersistedSnapshot[];
    }
  | {
      kind: 'update';
      before: DrawingPersistedSnapshot[];
      after: DrawingPersistedSnapshot[];
    };

type DrawingPathCommandType = 'M' | 'L' | 'Q';

type DrawingPathCommand = {
  command: DrawingPathCommandType;
  values: number[];
};

type DrawingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type DrawingCanvasItem = {
  key: string;
  drawing: ApiBoardDrawing | PendingBoardDrawing;
  path: Path2D;
  bounds: DrawingBounds | null;
  selectable: boolean;
};

const DRAWING_PATH_TOKEN_RE = /[MLQ]|-?\d+(?:\.\d+)?/g;
const DRAWING_PATH_COMMAND_ARITY: Record<DrawingPathCommandType, number> = {
  M: 2,
  L: 2,
  Q: 4,
};

const parseDrawingPathCommands = (pathD: string): DrawingPathCommand[] | null => {
  if (!pathD) return null;
  const tokens = pathD.match(DRAWING_PATH_TOKEN_RE);
  if (!tokens?.length) return null;

  const commands: DrawingPathCommand[] = [];
  let index = 0;

  while (index < tokens.length) {
    const rawCommand = tokens[index++]?.toUpperCase();
    if (rawCommand !== 'M' && rawCommand !== 'L' && rawCommand !== 'Q') return null;

    const arity = DRAWING_PATH_COMMAND_ARITY[rawCommand];
    const values: number[] = [];

    for (let i = 0; i < arity; i += 1) {
      const token = tokens[index++];
      const value = roundDrawingCoord(Number(token));
      if (!Number.isFinite(value)) return null;
      values.push(value);
    }

    commands.push({ command: rawCommand, values });
  }

  return commands.length ? commands : null;
};

const stringifyDrawingPathCommands = (commands: DrawingPathCommand[]) =>
  commands
    .map(({ command, values }) => `${command} ${values.map((value) => roundDrawingCoord(value)).join(' ')}`)
    .join(' ');

const getDistanceToSegment = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
};

const getQuadraticPoint = (
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number
) => {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
};

const isPointNearDrawingPath = (pathD: string, point: { x: number; y: number }, tolerance: number) => {
  const commands = parseDrawingPathCommands(pathD);
  if (!commands?.length) return false;

  let currentPoint: { x: number; y: number } | null = null;
  for (const command of commands) {
    if (command.command === 'M') {
      currentPoint = { x: command.values[0], y: command.values[1] };
      continue;
    }

    if (!currentPoint) return false;

    if (command.command === 'L') {
      const nextPoint = { x: command.values[0], y: command.values[1] };
      if (getDistanceToSegment(point, currentPoint, nextPoint) <= tolerance) return true;
      currentPoint = nextPoint;
      continue;
    }

    if (command.command === 'Q') {
      const control = { x: command.values[0], y: command.values[1] };
      const end = { x: command.values[2], y: command.values[3] };
      let previousPoint = currentPoint;
      const segments = 20;
      for (let index = 1; index <= segments; index += 1) {
        const nextPoint = getQuadraticPoint(currentPoint, control, end, index / segments);
        if (getDistanceToSegment(point, previousPoint, nextPoint) <= tolerance) return true;
        previousPoint = nextPoint;
      }
      currentPoint = end;
    }
  }

  return false;
};

const getDrawingBoundsFromPathD = (pathD: string): DrawingBounds | null => {
  const commands = parseDrawingPathCommands(pathD);
  if (!commands?.length) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  commands.forEach(({ values }) => {
    for (let i = 0; i < values.length; i += 2) {
      const x = values[i];
      const y = values[i + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

const translateDrawingPath = (pathD: string, dx: number, dy: number): string | null => {
  const commands = parseDrawingPathCommands(pathD);
  if (!commands?.length) return null;

  const nextCommands = commands.map(({ command, values }) => ({
    command,
    values: values.map((value, index) => roundDrawingCoord(value + (index % 2 === 0 ? dx : dy))),
  }));

  return stringifyDrawingPathCommands(nextCommands);
};

const getTranslatedDrawingBounds = (bounds: DrawingBounds | null, dx: number, dy: number): DrawingBounds | null => {
  if (!bounds) return null;
  return {
    minX: roundDrawingCoord(bounds.minX + dx),
    minY: roundDrawingCoord(bounds.minY + dy),
    maxX: roundDrawingCoord(bounds.maxX + dx),
    maxY: roundDrawingCoord(bounds.maxY + dy),
  };
};

const getDrawingScreenBounds = (
  bounds: DrawingBounds | null,
  viewport: { x: number; y: number; zoom: number },
  options?: { offsetX?: number; offsetY?: number; pad?: number }
) => {
  if (!bounds) return null;
  const { offsetX = 0, offsetY = 0, pad = 0 } = options ?? {};
  const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;

  const left = (bounds.minX + offsetX) * zoom + viewport.x - pad;
  const top = (bounds.minY + offsetY) * zoom + viewport.y - pad;
  const right = (bounds.maxX + offsetX) * zoom + viewport.x + pad;
  const bottom = (bounds.maxY + offsetY) * zoom + viewport.y + pad;

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const isPointInRect = (
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number } | null
) => Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);

const rectsIntersect = (
  a: { left: number; top: number; right: number; bottom: number } | null,
  b: { left: number; top: number; right: number; bottom: number } | null
) => Boolean(a && b && a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top);

const mergeDrawingBounds = (items: Array<DrawingBounds | null>): DrawingBounds | null => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  items.forEach((bounds) => {
    if (!bounds) return;
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return { minX, minY, maxX, maxY };
};

const toDrawingPersistedSnapshot = (drawing: ApiBoardDrawing): DrawingPersistedSnapshot => ({
  id: drawing.id,
  board_id: drawing.board_id,
  user_id: drawing.user_id,
  color: drawing.color,
  stroke_width: drawing.stroke_width,
  path_d: drawing.path_d,
  sort_order: drawing.sort_order,
  group_key: drawing.group_key ?? null,
  created_at: drawing.created_at,
});

const toDrawingCreateSnapshot = (
  drawing: ApiBoardDrawing | PendingBoardDrawing | DrawingPersistedSnapshot,
  points?: ApiBoardDrawingPoint[]
): DrawingCreateSnapshot => ({
  board_id: drawing.board_id,
  user_id: drawing.user_id,
  color: drawing.color,
  stroke_width: drawing.stroke_width,
  path_d: drawing.path_d,
  sort_order: drawing.sort_order,
  group_key: drawing.group_key ?? null,
  points,
});

const expandDrawingIdsByGroup = (drawings: ApiBoardDrawing[], ids: number[]) => {
  if (!ids.length) return [];

  const selectedSet = new Set(ids);
  const selectedGroups = new Set(
    drawings
      .filter((drawing) => selectedSet.has(drawing.id) && drawing.group_key)
      .map((drawing) => drawing.group_key as string)
  );

  return sortBoardDrawings(
    drawings.filter((drawing) => selectedSet.has(drawing.id) || (drawing.group_key && selectedGroups.has(drawing.group_key)))
  ).map((drawing) => drawing.id);
};

const parseViewportTransform = (transform: string | null | undefined) => {
  if (!transform || transform === 'none') return null;

  const matrixMatch = transform.match(/^matrix\((.+)\)$/);
  if (matrixMatch) {
    const values = matrixMatch[1].split(',').map((value) => Number(value.trim()));
    if (values.length === 6 && values.every((value) => Number.isFinite(value))) {
      return {
        x: values[4],
        y: values[5],
        zoom: clampFlowZoom(values[0]),
      };
    }
  }

  const matrix3dMatch = transform.match(/^matrix3d\((.+)\)$/);
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((value) => Number(value.trim()));
    if (values.length === 16 && values.every((value) => Number.isFinite(value))) {
      return {
        x: values[12],
        y: values[13],
        zoom: clampFlowZoom(values[0]),
      };
    }
  }

  return null;
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
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
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
  const drawingsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingCanvasDrawFrameRef = useRef<number | null>(null);
  const drawingCanvasResizeFrameRef = useRef<number | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const createPanelRef = useRef<HTMLDivElement | null>(null);
  const drawToolbarRef = useRef<HTMLDivElement | null>(null);
  const colorPaletteRef = useRef<HTMLDivElement | null>(null);
  const colorPaletteBodyRef = useRef<HTMLDivElement | null>(null);
  const drawPaletteRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreloadStartedRef = useRef<Set<string>>(new Set());
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance | null>(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const [nodes, setNodes] = useState<RFNode<FlowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [drawings, setDrawings] = useState<ApiBoardDrawing[]>([]);
  const [pendingDrawings, setPendingDrawings] = useState<PendingBoardDrawing[]>([]);
  const [selectedDrawingIds, setSelectedDrawingIds] = useState<number[]>([]);
  const [selectedDrawingPaletteOpen, setSelectedDrawingPaletteOpen] = useState(false);
  const [selectedDrawingPaletteDraft, setSelectedDrawingPaletteDraft] = useState<string | null>(null);
  const [selectedDrawingDeleteConfirmOpen, setSelectedDrawingDeleteConfirmOpen] = useState(false);
  const [drawingMutationBusy, setDrawingMutationBusy] = useState(false);
  const selectedDrawingDragOffsetRef = useRef<{ drawingIds: number[]; dx: number; dy: number; nextPathById: Map<number, string> | null } | null>(null);
  const drawingInteractionRef = useRef<{
    pointerId: number;
    startPoint: ApiBoardDrawingPoint;
    baseSnapshots: DrawingPersistedSnapshot[];
    moved: boolean;
  } | null>(null);
  const [selectionBoxRect, setSelectionBoxRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selectionBoxSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    additive: boolean;
  } | null>(null);
  const drawingTouchModeRef = useRef<'idle' | 'draw' | 'pinch'>('idle');
  const drawingTouchPointsRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const drawingPinchRef = useRef<{
    startDistance: number;
    startViewport: { x: number; y: number; zoom: number };
    worldAtCenter: { x: number; y: number };
  } | null>(null);
  const drawCanvasPanRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    viewport: { x: number; y: number; zoom: number };
  } | null>(null);
  const suppressDrawingClickRef = useRef(false);
  const initialViewportAppliedRef = useRef(false);
  const draggingNodeIdRef = useRef<string | null>(null);
  const draggingNodeStartPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragStartSelectedPositionsRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [reloadLinksSeq, setReloadLinksSeq] = useState(0);
  const [reloadDrawingsSeq, setReloadDrawingsSeq] = useState(0);
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
  const boardEditMode = useUIStore((s) => s.boardEditMode);
  const openBoardDrawPanel = useUIStore((s) => s.openBoardDrawPanel);
  const closeBoardDrawPanel = useUIStore((s) => s.closeBoardDrawPanel);
  const openBoardSelectMode = useUIStore((s) => s.openBoardSelectMode);
  const closeBoardSelectMode = useUIStore((s) => s.closeBoardSelectMode);
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

  // РїРѕРєР°Р·С‹РІР°РµРј/СЃРєСЂС‹РІР°РµРј СѓР·Р»С‹ СЃРІСЏР·РµР№ С‡РёСЃС‚Рѕ С‡РµСЂРµР· CSS (selected + "connecting" РєР»Р°СЃСЃ РЅР° РєРѕРЅС‚РµР№РЅРµСЂРµ)

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
      setReloadDrawingsSeq((v) => v + 1);
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
  const [drawStrokeWidth, setDrawStrokeWidth] = useState(DEFAULT_DRAW_STROKE_WIDTH);
  const [drawColor, setDrawColor] = useState(DEFAULT_DRAW_COLOR);
  const [drawPaletteOpen, setDrawPaletteOpen] = useState(false);
  const [drawPaletteDraft, setDrawPaletteDraft] = useState<string | null>(null);
  const [activeDrawingPreview, setActiveDrawingPreview] = useState<PendingBoardDrawing | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [undoStack, setUndoStack] = useState<DrawingHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<DrawingHistoryEntry[]>([]);
  const activeDrawingSessionRef = useRef<{
    pointerId: number;
    clientDrawId: string;
    color: string;
    strokeWidth: number;
    points: ApiBoardDrawingPoint[];
  } | null>(null);
  const boardColorOptions = useMemo(
    () =>
      collectUniqueHexColors([
        ...nodes.map((node) => node.data.color),
        ...drawings.map((drawing) => drawing.color),
        ...pendingDrawings.map((drawing) => drawing.color),
      ]),
    [drawings, nodes, pendingDrawings]
  );
  const nextDrawingSortOrder = useMemo(
    () =>
      Math.max(
        0,
        ...drawings.map((drawing) => Number(drawing.sort_order) || 0),
        ...pendingDrawings.map((drawing) => Number(drawing.sort_order) || 0)
      ) + 1,
    [drawings, pendingDrawings]
  );
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
  const isDrawMode = Boolean(canEditCards && boardEditMode === 'draw');
  const isSelectMode = Boolean(canEditCards && boardEditMode === 'select');
  const drawPaletteDisplayColor = normalizeHexColor(drawPaletteDraft);
  const drawPalettePickerColorValue = drawPaletteDisplayColor ?? drawColor ?? DEFAULT_DRAW_COLOR;
  const selectedDrawingIdSet = useMemo(() => new Set(selectedDrawingIds), [selectedDrawingIds]);
  const selectedDrawings = useMemo(
    () => sortBoardDrawings(drawings.filter((drawing) => selectedDrawingIdSet.has(drawing.id))),
    [drawings, selectedDrawingIdSet]
  );
  const selectedDrawing = selectedDrawings.length === 1 ? selectedDrawings[0] : null;
  const selectedNodeIds = useMemo(
    () => nodes.filter((node) => Boolean((node as RFNode<FlowNodeData>).selected)).map((node) => String(node.id)),
    [nodes]
  );
  const selectedDrawingGroupKeys = useMemo(
    () => Array.from(new Set(selectedDrawings.map((drawing) => drawing.group_key).filter((groupKey): groupKey is string => Boolean(groupKey)))),
    [selectedDrawings]
  );
  const canGroupSelectedDrawings = Boolean(
    selectedDrawings.length > 1 && (selectedDrawingGroupKeys.length !== 1 || selectedDrawings.some((drawing) => drawing.group_key !== selectedDrawingGroupKeys[0]))
  );
  const canUngroupSelectedDrawings = Boolean(selectedDrawingGroupKeys.length);
  const selectedDrawingPaletteDisplayColor = normalizeHexColor(selectedDrawingPaletteDraft);
  const selectedDrawingPalettePickerColorValue =
    selectedDrawingPaletteDisplayColor ?? normalizeHexColor(selectedDrawings[0]?.color) ?? DEFAULT_DRAW_COLOR;
  const showTopAlarm = useUIStore((s) => s.showTopAlarm);
  const suppressSocketReloadByCardIdRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const normalized = clampDrawingStrokeWidth(drawStrokeWidth);
    if (normalized === drawStrokeWidth) return;
    setDrawStrokeWidth(normalized);
  }, [drawStrokeWidth]);

  const reportError = useCallback(
    (message: string, error?: unknown) => {
      showTopAlarm(message);
      if (process.env.NODE_ENV !== 'production' && error) console.error(error);
    },
    [showTopAlarm]
  );
  const getCurrentViewport = useCallback(() => {
    const viewportElement = containerRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    const viewportTransform = viewportElement ? window.getComputedStyle(viewportElement).transform || viewportElement.style.transform : '';
    const domViewport = parseViewportTransform(viewportTransform);
    if (domViewport) {
      viewportRef.current = domViewport;
      return domViewport;
    }

    const instanceViewport = reactFlow?.getViewport?.() ?? viewportRef.current;
    viewportRef.current = {
      x: Number(instanceViewport.x) || 0,
      y: Number(instanceViewport.y) || 0,
      zoom: clampFlowZoom(Number(instanceViewport.zoom) || 1),
    };
    return viewportRef.current;
  }, [reactFlow]);
  const clearDrawingSelection = useCallback(() => {
    setSelectedDrawingIds([]);
    setSelectedDrawingPaletteOpen(false);
    setSelectedDrawingPaletteDraft(null);
    setSelectedDrawingDeleteConfirmOpen(false);
  }, []);
  const replaceDrawingSelection = useCallback(
    (ids: number[]) => {
      const nextIds = expandDrawingIdsByGroup(drawings, ids);
      setSelectedDrawingIds(nextIds);
      if (nextIds.length !== 1) {
        setSelectedDrawingPaletteOpen(false);
        setSelectedDrawingPaletteDraft(null);
      }
      if (!nextIds.length) setSelectedDrawingDeleteConfirmOpen(false);
      return nextIds;
    },
    [drawings]
  );
  const toggleDrawingSelection = useCallback(
    (drawingId: number) => {
      const currentlySelected = selectedDrawingIds.includes(drawingId);
      const rawIds = currentlySelected ? selectedDrawingIds.filter((id) => id !== drawingId) : [...selectedDrawingIds, drawingId];
      return replaceDrawingSelection(rawIds);
    },
    [replaceDrawingSelection, selectedDrawingIds]
  );
  const replaceNodeSelection = useCallback(
    (nodeIds: string[]) => {
      const selectedNodeIds = new Set(nodeIds.map(String));
      setNodes((prev) =>
        prev.map((node) => {
          const isSelected = selectedNodeIds.has(String(node.id));
          if (Boolean((node as RFNode<FlowNodeData>).selected) === isSelected) return node;
          return { ...node, selected: isSelected };
        })
      );
      clearSelectedEdges();
      setEdgeHighlightBySelectedNodes(selectedNodeIds);
      setLinkSourceNodeId(nodeIds.length === 1 ? String(nodeIds[0]) : null);
      clearDrawingSelection();
    },
    [clearDrawingSelection, clearSelectedEdges, setEdgeHighlightBySelectedNodes]
  );
  const toggleNodeSelection = useCallback(
    (nodeId: string) => {
      const currentSelectedIds = nodes.filter((node) => Boolean((node as RFNode<FlowNodeData>).selected)).map((node) => String(node.id));
      const nextIds = currentSelectedIds.includes(String(nodeId))
        ? currentSelectedIds.filter((id) => id !== String(nodeId))
        : [...currentSelectedIds, String(nodeId)];
      replaceNodeSelection(nextIds);
      return nextIds;
    },
    [nodes, replaceNodeSelection]
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
  const isDrawPaletteColorFavorite = Boolean(drawPaletteDisplayColor && favoriteColors.includes(drawPaletteDisplayColor));
  const isSelectedDrawingPaletteColorFavorite = Boolean(
    selectedDrawingPaletteDisplayColor && favoriteColors.includes(selectedDrawingPaletteDisplayColor)
  );

  useEffect(() => {
    setColorPaletteOpen(false);
    setColorPaletteDraft(null);
  }, [activeNodeId, isEditing]);

  useEffect(() => {
    if (Number.isFinite(numericBoardId) && numericBoardId > 0) return;
    setDrawings([]);
    setPendingDrawings([]);
    setActiveDrawingPreview(null);
    setUndoStack([]);
    setRedoStack([]);
    setHistoryBusy(false);
    setSelectedDrawingIds([]);
    setSelectedDrawingPaletteOpen(false);
    setSelectedDrawingPaletteDraft(null);
    setSelectedDrawingDeleteConfirmOpen(false);
    setDrawingMutationBusy(false);
    drawingInteractionRef.current = null;
    selectionBoxSessionRef.current = null;
    setSelectionBoxRect(null);
    selectedDrawingDragOffsetRef.current = null;
  }, [numericBoardId]);

  useEffect(() => {
    resetFavoriteColors();
  }, [hasToken, numericBoardId, resetFavoriteColors]);

  useEffect(() => {
    setDrawPaletteOpen(false);
    setDrawPaletteDraft(null);
    setPendingDrawings([]);
    setActiveDrawingPreview(null);
    activeDrawingSessionRef.current = null;
    setSelectedDrawingIds([]);
    setSelectedDrawingPaletteOpen(false);
    setSelectedDrawingPaletteDraft(null);
    setDrawingMutationBusy(false);
    drawingInteractionRef.current = null;
    selectionBoxSessionRef.current = null;
    setSelectionBoxRect(null);
    selectedDrawingDragOffsetRef.current = null;
  }, [numericBoardId]);

  useEffect(() => {
    if (isDrawMode) return;
    setDrawPaletteOpen(false);
    setDrawPaletteDraft(null);
    setActiveDrawingPreview(null);
    activeDrawingSessionRef.current = null;
  }, [isDrawMode]);

  useEffect(() => {
    if (!selectedDrawingIds.length) return;
    const nextIds = selectedDrawingIds.filter((drawingId) => drawings.some((drawing) => drawing.id === drawingId));
    if (nextIds.length === selectedDrawingIds.length) return;
    setSelectedDrawingIds(nextIds);
    setSelectedDrawingPaletteOpen(false);
    setSelectedDrawingPaletteDraft(null);
  }, [drawings, selectedDrawingIds]);

  useEffect(() => {
    if (!selectedDrawingIds.length || isDrawMode) {
      setSelectedDrawingPaletteOpen(false);
      setSelectedDrawingPaletteDraft(null);
    }
  }, [isDrawMode, selectedDrawingIds]);

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

  const commitNodePositionsLocally = useCallback((currentNodes: RFNode<FlowNodeData>[]) => {
    const byId = new Map(currentNodes.map((node) => [String(node.id), node]));
    flushSync(() => {
      setNodes((prev) =>
        prev.map((node) => {
          const current = byId.get(String(node.id));
          if (!current) return node;
          const nextX = Number(current.position?.x);
          const nextY = Number(current.position?.y);
          if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return node;

          const prevX = Number(node.position?.x);
          const prevY = Number(node.position?.y);
          if (Math.abs(nextX - prevX) < 0.001 && Math.abs(nextY - prevY) < 0.001) return node;

          return {
            ...node,
            position: { x: nextX, y: nextY },
          };
        })
      );
    });
  }, []);

  const addEdgeFromLink = useCallback((link: ApiCardLink) => {
    setEdges((prev) => {
      const edge = buildEdgeFromLink(link);
      if (prev.some((e) => String(e.id) === String(edge.id))) return prev;
      return [...prev, edge];
    });
  }, []);

  const upsertDrawingFromSocket = useCallback((drawing: ApiBoardDrawing, clientDrawId: string | null) => {
    setPendingDrawings((prev) => (clientDrawId ? prev.filter((item) => item.client_draw_id !== clientDrawId) : prev));
    setDrawings((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === drawing.id);
      if (existingIndex >= 0) {
        const next = prev.slice();
        next[existingIndex] = { ...prev[existingIndex], ...drawing };
        return sortBoardDrawings(next);
      }
      return sortBoardDrawings([...prev, drawing]);
    });
  }, []);

  const removeDrawingFromSocket = useCallback((drawingId: number) => {
    setDrawings((prev) => prev.filter((drawing) => drawing.id !== drawingId));
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
    upsertDrawingFromSocket,
    removeDrawingFromSocket,
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
        reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СЃРІСЏР·СЊ.');
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

  useEffect(() => {
    if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) return;

    let cancelled = false;
    const loadDrawings = async () => {
      try {
        const url = hasToken
          ? `/api/boards/${numericBoardId}/drawings`
          : `/api/boards/public/${numericBoardId}/drawings`;
        const res = await axiosInstance.get<ApiBoardDrawing[]>(url);
        const nextDrawings = Array.isArray(res.data) ? sortBoardDrawings(res.data) : [];
        if (cancelled) return;
        setDrawings(nextDrawings);
      } catch {
        if (!hasToken) return;
        try {
          const res = await axiosInstance.get<ApiBoardDrawing[]>(`/api/boards/public/${numericBoardId}/drawings`);
          const nextDrawings = Array.isArray(res.data) ? sortBoardDrawings(res.data) : [];
          if (cancelled) return;
          setDrawings(nextDrawings);
        } catch {
          // ignore
        }
      }
    };

    loadDrawings();
    return () => {
      cancelled = true;
    };
  }, [hasToken, numericBoardId, reloadDrawingsSeq]);

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
    suspended: isDrawMode,
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
    if (!isDrawMode) return;
    closeContextMenu();
    cancelLinkMode();
    setLinkSourceNodeId(null);
    clearSelectedElements();
    clearSelectedEdges();
    if (flowCardSettingsOpen) cancelCardSettings();
  }, [cancelCardSettings, cancelLinkMode, clearSelectedEdges, clearSelectedElements, closeContextMenu, flowCardSettingsOpen, isDrawMode]);

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
        closeBoardDrawPanel();
        closeBoardSelectMode();
        setSelectedNodeOnly(null);
        clearDrawingSelection();
        startLinkMode();
      },
      startDrawMode: () => {
        if (!canEditCards) return;
        if (boardEditMode === 'draw') {
          closeBoardDrawPanel();
          return;
        }
        if (flowCardSettingsOpen) cancelCardSettings();
        closeContextMenu();
        cancelLinkMode();
        closeBoardSelectMode();
        setLinkSourceNodeId(null);
        clearDrawingSelection();
        clearSelectedElements();
        clearSelectedEdges();
        openBoardDrawPanel();
      },
      startSelectMode: () => {
        if (!canEditCards) return;
        if (boardEditMode === 'select') {
          closeBoardSelectMode();
          clearSelectedElements();
          clearSelectedEdges();
          clearDrawingSelection();
          return;
        }
        if (flowCardSettingsOpen) cancelCardSettings();
        closeContextMenu();
        cancelLinkMode();
        closeBoardDrawPanel();
        setLinkSourceNodeId(null);
        clearDrawingSelection();
        clearSelectedElements();
        clearSelectedEdges();
        openBoardSelectMode();
      },
    }),
    [
      boardEditMode,
      canEditCards,
      cancelCardSettings,
      cancelLinkMode,
      clearDrawingSelection,
      closeBoardDrawPanel,
      closeBoardSelectMode,
      clearSelectedEdges,
      clearSelectedElements,
      closeContextMenu,
      createDraftNodeAt,
      flowCardSettingsOpen,
      openBoardDrawPanel,
      openBoardSelectMode,
      setSelectedNodeOnly,
      startLinkMode,
    ]
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
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РєР°СЂС‚РѕС‡РєРё.', e);
    } finally {
      setImageUploading(false);
    }
  }, [activeNodeId, applyPendingCroppedImage, applyPreviewToNode, canEditCards, clearPendingImage, hasToken, numericBoardId, reportError, syncSavedVisualsToActiveSettings]);

  const handleImageSelected = (file: File | null) => {
    if (!activeNodeId) return;
    if (!file) return;
    if (file.size > MAX_CARD_IMAGE_SIZE_BYTES) {
      showTopAlarm(`Р’РµСЃ СЃР»РёС€РєРѕРј Р±РѕР»СЊС€РѕР№, РІС‹Р±РµСЂРёС‚Рµ РёР·РѕР±СЂР°Р¶РµРЅРёРµ РІРµСЃРѕРј РґРѕ ${MAX_CARD_IMAGE_SIZE_MB} РњР‘.`);
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
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ С†РІРµС‚ РєР°СЂС‚РѕС‡РєРё.', e);
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

  const closeDrawPalette = useCallback(() => {
    setDrawPaletteOpen(false);
    setDrawPaletteDraft(null);
  }, []);

  const openDrawPalette = useCallback(() => {
    if (!isDrawMode || historyBusy) return;
    void ensureFavoriteColorsLoaded();
    setDrawPaletteDraft(normalizeHexColor(drawColor) ?? DEFAULT_DRAW_COLOR);
    setDrawPaletteOpen(true);
  }, [drawColor, ensureFavoriteColorsLoaded, historyBusy, isDrawMode]);

  const cancelDrawPalette = useCallback(() => {
    closeDrawPalette();
  }, [closeDrawPalette]);

  const setDrawPaletteColorLive = useCallback((color: string) => {
    const nextColor = normalizeHexColor(color);
    if (!nextColor) return;
    setDrawPaletteDraft(nextColor);
  }, []);

  const saveDrawPalette = useCallback(() => {
    const nextColor = normalizeHexColor(drawPaletteDraft) ?? normalizeHexColor(drawColor) ?? DEFAULT_DRAW_COLOR;
    setDrawColor(nextColor);
    closeDrawPalette();
  }, [closeDrawPalette, drawColor, drawPaletteDraft]);

  const toggleDrawCurrentColorFavorite = async () => {
    if (!drawPaletteDisplayColor) return;
    if (isDrawPaletteColorFavorite) {
      await removeFavoriteColor(drawPaletteDisplayColor);
      return;
    }
    await addFavoriteColor(drawPaletteDisplayColor);
  };

  const persistBoardDrawingUpdate = useCallback(
    async (drawingId: number, patch: { pathD?: string; color?: string; sortOrder?: number; groupKey?: string | null }) => {
      if (!hasToken) throw new Error('No token');
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) throw new Error('Invalid board');

      const payload: Record<string, unknown> = {};
      if (typeof patch.pathD === 'string' && patch.pathD) payload.path_d = patch.pathD;
      if (typeof patch.color === 'string' && patch.color) payload.color = patch.color;
      if (Number.isInteger(patch.sortOrder) && patch.sortOrder > 0) payload.sort_order = patch.sortOrder;
      if (patch.groupKey === null || typeof patch.groupKey === 'string') payload.group_key = patch.groupKey;
      if (!Object.keys(payload).length) throw new Error('Empty drawing patch');

      const res = await axiosInstance.patch<ApiBoardDrawing>(`/api/boards/${numericBoardId}/drawings/${drawingId}`, payload);
      return res.data;
    },
    [hasToken, numericBoardId]
  );

  const persistBoardDrawingsBulkUpdate = useCallback(
    async (
      patches: Array<{
        id: number;
        pathD?: string;
        color?: string;
        sortOrder?: number;
        groupKey?: string | null;
      }>
    ) => {
      if (!hasToken) throw new Error('No token');
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) throw new Error('Invalid board');
      if (!patches.length) return [];

      const payload = {
        drawings: patches.map((patch) => {
          const item: Record<string, unknown> = { id: patch.id };
          if (typeof patch.pathD === 'string' && patch.pathD) item.path_d = patch.pathD;
          if (typeof patch.color === 'string' && patch.color) item.color = patch.color;
          if (Number.isInteger(patch.sortOrder) && patch.sortOrder > 0) item.sort_order = patch.sortOrder;
          if (patch.groupKey === null || typeof patch.groupKey === 'string') item.group_key = patch.groupKey;
          return item;
        }),
      };

      const res = await axiosInstance.patch<ApiBoardDrawing[]>(`/api/boards/${numericBoardId}/drawings/bulk`, payload);
      return Array.isArray(res.data) ? res.data : [];
    },
    [hasToken, numericBoardId]
  );

  const closeSelectedDrawingPalette = useCallback(() => {
    setSelectedDrawingPaletteOpen(false);
    setSelectedDrawingPaletteDraft(null);
  }, []);

  const openSelectedDrawingPalette = useCallback(() => {
    if (!selectedDrawings.length || isDrawMode || drawingMutationBusy) return;
    void ensureFavoriteColorsLoaded();
    setSelectedDrawingPaletteDraft(normalizeHexColor(selectedDrawings[0]?.color) ?? DEFAULT_DRAW_COLOR);
    setSelectedDrawingPaletteOpen(true);
  }, [drawingMutationBusy, ensureFavoriteColorsLoaded, isDrawMode, selectedDrawings]);

  const cancelSelectedDrawingPalette = useCallback(() => {
    closeSelectedDrawingPalette();
  }, [closeSelectedDrawingPalette]);

  const setSelectedDrawingPaletteColorLive = useCallback((color: string) => {
    const nextColor = normalizeHexColor(color);
    if (!nextColor) return;
    setSelectedDrawingPaletteDraft(nextColor);
  }, []);

  function applyDrawingSnapshotsLocally(snapshots: DrawingPersistedSnapshot[]) {
    applyDrawingSnapshotsLocallyImpl(snapshots);
  }

  function pushDrawingHistoryEntry(entry: DrawingHistoryEntry) {
    pushDrawingHistoryEntryImpl(entry);
  }

  const saveSelectedDrawingPaletteLegacy = useCallback(async () => {
    if (!selectedDrawing || drawingMutationBusy) return;

    const nextColor =
      normalizeHexColor(selectedDrawingPaletteDraft) ?? normalizeHexColor(selectedDrawing.color) ?? DEFAULT_DRAW_COLOR;
    const prevColor = normalizeHexColor(selectedDrawing.color);

    closeSelectedDrawingPalette();
    if (nextColor === prevColor) return;

    setDrawingMutationBusy(true);
    setDrawings((prev) => prev.map((drawing) => (drawing.id === selectedDrawing.id ? { ...drawing, color: nextColor } : drawing)));

    try {
      const saved = await persistBoardDrawingUpdate(selectedDrawing.id, { color: nextColor });
      upsertDrawingFromSocket(saved, null);
    } catch (error) {
      setDrawings((prev) =>
        prev.map((drawing) => (drawing.id === selectedDrawing.id ? { ...drawing, color: prevColor ?? drawing.color } : drawing))
      );
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ С†РІРµС‚ С„РёРіСѓСЂС‹.', error);
    } finally {
      setDrawingMutationBusy(false);
    }
  }, [
    closeSelectedDrawingPalette,
    drawingMutationBusy,
    persistBoardDrawingUpdate,
    reportError,
    selectedDrawing,
    selectedDrawingPaletteDraft,
    upsertDrawingFromSocket,
  ]);

  const saveSelectedDrawingPalette = useCallback(async () => {
    if (!selectedDrawings.length || drawingMutationBusy) return;

    const nextColor =
      normalizeHexColor(selectedDrawingPaletteDraft) ?? normalizeHexColor(selectedDrawings[0]?.color) ?? DEFAULT_DRAW_COLOR;
    const beforeSnapshots = selectedDrawings.map(toDrawingPersistedSnapshot);
    const afterSnapshots = beforeSnapshots.map((snapshot) => ({ ...snapshot, color: nextColor }));

    closeSelectedDrawingPalette();
    if (!afterSnapshots.some((snapshot, index) => snapshot.color !== beforeSnapshots[index]?.color)) return;

    setDrawingMutationBusy(true);
    applyDrawingSnapshotsLocally(afterSnapshots);

    try {
      const saved = await persistBoardDrawingsBulkUpdate(afterSnapshots.map((snapshot) => ({ id: snapshot.id, color: snapshot.color })));
      applyDrawingSnapshotsLocally(saved.map(toDrawingPersistedSnapshot));
      pushDrawingHistoryEntry({ kind: 'update', before: beforeSnapshots, after: afterSnapshots });
    } catch (error) {
      applyDrawingSnapshotsLocally(beforeSnapshots);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ С†РІРµС‚ С„РёРіСѓСЂС‹.', error);
    } finally {
      setDrawingMutationBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    closeSelectedDrawingPalette,
    drawingMutationBusy,
    persistBoardDrawingsBulkUpdate,
    pushDrawingHistoryEntry,
    reportError,
    selectedDrawingPaletteDraft,
    selectedDrawings,
  ]);

  const toggleSelectedDrawingCurrentColorFavorite = async () => {
    if (!selectedDrawingPaletteDisplayColor) return;
    if (isSelectedDrawingPaletteColorFavorite) {
      await removeFavoriteColor(selectedDrawingPaletteDisplayColor);
      return;
    }
    await addFavoriteColor(selectedDrawingPaletteDisplayColor);
  };

  const persistBoardDrawingCreate = useCallback(
    async (params: {
      points?: ApiBoardDrawingPoint[];
      pathD?: string;
      color: string;
      strokeWidth: number;
      clientDrawId: string;
      sortOrder?: number;
      groupKey?: string | null;
    }) => {
      const { points, pathD, color, strokeWidth, clientDrawId, sortOrder, groupKey } = params;
      if (!hasToken) throw new Error('No token');
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) throw new Error('Invalid board');

      const res = await axiosInstance.post<ApiBoardDrawing>(`/api/boards/${numericBoardId}/drawings`, {
        ...(Array.isArray(points) ? { points } : {}),
        ...(typeof pathD === 'string' && pathD ? { path_d: pathD } : {}),
        color,
        stroke_width: strokeWidth,
        client_draw_id: clientDrawId,
        ...(Number.isInteger(sortOrder) && sortOrder > 0 ? { sort_order: sortOrder } : {}),
        ...(groupKey === null || typeof groupKey === 'string' ? { group_key: groupKey } : {}),
      });

      return res.data;
    },
    [hasToken, numericBoardId]
  );

  const persistBoardDrawingDelete = useCallback(
    async (drawingId: number) => {
      if (!hasToken) throw new Error('No token');
      if (!Number.isFinite(numericBoardId) || numericBoardId <= 0) throw new Error('Invalid board');
      await axiosInstance.delete(`/api/boards/${numericBoardId}/drawings/${drawingId}`);
    },
    [hasToken, numericBoardId]
  );

  const applyDrawingSnapshotsLocallyImpl = useCallback((snapshots: DrawingPersistedSnapshot[]) => {
    if (!snapshots.length) return;
    setDrawings((prev) => {
      const next = prev.slice();
      snapshots.forEach((snapshot) => {
        const existingIndex = next.findIndex((drawing) => drawing.id === snapshot.id);
        const nextDrawing: ApiBoardDrawing = { ...snapshot };
        if (existingIndex >= 0) {
          next[existingIndex] = { ...next[existingIndex], ...nextDrawing };
        } else {
          next.push(nextDrawing);
        }
      });
      return sortBoardDrawings(next);
    });
  }, []);

  const removeDrawingIdsLocally = useCallback((ids: number[]) => {
    if (!ids.length) return;
    const idsSet = new Set(ids);
    setDrawings((prev) => prev.filter((drawing) => !idsSet.has(drawing.id)));
  }, []);

  const pushDrawingHistoryEntryImpl = useCallback((entry: DrawingHistoryEntry) => {
    setUndoStack((prev) => [...prev, entry]);
    setRedoStack([]);
  }, []);

  const recreateDrawingSnapshot = useCallback(
    async (snapshot: DrawingCreateSnapshot) => {
      const clientDrawId = makeClientDrawId();
      return persistBoardDrawingCreate({
        points: snapshot.points,
        pathD: snapshot.path_d,
        color: snapshot.color,
        strokeWidth: snapshot.stroke_width,
        clientDrawId,
        sortOrder: snapshot.sort_order,
        groupKey: snapshot.group_key,
      });
    },
    [persistBoardDrawingCreate]
  );

  const handleDrawUndo = useCallback(async () => {
    if (historyBusy || pendingDrawings.length) return;
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;

    setHistoryBusy(true);
    setUndoStack((prev) => prev.slice(0, -1));
    try {
      if (entry.kind === 'create') {
        clearDrawingSelection();
        removeDrawingIdsLocally([entry.snapshot.id]);
        await persistBoardDrawingDelete(entry.snapshot.id);
        setRedoStack((prev) => [...prev, entry]);
        return;
      }

      if (entry.kind === 'delete') {
        const recreatedSnapshots: DrawingPersistedSnapshot[] = [];
        for (const snapshot of sortBoardDrawings(entry.snapshots)) {
          const recreated = await recreateDrawingSnapshot(toDrawingCreateSnapshot(snapshot));
          upsertDrawingFromSocket(recreated, null);
          recreatedSnapshots.push(toDrawingPersistedSnapshot(recreated));
        }
        replaceDrawingSelection(recreatedSnapshots.map((snapshot) => snapshot.id));
        setRedoStack((prev) => [...prev, { kind: 'delete', snapshots: recreatedSnapshots }]);
        return;
      }

      applyDrawingSnapshotsLocally(entry.before);
      await persistBoardDrawingsBulkUpdate(
        entry.before.map((snapshot) => ({
          id: snapshot.id,
          pathD: snapshot.path_d,
          color: snapshot.color,
          sortOrder: snapshot.sort_order,
          groupKey: snapshot.group_key,
        }))
      );
      setRedoStack((prev) => [...prev, entry]);
    } catch (error) {
      if (entry.kind === 'create') {
        applyDrawingSnapshotsLocally([entry.snapshot]);
      } else if (entry.kind === 'delete') {
        const recreatedIds = drawings
          .filter((drawing) => entry.snapshots.some((snapshot) => snapshot.id === drawing.id))
          .map((drawing) => drawing.id);
        if (recreatedIds.length) {
          removeDrawingIdsLocally(recreatedIds);
          await Promise.allSettled(recreatedIds.map((drawingId) => persistBoardDrawingDelete(drawingId)));
        }
      } else {
        applyDrawingSnapshotsLocally(entry.after);
      }
      setUndoStack((prev) => [...prev, entry]);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєР°С‚РёС‚СЊ С€С‚СЂРёС….', error);
    } finally {
      setHistoryBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    clearDrawingSelection,
    drawings,
    historyBusy,
    pendingDrawings.length,
    persistBoardDrawingDelete,
    persistBoardDrawingsBulkUpdate,
    recreateDrawingSnapshot,
    removeDrawingIdsLocally,
    replaceDrawingSelection,
    reportError,
    undoStack,
    upsertDrawingFromSocket,
  ]);

  const handleDrawRedo = useCallback(async () => {
    if (historyBusy || pendingDrawings.length) return;
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;

    setHistoryBusy(true);
    setRedoStack((prev) => prev.slice(0, -1));

    try {
      if (entry.kind === 'create') {
        const saved = await recreateDrawingSnapshot(entry.restore);
        const savedSnapshot = toDrawingPersistedSnapshot(saved);
        upsertDrawingFromSocket(saved, null);
        setUndoStack((prev) => [
          ...prev,
          {
            kind: 'create',
            snapshot: savedSnapshot,
            restore: toDrawingCreateSnapshot(savedSnapshot, entry.restore.points),
          },
        ]);
        return;
      }

      if (entry.kind === 'delete') {
        clearDrawingSelection();
        removeDrawingIdsLocally(entry.snapshots.map((snapshot) => snapshot.id));
        await Promise.all(entry.snapshots.map((snapshot) => persistBoardDrawingDelete(snapshot.id)));
        setUndoStack((prev) => [...prev, entry]);
        return;
      }

      applyDrawingSnapshotsLocally(entry.after);
      await persistBoardDrawingsBulkUpdate(
        entry.after.map((snapshot) => ({
          id: snapshot.id,
          pathD: snapshot.path_d,
          color: snapshot.color,
          sortOrder: snapshot.sort_order,
          groupKey: snapshot.group_key,
        }))
      );
      setUndoStack((prev) => [...prev, entry]);
    } catch (error) {
      if (entry.kind === 'delete') {
        applyDrawingSnapshotsLocally(entry.snapshots);
      } else if (entry.kind === 'update') {
        applyDrawingSnapshotsLocally(entry.before);
      }
      setRedoStack((prev) => [...prev, entry]);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ РІРµСЂРЅСѓС‚СЊ С€С‚СЂРёС….', error);
    } finally {
      setHistoryBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    clearDrawingSelection,
    historyBusy,
    pendingDrawings.length,
    persistBoardDrawingDelete,
    persistBoardDrawingsBulkUpdate,
    recreateDrawingSnapshot,
    redoStack,
    removeDrawingIdsLocally,
    reportError,
    upsertDrawingFromSocket,
  ]);

  useEffect(() => {
    if (!drawPaletteOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelDrawPalette();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelDrawPalette, drawPaletteOpen]);

  useEffect(() => {
    if (!selectedDrawingPaletteOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      cancelSelectedDrawingPalette();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelSelectedDrawingPalette, selectedDrawingPaletteOpen]);

  const getProjectedPointFromClient = useCallback(
    (clientX: number, clientY: number) => {
      if (!reactFlow) return null;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const flowPoint = reactFlow.project({ x, y });
      return {
        x: roundDrawingCoord(flowPoint.x),
        y: roundDrawingCoord(flowPoint.y),
      };
    },
    [reactFlow]
  );

  function scheduleDrawingsCanvasRender() {
    scheduleDrawingsCanvasRenderImpl();
  }

  const applyFlowViewport = useCallback(
    (nextViewport: { x: number; y: number; zoom: number }) => {
      if (!reactFlow) return;
      const sanitizedViewport = {
        x: roundDrawingCoord(nextViewport.x),
        y: roundDrawingCoord(nextViewport.y),
        zoom: clampFlowZoom(nextViewport.zoom),
      };
      viewportRef.current = sanitizedViewport;
      reactFlow.setViewport(sanitizedViewport, { duration: 0 });
      scheduleDrawingsCanvasRender();
    },
    [reactFlow, scheduleDrawingsCanvasRender]
  );

  const setFlowViewportFromWorldAnchor = useCallback(
    (params: { clientX: number; clientY: number; worldPoint: { x: number; y: number }; zoom: number }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const nextZoom = clampFlowZoom(params.zoom);
      applyFlowViewport({
        x: params.clientX - rect.left - params.worldPoint.x * nextZoom,
        y: params.clientY - rect.top - params.worldPoint.y * nextZoom,
        zoom: nextZoom,
      });
    },
    [applyFlowViewport]
  );

  const syncActiveDrawingPreview = useCallback((session: NonNullable<typeof activeDrawingSessionRef.current>) => {
    const pathD = buildDrawingPathFromPoints(session.points);
    setActiveDrawingPreview({
      client_draw_id: session.clientDrawId,
      board_id: numericBoardId,
      user_id: Number(authUserId) || 0,
      color: session.color,
      stroke_width: session.strokeWidth,
      path_d: pathD,
      sort_order: nextDrawingSortOrder,
      group_key: null,
      created_at: '',
      points: session.points.map((point) => ({ ...point })),
    });
  }, [authUserId, nextDrawingSortOrder, numericBoardId]);

  const finalizeActiveDrawing = useCallback(async () => {
    const session = activeDrawingSessionRef.current;
    if (!session) return;
    activeDrawingSessionRef.current = null;

    const normalizedPoints = session.points.reduce<ApiBoardDrawingPoint[]>((acc, point) => {
      if (!acc.length) {
        acc.push(point);
        return acc;
      }
      const previous = acc[acc.length - 1];
      if (Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_DRAW_POINT_DISTANCE) {
        acc[acc.length - 1] = point;
        return acc;
      }
      acc.push(point);
      return acc;
    }, []);

    if (normalizedPoints.length < 2) {
      setActiveDrawingPreview(null);
      return;
    }

    const pathD = buildDrawingPathFromPoints(normalizedPoints);
    if (!pathD) {
      setActiveDrawingPreview(null);
      return;
    }

    const pendingDrawing: PendingBoardDrawing = {
      client_draw_id: session.clientDrawId,
      board_id: numericBoardId,
      user_id: Number(authUserId) || 0,
      color: session.color,
      stroke_width: session.strokeWidth,
      path_d: pathD,
      sort_order: nextDrawingSortOrder,
      group_key: null,
      created_at: '',
      points: normalizedPoints,
    };

    setActiveDrawingPreview(null);
    setPendingDrawings((prev) => [...prev, pendingDrawing]);

    try {
      const saved = await persistBoardDrawingCreate({
        points: normalizedPoints,
        color: pendingDrawing.color,
        strokeWidth: pendingDrawing.stroke_width,
        clientDrawId: pendingDrawing.client_draw_id,
        sortOrder: pendingDrawing.sort_order,
      });
      upsertDrawingFromSocket(saved, pendingDrawing.client_draw_id);
      pushDrawingHistoryEntry({
        kind: 'create',
        snapshot: toDrawingPersistedSnapshot(saved),
        restore: toDrawingCreateSnapshot(saved, normalizedPoints),
      });
    } catch (error) {
      setPendingDrawings((prev) => prev.filter((drawing) => drawing.client_draw_id !== pendingDrawing.client_draw_id));
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ С€С‚СЂРёС….', error);
    }
  }, [authUserId, nextDrawingSortOrder, numericBoardId, persistBoardDrawingCreate, pushDrawingHistoryEntry, reportError, upsertDrawingFromSocket]);

  const restartDrawingPinchSession = useCallback(() => {
    const touchPoints = Array.from(drawingTouchPointsRef.current.values());
    if (touchPoints.length < 2) {
      drawingTouchModeRef.current = drawingTouchPointsRef.current.size ? 'draw' : 'idle';
      drawingPinchRef.current = null;
      return;
    }

    const [firstPoint, secondPoint] = touchPoints;
    const centerClientX = (firstPoint.clientX + secondPoint.clientX) / 2;
    const centerClientY = (firstPoint.clientY + secondPoint.clientY) / 2;
    const worldAtCenter = getProjectedPointFromClient(centerClientX, centerClientY);
    if (!worldAtCenter) {
      drawingTouchModeRef.current = 'idle';
      drawingPinchRef.current = null;
      return;
    }

    drawingTouchModeRef.current = 'pinch';
    drawingPinchRef.current = {
      startDistance: Math.max(1, Math.hypot(firstPoint.clientX - secondPoint.clientX, firstPoint.clientY - secondPoint.clientY)),
      startViewport: getCurrentViewport(),
      worldAtCenter,
    };
  }, [getCurrentViewport, getProjectedPointFromClient]);

  const handleDrawWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      if (!isDrawMode || !canEditCards || !reactFlow) return;
      const worldPoint = getProjectedPointFromClient(event.clientX, event.clientY);
      if (!worldPoint) return;

      const currentViewport = getCurrentViewport();
      const nextZoom = clampFlowZoom(currentViewport.zoom * Math.exp(-event.deltaY * 0.0015));
      if (Math.abs(nextZoom - currentViewport.zoom) < 0.0001) return;

      setFlowViewportFromWorldAnchor({
        clientX: event.clientX,
        clientY: event.clientY,
        worldPoint,
        zoom: nextZoom,
      });
      event.preventDefault();
      event.stopPropagation();
    },
    [canEditCards, getCurrentViewport, getProjectedPointFromClient, isDrawMode, reactFlow, setFlowViewportFromWorldAnchor]
  );

  const handleDrawPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawMode || !canEditCards) return;
      if (!reactFlow) return;
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse' && (event.button === 1 || event.button === 2)) {
        drawCanvasPanRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          viewport: getCurrentViewport(),
        };
        try {
          drawingsCanvasRef.current?.setPointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.button !== 0) return;

      if (event.pointerType === 'touch') {
        drawingTouchPointsRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
        if (drawingTouchPointsRef.current.size >= 2) {
          const activeSession = activeDrawingSessionRef.current;
          if (activeSession) {
            try {
              drawingsCanvasRef.current?.releasePointerCapture(activeSession.pointerId);
            } catch {
              // ignore
            }
            void finalizeActiveDrawing();
          }
          restartDrawingPinchSession();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        drawingTouchModeRef.current = 'draw';
      }

      const point = getProjectedPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      const color = normalizeHexColor(drawColor) ?? DEFAULT_DRAW_COLOR;
      const strokeWidth = clampDrawingStrokeWidth(drawStrokeWidth);

      activeDrawingSessionRef.current = {
        pointerId: event.pointerId,
        clientDrawId: makeClientDrawId(),
        color,
        strokeWidth,
        points: [point, point],
      };

      syncActiveDrawingPreview(activeDrawingSessionRef.current);
      drawingsCanvasRef.current?.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    [canEditCards, drawColor, drawStrokeWidth, finalizeActiveDrawing, getCurrentViewport, getProjectedPointFromClient, isDrawMode, reactFlow, restartDrawingPinchSession, syncActiveDrawingPreview]
  );

  const handleDrawPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const pan = drawCanvasPanRef.current;
      if (pan && pan.pointerId === event.pointerId) {
        applyFlowViewport({
          x: pan.viewport.x + (event.clientX - pan.clientX),
          y: pan.viewport.y + (event.clientY - pan.clientY),
          zoom: pan.viewport.zoom,
        });
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.pointerType === 'touch' && drawingTouchPointsRef.current.has(event.pointerId)) {
        drawingTouchPointsRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
      }

      if (drawingTouchModeRef.current === 'pinch' && event.pointerType === 'touch') {
        const pinch = drawingPinchRef.current;
        const touchPoints = Array.from(drawingTouchPointsRef.current.values());
        const [firstPoint, secondPoint] = touchPoints;
        if (!pinch || !firstPoint || !secondPoint) return;

        const centerClientX = (firstPoint.clientX + secondPoint.clientX) / 2;
        const centerClientY = (firstPoint.clientY + secondPoint.clientY) / 2;
        const nextDistance = Math.max(1, Math.hypot(firstPoint.clientX - secondPoint.clientX, firstPoint.clientY - secondPoint.clientY));
        const nextZoom = clampFlowZoom((pinch.startViewport.zoom * nextDistance) / pinch.startDistance);
        setFlowViewportFromWorldAnchor({
          clientX: centerClientX,
          clientY: centerClientY,
          worldPoint: pinch.worldAtCenter,
          zoom: nextZoom,
        });
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const session = activeDrawingSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      const point = getProjectedPointFromClient(event.clientX, event.clientY);
      if (!point) return;

      const last = session.points[session.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < MIN_DRAW_POINT_DISTANCE) {
        session.points[session.points.length - 1] = point;
      } else {
        session.points.push(point);
      }

      syncActiveDrawingPreview(session);
      event.preventDefault();
      event.stopPropagation();
    },
    [applyFlowViewport, getProjectedPointFromClient, setFlowViewportFromWorldAnchor, syncActiveDrawingPreview]
  );

  const handleDrawPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (drawCanvasPanRef.current?.pointerId === event.pointerId) {
        drawCanvasPanRef.current = null;
        try {
          drawingsCanvasRef.current?.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.pointerType === 'touch') {
        drawingTouchPointsRef.current.delete(event.pointerId);
        if (drawingTouchModeRef.current === 'pinch') {
          restartDrawingPinchSession();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const session = activeDrawingSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      try {
        drawingsCanvasRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      drawingTouchModeRef.current = drawingTouchPointsRef.current.size ? 'draw' : 'idle';
      drawingPinchRef.current = null;
      void finalizeActiveDrawing();
      event.preventDefault();
      event.stopPropagation();
    },
    [finalizeActiveDrawing, restartDrawingPinchSession]
  );

  const handleDrawPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (drawCanvasPanRef.current?.pointerId === event.pointerId) {
        drawCanvasPanRef.current = null;
        try {
          drawingsCanvasRef.current?.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.pointerType === 'touch') {
        drawingTouchPointsRef.current.delete(event.pointerId);
        if (drawingTouchModeRef.current === 'pinch') {
          restartDrawingPinchSession();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const session = activeDrawingSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      activeDrawingSessionRef.current = null;
      setActiveDrawingPreview(null);
      drawingTouchModeRef.current = drawingTouchPointsRef.current.size ? 'draw' : 'idle';
      drawingPinchRef.current = null;
      try {
        drawingsCanvasRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [restartDrawingPinchSession]
  );

  const displayedDrawings = useMemo(() => [...drawings, ...pendingDrawings], [drawings, pendingDrawings]);

  const drawingCanvasItems = useMemo<DrawingCanvasItem[]>(
    () =>
      displayedDrawings.map((drawing) => {
        let path: Path2D;
        try {
          path = new Path2D(drawing.path_d);
        } catch {
          path = new Path2D();
        }

        return {
          key: 'id' in drawing ? `drawing-${drawing.id}` : `pending-${drawing.client_draw_id}`,
          drawing,
          path,
          bounds: getDrawingBoundsFromPathD(drawing.path_d),
          selectable: 'id' in drawing && Number.isFinite(drawing.id),
        };
      }),
    [displayedDrawings]
  );

  const getCanvasRelativePoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const getNormalizedSelectionRect = useCallback(
    (startX: number, startY: number, endX: number, endY: number) => {
      const start = getCanvasRelativePoint(startX, startY);
      const end = getCanvasRelativePoint(endX, endY);
      if (!start || !end) return null;

      const left = Math.min(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const right = Math.max(start.x, end.x);
      const bottom = Math.max(start.y, end.y);

      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    },
    [getCanvasRelativePoint]
  );

  const getNodeSelectionRects = useCallback(() => {
    const container = containerRef.current;
    const containerRect = container?.getBoundingClientRect();
    if (!container || !containerRect) return new Map<string, { left: number; top: number; right: number; bottom: number }>();

    const result = new Map<string, { left: number; top: number; right: number; bottom: number }>();
    const nodeElements = container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]');

    nodeElements.forEach((element) => {
      const id = element.dataset.id;
      if (!id) return;
      const rect = element.getBoundingClientRect();
      result.set(String(id), {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: rect.right - containerRect.left,
        bottom: rect.bottom - containerRect.top,
      });
    });

    return result;
  }, []);

  const scheduleDrawingsCanvasRenderImpl = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (drawingCanvasDrawFrameRef.current !== null) return;

    drawingCanvasDrawFrameRef.current = window.requestAnimationFrame(() => {
      drawingCanvasDrawFrameRef.current = null;

      const canvas = drawingsCanvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const nextWidth = Math.max(1, Math.round(rect.width * dpr));
      const nextHeight = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = getCurrentViewport();
      const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
      const dragState = selectedDrawingDragOffsetRef.current;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawingCanvasItems.forEach((item) => {
        const drawing = item.drawing;
        const offset =
          item.selectable && 'id' in drawing && dragState?.drawingIds.includes(drawing.id)
            ? dragState
            : null;
        const previewPathD = offset && 'id' in drawing ? offset.nextPathById?.get(drawing.id) : null;
        const pathToStroke = (() => {
          if (!previewPathD) return item.path;
          try {
            return new Path2D(previewPathD);
          } catch {
            return item.path;
          }
        })();

        ctx.save();
        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * viewport.x, dpr * viewport.y);
        if (offset && !previewPathD) ctx.translate(offset.dx, offset.dy);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = drawing.stroke_width;
        ctx.strokeStyle = drawing.color;
        ctx.globalAlpha = 0.96;
        ctx.stroke(pathToStroke);
        ctx.restore();
      });

      if (activeDrawingPreview?.path_d) {
        try {
          const previewPath = new Path2D(activeDrawingPreview.path_d);
          ctx.save();
          ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * viewport.x, dpr * viewport.y);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = activeDrawingPreview.stroke_width;
          ctx.strokeStyle = activeDrawingPreview.color;
          ctx.globalAlpha = 0.96;
          ctx.shadowColor = 'rgba(255, 255, 255, 0.22)';
          ctx.shadowBlur = 10;
          ctx.stroke(previewPath);
          ctx.restore();
        } catch {
          // ignore malformed preview
        }
      }

      if (selectedDrawingIds.length) {
        const selectedItems = drawingCanvasItems.filter(
          (item) => item.selectable && 'id' in item.drawing && selectedDrawingIdSet.has(item.drawing.id)
        );
        const mergedBounds = mergeDrawingBounds(selectedItems.map((item) => item.bounds));
        const bounds = getDrawingScreenBounds(mergedBounds, viewport, {
          offsetX: dragState?.dx ?? 0,
          offsetY: dragState?.dy ?? 0,
          pad: 14,
        });

        if (bounds) {
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 1.5 * dpr;
          ctx.strokeRect(bounds.left * dpr, bounds.top * dpr, bounds.width * dpr, bounds.height * dpr);
          ctx.restore();
        }
      }

      if (selectionBoxRect) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = 'rgba(231, 205, 115, 0.95)';
        ctx.fillStyle = 'rgba(231, 205, 115, 0.10)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.fillRect(selectionBoxRect.left * dpr, selectionBoxRect.top * dpr, selectionBoxRect.width * dpr, selectionBoxRect.height * dpr);
        ctx.strokeRect(selectionBoxRect.left * dpr, selectionBoxRect.top * dpr, selectionBoxRect.width * dpr, selectionBoxRect.height * dpr);
        ctx.restore();
      }
    });
  }, [activeDrawingPreview, drawingCanvasItems, getCurrentViewport, selectedDrawingIdSet, selectedDrawingIds.length, selectionBoxRect]);

  useLayoutEffect(() => {
    scheduleDrawingsCanvasRender();
  }, [scheduleDrawingsCanvasRender]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      if (typeof window === 'undefined') return;
      if (drawingCanvasResizeFrameRef.current !== null) window.cancelAnimationFrame(drawingCanvasResizeFrameRef.current);
      drawingCanvasResizeFrameRef.current = window.requestAnimationFrame(() => {
        drawingCanvasResizeFrameRef.current = window.requestAnimationFrame(() => {
          drawingCanvasResizeFrameRef.current = null;
          scheduleDrawingsCanvasRender();
        });
      });
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (drawingCanvasResizeFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(drawingCanvasResizeFrameRef.current);
        drawingCanvasResizeFrameRef.current = null;
      }
    };
  }, [scheduleDrawingsCanvasRender]);

  useEffect(
    () => () => {
      if (drawingCanvasDrawFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(drawingCanvasDrawFrameRef.current);
        drawingCanvasDrawFrameRef.current = null;
      }
      if (drawingCanvasResizeFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(drawingCanvasResizeFrameRef.current);
        drawingCanvasResizeFrameRef.current = null;
      }
    },
    []
  );

  const findDrawingAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const point = getCanvasRelativePoint(clientX, clientY);
      const flowPoint = getProjectedPointFromClient(clientX, clientY);
      if (!point || !flowPoint) return null;

      const viewport = getCurrentViewport();
      const zoom = Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1;
      const dragState = selectedDrawingDragOffsetRef.current;
      const selectedItems = selectedDrawingIds.length
        ? drawingCanvasItems.filter((item) => item.selectable && 'id' in item.drawing && selectedDrawingIdSet.has(item.drawing.id))
        : [];

      for (let i = drawingCanvasItems.length - 1; i >= 0; i -= 1) {
        const item = drawingCanvasItems[i];
        if (!item.selectable || !('id' in item.drawing)) continue;

        const offset = dragState?.drawingIds.includes(item.drawing.id) ? dragState : null;
        const previewPathD = offset?.nextPathById?.get(item.drawing.id) ?? (offset ? translateDrawingPath(item.drawing.path_d, offset.dx, offset.dy) : item.drawing.path_d);
        if (!previewPathD) continue;
        if (isPointNearDrawingPath(previewPathD, flowPoint, item.drawing.stroke_width / 2 + 14 / zoom)) return item;
      }

      if (selectedItems.length) {
        const selectionRect = getDrawingScreenBounds(mergeDrawingBounds(selectedItems.map((item) => item.bounds)), viewport, {
          offsetX: dragState?.dx ?? 0,
          offsetY: dragState?.dy ?? 0,
          pad: 14,
        });
        if (isPointInRect(point.x, point.y, selectionRect)) return selectedItems[selectedItems.length - 1];
      }

      return null;
    },
    [drawingCanvasItems, getCanvasRelativePoint, getCurrentViewport, getProjectedPointFromClient, selectedDrawingIdSet, selectedDrawingIds.length]
  );

  const resolveDrawingIdsInSelectionRect = useCallback(
    (selectionRect: { left: number; top: number; right: number; bottom: number }) => {
      const viewport = getCurrentViewport();
      const drawingIds = drawingCanvasItems
        .filter((item) => item.selectable && 'id' in item.drawing)
        .filter((item) => {
          const screenRect = getDrawingScreenBounds(item.bounds, viewport, { pad: 10 });
          return rectsIntersect(selectionRect, screenRect);
        })
        .map((item) => ('id' in item.drawing ? item.drawing.id : null))
        .filter((id): id is number => Number.isFinite(id));

      return expandDrawingIdsByGroup(drawings, drawingIds);
    },
    [drawingCanvasItems, drawings, getCurrentViewport]
  );

  const handleSelectionBoxPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const selectionBoxEnabled = __PLATFORM__ === 'desktop' && (isSelectMode || selectionModifierPressed);
      if (!selectionBoxEnabled || drawingMutationBusy) return false;
      if (!event.isPrimary || event.button !== 0) return false;

      const targetEl = event.target as Element | null;
      if (targetEl?.closest?.('.react-flow__node')) return false;
      if (targetEl?.closest?.('.react-flow__handle')) return false;
      if (contextMenuRef.current && targetEl && contextMenuRef.current.contains(targetEl)) return false;
      if (createPanelRef.current && targetEl && createPanelRef.current.contains(targetEl)) return false;
      if (drawToolbarRef.current && targetEl && drawToolbarRef.current.contains(targetEl)) return false;
      if (targetEl?.closest?.('[data-modal-scope=\"color-palette\"]')) return false;
      if (findDrawingAtClientPoint(event.clientX, event.clientY)) return false;

      const point = getCanvasRelativePoint(event.clientX, event.clientY);
      if (!point) return false;

      selectionBoxSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        additive: Boolean(event.ctrlKey || event.metaKey),
      };
      setSelectionBoxRect({ left: point.x, top: point.y, width: 0, height: 0 });
      clearSelectedEdges();
      closeContextMenu();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      event.preventDefault();
      event.stopPropagation();
      scheduleDrawingsCanvasRender();
      return true;
    },
    [
      clearSelectedEdges,
      closeContextMenu,
      drawingMutationBusy,
      findDrawingAtClientPoint,
      getCanvasRelativePoint,
      isSelectMode,
      scheduleDrawingsCanvasRender,
      selectionModifierPressed,
    ]
  );

  const handleSelectionBoxPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = selectionBoxSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return false;

      const rect = getNormalizedSelectionRect(session.startX, session.startY, event.clientX, event.clientY);
      if (!rect) return false;

      setSelectionBoxRect({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      event.preventDefault();
      event.stopPropagation();
      scheduleDrawingsCanvasRender();
      return true;
    },
    [getNormalizedSelectionRect, scheduleDrawingsCanvasRender]
  );

  const handleSelectionBoxPointerEndCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const session = selectionBoxSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return false;

      selectionBoxSessionRef.current = null;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      const rect = getNormalizedSelectionRect(session.startX, session.startY, event.clientX, event.clientY);
      setSelectionBoxRect(null);
      event.preventDefault();
      event.stopPropagation();
      scheduleDrawingsCanvasRender();

      if (!rect || (rect.width < 4 && rect.height < 4)) return true;

      const nodeRects = getNodeSelectionRects();
      const nodeIds = Array.from(nodeRects.entries())
        .filter(([, bounds]) => rectsIntersect(rect, bounds))
        .map(([id]) => id);

      if (nodeIds.length) {
        const currentSelectedIds = session.additive
          ? nodes.filter((node) => Boolean((node as RFNode<FlowNodeData>).selected)).map((node) => String(node.id))
          : [];
        replaceNodeSelection(Array.from(new Set([...currentSelectedIds, ...nodeIds])));
        return true;
      }

      const drawingIds = resolveDrawingIdsInSelectionRect(rect);
      if (drawingIds.length) {
        clearSelectedElements();
        clearSelectedEdges();
        setEdgeHighlightBySelectedNodes(new Set());
        setLinkSourceNodeId(null);
        const nextIds = session.additive && selectedDrawingIds.length
          ? Array.from(new Set([...selectedDrawingIds, ...drawingIds]))
          : drawingIds;
        replaceDrawingSelection(nextIds);
        return true;
      }

      if (!session.additive) {
        clearSelectedElements();
        clearSelectedEdges();
        setEdgeHighlightBySelectedNodes(new Set());
        setLinkSourceNodeId(null);
        clearDrawingSelection();
      }

      return true;
    },
    [
      clearDrawingSelection,
      clearSelectedEdges,
      clearSelectedElements,
      getNodeSelectionRects,
      getNormalizedSelectionRect,
      nodes,
      replaceDrawingSelection,
      replaceNodeSelection,
      resolveDrawingIdsInSelectionRect,
      scheduleDrawingsCanvasRender,
      selectedDrawingIds,
      setEdgeHighlightBySelectedNodes,
    ]
  );

  const finishSelectedDrawingDrag = useCallback(
    async (params: { baseSnapshots: DrawingPersistedSnapshot[]; dx: number; dy: number; nextPathById: Map<number, string> | null }) => {
      const { baseSnapshots, dx, dy, nextPathById } = params;
      const afterSnapshots = baseSnapshots
        .map((snapshot) => {
          const nextPathD = nextPathById?.get(snapshot.id) ?? translateDrawingPath(snapshot.path_d, dx, dy);
          if (!nextPathD || nextPathD === snapshot.path_d) return null;
          return { ...snapshot, path_d: nextPathD };
        })
        .filter(Boolean) as DrawingPersistedSnapshot[];
      if (!afterSnapshots.length) {
        selectedDrawingDragOffsetRef.current = null;
        scheduleDrawingsCanvasRender();
        return;
      }

      setDrawingMutationBusy(true);
      selectedDrawingDragOffsetRef.current = {
        drawingIds: baseSnapshots.map((snapshot) => snapshot.id),
        dx: 0,
        dy: 0,
        nextPathById: new Map(afterSnapshots.map((snapshot) => [snapshot.id, snapshot.path_d])),
      };
      flushSync(() => {
        applyDrawingSnapshotsLocally(afterSnapshots);
      });
      selectedDrawingDragOffsetRef.current = null;
      scheduleDrawingsCanvasRender();

      try {
        const saved = await persistBoardDrawingsBulkUpdate(
          afterSnapshots.map((snapshot) => ({
            id: snapshot.id,
            pathD: snapshot.path_d,
          }))
        );
        const savedSnapshots = saved.map(toDrawingPersistedSnapshot);
        applyDrawingSnapshotsLocally(savedSnapshots);
        pushDrawingHistoryEntry({ kind: 'update', before: baseSnapshots, after: savedSnapshots });
      } catch (error) {
        applyDrawingSnapshotsLocally(baseSnapshots);
        reportError('РќРµ СѓРґР°Р»РѕСЃСЊ РїРµСЂРµРјРµСЃС‚РёС‚СЊ С„РёРіСѓСЂСѓ.', error);
      } finally {
        setDrawingMutationBusy(false);
      }
    },
    [applyDrawingSnapshotsLocally, persistBoardDrawingsBulkUpdate, pushDrawingHistoryEntry, reportError, scheduleDrawingsCanvasRender]
  );

  const handleSelectedDrawingDelete = useCallback(async () => {
    if (!selectedDrawings.length || drawingMutationBusy) return;

    const snapshots = selectedDrawings.map(toDrawingPersistedSnapshot);
    const drawingIds = snapshots.map((snapshot) => snapshot.id);
    setDrawingMutationBusy(true);
    setSelectedDrawingDeleteConfirmOpen(false);
    clearDrawingSelection();
    closeSelectedDrawingPalette();
    removeDrawingIdsLocally(drawingIds);

    try {
      await Promise.all(snapshots.map((snapshot) => persistBoardDrawingDelete(snapshot.id)));
      pushDrawingHistoryEntry({ kind: 'delete', snapshots });
    } catch (error) {
      applyDrawingSnapshotsLocally(snapshots);
      replaceDrawingSelection(drawingIds);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С„РёРіСѓСЂСѓ.', error);
    } finally {
      setDrawingMutationBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    clearDrawingSelection,
    closeSelectedDrawingPalette,
    drawingMutationBusy,
    persistBoardDrawingDelete,
    pushDrawingHistoryEntry,
    removeDrawingIdsLocally,
    replaceDrawingSelection,
    reportError,
    selectedDrawings,
  ]);

  const handleSelectedDrawingsGroup = useCallback(async () => {
    if (!canGroupSelectedDrawings || drawingMutationBusy || selectedDrawings.length < 2) return;

    const groupKey = makeDrawingGroupKey();
    const beforeSnapshots = selectedDrawings.map(toDrawingPersistedSnapshot);
    const afterSnapshots = beforeSnapshots.map((snapshot) => ({ ...snapshot, group_key: groupKey }));

    setDrawingMutationBusy(true);
    applyDrawingSnapshotsLocally(afterSnapshots);

    try {
      const saved = await persistBoardDrawingsBulkUpdate(afterSnapshots.map((snapshot) => ({ id: snapshot.id, groupKey: snapshot.group_key })));
      const savedSnapshots = saved.map(toDrawingPersistedSnapshot);
      applyDrawingSnapshotsLocally(savedSnapshots);
      replaceDrawingSelection(savedSnapshots.map((snapshot) => snapshot.id));
      pushDrawingHistoryEntry({ kind: 'update', before: beforeSnapshots, after: savedSnapshots });
    } catch (error) {
      applyDrawingSnapshotsLocally(beforeSnapshots);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРіСЂСѓРїРїРёСЂРѕРІР°С‚СЊ С„РёРіСѓСЂС‹.', error);
    } finally {
      setDrawingMutationBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    canGroupSelectedDrawings,
    drawingMutationBusy,
    persistBoardDrawingsBulkUpdate,
    pushDrawingHistoryEntry,
    replaceDrawingSelection,
    reportError,
    selectedDrawings,
  ]);

  const handleSelectedDrawingsUngroup = useCallback(async () => {
    if (!canUngroupSelectedDrawings || drawingMutationBusy || !selectedDrawings.length) return;

    const beforeSnapshots = selectedDrawings.map(toDrawingPersistedSnapshot);
    const afterSnapshots = beforeSnapshots.map((snapshot) => ({ ...snapshot, group_key: null }));

    setDrawingMutationBusy(true);
    applyDrawingSnapshotsLocally(afterSnapshots);

    try {
      const saved = await persistBoardDrawingsBulkUpdate(afterSnapshots.map((snapshot) => ({ id: snapshot.id, groupKey: null })));
      const savedSnapshots = saved.map(toDrawingPersistedSnapshot);
      applyDrawingSnapshotsLocally(savedSnapshots);
      replaceDrawingSelection(savedSnapshots.map((snapshot) => snapshot.id));
      pushDrawingHistoryEntry({ kind: 'update', before: beforeSnapshots, after: savedSnapshots });
    } catch (error) {
      applyDrawingSnapshotsLocally(beforeSnapshots);
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°Р·РіСЂСѓРїРїРёСЂРѕРІР°С‚СЊ С„РёРіСѓСЂС‹.', error);
    } finally {
      setDrawingMutationBusy(false);
    }
  }, [
    applyDrawingSnapshotsLocally,
    canUngroupSelectedDrawings,
    drawingMutationBusy,
    persistBoardDrawingsBulkUpdate,
    pushDrawingHistoryEntry,
    replaceDrawingSelection,
    reportError,
    selectedDrawings,
  ]);

  const moveSelectedDrawingsLayer = useCallback(
    async (direction: 'up' | 'down') => {
      if (!selectedDrawings.length || drawingMutationBusy) return;

      const selectedIds = new Set(selectedDrawings.map((drawing) => drawing.id));
      const ordered = normalizeDrawingSortOrders(sortBoardDrawings(drawings)).map((drawing) => toDrawingPersistedSnapshot(drawing));
      const items = ordered.slice();

      if (direction === 'up') {
        for (let index = items.length - 2; index >= 0; index -= 1) {
          if (selectedIds.has(items[index].id) && !selectedIds.has(items[index + 1].id)) {
            [items[index], items[index + 1]] = [items[index + 1], items[index]];
          }
        }
      } else {
        for (let index = 1; index < items.length; index += 1) {
          if (selectedIds.has(items[index].id) && !selectedIds.has(items[index - 1].id)) {
            [items[index - 1], items[index]] = [items[index], items[index - 1]];
          }
        }
      }

      const reordered = normalizeDrawingSortOrders(items);
      const reorderedById = new Map(reordered.map((snapshot) => [snapshot.id, snapshot]));
      const changedIds = ordered
        .filter((snapshot) => snapshot.sort_order !== reorderedById.get(snapshot.id)?.sort_order)
        .map((snapshot) => snapshot.id);
      const beforeSnapshots = ordered.filter((snapshot) => changedIds.includes(snapshot.id));
      const afterSnapshots = changedIds
        .map((drawingId) => reorderedById.get(drawingId) ?? null)
        .filter(Boolean) as DrawingPersistedSnapshot[];
      if (!beforeSnapshots.length || beforeSnapshots.length !== afterSnapshots.length) return;

      setDrawingMutationBusy(true);
      applyDrawingSnapshotsLocally(afterSnapshots);

      try {
        const saved = await persistBoardDrawingsBulkUpdate(afterSnapshots.map((snapshot) => ({ id: snapshot.id, sortOrder: snapshot.sort_order })));
        const savedSnapshots = saved.map(toDrawingPersistedSnapshot);
        applyDrawingSnapshotsLocally(savedSnapshots);
        replaceDrawingSelection(selectedDrawings.map((drawing) => drawing.id));
        pushDrawingHistoryEntry({ kind: 'update', before: beforeSnapshots, after: afterSnapshots });
      } catch (error) {
        applyDrawingSnapshotsLocally(beforeSnapshots);
        reportError(direction === 'up' ? 'РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРЅСЏС‚СЊ С„РёРіСѓСЂСѓ РІС‹С€Рµ.' : 'РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСѓСЃС‚РёС‚СЊ С„РёРіСѓСЂСѓ РЅРёР¶Рµ.', error);
      } finally {
        setDrawingMutationBusy(false);
      }
    },
    [
      applyDrawingSnapshotsLocally,
      drawingMutationBusy,
      drawings,
      persistBoardDrawingsBulkUpdate,
      pushDrawingHistoryEntry,
      replaceDrawingSelection,
      reportError,
      selectedDrawings,
    ]
  );

  const handleDrawingPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isDrawMode || !canEditCards || drawingMutationBusy || linkModeStep !== 'off') return false;
      if (!event.isPrimary || event.button !== 0) return false;
      const targetEl = event.target as Element | null;
      if (drawToolbarRef.current && targetEl && drawToolbarRef.current.contains(targetEl)) return false;
      if (targetEl?.closest?.('[data-modal-scope=\"color-palette\"]')) return false;

      const hit = findDrawingAtClientPoint(event.clientX, event.clientY);
      if (!hit || !('id' in hit.drawing)) return false;

      if (flowCardSettingsOpen && requestImplicitCardSettingsClose()) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (boardMenuView === 'link' && (onRequestImplicitLinkInspectorClose ?? (() => false))()) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (boardMenuView === 'link') {
        closeLinkInspector();
        clearSelectedEdges();
      }

      if (boardMenuView === 'card') closeCardDetails();
      closeContextMenu();
      clearSelectedElements();
      clearSelectedEdges();
      setEdgeHighlightBySelectedNodes(new Set());
      setLinkSourceNodeId(null);

      const isAdditive = Boolean(event.ctrlKey || event.metaKey);
      const hitDrawingId = hit.drawing.id;
      const nextSelectionIds = isAdditive
        ? toggleDrawingSelection(hitDrawingId)
        : selectedDrawingIdSet.has(hitDrawingId)
          ? selectedDrawingIds
          : replaceDrawingSelection([hitDrawingId]);
      setSelectedDrawingPaletteOpen(false);
      setSelectedDrawingPaletteDraft(null);

      const startPoint = getProjectedPointFromClient(event.clientX, event.clientY);
      if (!startPoint) return false;
      if (isAdditive) {
        event.preventDefault();
        event.stopPropagation();
        scheduleDrawingsCanvasRender();
        return true;
      }

      const dragIds = expandDrawingIdsByGroup(drawings, nextSelectionIds.includes(hitDrawingId) ? nextSelectionIds : [hitDrawingId]);
      const baseSnapshots = sortBoardDrawings(drawings.filter((drawing) => dragIds.includes(drawing.id))).map(toDrawingPersistedSnapshot);
      if (!baseSnapshots.length) return true;

      drawingInteractionRef.current = {
        pointerId: event.pointerId,
        startPoint,
        baseSnapshots,
        moved: false,
      };
      selectedDrawingDragOffsetRef.current = {
        drawingIds: dragIds,
        dx: 0,
        dy: 0,
        nextPathById: new Map(baseSnapshots.map((snapshot) => [snapshot.id, snapshot.path_d])),
      };
      suppressDrawingClickRef.current = true;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      event.preventDefault();
      event.stopPropagation();
      scheduleDrawingsCanvasRender();
      return true;
    },
    [
      boardMenuView,
      canEditCards,
      clearSelectedElements,
      clearSelectedEdges,
      closeCardDetails,
      closeContextMenu,
      closeLinkInspector,
      drawToolbarRef,
      drawingMutationBusy,
      drawings,
      replaceDrawingSelection,
      findDrawingAtClientPoint,
      flowCardSettingsOpen,
      getProjectedPointFromClient,
      isDrawMode,
      linkModeStep,
      onRequestImplicitLinkInspectorClose,
      requestImplicitCardSettingsClose,
      scheduleDrawingsCanvasRender,
      selectedDrawingIdSet,
      selectedDrawingIds,
      setEdgeHighlightBySelectedNodes,
      toggleDrawingSelection,
    ]
  );

  const handleDrawingPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const interaction = drawingInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return false;

      const point = getProjectedPointFromClient(event.clientX, event.clientY);
      if (!point) return false;

      const dx = roundDrawingCoord(point.x - interaction.startPoint.x);
      const dy = roundDrawingCoord(point.y - interaction.startPoint.y);
      selectedDrawingDragOffsetRef.current = {
        drawingIds: interaction.baseSnapshots.map((snapshot) => snapshot.id),
        dx,
        dy,
        nextPathById: new Map(
          interaction.baseSnapshots.map((snapshot) => [snapshot.id, translateDrawingPath(snapshot.path_d, dx, dy) ?? snapshot.path_d])
        ),
      };

      if (Math.hypot(dx, dy) >= 0.8) interaction.moved = true;

      event.preventDefault();
      event.stopPropagation();
      scheduleDrawingsCanvasRender();
      return true;
    },
    [getProjectedPointFromClient, scheduleDrawingsCanvasRender]
  );

  const handleDrawingPointerEndCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const interaction = drawingInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return false;

      drawingInteractionRef.current = null;
      const offset = selectedDrawingDragOffsetRef.current;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }

      event.preventDefault();
      event.stopPropagation();

      if (interaction.moved && offset && Math.hypot(offset.dx, offset.dy) >= 0.8) {
        void finishSelectedDrawingDrag({
          baseSnapshots: interaction.baseSnapshots,
          dx: offset.dx,
          dy: offset.dy,
          nextPathById: offset.nextPathById,
        });
        return true;
      }

      selectedDrawingDragOffsetRef.current = null;
      scheduleDrawingsCanvasRender();

      return true;
    },
    [finishSelectedDrawingDrag, scheduleDrawingsCanvasRender]
  );

  const handleDrawingClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressDrawingClickRef.current) return false;
    suppressDrawingClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

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
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РєР°СЂС‚РѕС‡РєСѓ.', e);
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
      reportError('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РёР·РјРµРЅРµРЅРёСЏ РєР°СЂС‚РѕС‡РєРё.', e);
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

  useEffect(() => {
    if (!canEditCards) return;

    const onKeyDownCapture = (event: KeyboardEvent) => {
      const targetEl = event.target as HTMLElement | null;
      const isFormField =
        Boolean(targetEl) &&
        (targetEl instanceof HTMLInputElement ||
          targetEl instanceof HTMLTextAreaElement ||
          (targetEl as { isContentEditable?: boolean }).isContentEditable);
      if (isFormField) return;

      const modifierPressed = event.ctrlKey || event.metaKey;
      if (!modifierPressed) return;

      const key = event.key.toLowerCase();
      const shouldRedo = key === 'y' || (key === 'z' && event.shiftKey);
      const shouldUndo = key === 'z' && !event.shiftKey;
      if (!shouldUndo && !shouldRedo) return;

      event.preventDefault();
      event.stopPropagation();
      if (shouldRedo) {
        void handleDrawRedo();
        return;
      }
      void handleDrawUndo();
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  }, [canEditCards, handleDrawRedo, handleDrawUndo]);

  const exitDrawMode = useCallback(() => {
    setDrawPaletteOpen(false);
    setDrawPaletteDraft(null);
    closeBoardDrawPanel();
  }, [closeBoardDrawPanel]);

  const canUndoDrawing = Boolean(canEditCards && !historyBusy && !pendingDrawings.length && undoStack.length);
  const canRedoDrawing = Boolean(canEditCards && !historyBusy && !pendingDrawings.length && redoStack.length);
  const canShowSelectedDrawingToolbar = Boolean(!isDrawMode && canEditCards && selectedDrawings.length && !selectedNodeIds.length);

  return (
    <div
      ref={containerRef}
      className={`${classes.space_container} ${__PLATFORM__ === 'desktop' ? classes.space_container_desktop : classes.space_container_mobile} ${__PLATFORM__ === 'desktop' && (selectionModifierPressed || isSelectMode) ? classes.space_container_selecting : ''} ${canEditCards ? classes.space_container_can_edit : ''} ${!canEditCards ? classes.space_container_readonly : ''} ${isConnecting ? classes.space_container_connecting : ''} ${isDrawMode ? classes.space_container_drawing : ''}`.trim()}
      onContextMenu={isDrawMode ? (event) => event.preventDefault() : handleContextMenu}
      onMouseDown={isDrawMode ? undefined : handleMouseDown}
      onClickCapture={(event) => {
        if (handleDrawingClickCapture(event)) return;
        pointerGestures.handleClickCapture(event);
      }}
      onPointerDownCapture={(event) => {
        if (handleSelectionBoxPointerDownCapture(event)) return;
        if (handleDrawingPointerDownCapture(event)) return;
        pointerGestures.handlePointerDownCapture(event);
      }}
      onPointerDown={pointerGestures.handlePointerDown}
      onPointerMove={(event) => {
        if (handleSelectionBoxPointerMoveCapture(event)) return;
        if (handleDrawingPointerMoveCapture(event)) return;
        pointerGestures.handlePointerMove(event);
      }}
      onPointerUp={(event) => {
        if (handleSelectionBoxPointerEndCapture(event)) return;
        if (handleDrawingPointerEndCapture(event)) return;
        pointerGestures.handlePointerUp(event);
      }}
      onPointerCancel={(event) => {
        if (handleSelectionBoxPointerEndCapture(event)) return;
        if (handleDrawingPointerEndCapture(event)) return;
        pointerGestures.handlePointerCancel(event);
      }}
      onWheelCapture={() => closeContextMenu()}
    >
      <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edgesForRender}
            zoomOnDoubleClick={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            selectionOnDrag={false}
            panOnDrag={
              __PLATFORM__ === 'desktop'
                ? (isDrawMode || isSelectMode ? [1] : !selectionModifierPressed)
                : !isDrawMode && !isSelectMode
            }
            selectionMode={SelectionMode.Partial}
            connectionLineType={ConnectionLineType.Straight}
            connectionLineComponent={HoverConnectionLine}
            connectionRadius={1}
            nodesConnectable={canEditCards && !isDrawMode && !isSelectMode}
            nodesDraggable={canEditCards && !isDrawMode}
            elementsSelectable={!isDrawMode}
            proOptions={{ hideAttribution: true }}
            onMoveStart={() => closeContextMenu()}
            onMove={(_, viewport) => {
              viewportRef.current = viewport;
              scheduleDrawingsCanvasRender();
            }}
            onInit={(instance) => {
              setReactFlow(instance);
              viewportRef.current = instance.getViewport();
              scheduleDrawingsCanvasRender();
            }}
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
              if (selectedNodes.length || selectedEdges.length) {
                clearDrawingSelection();
              }
              if (isSelectMode && selectedEdges.length) {
                clearSelectedEdges();
                setEdgeHighlightBySelectedNodes(new Set(selectedNodes.map((n) => String(n.id))));
                return;
              }
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
              clearDrawingSelection();
              clearSelectedElements();
            }}
            onEdgeClick={(event, edge) => {
              clearDrawingSelection();
              if (isSelectMode) {
                event.preventDefault();
                event.stopPropagation();
                clearSelectedEdges();
                return;
              }
              handleEdgeClick(event, edge);
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
            commitNodePositionsLocally(currentNodes as RFNode<FlowNodeData>[]);

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
              clearDrawingSelection();
              if (isSelectMode || event.ctrlKey || event.metaKey) {
                const clickedId = String((node as RFNode<FlowNodeData>).id);
                if (!clickedId || clickedId.startsWith('draft-')) return;
                event.preventDefault();
                event.stopPropagation();
                if (event.ctrlKey || event.metaKey) toggleNodeSelection(clickedId);
                else replaceNodeSelection([clickedId]);
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
              zIndex: 9,
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
      <canvas
        ref={drawingsCanvasRef}
        className={`${classes.drawings_overlay} ${isDrawMode ? classes.drawings_overlay_active : ''}`.trim()}
        aria-hidden="true"
        onWheel={handleDrawWheel}
        onPointerDown={handleDrawPointerDown}
        onPointerMove={handleDrawPointerMove}
        onPointerUp={handleDrawPointerUp}
        onPointerCancel={handleDrawPointerCancel}
      />
      {isDrawMode ? (
        <div ref={drawToolbarRef} className={classes.draw_toolbar}>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${canUndoDrawing ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleDrawUndo()}
            disabled={!canUndoDrawing}
            aria-label={"\u041e\u0442\u043a\u0430\u0442\u0438\u0442\u044c \u0448\u0442\u0440\u0438\u0445"}
          >
            <BackIcon />
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${canRedoDrawing ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleDrawRedo()}
            disabled={!canRedoDrawing}
            aria-label={"\u0412\u0435\u0440\u043d\u0443\u0442\u044c \u0448\u0442\u0440\u0438\u0445"}
          >
            <span className={classes.draw_toolbar_icon_btn_flip}>
              <BackIcon />
            </span>
          </button>
          <label className={classes.draw_toolbar_slider}>
            <span className={classes.draw_toolbar_slider_label}>{"\u041a\u0438\u0441\u0442\u044c"}</span>
            <input
              type="range"
              min="2"
              max="24"
              step="1"
              value={drawStrokeWidth}
              onChange={(event) => setDrawStrokeWidth(clampDrawingStrokeWidth(event.currentTarget.value))}
            />
            <span className={classes.draw_toolbar_slider_value}>{drawStrokeWidth}px</span>
          </label>
          <button
            type="button"
            className={`${classes.draw_toolbar_palette_btn} ${drawPaletteDisplayColor ? classes.draw_toolbar_palette_btn_active : ''}`.trim()}
            onClick={(event) => {
              event.stopPropagation();
              openDrawPalette();
            }}
            aria-label={"\u0412\u044b\u0431\u0440\u0430\u0442\u044c \u0446\u0432\u0435\u0442 \u043a\u0438\u0441\u0442\u0438"}
          >
            <span className={classes.color_palette_trigger_inner}>
              <ColorIcon />
              <span
                className={`${classes.color_palette_trigger_swatch} ${drawColor ? '' : classes.color_palette_trigger_swatch_default}`.trim()}
                style={drawColor ? { backgroundColor: drawColor } : undefined}
              />
            </span>
          </button>
          <button
            type="button"
            className={classes.draw_toolbar_text_btn}
            onClick={exitDrawMode}
          >
            {"\u0413\u043e\u0442\u043e\u0432\u043e"}
          </button>
        </div>
      ) : canShowSelectedDrawingToolbar ? (
        <div ref={drawToolbarRef} className={classes.draw_toolbar}>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${canUndoDrawing ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleDrawUndo()}
            disabled={!canUndoDrawing}
            aria-label={"\u041e\u0442\u043a\u0430\u0442\u0438\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0440\u0438\u0441\u043e\u0432\u0430\u043d\u0438\u044f"}
          >
            <BackIcon />
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${canRedoDrawing ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleDrawRedo()}
            disabled={!canRedoDrawing}
            aria-label={"\u0412\u0435\u0440\u043d\u0443\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u0440\u0438\u0441\u043e\u0432\u0430\u043d\u0438\u044f"}
          >
            <span className={classes.draw_toolbar_icon_btn_flip}>
              <BackIcon />
            </span>
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${drawingMutationBusy ? classes.draw_toolbar_icon_btn_disabled : ''}`.trim()}
            onClick={() => void moveSelectedDrawingsLayer('down')}
            disabled={drawingMutationBusy}
            aria-label={"\u041e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0444\u0438\u0433\u0443\u0440\u0443 \u043d\u0438\u0436\u0435"}
          >
            <span className={`${classes.draw_toolbar_icon_btn_rotate} ${classes.draw_toolbar_icon_btn_rotate_down}`.trim()}>
              <BackIcon />
            </span>
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_icon_btn} ${drawingMutationBusy ? classes.draw_toolbar_icon_btn_disabled : ''}`.trim()}
            onClick={() => void moveSelectedDrawingsLayer('up')}
            disabled={drawingMutationBusy}
            aria-label={"\u041f\u043e\u0434\u043d\u044f\u0442\u044c \u0444\u0438\u0433\u0443\u0440\u0443 \u0432\u044b\u0448\u0435"}
          >
            <span className={`${classes.draw_toolbar_icon_btn_rotate} ${classes.draw_toolbar_icon_btn_rotate_up}`.trim()}>
              <BackIcon />
            </span>
          </button>
          <DropdownWrapper
            upDel
            closeOnClick={false}
            isOpen={selectedDrawingDeleteConfirmOpen}
            onClose={() => setSelectedDrawingDeleteConfirmOpen(false)}
          >
            {[
              <button
                key="trigger"
                type="button"
                className={`${classes.draw_toolbar_icon_btn} ${drawingMutationBusy ? classes.draw_toolbar_icon_btn_disabled : ''}`.trim()}
                onClick={() => setSelectedDrawingDeleteConfirmOpen((prev) => !prev)}
                disabled={drawingMutationBusy}
                aria-label={"\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u0438\u0433\u0443\u0440\u0443"}
              >
                <DeleteIcon />
              </button>,
              <div key="menu">
                <button
                  type="button"
                  data-dropdown-class={classes.confirm_danger}
                  onClick={() => void handleSelectedDrawingDelete()}
                  disabled={drawingMutationBusy}
                >
                  {"\u0414\u0430, \u0443\u0434\u0430\u043b\u0438\u0442\u044c"}
                </button>
                <button
                  type="button"
                  data-dropdown-class={classes.confirm_cancel}
                  onClick={() => setSelectedDrawingDeleteConfirmOpen(false)}
                  disabled={drawingMutationBusy}
                >
                  {"\u041e\u0442\u043c\u0435\u043d\u0430"}
                </button>
              </div>,
            ]}
          </DropdownWrapper>
          <button
            type="button"
            className={`${classes.draw_toolbar_palette_btn} ${selectedDrawingPaletteDisplayColor ? classes.draw_toolbar_palette_btn_active : ''}`.trim()}
            onClick={(event) => {
              event.stopPropagation();
              openSelectedDrawingPalette();
            }}
            disabled={drawingMutationBusy}
            aria-label={"\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0446\u0432\u0435\u0442 \u0444\u0438\u0433\u0443\u0440\u044b"}
          >
            <span className={classes.color_palette_trigger_inner}>
              <ColorIcon />
              <span
                className={`${classes.color_palette_trigger_swatch} ${selectedDrawings[0]?.color ? '' : classes.color_palette_trigger_swatch_default}`.trim()}
                style={selectedDrawings[0]?.color ? { backgroundColor: selectedDrawings[0].color } : undefined}
              />
            </span>
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_text_btn} ${canGroupSelectedDrawings && !drawingMutationBusy ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleSelectedDrawingsGroup()}
            disabled={drawingMutationBusy || !canGroupSelectedDrawings}
          >
            {"\u0413\u0440\u0443\u043f\u043f\u0430"}
          </button>
          <button
            type="button"
            className={`${classes.draw_toolbar_text_btn} ${canUngroupSelectedDrawings && !drawingMutationBusy ? '' : classes.draw_toolbar_icon_btn_disabled}`.trim()}
            onClick={() => void handleSelectedDrawingsUngroup()}
            disabled={drawingMutationBusy || !canUngroupSelectedDrawings}
          >
            {"\u0420\u0430\u0437\u0433\u0440\u0443\u043f."}
          </button>
        </div>
      ) : null}
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
            РЎРѕР·РґР°С‚СЊ Р·Р°РїРёСЃСЊ
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
          <div className={classes.create_panel_title}>РќР°СЃС‚СЂРѕР№С‚Рµ РІРёРґ Р·Р°РїРёСЃРё:</div>
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
              <div className={classes.form_label}>{'РќР°Р·РІР°РЅРёРµ'}</div>
              <input
                className={classes.create_panel_input}
                ref={titleInputRef}
                value={displayTitle}
                onChange={e => setDraftTitleLive(e.target.value)}
                placeholder={visualEditing ? 'РќР°Р·РІР°РЅРёРµ' : 'Р’С‹Р±РµСЂРёС‚Рµ Р·Р°РїРёСЃСЊ'}
                maxLength={50}
                disabled={!isEditing}
              />
            </div>

            <div className={classes.form_field}>
              <div className={classes.form_label}>{'РР·РѕР±СЂР°Р¶РµРЅРёРµ'}</div>
              <div className={classes.form_row}>
                <Mainbtn
                  variant="mini"
                  kind="button"
                  type="button"
                  text={'Р’С‹Р±СЂР°С‚СЊ'}
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
                          <div className={classes.color_palette_current_label}>РўРµРєСѓС‰РёР№ С†РІРµС‚</div>
                          <div className={classes.color_palette_current_value_row}>
                            <span
                              className={`${classes.color_palette_current_swatch} ${displayColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
                              style={displayColor ? { backgroundColor: displayColor } : undefined}
                            />
                            <span className={classes.color_palette_current_value}>{displayColor ?? 'РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№'}</span>
                          </div>
                          <button
                            type="button"
                            className={classes.color_palette_favorite_btn}
                            onClick={() => void toggleCurrentColorFavorite()}
                            disabled={!displayColor || favoritesLoading}
                          >
                            {isDisplayColorFavorite ? 'РЈР±СЂР°С‚СЊ РёР· РёР·Р±СЂР°РЅРЅРѕРіРѕ' : 'Р’ РёР·Р±СЂР°РЅРЅРѕРµ'}
                          </button>
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>Р‘Р°Р·РѕРІС‹Рµ С†РІРµС‚Р°</div>
                          <div className={classes.color_palette_swatch_grid}>
                            {PRESET_CARD_COLORS.map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                style={{ backgroundColor: color }}
                                onClick={() => setDraftColorLive(color)}
                                aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>Р¦РІРµС‚Р° РЅР° РґРѕСЃРєРµ</div>
                          {boardColorOptions.length ? (
                            <div className={classes.color_palette_swatch_grid}>
                              {boardColorOptions.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setDraftColorLive(color)}
                                  aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className={classes.color_palette_empty}>РџРѕРєР° РЅРµС‚ С†РІРµС‚РЅС‹С… РЅРѕРґРѕРІ.</div>
                          )}
                        </div>

                        <div className={classes.color_palette_section}>
                          <div className={classes.color_palette_section_title}>РР·Р±СЂР°РЅРЅС‹Рµ С†РІРµС‚Р°</div>
                          {favoriteColors.length ? (
                            <div className={classes.color_palette_swatch_grid}>
                              {favoriteColors.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  className={`${classes.color_palette_swatch_btn} ${displayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setDraftColorLive(color)}
                                  aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className={classes.color_palette_empty}>
                              {favoritesLoading ? 'Р—Р°РіСЂСѓР·РєР°...' : 'РР·Р±СЂР°РЅРЅС‹С… С†РІРµС‚РѕРІ РїРѕРєР° РЅРµС‚.'}
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
                    aria-label={'РЈРґР°Р»РёС‚СЊ Р·Р°РїРёСЃСЊ'}
                  >
                    {'РЈРґР°Р»РёС‚СЊ'}
                  </button>,
                  <div key="menu">
                    <button
                      type="button"
                      data-dropdown-class={classes.confirm_danger}
                      onClick={() => void deleteActive()}
                      disabled={!isEditing || draftSaving || imageUploading}
                    >
                      Р”Р°, СѓРґР°Р»РёС‚СЊ
                    </button>
                    <button
                      type="button"
                      data-dropdown-class={classes.confirm_cancel}
                      onClick={() => setDeleteConfirmOpen(false)}
                      disabled={!isEditing || draftSaving || imageUploading}
                    >
                      РћС‚РјРµРЅР°
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
                text="РЎРѕС…СЂР°РЅРёС‚СЊ"
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
                text="РћС‚РјРµРЅР°"
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
          aria-label={'Р’С‹Р±РѕСЂ С†РІРµС‚Р° Р·Р°РїРёСЃРё'}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={classes.color_palette_modal_header}>
            {'Р¦РІРµС‚ Р·Р°РїРёСЃРё'}
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
                  ? 'РЈР±СЂР°С‚СЊ РёР· РёР·Р±СЂР°РЅРЅРѕРіРѕ'
                  : 'Р”РѕР±Р°РІРёС‚СЊ РІ РёР·Р±СЂР°РЅРЅРѕРµ'}
              </button>
            </div>

            <div className={classes.color_palette_modal_secondary}>
              <div className={classes.color_palette_current}>
                <div className={classes.color_palette_current_label}>{'РўРµРєСѓС‰РёР№ С†РІРµС‚'}</div>
                <div className={classes.color_palette_current_value_row}>
                  <span
                    className={`${classes.color_palette_current_swatch} ${paletteDisplayColor ? '' : classes.color_palette_current_swatch_default}`.trim()}
                    style={paletteDisplayColor ? { backgroundColor: paletteDisplayColor } : undefined}
                  />
                  <span className={classes.color_palette_current_value}>
                    {paletteDisplayColor ?? 'РЎС‚Р°РЅРґР°СЂС‚РЅС‹Р№'}
                  </span>
                </div>
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'Р‘Р°Р·РѕРІС‹Рµ С†РІРµС‚Р°'}</div>
                <div className={classes.color_palette_swatch_grid}>
                  {PRESET_CARD_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                      style={{ backgroundColor: color }}
                      onClick={() => setPaletteColorLive(color)}
                      aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                    />
                  ))}
                </div>
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'Р¦РІРµС‚Р° РЅР° РґРѕСЃРєРµ'}</div>
                {boardColorOptions.length ? (
                  <div className={classes.color_palette_swatch_grid}>
                    {boardColorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                        style={{ backgroundColor: color }}
                        onClick={() => setPaletteColorLive(color)}
                        aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={classes.color_palette_empty}>{'РџРѕРєР° РЅРµС‚ С†РІРµС‚РЅС‹С… РЅРѕРґРѕРІ.'}</div>
                )}
              </div>

              <div className={classes.color_palette_section}>
                <div className={classes.color_palette_section_title}>{'РР·Р±СЂР°РЅРЅС‹Рµ С†РІРµС‚Р°'}</div>
                {favoriteColors.length ? (
                  <div className={classes.color_palette_swatch_grid}>
                    {favoriteColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`${classes.color_palette_swatch_btn} ${paletteDisplayColor === color ? classes.color_palette_swatch_btn_active : ''}`.trim()}
                        style={{ backgroundColor: color }}
                        onClick={() => setPaletteColorLive(color)}
                        aria-label={`Р’С‹Р±СЂР°С‚СЊ С†РІРµС‚ ${color}`}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={classes.color_palette_empty}>
                    {favoritesLoading ? 'Р—Р°РіСЂСѓР·РєР°...' : 'РР·Р±СЂР°РЅРЅС‹С… С†РІРµС‚РѕРІ РїРѕРєР° РЅРµС‚.'}
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
              text={'РћС‚РјРµРЅР°'}
              onClick={cancelColorPalette}
              disabled={draftSaving || imageUploading}
            />
            <Mainbtn
              variant="mini"
              kind="button"
              type="button"
              text={'РЎРѕС…СЂР°РЅРёС‚СЊ'}
              onClick={saveColorPalette}
              disabled={draftSaving || imageUploading}
            />
          </div>
        </div>
      ) : null}
      {drawPaletteOpen && isDrawMode ? (
        <FlowColorPaletteModal
          title="Р¦РІРµС‚ РєРёСЃС‚Рё"
          ariaLabel="Р’С‹Р±РѕСЂ С†РІРµС‚Р° РєРёСЃС‚Рё"
          currentColor={drawPaletteDisplayColor}
          pickerColorValue={drawPalettePickerColorValue}
          presetColors={PRESET_CARD_COLORS}
          boardColorOptions={boardColorOptions}
          boardColorsEmptyLabel="РџРѕРєР° РЅР° РґРѕСЃРєРµ РЅРµС‚ С†РІРµС‚РЅС‹С… СЌР»РµРјРµРЅС‚РѕРІ."
          favoriteColors={favoriteColors}
          favoritesLoading={favoritesLoading}
          isCurrentColorFavorite={isDrawPaletteColorFavorite}
          style={{ left: '50%', bottom: '104px', width: 'min(420px, calc(100vw - 24px))', transform: 'translateX(-50%)' }}
          paletteRef={drawPaletteRef}
          onColorChange={setDrawPaletteColorLive}
          onToggleFavorite={() => void toggleDrawCurrentColorFavorite()}
          onCancel={cancelDrawPalette}
          onSave={saveDrawPalette}
          favoriteDisabled={!drawPaletteDisplayColor || favoritesLoading}
        />
      ) : null}
      {selectedDrawingPaletteOpen && selectedDrawings.length ? (
        <FlowColorPaletteModal
          title="Р¦РІРµС‚ С„РёРіСѓСЂС‹"
          ariaLabel="Р’С‹Р±РѕСЂ С†РІРµС‚Р° С„РёРіСѓСЂС‹"
          currentColor={selectedDrawingPaletteDisplayColor}
          pickerColorValue={selectedDrawingPalettePickerColorValue}
          presetColors={PRESET_CARD_COLORS}
          boardColorOptions={boardColorOptions}
          boardColorsEmptyLabel="РџРѕРєР° РЅР° РґРѕСЃРєРµ РЅРµС‚ С†РІРµС‚РЅС‹С… СЌР»РµРјРµРЅС‚РѕРІ."
          favoriteColors={favoriteColors}
          favoritesLoading={favoritesLoading}
          isCurrentColorFavorite={isSelectedDrawingPaletteColorFavorite}
          style={{ left: '50%', bottom: '104px', width: 'min(420px, calc(100vw - 24px))', transform: 'translateX(-50%)' }}
          onColorChange={setSelectedDrawingPaletteColorLive}
          onToggleFavorite={() => void toggleSelectedDrawingCurrentColorFavorite()}
          onCancel={cancelSelectedDrawingPalette}
          onSave={() => void saveSelectedDrawingPalette()}
          saveDisabled={drawingMutationBusy}
          cancelDisabled={drawingMutationBusy}
          favoriteDisabled={!selectedDrawingPaletteDisplayColor || favoritesLoading}
        />
      ) : null}
    </div>
  );
});

export default FlowBoard;


