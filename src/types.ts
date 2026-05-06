export type Direction = 'up' | 'down' | 'left' | 'right';
export type SpriteChoice = 0 | 1;

export const TINT_OPTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export type TintDeg = typeof TINT_OPTIONS[number];

export const TINT_ACCENT_COLORS: Record<TintDeg, string> = {
  0: '#e8e8ff', 45: '#ffe599', 90: '#b6f0a0', 135: '#a0e4f0',
  180: '#a0b6f0', 225: '#c8a0f0', 270: '#f0a0d8', 315: '#f0a0a0',
};

export interface PlayerState {
  id: string;
  handle: string;
  spriteChoice: SpriteChoice;
  tintDeg: number;
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
}

export interface ChatMessage {
  fromId: string;
  fromHandle: string;
  text: string;
  toId?: string;
  timestamp: number;
}
