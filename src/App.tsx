import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import Landing from './components/Landing';
import JoinRoom from './components/JoinRoom';
import Game from './components/Game';
import type { PlayerState } from './types';
import { TINT_OPTIONS } from './types';
import type { TintDeg } from './types';

type AppState =
  | { phase: 'landing' }
  | { phase: 'join'; roomId: string; roomHue: number }
  | {
      phase: 'game';
      myId: string;
      myHandle: string;
      mySprite: 0 | 1;
      myTint: number;
      initialX: number;
      initialY: number;
      initialPlayers: PlayerState[];
      roomId: string;
      roomHue: number;
    };

function getRoomIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/([0-9a-f]{8})$/);
  return match ? match[1] : null;
}

function getRoomHueFromUrl(): number {
  const raw = parseInt(new URLSearchParams(window.location.search).get('hue') ?? '', 10);
  return TINT_OPTIONS.includes(raw as TintDeg) ? raw : 0;
}

function generateRoomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function App() {
  const roomId = getRoomIdFromUrl();
  const roomHue = getRoomHueFromUrl();
  const [state, setState] = useState<AppState>(
    roomId ? { phase: 'join', roomId, roomHue } : { phase: 'landing' }
  );

  useEffect(() => {
    socket.connect();
    return () => { socket.disconnect(); };
  }, []);

  function handleJoin(handle: string, spriteChoice: 0 | 1, tintDeg: number) {
    if (state.phase !== 'join') return;
    socket.emit('join', { handle, spriteChoice, tintDeg, roomId: state.roomId });

    socket.once('joinSuccess', ({ player, others }: { player: PlayerState; others: PlayerState[] }) => {
      setState({
        phase: 'game',
        myId: player.id,
        myHandle: player.handle,
        mySprite: player.spriteChoice,
        myTint: player.tintDeg,
        initialX: player.x,
        initialY: player.y,
        initialPlayers: others,
        roomId: state.roomId,
        roomHue: state.roomHue,
      });
    });
  }

  function handleLeave() {
    socket.disconnect();
    window.location.href = '/';
  }

  if (state.phase === 'landing') {
    return (
      <Landing
        onCreateRoom={(hue) => {
          const query = hue !== 0 ? `?hue=${hue}` : '';
          window.location.href = '/' + generateRoomId() + query;
        }}
      />
    );
  }

  if (state.phase === 'join') {
    return <JoinRoom roomId={state.roomId} onJoin={handleJoin} />;
  }

  return (
    <Game
      myId={state.myId}
      myHandle={state.myHandle}
      mySprite={state.mySprite}
      myTint={state.myTint}
      initialX={state.initialX}
      initialY={state.initialY}
      initialPlayers={state.initialPlayers}
      roomHue={state.roomHue}
      onLeave={handleLeave}
    />
  );
}
