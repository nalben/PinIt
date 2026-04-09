import type { ApiBoardDrawing, ApiBoardDrawingPoint } from './flowBoardModel';

export const MAX_CARD_IMAGE_SIZE_MB = 5;
export const MAX_CARD_IMAGE_SIZE_BYTES = MAX_CARD_IMAGE_SIZE_MB * 1024 * 1024;
export const DEFAULT_CARD_PICKER_COLOR = '#E7CD73';
export const DEFAULT_DRAW_COLOR = '#F7C66F';
export const DEFAULT_DRAW_STROKE_WIDTH = 6;
export const MIN_DRAW_POINT_DISTANCE = 0.7;
export const PRESET_CARD_COLORS = ['#F28B82', '#F7C66F', '#F2E394', '#9FD3C7', '#7AC7E3', '#9DB7FF', '#C7A6FF', '#F3A6C8'] as const;

export const normalizeHexColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const color = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(color) ? color : null;
};

export const collectUniqueHexColors = (colors: Array<string | null | undefined>): string[] => {
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

export const clampDrawingStrokeWidth = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_DRAW_STROKE_WIDTH;
  return Math.min(24, Math.max(2, Math.round(numeric)));
};

export const clampFlowZoom = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(2, Math.max(0.5, value));
};

export const makeClientDrawId = () => `draw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const makeDrawingGroupKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

export const sortBoardDrawings = <TDrawing extends { sort_order: number; id?: number }>(items: TDrawing[]) =>
  items.slice().sort((a, b) => {
    const orderDiff = Number(a.sort_order) - Number(b.sort_order);
    if (orderDiff) return orderDiff;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });

export const normalizeDrawingSortOrders = <TDrawing extends { sort_order: number }>(items: TDrawing[]) =>
  items.map((item, index) => ({ ...item, sort_order: index + 1 }));

export const roundDrawingCoord = (value: number) => Math.round(value * 100) / 100;

export const buildDrawingPathFromPoints = (points: ApiBoardDrawingPoint[]) => {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midX = roundDrawingCoord((current.x + next.x) / 2);
    const midY = roundDrawingCoord((current.y + next.y) / 2);
    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
};

export type PendingBoardDrawing = {
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

export type DrawingPersistedSnapshot = {
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

export type DrawingCreateSnapshot = Omit<DrawingPersistedSnapshot, 'id' | 'created_at'> & {
  points?: ApiBoardDrawingPoint[];
  created_at?: string;
};

export type DrawingHistoryEntry =
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

export type DrawingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type DrawingCanvasItem = {
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

    for (let valueIndex = 0; valueIndex < arity; valueIndex += 1) {
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

export const isPointNearDrawingPath = (pathD: string, point: { x: number; y: number }, tolerance: number) => {
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

export const getDrawingBoundsFromPathD = (pathD: string): DrawingBounds | null => {
  const commands = parseDrawingPathCommands(pathD);
  if (!commands?.length) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  commands.forEach(({ values }) => {
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index];
      const y = values[index + 1];
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

export const translateDrawingPath = (pathD: string, dx: number, dy: number): string | null => {
  const commands = parseDrawingPathCommands(pathD);
  if (!commands?.length) return null;

  const nextCommands = commands.map(({ command, values }) => ({
    command,
    values: values.map((value, index) => roundDrawingCoord(value + (index % 2 === 0 ? dx : dy))),
  }));

  return stringifyDrawingPathCommands(nextCommands);
};

export const getTranslatedDrawingBounds = (bounds: DrawingBounds | null, dx: number, dy: number): DrawingBounds | null => {
  if (!bounds) return null;
  return {
    minX: roundDrawingCoord(bounds.minX + dx),
    minY: roundDrawingCoord(bounds.minY + dy),
    maxX: roundDrawingCoord(bounds.maxX + dx),
    maxY: roundDrawingCoord(bounds.maxY + dy),
  };
};

export const getDrawingScreenBounds = (
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

export const isPointInRect = (
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number } | null
) => Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);

export const rectsIntersect = (
  a: { left: number; top: number; right: number; bottom: number } | null,
  b: { left: number; top: number; right: number; bottom: number } | null
) => Boolean(a && b && a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top);

export const mergeDrawingBounds = (items: Array<DrawingBounds | null>): DrawingBounds | null => {
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

export const toDrawingPersistedSnapshot = (drawing: ApiBoardDrawing): DrawingPersistedSnapshot => ({
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

export const toDrawingCreateSnapshot = (
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

export const expandDrawingIdsByGroup = (drawings: ApiBoardDrawing[], ids: number[]) => {
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

export const parseViewportTransform = (transform: string | null | undefined) => {
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
