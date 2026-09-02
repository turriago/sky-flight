import { Peer, type DataConnection } from "peerjs";
import { DuelHost, peerRoomId, type DuelSend } from "./DuelHost";
import type { DuelMessage, DuelPhase, DuelPlayerInfo, DuelPose, DuelRole } from "./protocol";

type Handler = (message: DuelMessage) => void;

export class MatchClient {
  phase: DuelPhase = "lobby";
  slot: 0 | 1 | null = null;
  role: DuelRole | null = null;
  room = "";
  players: DuelPlayerInfo[] = [];
  lastPose: [DuelPose | null, DuelPose | null] = [null, null];
  winner: 0 | 1 | null = null;
  times: [number | null, number | null] = [null, null];
  countdown = 0;
  error = "";
  connected = false;

  private socket: WebSocket | null = null;
  private peer: Peer | null = null;
  private peerConn: DataConnection | null = null;
  private host: DuelHost | null = null;
  private readonly handlers = new Set<Handler>();
  private sendPoseAcc = 0;
  private usingPeer = false;

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(role: DuelRole, room: string, name?: string): void {
    this.close();
    this.role = role;
    this.room = room.toUpperCase();
    this.error = "";
    this.usingPeer = import.meta.env.PROD;
    if (this.usingPeer) {
      this.connectPeer(role, name);
      return;
    }
    this.connectSocket(role, name);
  }

  startMatch(): void {
    if (this.host) {
      this.host.start();
      return;
    }
    this.send({ t: "start" });
  }

  resetMatch(): void {
    if (this.host) {
      this.host.reset();
      return;
    }
    this.send({ t: "reset" });
  }

  sendPose(dt: number, pose: Omit<DuelPose, "t">): void {
    this.sendPoseAcc += dt;
    if (this.sendPoseAcc < 0.05) {
      return;
    }
    this.sendPoseAcc = 0;
    this.send({ t: "pose", ...pose });
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
    this.peerConn?.close();
    this.peerConn = null;
    this.host?.dispose();
    this.host = null;
    this.peer?.destroy();
    this.peer = null;
    this.connected = false;
    this.usingPeer = false;
  }

  private connectSocket(role: DuelRole, name?: string): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/__sky/ws`);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.connected = true;
      this.send({ t: "hello", role, room: this.room, name });
    });
    socket.addEventListener("message", (event) => {
      this.parseIncoming(event.data);
    });
    socket.addEventListener("close", () => {
      this.connected = false;
      if (!this.error) {
        this.error = "Conexión perdida. Misma Wi‑Fi y recarga.";
      }
      this.emit({ t: "error", message: this.error });
    });
    socket.addEventListener("error", () => {
      this.error = "No se pudo abrir la sala. Usa la IP de la red, no localhost.";
    });
  }

  private connectPeer(role: DuelRole, name?: string): void {
    const iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ];
    if (role === "admin") {
      const peer = new Peer(peerRoomId(this.room), { config: { iceServers } });
      this.peer = peer;
      this.host = new DuelHost(this.room, (message) => this.handle(message));
      peer.on("open", () => {
        this.connected = true;
        this.handle(this.host!.welcomeAdmin());
      });
      peer.on("connection", (conn) => this.bindHostConnection(conn));
      peer.on("error", (err) => {
        this.error = err.type === "unavailable-id"
          ? "Esa sala quedó ocupada. Recarga e inicia otra."
          : "No se pudo abrir la sala en internet. Recarga.";
        this.emit({ t: "error", message: this.error });
      });
      return;
    }

    const peer = new Peer({ config: { iceServers } });
    this.peer = peer;
    peer.on("open", () => {
      const conn = peer.connect(peerRoomId(this.room), { reliable: true });
      this.peerConn = conn;
      conn.on("open", () => {
        this.connected = true;
        this.send({ t: "hello", role: "player", room: this.room, name });
      });
      conn.on("data", (data) => this.parseIncoming(data));
      conn.on("close", () => {
        this.connected = false;
        if (!this.error) {
          this.error = "El admin se desconectó. Escanea el QR otra vez.";
        }
        this.emit({ t: "error", message: this.error });
      });
      conn.on("error", () => {
        this.error = "No se pudo unir. El admin debe tener la sala abierta.";
        this.emit({ t: "error", message: this.error });
      });
    });
    peer.on("error", (err) => {
      this.error = err.type === "peer-unavailable"
        ? "No hay admin en esa sala. Abre 1 vs 1 en el PC primero."
        : "No se pudo unir a la sala. Recarga e intenta de nuevo.";
      this.emit({ t: "error", message: this.error });
    });
  }

  private bindHostConnection(conn: DataConnection): void {
    const send: DuelSend = (message) => {
      if (conn.open) {
        conn.send(JSON.stringify(message));
      }
    };
    conn.on("data", (data) => {
      const message = decodeMessage(data);
      if (message && this.host) {
        this.host.incoming(send, message);
      }
    });
    conn.on("close", () => this.host?.leave(send));
    conn.on("error", () => this.host?.leave(send));
  }

  private handle(message: DuelMessage): void {
    if (message.t === "welcome") {
      this.role = message.role;
      this.slot = message.slot;
      this.room = message.room;
      this.phase = message.phase;
      this.players = message.players;
      this.error = "";
    } else if (message.t === "lobby") {
      this.phase = message.phase;
      this.players = message.players;
      this.countdown = message.count ?? 0;
      if (message.phase === "lobby") {
        this.winner = null;
        this.times = [null, null];
        this.lastPose = [null, null];
      }
    } else if (message.t === "pose") {
      this.lastPose[message.slot] = message;
    } else if (message.t === "over") {
      this.phase = "finished";
      this.winner = message.winner;
      this.times = message.times;
    } else if (message.t === "error") {
      this.error = message.message;
    }
    this.emit(message);
  }

  private emit(message: DuelMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  private send(message: DuelMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    if (this.peerConn?.open) {
      this.peerConn.send(JSON.stringify(message));
    }
  }

  private parseIncoming(raw: unknown): void {
    const message = decodeMessage(raw);
    if (message) {
      this.handle(message);
    }
  }
}

function decodeMessage(raw: unknown): DuelMessage | null {
  try {
    if (typeof raw === "string") {
      return JSON.parse(raw) as DuelMessage;
    }
    if (raw && typeof raw === "object" && "t" in raw) {
      return raw as DuelMessage;
    }
  } catch {
    return null;
  }
  return null;
}
