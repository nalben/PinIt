import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  type MiniMapNodeProps,
  type NodeProps,
  Position,
  useReactFlow,
} from 'reactflow';
import LockClose from '@/assets/icons/monochrome/lock_close.svg';
import classes from './FlowBoard.module.scss';
import type { FlowNodeData, FlowNodeType } from './flowBoardModel';
import { getBoundaryPoint, getLinkHandleStyle, getNodeRect } from './flowBoardUtils';

const MiniMapNode: React.FC<MiniMapNodeProps> = (props) => {
  const { id, x, y, width, height, className, color, strokeColor, strokeWidth, shapeRendering, style, onClick } = props;

  const commonProps = {
    className,
    style,
    fill: color,
    stroke: strokeColor,
    strokeWidth,
    shapeRendering,
    onClick: onClick ? (event: React.MouseEvent<SVGElement>) => onClick(event, id) : undefined,
  };

  if (className.includes('minimap_circle')) {
    const radius = Math.min(width, height) / 2;
    return <circle {...commonProps} cx={x + width / 2} cy={y + height / 2} r={radius} />;
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

export const useNodeFloatNow = () =>
  useSyncExternalStore(FLOAT_CLOCK.subscribe, FLOAT_CLOCK.getSnapshot, FLOAT_CLOCK.getServerSnapshot);

const hashNodeFloatSeed = (nodeId: string) => {
  let hash = 2166136261;
  for (let index = 0; index < nodeId.length; index += 1) {
    hash ^= nodeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const sampleNodeFloatPath = (path: readonly NodeFloatPathPoint[], progress: number): NodeFloatPathPoint => {
  if (progress <= 0) return path[0];
  if (progress >= 1) return path[path.length - 1];

  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const next = path[index];
    if (progress > next.t) continue;

    const range = next.t - previous.t || 1;
    const localT = (progress - previous.t) / range;
    const easedT = localT * localT * (3 - 2 * localT);

    return {
      t: progress,
      x: previous.x + (next.x - previous.x) * easedT,
      y: previous.y + (next.y - previous.y) * easedT,
      rotate: previous.rotate + (next.rotate - previous.rotate) * easedT,
    };
  }

  return path[path.length - 1];
};

export const getNodeFloatVector = (nodeId: string, now: number): NodeFloatVector => {
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
          <div className={classes.rhombus_content} style={nodeStyle}>
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
          <div className={classes.circle_content} style={nodeStyle}>
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

export const NODE_TYPES = {
  rectangle: RectangleNode,
  rhombus: RhombusNode,
  circle: CircleNode,
} as const;

const FlowStraightEdge: React.FC<EdgeProps> = (props) => {
  const { id, source, target, style, markerEnd, sourceX, sourceY, targetX, targetY, data } = props;
  const reactFlow = useReactFlow();
  const floatNow = useNodeFloatNow();
  const isSelected = Boolean((props as unknown as { selected?: boolean }).selected);
  const [isHovered, setIsHovered] = useState(false);
  const isDesktopHover = __PLATFORM__ === 'desktop';
  const sourceFloat = useMemo(() => getNodeFloatVector(String(source), floatNow), [floatNow, source]);
  const targetFloat = useMemo(() => getNodeFloatVector(String(target), floatNow), [floatNow, target]);

  const sourceNode = reactFlow.getNode(source);
  const targetNode = reactFlow.getNode(target);
  const sourceRect = getNodeRect(sourceNode);
  const targetRect = getNodeRect(targetNode);

  let sx = sourceX + sourceFloat.x;
  let sy = sourceY + sourceFloat.y;
  let tx = targetX + targetFloat.x;
  let ty = targetY + targetFloat.y;

  const MIN_EDGE_RENDER_LEN_PX = 12;
  const OVERLAP_HIDE_AABB_PAD_PX = 8;

  if (sourceRect && targetRect) {
    const sourceType = (sourceNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const targetType = (targetNode?.type as FlowNodeType | undefined) ?? 'rectangle';
    const sourceCx = sourceRect.cx + sourceFloat.x;
    const sourceCy = sourceRect.cy + sourceFloat.y;
    const targetCx = targetRect.cx + targetFloat.x;
    const targetCy = targetRect.cy + targetFloat.y;
    const dx = targetCx - sourceCx;
    const dy = targetCy - sourceCy;

    const overlapsOrTouchesAabb =
      Math.abs(dx) <= sourceRect.hw + targetRect.hw + OVERLAP_HIDE_AABB_PAD_PX &&
      Math.abs(dy) <= sourceRect.hh + targetRect.hh + OVERLAP_HIDE_AABB_PAD_PX;

    if (overlapsOrTouchesAabb) return null;

    const sourcePoint = getBoundaryPoint(sourceType, sourceCx, sourceCy, dx, dy, sourceRect.hw, sourceRect.hh);
    const targetPoint = getBoundaryPoint(targetType, targetCx, targetCy, -dx, -dy, targetRect.hw, targetRect.hh);
    sx = sourcePoint.x;
    sy = sourcePoint.y;
    tx = targetPoint.x;
    ty = targetPoint.y;
  }

  if (Math.hypot(tx - sx, ty - sy) < MIN_EDGE_RENDER_LEN_PX) return null;

  const labelRaw = (data as { label?: unknown } | undefined)?.label;
  const isLabelVisibleRaw = (data as { isLabelVisible?: unknown } | undefined)?.isLabelVisible;
  const isLabelVisible = isLabelVisibleRaw === undefined ? true : Boolean(isLabelVisibleRaw);
  const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
  const shouldRenderLabel = Boolean(label);
  const labelOpacity = isLabelVisible || isHovered || isSelected ? 1 : 0;
  const labelClass = classes.flow_edge_label_html;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  const dataStyleRaw = (data as { style?: unknown } | undefined)?.style;
  const isArrow = dataStyleRaw === 'arrow' ? true : dataStyleRaw === 'line' ? false : Boolean(markerEnd);

  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy);
  const ux = Number.isFinite(len) && len > 0.0001 ? dx / len : 0;
  const uy = Number.isFinite(len) && len > 0.0001 ? dy / len : 0;

  const ARROW_LEN = 16;
  const ARROW_WIDTH = 14;
  const tipX = tx;
  const tipY = ty;
  const baseX = tipX - ux * ARROW_LEN;
  const baseY = tipY - uy * ARROW_LEN;
  const px = -uy;
  const py = ux;
  const leftX = baseX + px * (ARROW_WIDTH / 2);
  const leftY = baseY + py * (ARROW_WIDTH / 2);
  const rightX = baseX - px * (ARROW_WIDTH / 2);
  const rightY = baseY - py * (ARROW_WIDTH / 2);

  const lineEndX = isArrow ? baseX : tx;
  const lineEndY = isArrow ? baseY : ty;
  const path = `M${sx},${sy}L${lineEndX},${lineEndY}`;

  const renderedStyle = isSelected ? { ...(style ?? {}), stroke: 'var(--white)' } : style;
  const strokeColor =
    typeof (renderedStyle as { stroke?: unknown } | undefined)?.stroke === 'string'
      ? String((renderedStyle as { stroke?: unknown }).stroke)
      : typeof (style as { stroke?: unknown } | undefined)?.stroke === 'string'
        ? String((style as { stroke?: unknown }).stroke)
        : 'var(--pink)';
  const renderedStyleWithCap = isArrow ? { ...(renderedStyle ?? {}), strokeLinecap: 'butt' as const } : renderedStyle;

  const arrowHead = isArrow ? (
    <path className={classes.flow_edge_arrowhead} d={`M ${tipX} ${tipY} L ${leftX} ${leftY} L ${rightX} ${rightY} Z`} fill={strokeColor} />
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

export const EDGE_TYPES = {
  flowStraight: FlowStraightEdge,
} as const;

export { MiniMapNode };
