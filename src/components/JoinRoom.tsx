import React, { useState, useEffect } from 'react';
import { socket } from '../socket';
import { TINT_OPTIONS, TINT_ACCENT_COLORS } from '../types';
import type { TintDeg } from '../types';

interface Props {
  roomId: string;
  onJoin: (handle: string, spriteChoice: 0 | 1, tintDeg: number) => void;
}

const SPRITE_IMAGES = ['/assets/boy_choice.png', '/assets/girl_choice.png'];

export default function JoinRoom({ roomId, onJoin }: Props) {
  const [handle, setHandle] = useState('');
  const [spriteChoice, setSpriteChoice] = useState<0 | 1>(0);
  const [tintDeg, setTintDeg] = useState<number>(0);
  const [error, setError] = useState('');

  useEffect(() => {
    socket.on('joinError', (msg: string) => setError(msg));
    return () => { socket.off('joinError'); };
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = handle.trim();
    if (!trimmed) { setError('Enter a handle.'); return; }
    if (trimmed.length > 20) { setError('Handle too long (max 20 chars).'); return; }
    setError('');
    onJoin(trimmed, spriteChoice, tintDeg);
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">Multiplayer Room</h1>
        <p className="room-id-hint">Room: <code>{roomId}</code></p>
        <form onSubmit={submit} className="join-form">
          <label className="join-label">Your handle</label>
          <input
            className="join-input"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Enter name…"
            maxLength={20}
            autoFocus
          />

          <label className="join-label" style={{ marginTop: 20 }}>Choose your sprite</label>
          <div className="sprite-picker">
            {([0, 1] as const).map((idx) => (
              <button
                key={idx}
                type="button"
                className={`sprite-option${spriteChoice === idx ? ' selected' : ''}`}
                onClick={() => setSpriteChoice(idx)}
              >
                <SpritePreview index={idx} tintDeg={tintDeg} />
              </button>
            ))}
          </div>

          <label className="join-label" style={{ marginTop: 20 }}>Choose your color</label>
          <div className="color-picker">
            {TINT_OPTIONS.map((deg) => (
              <button
                key={deg}
                type="button"
                className={`color-swatch${tintDeg === deg ? ' selected' : ''}`}
                style={{ '--swatch-color': TINT_ACCENT_COLORS[deg as TintDeg] } as React.CSSProperties}
                onClick={() => setTintDeg(deg)}
                aria-label={`Color ${deg}`}
              />
            ))}
          </div>

          {error && <p className="join-error">{error}</p>}

          <button type="submit" className="join-btn">
            Enter Room
          </button>
        </form>
      </div>
    </div>
  );
}

function SpritePreview({ index, tintDeg }: { index: 0 | 1; tintDeg: number }) {
  return (
    <div className="sprite-preview">
      <img
        src={SPRITE_IMAGES[index]}
        alt=""
        width={80}
        height={140}
        style={{
          imageRendering: 'pixelated',
          filter: tintDeg !== 0 ? `hue-rotate(${tintDeg}deg)` : undefined,
        }}
      />
    </div>
  );
}
