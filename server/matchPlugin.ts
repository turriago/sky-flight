import type { IncomingMessage } from "node:http";
import os from "node:os";
import type { Duplex } from "node:stream";
import type { Plugin, ViteDevServer } from "vite";
import { WebSocket, WebSocketServer } from "ws";

type Role = "admin" | "player";
type Phase = "lobby" | "countdown" | "racing" | "finished";

interface Client {
  ws: WebSocket;
  role: Role;
  room: string;
  slot: 0 | 1 | null;
  name: string;
}

interface Room {
  id: string;
  admin: Client | null;
  players: [Client | null, Client | null];
  phase: Phase;
  times: [number | null, number | null];
  countdown: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, Room>();

export function matchPlugin(): Plugin {
  return {
    name: "sky-flight-match",
    configureServer(server) {
      addLanRoute(server.middlewares);
      bindWss(server);
    },
    configurePreviewServer(server) {
      addLanRoute(server.middlewares);
      bindWss(server);
    },
  };
}

function addLanRoute(middlewares: ViteDevServer["middlewares"]): void {
  middlewares.use("/__sky/lan", (_req, res) => {
    const hosts = lanAddresses();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ host: hosts[0] ?? "localhost", hosts }));
  });
}

function bindWss(server: { httpServer?: ViteDevServer["httpServer"] | null }): void {
  const start = (): void => {
    const httpServer = server.httpServer;
    if (!httpServer || attached.has(httpServer)) {
      return;
    }
    attached.add(httpServer);
    listen(httpServer);
  };
  start();
  server.httpServer?.once("listening", start);
}

const attached = new WeakSet<object>();

function listen(httpServer: NonNullable<ViteDevServer["httpServer"]>): void {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = request.url ?? "";
    if (!url.startsWith("/__sky/ws")) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    let client: Client | null = null;

    ws.on("message", (raw) => {
      let msg: { t?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === "hello" && typeof msg.room === "string" && (msg.role === "admin" || msg.role === "player")) {
        client = join(ws, msg.role, String(msg.room).toUpperCase().slice(0, 8), typeof msg.name === "string" ? msg.name : "");
        return;
      }
      if (!client) {
        return;
      }
      if (msg.t === "start" && client.role === "admin") {
        beginMatch(client.room);
        return;
      }
      if (msg.t === "reset" && client.role === "admin") {
        resetMatch(client.room);
        return;
      }
      if (msg.t === "pose" && client.role === "player" && client.slot !== null) {
        relayPose(client, msg);
      }
    });

    ws.on("close", () => {
      if (client) {
        leave(client);
      }
    });
  });
}

function join(ws: WebSocket, role: Role, roomId: string, name: string): Client | null {
  const room = rooms.get(roomId) ?? createRoom(roomId);
  if (role === "admin") {
    if (room.admin && room.admin.ws !== ws) {
      room.admin.ws.close();
    }
    const client: Client = { ws, role, room: roomId, slot: null, name: "Admin" };
    room.admin = client;
    send(ws, { t: "welcome", role: "admin", slot: null, room: roomId, phase: room.phase, players: snapshot(room) });
    broadcastLobby(room);
    return client;
  }

  const slot = room.players[0] ? (room.players[1] ? -1 : 1) : 0;
  if (slot < 0) {
    send(ws, { t: "error", message: "La sala ya tiene dos jugadores." });
    ws.close();
    return null;
  }
  const client: Client = {
    ws,
    role,
    room: roomId,
    slot: slot as 0 | 1,
    name: name || (slot === 0 ? "Naranja" : "Cian"),
  };
  room.players[slot as 0 | 1] = client;
  send(ws, { t: "welcome", role: "player", slot, room: roomId, phase: room.phase, players: snapshot(room) });
  broadcastLobby(room);
  return client;
}

