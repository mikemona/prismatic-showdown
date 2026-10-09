import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, ServerToClientEvents, SessionInfo } from '../../shared/protocol.ts';
import { contentPool } from './content/pool.ts';
import { cleanName, GameError, Room, type Seat } from './room.ts';

interface SocketData {
  code?: string;
  sessionId?: string;
}

type GameServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const PORT = Number(process.env.PORT ?? 3000);
/** Developer shortcuts (e.g. jump to the end of a game). Only `npm run dev` passes this flag. */
const DEV_TOOLS = process.argv.includes('--dev-tools');
/** Rooms with nobody connected are removed after this long. */
const IDLE_ROOM_MS = 30 * 60 * 1000;
/** No 0/O or 1/I so codes are easy to read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map<string, Room>();

const app = express();
const httpServer = createServer(app);
const io: GameServer = new Server(httpServer);

// --- static client (production) ------------------------------------------

const clientDist = fileURLToPath(new URL('../../client/dist/client/browser', import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Room links like /room/ABCD are client routes.
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientDist }));
}

// --- helpers ---------------------------------------------------------------

function newRoomCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function normalizeCode(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

function requireRoom(code: string): Room {
  const room = rooms.get(code);
  if (!room) throw new GameError('That room does not exist or has closed.');
  return room;
}

/** The room and seat this socket is sitting in. */
function seatOf(socket: GameSocket): { room: Room; seat: Seat } {
  const { code, sessionId } = socket.data;
  if (!code || !sessionId) throw new GameError('You are not in a room.');
  const room = requireRoom(code);
  const seat = room.findSeat(sessionId);
  if (!seat) throw new GameError('You are no longer in this room.');
  return { room, seat };
}

function hostRoom(socket: GameSocket): Room {
  const { room, seat } = seatOf(socket);
  if (seat.role !== 'host') throw new GameError('Only the host can do that.');
  return room;
}

/** Send every socket in the room its own view (the host sees answers, players don't). */
function broadcast(room: Room): void {
  room.lastActivity = Date.now();
  const socketIds = io.sockets.adapter.rooms.get(room.code) ?? new Set<string>();
  for (const id of socketIds) {
    const socket = io.sockets.sockets.get(id);
    const seat = socket?.data.sessionId ? room.findSeat(socket.data.sessionId) : null;
    if (socket && seat) socket.emit('room:state', room.viewFor(seat));
  }
}

/** Run a handler, turn GameErrors into a failed ack, and broadcast on success. */
function handle<T extends object>(ack: Ack<T> | undefined, fn: () => { room: Room; result: T }): void {
  const reply: Ack<T> = typeof ack === 'function' ? ack : () => {};
  try {
    const { room, result } = fn();
    reply({ ok: true, ...result });
    broadcast(room);
    room.afterAction();
  } catch (err) {
    if (!(err instanceof GameError)) console.error(err);
    reply({ ok: false, error: err instanceof GameError ? err.message : 'Something went wrong.' });
  }
}

/** Point a seat at this socket, booting any older tab that held it. */
function attach(socket: GameSocket, room: Room, seat: Seat, sessionId: string): SessionInfo {
  detach(socket);
  const previousId = seat.role === 'host' ? room.hostSocketId : seat.player.socketId;
  if (previousId && previousId !== socket.id) {
    const previous = io.sockets.sockets.get(previousId);
    previous?.emit('room:closed', 'You opened this room in another tab.');
    previous?.leave(room.code);
    if (previous) previous.data = {};
  }
  if (seat.role === 'host') room.hostSocketId = socket.id;
  else seat.player.socketId = socket.id;

  socket.data = { code: room.code, sessionId };
  socket.join(room.code);
  return { code: room.code, sessionId, role: seat.role };
}

/** Release whatever seat this socket held (refresh, navigation, disconnect). */
function detach(socket: GameSocket): void {
  const { code, sessionId } = socket.data;
  if (!code || !sessionId) return;
  socket.data = {};
  socket.leave(code);
  const room = rooms.get(code);
  const seat = room?.findSeat(sessionId);
  if (!room || !seat) return;
  if (seat.role === 'host' && room.hostSocketId === socket.id) room.hostSocketId = null;
  if (seat.role === 'player' && seat.player.socketId === socket.id) seat.player.socketId = null;
  broadcast(room);
}

// --- socket events ---------------------------------------------------------

