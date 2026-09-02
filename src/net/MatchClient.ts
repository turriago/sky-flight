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
  private readonly handlers = new Set<Handler>();
  private sendPoseAcc = 0;

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(role: DuelRole, room: string, name?: string): void {
    this.close();
    this.role = role;
    this.room = room.toUpperCase();
    this.error = "";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/__sky/ws`);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.connected = true;
      this.send({ t: "hello", role, room: this.room, name });
    });
    socket.addEventListener("message", (event) => {
      try {
        this.handle(JSON.parse(String(event.data)) as DuelMessage);
      } catch {
        // ignore malformed packets
      }
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

  startMatch(): void {
    this.send({ t: "start" });
  }

  resetMatch(): void {
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
    this.connected = false;
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
    }
  }
}
