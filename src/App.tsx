import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import JoinRoom from './components/JoinRoom';
import Game from './components/Game';
import type { PlayerState } from './types';

type AppState =
  | { phase: 'join' }
  | {
      phase: 'game';
      myId: string;
      myHandle: string;
      mySprite: 0 | 1;
      initialX: number;
      initialY: number;
      initialPlayers: PlayerState[];
    };

export default function App() {
  const [state, setState] = useState<AppState>({ phase: 'join' });

  useEffect(() => {
    socket.connect();
    return () => { socket.disconnect(); };
  }, []);

  function handleJoin(handle: string, spriteChoice: 0 | 1) {
    socket.emit('join', { handle, spriteChoice });

    socket.once('joinSuccess', ({ player, others }: { player: PlayerState; others: PlayerState[] }) => {
      setState({
        phase: 'game',
        myId: player.id,
        myHandle: player.handle,
        mySprite: player.spriteChoice,
        initialX: player.x,
        initialY: player.y,
        initialPlayers: others,
      });
    });
  }

  function handleLeave() {
    socket.disconnect();
    socket.connect();
    setState({ phase: 'join' });
  }

  if (state.phase === 'join') {
    return <JoinRoom onJoin={handleJoin} />;
  }

  return (
    <Game
      myId={state.myId}
      myHandle={state.myHandle}
      mySprite={state.mySprite}
      initialX={state.initialX}
      initialY={state.initialY}
      initialPlayers={state.initialPlayers}
      onLeave={handleLeave}
    />
  );
}
