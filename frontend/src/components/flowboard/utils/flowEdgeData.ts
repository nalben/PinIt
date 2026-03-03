import type { Edge } from 'reactflow';
import type { ApiLinkStyle } from '@/components/flow/flowBoardModel';

export type ParsedFlowEdgeData = {
  linkId: number;
  fromCardId: number;
  toCardId: number;
  style: ApiLinkStyle;
  color: string;
  label: string | null;
  isLabelVisible: boolean;
};

export const parseFlowEdgeData = (params: {
  edge: Edge;
  defaultColor: string;
}): ParsedFlowEdgeData | null => {
  const { edge, defaultColor } = params;

  const rawData = (edge as unknown as { data?: unknown })?.data as
    | {
        linkId?: unknown;
        fromCardId?: unknown;
        toCardId?: unknown;
        style?: unknown;
        color?: unknown;
        label?: unknown;
        isLabelVisible?: unknown;
      }
    | undefined;

  const linkId = typeof rawData?.linkId === 'number' ? rawData.linkId : Number(rawData?.linkId);
  if (!Number.isFinite(linkId) || linkId <= 0) return null;

  const fromCardId = typeof rawData?.fromCardId === 'number' ? rawData.fromCardId : Number(edge.source);
  const toCardId = typeof rawData?.toCardId === 'number' ? rawData.toCardId : Number(edge.target);
  if (!Number.isFinite(fromCardId) || !Number.isFinite(toCardId)) return null;

  return {
    linkId,
    fromCardId,
    toCardId,
    style: rawData?.style === 'arrow' ? 'arrow' : 'line',
    color: typeof rawData?.color === 'string' ? rawData.color : defaultColor,
    label: typeof rawData?.label === 'string' ? rawData.label : null,
    isLabelVisible: rawData?.isLabelVisible === undefined ? true : Boolean(rawData?.isLabelVisible),
  };
};

