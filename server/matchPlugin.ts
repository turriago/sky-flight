import type { IncomingMessage } from "node:http";
import os from "node:os";
import type { Duplex } from "node:stream";
import type { Plugin, ViteDevServer } from "vite";
import { WebSocket, WebSocketServer } from "ws";
import { getHttpsPublicUrl, startHttpsTunnel, stopHttpsTunnel } from "./httpsTunnel";

type Role = "admin" | "player";
type Phase = "lobby" | "countdown" | "racing" | "finished";
type Mode = "race" | "hunt";

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
  mode: Mode;
  fleeSlot: 0 | 1;
  hp: [number, number];
  hitAt: [number, number];
  times: [number | null, number | null];
  countdown: ReturnType<typeof setInterval> | null;
  autoStart: ReturnType<typeof setTimeout> | null;
  crates: { id: number; kind: string; x: number; y: number; z: number }[];
  nextCrateId: number;
  held: [string | null, string | null];
  holdAt: [number, number];
  crateTimer: ReturnType<typeof setInterval> | null;
  lastHunt: [{ x: number; y: number; z: number } | null, { x: number; y: number; z: number } | null];
}

const rooms = new Map<string, Room>();

export function matchPlugin(): Plugin {
  return {
    name: "sky-flight-match",
    configureServer(server) {
      addLanRoute(server.middlewares);
      bindWss(server);
      bindTunnel(server);
    },
    configurePreviewServer(server) {
      addLanRoute(server.middlewares);
      bindWss(server);
      bindTunnel(server);
    },
  };
}

function addLanRoute(middlewares: ViteDevServer["middlewares"]): void {
  middlewares.use((req, _res, next) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (/^\/j\/[A-Za-z0-9]+\/?$/.test(path)) {
      req.url = "/index.html";
    }
    next();
  });
  middlewares.use("/__sky/lan", (_req, res) => {
    const hosts = lanAddresses();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      host: hosts[0] ?? "localhost",
      hosts,
      port: 5173,
      publicUrl: getHttpsPublicUrl(),
    }));
  });
}

