import type { FlowCardShape } from '@/store/uiStore';

export type FlowNodeType = FlowCardShape;
export type FlowNodeData = {
  title: string;
  imageSrc: string | null;
  color: string | null;
  isLocked: boolean;
  tags: string[];
  imageLoaded?: boolean;
};

export type ApiCardType = 'circle' | 'rectangle' | 'diamond';
export type ApiCard = {
  id: number;
  board_id: number;
  type: ApiCardType;
  title: string | null;
  image_path: string | null;
  color: string | null;
  is_locked: number | boolean | null;
  tags?: string[] | null;
  x: number;
  y: number;
  created_at: string;
};

export type ApiLinkStyle = 'line' | 'arrow';
export type ApiCardLink = {
  id: number;
  board_id: number;
  from_card_id: number;
  to_card_id: number;
  style: ApiLinkStyle;
  color: string;
  label: string | null;
  is_label_visible: number | boolean | null;
  created_at: string;
};

export type ApiBoardDrawingPoint = {
  x: number;
  y: number;
};

export type ApiBoardDrawing = {
  id: number;
  board_id: number;
  user_id: number;
  color: string;
  stroke_width: number;
  path_d: string;
  sort_order: number;
  group_key: string | null;
  created_at: string;
  client_draw_id?: string | null;
};
