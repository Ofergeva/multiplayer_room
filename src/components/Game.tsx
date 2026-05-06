import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Send, LogOut, Lock } from 'lucide-react';
import { socket } from '../socket';
import type { Direction, PlayerState, ChatMessage, TintDeg } from '../types';
import { TINT_ACCENT_COLORS } from '../types';

/* ─── Constants ─────────────────────────────────────────── */
const SW = 110;             // sprite frame width
const SH = 110;             // sprite frame height
const FRAMES = 4;          // walk frames per direction
const ANIM_MS = 120;       // ms per walk frame
const SPEED = 160;         // px/s
const SYNC_MS = 80;        // server position sync interval
const BUBBLE_MS = 4000;    // speech bubble lifetime
const STOP_DIST = 2;       // snap-to-target distance
const ADJ_TOL = 10;        // "touching" tolerance in px
const CHAT_H = 60;         // chat bar height
const WORLD_W = 2400;
const WORLD_H = 1800;
const CAM_MARGIN = 160;    // dead-zone before camera follows
const CAM_LERP = 0.14;     // camera catch-up speed
const ARROW_EDGE = 44;     // px from canvas edge for off-screen arrows

/* ─── Sprite sheet row per direction ────────────────────── */
const DIR_COL: Record<Direction, number> = { down: 0, left: 1, up: 2, right: 3 };
const SPRITE_COLORS: [string, string] = ['#3a3a5c', '#c9a227'];

/* ─── Types ─────────────────────────────────────────────── */
interface GamePlayer {
  id: string;
  handle: string;
  spriteChoice: 0 | 1;
  tintDeg: number;
  x: number;       // current visual x
  y: number;       // current visual y
  tx: number;      // target x
  ty: number;      // target y
  direction: Direction;
  moving: boolean;
  frame: number;
  frameTimer: number;
  targetFacing?: Direction; // final facing when walk-to-player completes
}

interface Bubble {
  uid: string;
  fromId: string;
  text: string;
  isPrivate: boolean;
  expiresAt: number;
}

/* ─── Helpers ────────────────────────────────────────────── */
function dirOf(dx: number, dy: number): Direction {
  return Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? 'right' : 'left'
    : dy >= 0 ? 'down' : 'up';
}

function adjacentPos(
  other: { x: number; y: number },
  approach: Direction
): { tx: number; ty: number } {
  const offsets: Record<Direction, [number, number]> = {
    right: [-SW, 0],
    left: [+SW, 0],
    down: [0, -SH],
    up: [0, +SH],
  };
  const [ox, oy] = offsets[approach];
  return { tx: other.x + ox, ty: other.y + oy };
}

function findPrivateTarget(
  me: GamePlayer,
  players: Map<string, GamePlayer>
): { id: string; handle: string } | null {
  if (me.moving) return null;
  for (const [id, p] of players) {
    if (id === me.id) continue;
    const dx = p.x - me.x;
    const dy = p.y - me.y;
    let adjacent = false;
    switch (me.direction) {
      case 'right': adjacent = Math.abs(dx - SW) < ADJ_TOL && Math.abs(dy) < SH / 2; break;
      case 'left': adjacent = Math.abs(dx + SW) < ADJ_TOL && Math.abs(dy) < SH / 2; break;
      case 'down': adjacent = Math.abs(dy - SH) < ADJ_TOL && Math.abs(dx) < SW / 2; break;
      case 'up': adjacent = Math.abs(dy + SH) < ADJ_TOL && Math.abs(dx) < SW / 2; break;
    }
    if (adjacent) return { id, handle: p.handle };
  }
  return null;
}

/* ─── SpriteSheet ────────────────────────────────────────── */
class SpriteSheet {
  private img = new Image();
  loaded = false;
  constructor(src: string) {
    this.img.onload = () => { this.loaded = true; };
    this.img.src = src;
  }
  draw(ctx: CanvasRenderingContext2D, dir: Direction, frame: number, cx: number, cy: number) {
    if (!this.loaded) return false;
    ctx.drawImage(
      this.img,
      DIR_COL[dir] * SW, frame * SH, SW, SH,
      Math.round(cx - SW / 2), Math.round(cy - SH / 2), SW, SH
    );
    return true;
  }
}

