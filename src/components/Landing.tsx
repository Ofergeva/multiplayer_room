import React, { useState } from 'react';
import { TINT_OPTIONS, TINT_ACCENT_COLORS } from '../types';
import type { TintDeg } from '../types';

interface Props {
  onCreateRoom: (roomHue: number) => void;
}

export default function Landing({ onCreateRoom }: Props) {
  const [roomHue, setRoomHue] = useState<number>(0);

  return (
    <div className="join-screen">
      <div className="landing-card">
        <h1 className="join-title">Multiplayer Room</h1>
        <p className="landing-subtitle">
          Create a room and share the link with friends.
        </p>

        <label className="join-label" style={{ marginTop: 4 }}>Room color</label>
        <div className="color-picker">
          {TINT_OPTIONS.map((deg) => (
            <button
              key={deg}
              type="button"
              className={`color-swatch${roomHue === deg ? ' selected' : ''}`}
              style={{ '--swatch-color': TINT_ACCENT_COLORS[deg as TintDeg] } as React.CSSProperties}
              onClick={() => setRoomHue(deg)}
              aria-label={`Room color ${deg}`}
            />
          ))}
        </div>

        <button className="join-btn landing-create-btn" onClick={() => onCreateRoom(roomHue)}>
          Create Room
        </button>
      </div>
    </div>
  );
}
