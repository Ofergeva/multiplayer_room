import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PlayerState {
  id: string;
  handle: string;
  spriteChoice: 0 | 1;
  tintDeg: number;
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

const rooms = new Map<string, Map<string, PlayerState>>();
const socketRoom = new Map<string, string>();

function getRoom(roomId: string): Map<string, PlayerState> {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId)!;
}

function cleanupRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (room && room.size === 0) rooms.delete(roomId);
}

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  socket.on('join', (data: { handle: string; spriteChoice: 0 | 1; tintDeg: number; roomId: string }) => {
    const { handle, spriteChoice, tintDeg, roomId } = data;

    if (!/^[0-9a-f]{8}$/.test(roomId)) {
      socket.emit('joinError', 'Invalid room ID.');
      return;
    }

    const room = getRoom(roomId);

    for (const p of room.values()) {
      if (p.handle.toLowerCase() === handle.toLowerCase()) {
        socket.emit('joinError', 'Handle already taken in this room.');
        return;
      }
    }

    const player: PlayerState = {
      id: socket.id,
      handle,
      spriteChoice,
      tintDeg,
      x: 400 + Math.random() * 1200,
      y: 300 + Math.random() * 900,
      direction: 'down',
      moving: false,
    };

    room.set(socket.id, player);
    socketRoom.set(socket.id, roomId);
    socket.join(roomId);

    socket.emit('joinSuccess', {
      player,
      others: Array.from(room.values()).filter((p) => p.id !== socket.id),
    });

    socket.to(roomId).emit('playerJoined', player);
    console.log(`"${handle}" joined room ${roomId}. Room size: ${room.size}`);
  });

  socket.on(
    'playerUpdate',
    (update: { x?: number; y?: number; direction?: PlayerState['direction']; moving?: boolean }) => {
      const roomId = socketRoom.get(socket.id);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.get(socket.id);
      if (!player) return;
      Object.assign(player, update);
      socket.to(roomId).emit('playerUpdate', { id: socket.id, ...update });
    }
  );

  socket.on('chat', (data: { text: string; toId?: string }) => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.get(socket.id);
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
      io.to(roomId).emit('chatMessage', message);
    }
  });

  socket.on('disconnect', () => {
    const roomId = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);

    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.get(socket.id);
    room.delete(socket.id);

    io.to(roomId).emit('playerLeft', socket.id);
    cleanupRoom(roomId);
    console.log(`"${player?.handle ?? socket.id}" left room ${roomId}. Room size: ${room.size}`);
  });
});

// Serve built frontend in production
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../dist/index.html')));

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`Server on :${PORT}`));
