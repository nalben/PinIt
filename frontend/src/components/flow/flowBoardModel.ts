import type { FlowCardShape } from '@/store/uiStore';

export type FlowNodeType = FlowCardShape;
export type FlowNodeData = {
  title: string;
  imageSrc: string | null;
  isLocked: boolean;
  imageLoaded?: boolean;
};

export type ApiCardType = 'circle' | 'rectangle' | 'diamond';
export type ApiCard = {
  id: number;
  board_id: number;
  type: ApiCardType;
  title: string | null;
  image_path: string | null;
  is_locked: number | boolean | null;
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
  created_at: string;
};