/* ─── Fallback sprite ────────────────────────────────────── */
function drawFallback(ctx: CanvasRenderingContext2D, p: GamePlayer) {
  const { x, y, direction } = p;
  const r = SW / 2 - 2;
  ctx.fillStyle = SPRITE_COLORS[p.spriteChoice];
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // direction pip
  const pipDist = r * 0.6;
  const pipOff: Record<Direction, [number, number]> = {
    right: [pipDist, 0], left: [-pipDist, 0],
    down: [0, pipDist], up: [0, -pipDist],
  };
  const [px, py] = pipOff[direction];
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x + px, y + py, 5, 0, Math.PI * 2);
  ctx.fill();
}

/* ─── Speech bubble ──────────────────────────────────────── */
function drawBubble(ctx: CanvasRenderingContext2D, p: GamePlayer, bubble: Bubble) {
  const now = Date.now();
  const remaining = bubble.expiresAt - now;
  if (remaining <= 0) return;

  const alpha = remaining < 700 ? remaining / 700 : 1;
  const pad = 8;
  const fontSize = 13;
  const maxTextW = 180;
  ctx.font = `${fontSize}px system-ui, sans-serif`;

  // word wrap
  const words = bubble.text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxTextW) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3) lines.length = 3;

  const lh = fontSize + 5;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const bw = Math.min(maxTextW, textW) + pad * 2;
  const bh = lines.length * lh + pad * 2 - 2;

  const bx = Math.round(p.x - bw / 2);
  const by = Math.round(p.y - SH / 2 - bh - 22 - 4);  // above handle

  ctx.save();
  ctx.globalAlpha = alpha;

  const bg = bubble.isPrivate ? '#2d1a3e' : '#ffffff';
  const fg = bubble.isPrivate ? '#ddb6f2' : '#1a1a1a';
  const border = bubble.isPrivate ? '#9b59b6' : '#cccccc';
  const rr = 8;

  // box
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bx + rr, by);
  ctx.lineTo(bx + bw - rr, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + rr, rr);
  ctx.lineTo(bx + bw, by + bh - rr);
  ctx.arcTo(bx + bw, by + bh, bx + bw - rr, by + bh, rr);
  ctx.lineTo(bx + rr, by + bh);
  ctx.arcTo(bx, by + bh, bx, by + bh - rr, rr);
  ctx.lineTo(bx, by + rr);
  ctx.arcTo(bx, by, bx + rr, by, rr);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // tail
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.beginPath();
  ctx.moveTo(p.x - 6, by + bh);
  ctx.lineTo(p.x + 6, by + bh);
  ctx.lineTo(p.x, by + bh + 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.x - 6, by + bh + 1);
  ctx.lineTo(p.x, by + bh + 8);
  ctx.moveTo(p.x + 6, by + bh + 1);
  ctx.lineTo(p.x, by + bh + 8);
  ctx.stroke();

  // text
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], p.x, by + pad + (i + 1) * lh - 2);
  }

  ctx.restore();
}

