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
  style: { stroke: l.color || 'var(--pink)', strokeWidth: 2 },
  markerEnd: l.style === 'arrow' ? { type: MarkerType.ArrowClosed, color: l.color || 'var(--pink)' } : undefined,
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

const LINK_HANDLE_OFFSETS_RB: Record<FlowNodeType, { right: number; bottom: number }> = {
  rectangle: { right: 15, bottom: 15 },
  circle: { right: 28, bottom: 28 },
  rhombus: { right: 21, bottom: 60 },
};

export const getLinkHandleStyle = (shape: FlowNodeType) => {
  const { right, bottom } = LINK_HANDLE_OFFSETS_RB[shape] ?? LINK_HANDLE_OFFSETS_RB.rectangle;
  return {
    right,
    bottom,
    left: 'auto',
    top: 'auto',
    transform: 'translate(50%, 50%)',
  } as const;
};
