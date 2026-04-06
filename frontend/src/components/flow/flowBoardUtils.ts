import { MarkerType, type Edge, type Node as RFNode } from 'reactflow';
import { API_URL } from '@/api/axiosInstance';
import type { ApiCardLink, ApiCardType, FlowNodeType } from './flowBoardModel';

export const NODE_SIZES: Record<FlowNodeType, { width: number; height: number }> = {
  rectangle: { width: 240, height: 80 },
  rhombus: { width: 120, height: 120 },
  circle: { width: 120, height: 120 }
};

export const mapApiTypeToNodeType = (type: ApiCardType): FlowNodeType => {
  if (type === 'diamond') return 'rhombus';
  return type;
};

export const resolveImageSrc = (image_path?: string | null) => {
  if (!image_path) return null;
  if (image_path.startsWith('/uploads/')) return `${API_URL}${image_path}`;
  return image_path;
};

export const buildEdgeFromLink = (l: ApiCardLink): Edge => ({
  id: `link-${l.id}`,
  source: String(l.from_card_id),
  target: String(l.to_card_id),
  type: 'flowStraight',
  className: 'flow_edge',
  style: { stroke: 'var(--pink)', strokeWidth: 2 },
  markerEnd: l.style === 'arrow' ? { type: MarkerType.ArrowClosed, color: 'var(--pink)' } : undefined,
  data: {
    linkId: l.id,
    fromCardId: l.from_card_id,
    toCardId: l.to_card_id,
    style: l.style,
    color: l.color,
    label: l.label ?? null,
    isLabelVisible:
      l.is_label_visible === null || l.is_label_visible === undefined
        ? true
        : typeof l.is_label_visible === 'number'
          ? Boolean(l.is_label_visible)
          : Boolean(l.is_label_visible),
  },
});

export const getBoundaryPoint = (
  shape: FlowNodeType,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  hw: number,
  hh: number,
) => {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (!Number.isFinite(absDx) || !Number.isFinite(absDy) || (absDx === 0 && absDy === 0)) return { x: cx, y: cy };

  // small outward gap so the line doesn't show "under" transparent nodes
  const EDGE_GAP = 8;
  const a = Math.max(1, hw + EDGE_GAP);
  const b = Math.max(1, hh + EDGE_GAP);

  if (shape === 'circle') {
    const len = Math.hypot(dx, dy) || 1;
    const r = Math.max(1, Math.min(a, b));
    const t = r / len;
    return { x: cx + dx * t, y: cy + dy * t };
  }

  if (shape === 'rhombus') {
    const denom = absDx / a + absDy / b;
    const t = denom > 0 ? 1 / denom : 1;
    return { x: cx + dx * t, y: cy + dy * t };
  }

  // rectangle (axis-aligned)
  const tx = absDx > 0 ? a / absDx : Infinity;
  const ty = absDy > 0 ? b / absDy : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
};

export const getNodeRect = (n: RFNode | undefined | null): { cx: number; cy: number; hw: number; hh: number } | null => {
  if (!n) return null;
  const nodeType = (n.type as FlowNodeType | undefined) ?? 'rectangle';
  const size = NODE_SIZES[nodeType] ?? NODE_SIZES.rectangle;
  const posAbs = (n as unknown as { positionAbsolute?: { x: number; y: number } | null })?.positionAbsolute;
  const pos = (n as unknown as { position?: { x: number; y: number } | null })?.position;
  const base = posAbs || pos;
  if (!base) return null;
  return { cx: base.x + size.width / 2, cy: base.y + size.height / 2, hw: size.width / 2, hh: size.height / 2 };
};

type VisibleRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  cy: number;
};

const isRectFullyVisible = (rect: VisibleRect, viewport: { left: number; right: number; top: number; bottom: number }) =>
  rect.left >= viewport.left &&
  rect.right <= viewport.right &&
  rect.top >= viewport.top &&
  rect.bottom <= viewport.bottom;

export const getInitialViewportForDenseArea = (
  nodes: RFNode[],
  container: { width: number; height: number },
  options?: { zoom?: number; padding?: number }
) => {
  const zoom = options?.zoom ?? 1;
  const padding = options?.padding ?? 48;

  if (!Number.isFinite(container.width) || !Number.isFinite(container.height) || container.width <= 0 || container.height <= 0) {
    return null;
  }

  const rects = nodes
    .map((node) => getNodeRect(node))
    .filter((rect): rect is NonNullable<ReturnType<typeof getNodeRect>> => Boolean(rect))
    .map((rect) => ({
      left: rect.cx - rect.hw,
      right: rect.cx + rect.hw,
      top: rect.cy - rect.hh,
      bottom: rect.cy + rect.hh,
      cx: rect.cx,
      cy: rect.cy,
    }));

  if (rects.length === 0) return null;

  const visibleWidth = container.width / zoom - padding * 2;
  const visibleHeight = container.height / zoom - padding * 2;

  if (visibleWidth <= 0 || visibleHeight <= 0) return null;

  const evaluateCenter = (centerX: number, centerY: number) => {
    const viewport = {
      left: centerX - visibleWidth / 2,
      right: centerX + visibleWidth / 2,
      top: centerY - visibleHeight / 2,
      bottom: centerY + visibleHeight / 2,
    };

    const visibleRects = rects.filter((rect) => isRectFullyVisible(rect, viewport));
    if (visibleRects.length === 0) return null;

    const bounds = visibleRects.reduce(
      (acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        right: Math.max(acc.right, rect.right),
        top: Math.min(acc.top, rect.top),
        bottom: Math.max(acc.bottom, rect.bottom),
      }),
      { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    );

    return {
      count: visibleRects.length,
      area: Math.max(1, bounds.right - bounds.left) * Math.max(1, bounds.bottom - bounds.top),
      centerX: (bounds.left + bounds.right) / 2,
      centerY: (bounds.top + bounds.bottom) / 2,
    };
  };

  let best: ReturnType<typeof evaluateCenter> = null;

  for (const rect of rects) {
    const initial = evaluateCenter(rect.cx, rect.cy);
    if (!initial) continue;

    const refined = evaluateCenter(initial.centerX, initial.centerY) ?? initial;
    const isBetter =
      !best ||
      refined.count > best.count ||
      (refined.count === best.count && refined.area < best.area);

    if (isBetter) {
      best = refined;
    }
  }

  if (!best) return null;

  return {
    x: container.width / 2 - best.centerX * zoom,
    y: container.height / 2 - best.centerY * zoom,
    zoom,
  };
};

const LINK_HANDLE_OFFSETS_RB: Record<Exclude<FlowNodeType, 'rectangle'>, { right: number; bottom: number }> = {
  circle: { right: 28, bottom: 28 },
  rhombus: { right: 21, bottom: 60 },
};

const RECTANGLE_LINK_HANDLE_OFFSETS = {
  locked: { right: 35, bottom: 12 },
  unlocked: { right: 15, bottom: 15 },
} as const;

export const getLinkHandleStyle = (shape: FlowNodeType, options?: { isLocked?: boolean }) => {
  const isLocked = Boolean(options?.isLocked);
  const { right, bottom } =
    shape === 'rectangle'
      ? (isLocked ? RECTANGLE_LINK_HANDLE_OFFSETS.locked : RECTANGLE_LINK_HANDLE_OFFSETS.unlocked)
      : (LINK_HANDLE_OFFSETS_RB[shape] ?? LINK_HANDLE_OFFSETS_RB.circle);
  return {
    right,
    bottom,
    left: 'auto',
    top: 'auto',
    transform: 'translate(50%, 50%)',
  } as const;
};