/* ─── Background (called with world transform applied) ───── */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  cam: { x: number; y: number },
  cw: number,
  ch: number
) {
  const hw = cw / 2;
  const hh = ch / 2;
  const GRID = 64;
  ctx.fillStyle = '#4a7c4e';
  ctx.fillRect(cam.x - hw - 1, cam.y - hh - 1, cw + 2, ch + 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  const gx0 = Math.floor((cam.x - hw) / GRID) * GRID;
  const gy0 = Math.floor((cam.y - hh) / GRID) * GRID;
  for (let x = gx0; x <= cam.x + hw + GRID; x += GRID) {
    ctx.beginPath(); ctx.moveTo(x, cam.y - hh); ctx.lineTo(x, cam.y + hh); ctx.stroke();
  }
  for (let y = gy0; y <= cam.y + hh + GRID; y += GRID) {
    ctx.beginPath(); ctx.moveTo(cam.x - hw, y); ctx.lineTo(cam.x + hw, y); ctx.stroke();
  }
}

/* ─── Off-screen arrow (screen space) ───────────────────── */
function drawOffScreenArrow(
  ctx: CanvasRenderingContext2D,
  handle: string,
  screenX: number,
  screenY: number,
  cw: number,
  ch: number
) {
  const cx = cw / 2;
  const cy = ch / 2;
  const dx = screenX - cx;
  const dy = screenY - cy;
  const angle = Math.atan2(dy, dx);
  const hw = cx - ARROW_EDGE;
  const hh = cy - ARROW_EDGE;
  const tX = Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity;
  const tY = Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  const ex = cx + dx * t;
  const ey = cy + dy * t;

  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(angle);

  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.rotate(-angle);
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillText(handle, 1, -17);
  ctx.fillStyle = 'white';
  ctx.fillText(handle, 0, -18);
  ctx.restore();
}

/* ─── Component ──────────────────────────────────────────── */
interface GameProps {
  myId: string;
  myHandle: string;
  mySprite: 0 | 1;
  myTint: number;
  roomHue: number;
  initialX: number;
  initialY: number;
  initialPlayers: PlayerState[];
  onLeave: () => void;
}

export default function Game({
  myId, myHandle, mySprite, myTint, roomHue,
  initialX, initialY, initialPlayers,
  onLeave,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playersRef = useRef<Map<string, GamePlayer>>(new Map());
  const bubblesRef = useRef<Bubble[]>([]);
  const lastSyncRef = useRef(0);
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);

  const cameraRef = useRef({ x: initialX, y: initialY });

  const sheetsRef = useRef<[SpriteSheet, SpriteSheet]>([
    new SpriteSheet('/assets/boy.png'),
    new SpriteSheet('/assets/girl.png'),
  ]);

  const [chatText, setChatText] = useState('');
  const [privateTarget, setPrivateTarget] = useState<{ id: string; handle: string } | null>(null);
  const privateTargetRef = useRef<{ id: string; handle: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ─ Init players ──────────────────────────── */
  useEffect(() => {
    const map = playersRef.current;
    map.clear();

    map.set(myId, {
      id: myId, handle: myHandle, spriteChoice: mySprite, tintDeg: myTint,
      x: initialX, y: initialY,
      tx: initialX, ty: initialY,
      direction: 'down', moving: false,
      frame: 0, frameTimer: 0,
    });
    cameraRef.current = { x: initialX, y: initialY };

    for (const p of initialPlayers) {
      map.set(p.id, {
        ...p,
        tx: p.x, ty: p.y,
        frame: 0, frameTimer: 0,
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─ Socket events ─────────────────────────── */
  useEffect(() => {
    function onPlayerJoined(p: PlayerState) {
      playersRef.current.set(p.id, { ...p, tx: p.x, ty: p.y, frame: 0, frameTimer: 0 });
    }

    function onPlayerLeft(id: string) {
      playersRef.current.delete(id);
    }

    function onPlayerUpdate(u: Partial<PlayerState> & { id: string }) {
      const p = playersRef.current.get(u.id);
      if (!p) return;
      if (u.x !== undefined) p.tx = u.x;
      if (u.y !== undefined) p.ty = u.y;
      if (u.direction !== undefined) p.direction = u.direction;
      if (u.moving !== undefined) p.moving = u.moving;
    }

    function onChatMessage(msg: ChatMessage) {
      bubblesRef.current = bubblesRef.current.filter((b) => b.fromId !== msg.fromId);
      bubblesRef.current.push({
        uid: `${msg.fromId}-${msg.timestamp}`,
        fromId: msg.fromId,
        text: msg.text,
        isPrivate: !!msg.toId,
        expiresAt: Date.now() + BUBBLE_MS,
      });
    }

    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerLeft', onPlayerLeft);
    socket.on('playerUpdate', onPlayerUpdate);
    socket.on('chatMessage', onChatMessage);

    return () => {
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerLeft', onPlayerLeft);
      socket.off('playerUpdate', onPlayerUpdate);
      socket.off('chatMessage', onChatMessage);
    };
  }, []);

  /* ─ Canvas click ──────────────────────────── */
  const handleCanvasClick = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Convert screen → world
    const cam = cameraRef.current;
    const worldX = sx + cam.x - canvas.width / 2;
    const worldY = sy + cam.y - (canvas.height - CHAT_H) / 2;

    const me = playersRef.current.get(myId);
    if (!me) return;

    // Check for click on a remote player (world coords)
    for (const [id, p] of playersRef.current) {
      if (id === myId) continue;
      if (Math.abs(worldX - p.x) < SW / 2 && Math.abs(worldY - p.y) < SH / 2) {
        const dx = p.x - me.x;
        const dy = p.y - me.y;
        const approach = dirOf(dx, dy);
        const { tx, ty } = adjacentPos(p, approach);
        me.tx = tx;
        me.ty = ty;
        me.targetFacing = approach;
        return;
      }
    }

    // Walk to point (clamped to world bounds)
    me.tx = Math.max(SW / 2, Math.min(WORLD_W - SW / 2, worldX));
    me.ty = Math.max(SH / 2, Math.min(WORLD_H - SH / 2, worldY));
    me.targetFacing = undefined;
  }, [myId]);

  /* ─ Game loop ─────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // resize canvas to fill container
    function resize() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    canvas.addEventListener('click', handleCanvasClick);

    function loop(ts: number) {
      const dt = Math.min((ts - lastFrameRef.current) / 1000, 0.1); // cap at 100ms
      lastFrameRef.current = ts;

      const now = ts; // performance.now equivalent

      const players = playersRef.current;
      const me = players.get(myId);

      /* ── Move local player ── */
      if (me) {
        const dx = me.tx - me.x;
        const dy = me.ty - me.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > STOP_DIST) {
          const step = SPEED * dt;
          const ratio = Math.min(step / dist, 1);
          me.x += dx * ratio;
          me.y += dy * ratio;
          me.direction = dirOf(dx, dy);
          me.moving = true;
          me.frameTimer += dt * 1000;
          if (me.frameTimer >= ANIM_MS) {
            me.frame = (me.frame + 1) % FRAMES;
            me.frameTimer = 0;
          }
        } else {
          me.x = me.tx;
          me.y = me.ty;
          if (me.moving && me.targetFacing) {
            me.direction = me.targetFacing;
            me.targetFacing = undefined;
          }
          me.moving = false;
          me.frame = 0;
        }

        /* ── Sync to server ── */
        if (now - lastSyncRef.current > SYNC_MS) {
          lastSyncRef.current = now;
          socket.emit('playerUpdate', {
            x: Math.round(me.x),
            y: Math.round(me.y),
            direction: me.direction,
            moving: me.moving,
          });
        }

        /* ── Camera dead-zone follow ── */
        const gameH = canvas!.height - CHAT_H;
        const halfW = canvas!.width / 2;
        const halfH = gameH / 2;
        const cam = cameraRef.current;
        const sX = me.x - cam.x + halfW;
        const sY = me.y - cam.y + halfH;
        if (sX < CAM_MARGIN) cam.x += (me.x + halfW - CAM_MARGIN - cam.x) * CAM_LERP;
        if (sX > canvas!.width - CAM_MARGIN) cam.x += (me.x - halfW + CAM_MARGIN - cam.x) * CAM_LERP;
        if (sY < CAM_MARGIN) cam.y += (me.y + halfH - CAM_MARGIN - cam.y) * CAM_LERP;
        if (sY > gameH - CAM_MARGIN) cam.y += (me.y - halfH + CAM_MARGIN - cam.y) * CAM_LERP;

        /* ── Private target detection ── */
        const pt = findPrivateTarget(me, players);
        if (pt?.id !== privateTargetRef.current?.id) {
          privateTargetRef.current = pt;
          setPrivateTarget(pt);
        }
      }

      /* ── Lerp remote players ── */
      for (const [id, p] of players) {
        if (id === myId) continue;
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > STOP_DIST) {
          const step = SPEED * dt * 1.1; // slight overshoot correction
          const ratio = Math.min(step / dist, 1);
          p.x += dx * ratio;
          p.y += dy * ratio;
          p.moving = true;
          p.frameTimer += dt * 1000;
          if (p.frameTimer >= ANIM_MS) {
            p.frame = (p.frame + 1) % FRAMES;
            p.frameTimer = 0;
          }
        } else {
          p.x = p.tx;
          p.y = p.ty;
          p.moving = false;
          p.frame = 0;
        }
      }

      /* ── Prune expired bubbles ── */
      const nowMs = Date.now();
      bubblesRef.current = bubblesRef.current.filter((b) => b.expiresAt > nowMs);

      /* ── Render ── */
      const w = canvas!.width;
      const gh = canvas!.height - CHAT_H;
      const cam = cameraRef.current;

      ctx.clearRect(0, 0, w, canvas!.height);

      // World space rendering
      ctx.save();
      ctx.rect(0, 0, w, gh);
      ctx.clip();
      ctx.translate(-cam.x + w / 2, -cam.y + gh / 2);

      if (roomHue !== 0) { ctx.save(); ctx.filter = `hue-rotate(${roomHue}deg)`; }
      drawBackground(ctx, cam, w, gh);
      if (roomHue !== 0) ctx.restore();

      // sort by y for painters-algorithm depth
      const sorted = Array.from(players.values()).sort((a, b) => a.y - b.y);

      for (const p of sorted) {
        const sheet = sheetsRef.current[p.spriteChoice];

        // Apply hue-rotate tint for sprite draw only
        if (p.tintDeg !== 0) { ctx.save(); ctx.filter = `hue-rotate(${p.tintDeg}deg)`; }
        const drawn = sheet.draw(ctx, p.direction, p.frame, p.x, p.y);
        if (!drawn) drawFallback(ctx, p);
        if (p.tintDeg !== 0) ctx.restore();

        // handle label with accent color
        ctx.save();
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(p.handle, p.x + 1, p.y - SH / 2 - 7);
        ctx.fillStyle = TINT_ACCENT_COLORS[p.tintDeg as TintDeg] ?? '#e8e8e8';
        ctx.fillText(p.handle, p.x, p.y - SH / 2 - 8);
        ctx.restore();

        // bubble
        const bubble = bubblesRef.current.find((b) => b.fromId === p.id);
        if (bubble) drawBubble(ctx, p, bubble);
      }

      ctx.restore(); // end world transform + clip

      // Off-screen arrows (screen space)
      for (const [id, p] of players) {
        if (id === myId) continue;
        const psx = p.x - cam.x + w / 2;
        const psy = p.y - cam.y + gh / 2;
        if (psx < 0 || psx > w || psy < 0 || psy > gh) {
          drawOffScreenArrow(ctx, p.handle, psx, psy, w, gh);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('click', handleCanvasClick);
      ro.disconnect();
    };
  }, [myId, handleCanvasClick]);

  /* ─ Send chat ─────────────────────────────── */
  function sendChat() {
    const text = chatText.trim();
    if (!text) return;
    const pt = privateTargetRef.current;
    socket.emit('chat', { text, toId: pt?.id });
    setChatText('');
    inputRef.current?.focus();
  }

  /* ─ Render ────────────────────────────────── */
  return (
    <div className="game-root">
      <canvas ref={canvasRef} className="game-canvas" />
      <div className="chat-bar">
        <div className="chat-inner">
          {privateTarget && (
            <div className="private-badge">
              <Lock size={12} />
              <span>Private → {privateTarget.handle}</span>
            </div>
          )}
          <div className="chat-row">
            <input
              ref={inputRef}
              className="chat-input"
              type="text"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              placeholder={
                privateTarget
                  ? `Whisper to ${privateTarget.handle}…`
                  : 'Say something to the room…'
              }
              maxLength={200}
            />
            <button
              className="chat-btn send-btn"
              onClick={sendChat}
              title="Send"
            >
              <Send size={18} />
            </button>
            <button
              className="chat-btn leave-btn"
              onClick={onLeave}
              title="Leave room"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