io.on('connection', (socket: GameSocket) => {
  socket.on('room:create', (req, ack) =>
    handle(ack, () => {
      const room = new Room(newRoomCode(), cleanName(req?.hostName), contentPool, broadcast);
      rooms.set(room.code, room);
      return { room, result: attach(socket, room, { role: 'host' }, room.hostSessionId) };
    }),
  );

  socket.on('room:peek', (req, ack) =>
    handle(ack, () => {
      const room = requireRoom(normalizeCode(req?.code));
      return { room, result: { hostName: room.hostName, phase: room.phase } };
    }),
  );

  socket.on('room:join', (req, ack) =>
    handle(ack, () => {
      const room = requireRoom(normalizeCode(req?.code));
      const player = room.addPlayer(req?.name);
      return { room, result: attach(socket, room, { role: 'player', player }, player.sessionId) };
    }),
  );

  socket.on('room:resume', (req, ack) =>
    handle(ack, () => {
      const room = requireRoom(normalizeCode(req?.code));
      const seat = room.findSeat(String(req?.sessionId ?? ''));
      if (!seat) throw new GameError('Your seat in this room is gone. Join again with your name.');
      return { room, result: attach(socket, room, seat, String(req.sessionId)) };
    }),
  );

  socket.on('room:leave', () => detach(socket));

  // Host controls
  const hostAction = (fn: (room: Room) => void) => (ack: Ack) =>
    handle(ack, () => {
      const room = hostRoom(socket);
      fn(room);
      return { room, result: {} };
    });

  socket.on('host:start', hostAction((room) => room.start()));
  socket.on('host:spin', hostAction((room) => room.spin()));
  socket.on('host:beginBoard', hostAction((room) => room.beginBoard()));
  socket.on('host:finalShowQuestion', hostAction((room) => room.finalShowQuestion()));
  socket.on('host:finalLock', hostAction((room) => room.finalLock()));
  socket.on('host:finalReveal', hostAction((room) => room.finalReveal()));
  socket.on('host:finalJudge', (req, ack) => hostAction((room) => room.finalJudge(Boolean(req?.correct)))(ack));
  socket.on('host:finalFinish', hostAction((room) => room.finalFinish()));
  socket.on('host:tiebreakerNext', hostAction((room) => room.tiebreakerNext()));
  socket.on('host:openBuzzers', hostAction((room) => room.openBuzzers()));
  socket.on('host:startTimer', hostAction((room) => room.startTimer()));
  socket.on('host:reveal', hostAction((room) => room.revealCurrent()));
  socket.on('host:closeClue', hostAction((room) => room.closeClue()));
  socket.on('host:revealDailyDouble', hostAction((room) => room.revealDailyDouble()));
  socket.on('host:end', hostAction((room) => room.end()));
  socket.on('host:reset', hostAction((room) => room.reset()));

  socket.on('host:selectClue', (req, ack) => hostAction((room) => room.selectClue(String(req?.clueId), { role: 'host' }))(ack));
  socket.on('host:judge', (req, ack) => hostAction((room) => room.judgeCurrent(Boolean(req?.correct)))(ack));
  socket.on('host:adjustScore', (req, ack) =>
    hostAction((room) => room.adjustScore(String(req?.playerId), Number(req?.delta)))(ack),
  );
  socket.on('host:setControl', (req, ack) =>
    hostAction((room) => room.setControl(req?.playerId ? String(req.playerId) : null))(ack),
  );
  socket.on('host:updateSettings', (req, ack) => hostAction((room) => room.updateSettings(req ?? {}))(ack));
  socket.on('host:kick', (req, ack) =>
    hostAction((room) => {
      const player = room.removePlayer(String(req?.playerId));
      const kicked = player.socketId ? io.sockets.sockets.get(player.socketId) : undefined;
      if (kicked) {
        kicked.emit('room:closed', 'The host removed you from the room.');
        kicked.leave(room.code);
        kicked.data = {};
      }
    })(ack),
  );

  socket.on('host:addBots', (req, ack) => hostAction((room) => room.addBots(Number(req?.count) || 3))(ack));
  socket.on('host:removeBots', hostAction((room) => room.removeBots()));

  socket.on('dev:createEndingRoom', (req, ack) =>
    handle(ack, () => {
      if (!DEV_TOOLS) throw new GameError('Developer tools are turned off on this server.');
      const room = new Room(newRoomCode(), cleanName(req?.hostName || 'Host'), contentPool, broadcast);
      rooms.set(room.code, room);
      const session = attach(socket, room, { role: 'host' }, room.hostSessionId);
      room.devJumpToEnding();
      return { room, result: session };
    }),
  );

  // Player actions
  socket.on('player:selectClue', (req, ack) =>
    handle(ack, () => {
      const { room, seat } = seatOf(socket);
      room.selectClue(String(req?.clueId), seat);
      return { room, result: {} };
    }),
  );

  socket.on('player:buzz', (ack) =>
    handle(ack, () => {
      const { room, seat } = seatOf(socket);
      if (seat.role !== 'player') throw new GameError('Only players can buzz.');
      room.buzz(seat.player.id);
      return { room, result: {} };
    }),
  );

  socket.on('player:wager', (req, ack) =>
    handle(ack, () => {
      const { room, seat } = seatOf(socket);
      if (seat.role !== 'player') throw new GameError('Only players can wager.');
      room.wager(seat.player.id, Number(req?.amount));
      return { room, result: {} };
    }),
  );

  socket.on('player:finalAnswer', (req, ack) =>
    handle(ack, () => {
      const { room, seat } = seatOf(socket);
      if (seat.role !== 'player') throw new GameError('Only players can answer.');
      room.finalAnswer(seat.player.id, String(req?.text ?? ''));
      return { room, result: {} };
    }),
  );

  socket.on('disconnect', () => detach(socket));
});

// --- housekeeping ----------------------------------------------------------

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.hasConnectedSockets() && now - room.lastActivity > IDLE_ROOM_MS) {
      room.dispose();
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`Prismatic Showdown server on http://localhost:${PORT}${DEV_TOOLS ? ' (dev tools on)' : ''}`);
});
