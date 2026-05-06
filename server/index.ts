import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

interface PlayerState {
  id: string;
  handle: string;
  spriteChoice: 0 | 1;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  moving: boolean;
}

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

const players = new Map<string, PlayerState>();

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('join', (data: { handle: string; spriteChoice: 0 | 1 }) => {
    const { handle, spriteChoice } = data;

    for (const p of players.values()) {
      if (p.handle.toLowerCase() === handle.toLowerCase()) {
        socket.emit('joinError', 'Handle already taken in this room.');
        return;
      }
    }

    const player: PlayerState = {
      id: socket.id,
      handle,
      spriteChoice,
      x: 400 + Math.random() * 1200,
      y: 300 + Math.random() * 900,
      direction: 'down',
      moving: false,
    };

    players.set(socket.id, player);

    socket.emit('joinSuccess', {
      player,
      others: Array.from(players.values()).filter((p) => p.id !== socket.id),
    });

    socket.broadcast.emit('playerJoined', player);
    console.log(`"${handle}" joined. Room size: ${players.size}`);
  });

  socket.on(
    'playerUpdate',
    (update: { x?: number; y?: number; direction?: PlayerState['direction']; moving?: boolean }) => {
      const player = players.get(socket.id);
      if (!player) return;
      Object.assign(player, update);
      socket.broadcast.emit('playerUpdate', { id: socket.id, ...update });
    }
  );

  socket.on('chat', (data: { text: string; toId?: string }) => {
    const player = players.get(socket.id);
    if (!player || !data.text.trim()) return;

    const message = {
      fromId: socket.id,
      fromHandle: player.handle,
      text: data.text.trim().slice(0, 200),
      toId: data.toId,
      timestamp: Date.now(),
    };

    if (data.toId) {
      socket.emit('chatMessage', message);
      io.to(data.toId).emit('chatMessage', message);
    } else {
      io.emit('chatMessage', message);
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
    console.log(`"${player?.handle ?? socket.id}" left. Room size: ${players.size}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`Server on :${PORT}`));
