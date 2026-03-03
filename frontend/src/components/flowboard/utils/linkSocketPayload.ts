import type { ApiCardLink, ApiLinkStyle } from '@/components/flow/flowBoardModel';

type LinkUpdatedLikeCmd = {
  link_id?: unknown;
  from_card_id?: unknown;
  to_card_id?: unknown;
  style?: unknown;
  color?: unknown;
  label?: unknown;
  is_label_visible?: unknown;
};

export const parseLinkFromBoardsUpdated = (params: {
  cmd: LinkUpdatedLikeCmd;
  numericBoardId: number;
  defaultLinkStyle: ApiLinkStyle;
  defaultLinkColor: string;
}): ApiCardLink | null => {
  const { cmd, numericBoardId, defaultLinkStyle, defaultLinkColor } = params;

  const linkIdRaw = cmd?.link_id;
  const fromRaw = cmd?.from_card_id;
  const toRaw = cmd?.to_card_id;
  const styleRaw = cmd?.style;
  const colorRaw = cmd?.color;
  const labelRaw = cmd?.label;
  const visibleRaw = cmd?.is_label_visible;

  const id = typeof linkIdRaw === 'number' ? linkIdRaw : Number(linkIdRaw);
  const fromCardId = typeof fromRaw === 'number' ? fromRaw : Number(fromRaw);
  const toCardId = typeof toRaw === 'number' ? toRaw : Number(toRaw);

  if (!Number.isFinite(id) || !Number.isFinite(fromCardId) || !Number.isFinite(toCardId)) return null;

  const style = styleRaw === 'arrow' || styleRaw === 'line' ? (styleRaw as ApiLinkStyle) : defaultLinkStyle;
  const color = typeof colorRaw === 'string' ? colorRaw : defaultLinkColor;
  const label = labelRaw === null ? null : typeof labelRaw === 'string' ? labelRaw : null;
  const isLabelVisible = visibleRaw === undefined ? 1 : Number(visibleRaw) ? 1 : 0;

  return {
    id,
    board_id: numericBoardId,
    from_card_id: fromCardId,
    to_card_id: toCardId,
    style,
    color,
    label,
    is_label_visible: isLabelVisible,
    created_at: '',
  };
};