function bindTunnel(server: { httpServer?: ViteDevServer["httpServer"] | null }): void {
  const start = (): void => {
    const httpServer = server.httpServer;
    if (!httpServer) {
      return;
    }
    const addr = httpServer.address();
    const port = typeof addr === "object" && addr ? addr.port : 5173;
    startHttpsTunnel(port);
  };
  if (server.httpServer?.listening) {
    start();
  } else {
    server.httpServer?.once("listening", start);
  }
  server.httpServer?.once("close", () => stopHttpsTunnel());
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
      if (msg.t === "mode" && client.role === "admin") {
        setRoomMode(client.room, msg.mode === "hunt" ? "hunt" : "race");
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
      if (msg.t === "pilot" && client.role === "admin") {
        sitAdmin(client);
        return;
      }
      if (msg.t === "shot" && client.slot !== null) {
        relayShot(client, msg);
        return;
      }
      if (msg.t === "hit" && client.slot !== null) {
        applyHuntHit(client.room, client.slot, msg.target === 1 ? 1 : 0, msg.kind === "catch" ? "catch" : "shot");
        return;
      }
      if (msg.t === "grab" && client.slot !== null) {
        grabCrate(client.room, client.slot, num(msg.id));
        return;
      }
      if (msg.t === "use" && client.slot !== null) {
        useHeld(client.room, client.slot);
        return;
      }
      if (msg.t === "pose" && client.slot !== null) {
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
    send(ws, { t: "welcome", role: "admin", slot: null, room: roomId, phase: room.phase, players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
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
  send(ws, { t: "welcome", role: "player", slot, room: roomId, phase: room.phase, players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
  broadcastLobby(room);
  queueAutoStart(room);
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
  clearAutoStart(room);
  if (!room.admin && !room.players[0] && !room.players[1]) {
    stopCountdown(room);
    rooms.delete(room.id);
    return;
  }
  broadcastLobby(room);
}

function beginMatch(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room || (!room.players[0] && !room.players[1]) || room.phase === "countdown" || room.phase === "racing") {
    return;
  }
  clearAutoStart(room);
  room.times = [null, null];
  room.hp = room.fleeSlot === 0 ? [3, 2] : [2, 3];
  room.hitAt = [0, 0];
  room.phase = "countdown";
  let n = 3;
  broadcast(room, { t: "lobby", phase: "countdown", count: n, players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
  stopCountdown(room);
  room.countdown = setInterval(() => {
    n -= 1;
    if (n <= 0) {
      stopCountdown(room);
      room.phase = "racing";
      broadcast(room, { t: "lobby", phase: "racing", players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
      startCrates(room);
      return;
    }
    broadcast(room, { t: "lobby", phase: "countdown", count: n, players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
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
  if (room.mode === "hunt") {
    room.fleeSlot = room.fleeSlot === 0 ? 1 : 0;
  }
  room.hp = room.fleeSlot === 0 ? [3, 2] : [2, 3];
  clearCrates(room);
  broadcast(room, { t: "lobby", phase: "lobby", players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
  queueAutoStart(room);
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
    hp: room.hp[client.slot],
  };
  room.lastHunt[client.slot] = { x: pose.x, y: pose.y, z: pose.z };
  maybeAutoUse(room);
  if (room.mode === "hunt" && room.phase === "racing" && room.crates.length === 0) {
    spawnCrate(room);
  }
  for (const other of clientsOf(room)) {
    if (other !== client) {
      send(other.ws, pose);
    }
  }
  if (room.phase !== "racing") {
    return;
  }
  if (room.mode === "race" && pose.done && room.times[client.slot] === null) {
    room.times[client.slot] = pose.time;
    room.phase = "finished";
    clearCrates(room);
    broadcast(room, { t: "over", winner: client.slot, times: room.times, reason: "rings" });
    return;
  }
  if (room.mode === "hunt" && client.slot === room.fleeSlot) {
    if (pose.done && room.times[client.slot] === null) {
      room.times[client.slot] = pose.time;
      room.phase = "finished";
      clearCrates(room);
      broadcast(room, { t: "over", winner: client.slot, times: room.times, reason: "rings" });
      return;
    }
    if (pose.time >= 150) {
      room.phase = "finished";
      clearCrates(room);
      broadcast(room, { t: "over", winner: room.fleeSlot, times: room.times, reason: "timeout" });
    }
  }
}

function startCrates(room: Room): void {
  clearCrates(room);
  if (room.mode !== "hunt") {
    return;
  }
  spawnCrate(room);
  room.crateTimer = setInterval(() => spawnCrate(room), 8000);
}

function spawnCrate(room: Room): void {
  if (room.phase !== "racing" || room.mode !== "hunt" || room.crates.length >= 2) {
    return;
  }
  const prey = room.lastHunt[room.fleeSlot];
  const hunter = room.lastHunt[room.fleeSlot === 0 ? 1 : 0];
  const anchor = hunter ?? prey;
  if (!anchor) {
    return;
  }
  const hurt = room.hp[room.fleeSlot] < 3;
  const roll = Math.random();
  const kind = hurt
    ? (roll < 0.45 ? "wind" : roll < 0.78 ? "ammo" : "turbo")
    : (roll < 0.4 ? "turbo" : roll < 0.72 ? "ammo" : "wind");
  const angle = Math.random() * Math.PI * 2;
  room.crates.push({
    id: room.nextCrateId,
    kind,
    x: anchor.x + Math.cos(angle) * 14,
    y: anchor.y + 1.6,
    z: anchor.z + Math.sin(angle) * 14,
  });
  room.nextCrateId += 1;
  broadcast(room, { t: "crates", crates: room.crates });
}

function grabCrate(roomId: string, slot: 0 | 1, id: number): void {
  const room = rooms.get(roomId);
  if (!room || room.phase !== "racing" || room.mode !== "hunt" || room.held[slot]) {
    return;
  }
  const index = room.crates.findIndex((crate) => crate.id === id);
  if (index < 0) {
    return;
  }
  const crate = room.crates[index];
  room.crates.splice(index, 1);
  room.held[slot] = crate.kind;
  room.holdAt[slot] = Date.now();
  broadcast(room, { t: "crates", crates: room.crates });
  broadcast(room, { t: "held", slot, kind: crate.kind });
}

function useHeld(roomId: string, slot: 0 | 1): void {
  const room = rooms.get(roomId);
  if (room) {
    applyUse(room, slot);
  }
}

function maybeAutoUse(room: Room): void {
  const now = Date.now();
  for (const slot of [0, 1] as const) {
    if (room.held[slot] && now - room.holdAt[slot] >= 12000) {
      applyUse(room, slot);
    }
  }
}

function applyUse(room: Room, slot: 0 | 1): void {
  const kind = room.held[slot];
  if (!kind || room.phase !== "racing") {
    return;
  }
  room.held[slot] = null;
  room.holdAt[slot] = 0;
  broadcast(room, { t: "held", slot, kind: null });
  const other: 0 | 1 = slot === 0 ? 1 : 0;
  const target = kind === "wind" || kind === "ammo" ? other : slot;
  broadcast(room, { t: "fx", kind, by: slot, target });
}

function clearCrates(room: Room): void {
  if (room.crateTimer) {
    clearInterval(room.crateTimer);
    room.crateTimer = null;
  }
  room.crates = [];
  room.held = [null, null];
  room.holdAt = [0, 0];
  room.nextCrateId = 1;
  broadcast(room, { t: "crates", crates: [] });
  broadcast(room, { t: "held", slot: 0, kind: null });
  broadcast(room, { t: "held", slot: 1, kind: null });
}

function setRoomMode(roomId: string, mode: Mode): void {
  const room = rooms.get(roomId);
  if (!room || room.phase !== "lobby") {
    return;
  }
  room.mode = mode;
  broadcastLobby(room);
}

function relayShot(client: Client, msg: Record<string, unknown>): void {
  const room = rooms.get(client.room);
  if (!room || client.slot === null || room.phase !== "racing") {
    return;
  }
  const shot = {
    t: "shot",
    slot: client.slot,
    x: num(msg.x),
    y: num(msg.y),
    z: num(msg.z),
    dx: num(msg.dx),
    dy: num(msg.dy),
    dz: num(msg.dz),
  };
  for (const other of clientsOf(room)) {
    if (other !== client) {
      send(other.ws, shot);
    }
  }
}

function applyHuntHit(roomId: string, by: 0 | 1, target: 0 | 1, kind: "shot" | "catch"): void {
  const room = rooms.get(roomId);
  if (!room || room.mode !== "hunt" || room.phase !== "racing") {
    return;
  }
  if (by === target || room.hp[target] <= 0) {
    return;
  }
  if (kind === "catch" && (by === room.fleeSlot || target !== room.fleeSlot)) {
    return;
  }
  const now = Date.now();
  if (now - room.hitAt[target] < 750) {
    return;
  }
  room.hitAt[target] = now;
  room.hp[target] = Math.max(0, room.hp[target] - 1);
  broadcast(room, { t: "hit", target, hp: room.hp[target], by, kind });
  if (room.hp[target] <= 0) {
    const winner: 0 | 1 = target === room.fleeSlot ? (room.fleeSlot === 0 ? 1 : 0) : room.fleeSlot;
    room.phase = "finished";
    clearCrates(room);
    broadcast(room, { t: "over", winner, times: room.times, reason: kind === "catch" ? "catch" : "ko" });
  }
}

function createRoom(id: string): Room {
  const room: Room = {
    id,
    admin: null,
    players: [null, null],
    phase: "lobby",
    mode: "race",
    fleeSlot: 0,
    hp: [3, 2],
    hitAt: [0, 0],
    times: [null, null],
    countdown: null,
    autoStart: null,
    crates: [],
    nextCrateId: 1,
    held: [null, null],
    holdAt: [0, 0],
    crateTimer: null,
    lastHunt: [null, null],
  };
  rooms.set(id, room);
  return room;
}

function snapshot(room: Room) {
  return [0, 1].map((slot) => ({
    slot,
    name: slot === 0 ? "Naranja" : "Cian",
    connected: Boolean(room.players[slot as 0 | 1]),
    huntRole: slot === room.fleeSlot ? "flee" : "chase",
  }));
}

function broadcastLobby(room: Room): void {
  broadcast(room, { t: "lobby", phase: room.phase, players: snapshot(room), mode: room.mode, fleeSlot: room.fleeSlot });
}

function broadcast(room: Room, payload: unknown): void {
  for (const client of clientsOf(room)) {
    send(client.ws, payload);
  }
}

function sitAdmin(client: Client): void {
  const room = rooms.get(client.room);
  if (!room) {
    return;
  }
  if (client.slot !== null && room.players[client.slot] === client) {
    send(client.ws, { t: "seated", slot: client.slot });
    return;
  }
  const slot = room.players[0] ? (room.players[1] ? -1 : 1) : 0;
  if (slot < 0) {
    send(client.ws, { t: "error", message: "La sala ya tiene dos jugadores." });
    return;
  }
  client.slot = slot as 0 | 1;
  room.players[client.slot] = client;
  send(client.ws, { t: "seated", slot: client.slot });
  broadcastLobby(room);
  queueAutoStart(room);
}

function clientsOf(room: Room): Client[] {
  const list: Client[] = [];
  for (const client of [room.admin, room.players[0], room.players[1]]) {
    if (client && !list.includes(client)) {
      list.push(client);
    }
  }
  return list;
}

function stopCountdown(room: Room): void {
  if (room.countdown) {
    clearInterval(room.countdown);
    room.countdown = null;
  }
}

function queueAutoStart(room: Room): void {
  clearAutoStart(room);
  const joined = (room.players[0] ? 1 : 0) + (room.players[1] ? 1 : 0);
  if (joined < 1 || room.phase !== "lobby") {
    return;
  }
  room.autoStart = setTimeout(() => beginMatch(room.id), joined >= 2 ? 3500 : 6000);
}

function clearAutoStart(room: Room): void {
  if (room.autoStart) {
    clearTimeout(room.autoStart);
    room.autoStart = null;
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