function leave(client: Client): void {
  const room = rooms.get(client.room);
  if (!room) {
    return;
  }
  if (room.admin === client) {
    room.admin = null;
  }
  if (client.slot !== null && room.players[client.slot] === client) {
    room.players[client.slot] = null;
    if (room.phase === "racing" || room.phase === "countdown") {
      room.phase = "lobby";
      stopCountdown(room);
      broadcastLobby(room);
    }
  }
  if (!room.admin && !room.players[0] && !room.players[1]) {
    stopCountdown(room);
    rooms.delete(room.id);
    return;
  }
  broadcastLobby(room);
}

function beginMatch(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.players[0] || !room.players[1] || room.phase === "countdown" || room.phase === "racing") {
    return;
  }
  room.times = [null, null];
  room.phase = "countdown";
  let n = 3;
  broadcast(room, { t: "lobby", phase: "countdown", count: n, players: snapshot(room) });
  stopCountdown(room);
  room.countdown = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      stopCountdown(room);
      room.phase = "racing";
      broadcast(room, { t: "lobby", phase: "racing", players: snapshot(room) });
      return;
    }
    broadcast(room, { t: "lobby", phase: "countdown", count: n, players: snapshot(room) });
  }, 1000);
}

function resetMatch(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  stopCountdown(room);
  room.phase = "lobby";
  room.times = [null, null];
  broadcast(room, { t: "lobby", phase: "lobby", players: snapshot(room) });
}

function relayPose(client: Client, msg: Record<string, unknown>): void {
  const room = rooms.get(client.room);
  if (!room || client.slot === null) {
    return;
  }
  const pose = {
    t: "pose",
    slot: client.slot,
    x: num(msg.x),
    y: num(msg.y),
    z: num(msg.z),
    qx: num(msg.qx),
    qy: num(msg.qy),
    qz: num(msg.qz),
    qw: num(msg.qw),
    spd: num(msg.spd),
    rings: num(msg.rings),
    time: num(msg.time),
    done: msg.done ? 1 : 0,
  };
  for (const other of clientsOf(room)) {
    if (other !== client) {
      send(other.ws, pose);
    }
  }
  if (pose.done && room.times[client.slot] === null && room.phase === "racing") {
    room.times[client.slot] = pose.time;
    room.phase = "finished";
    broadcast(room, { t: "over", winner: client.slot, times: room.times });
  }
}

function createRoom(id: string): Room {
  const room: Room = {
    id,
    admin: null,
    players: [null, null],
    phase: "lobby",
    times: [null, null],
    countdown: null,
  };
  rooms.set(id, room);
  return room;
}

function snapshot(room: Room) {
  return [0, 1].map((slot) => ({
    slot,
    name: slot === 0 ? "Naranja" : "Cian",
    connected: Boolean(room.players[slot as 0 | 1]),
  }));
}

function broadcastLobby(room: Room): void {
  broadcast(room, { t: "lobby", phase: room.phase, players: snapshot(room) });
}

function broadcast(room: Room, payload: unknown): void {
  for (const client of clientsOf(room)) {
    send(client.ws, payload);
  }
}

function clientsOf(room: Room): Client[] {
  return [room.admin, room.players[0], room.players[1]].filter((client): client is Client => Boolean(client));
}

function stopCountdown(room: Room): void {
  if (room.countdown) {
    clearInterval(room.countdown);
    room.countdown = null;
  }
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function lanAddresses(): string[] {
  const skipName = /virtual|vethernet|wsl|hyper-v|docker|vbox|vmware|loopback|bluetooth|pseudo|vpn/i;
  const scored: { ip: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    const virtual = skipName.test(name);
    for (const addr of addrs ?? []) {
      if (addr.internal) {
        continue;
      }
      if (!(addr.family === "IPv4" || addr.family === 4)) {
        continue;
      }
      const ip = addr.address;
      let score = 0;
      if (ip.startsWith("192.168.")) {
        score = 40;
      } else if (ip.startsWith("10.")) {
        score = 25;
      } else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
        score = 12;
      } else {
        continue;
      }
      if (virtual) {
        score -= 20;
      }
      scored.push({ ip, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((item) => item.ip))];
}
