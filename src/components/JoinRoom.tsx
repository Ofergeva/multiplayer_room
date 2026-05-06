import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

interface Props {
  onJoin: (handle: string, spriteChoice: 0 | 1) => void;
}

const SPRITE_IMAGES = ['/assets/boy_choice.png', '/assets/girl_choice.png'];

export default function JoinRoom({ onJoin }: Props) {
  const [handle, setHandle] = useState('');
  const [spriteChoice, setSpriteChoice] = useState<0 | 1>(0);
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
    onJoin(trimmed, spriteChoice);
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <h1 className="join-title">Multiplayer Room</h1>
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
                <SpritePreview index={idx} />
              </button>
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

function SpritePreview({ index }: { index: 0 | 1 }) {
  return (
    <div className="sprite-preview">
      <img src={SPRITE_IMAGES[index]} alt="" width={80} height={140} style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
