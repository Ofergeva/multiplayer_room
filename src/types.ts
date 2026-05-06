export type Direction = 'up' | 'down' | 'left' | 'right';
export type SpriteChoice = 0 | 1;

export interface PlayerState {
  id: string;
  handle: string;
  spriteChoice: SpriteChoice;
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
