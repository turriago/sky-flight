import type { DuelMessage, DuelPhase, DuelPlayerInfo, DuelPose } from "./protocol";

export type DuelSend = (message: DuelMessage) => void;

interface Seat {
  send: DuelSend;
  name: string;
}

export class DuelHost {
  phase: DuelPhase = "lobby";
  private readonly seats: [Seat | null, Seat | null] = [null, null];
  private times: [number | null, number | null] = [null, null];
  private timer: ReturnType<typeof setInterval> | null = null;
  private autoStart: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly room: string,
    private readonly emitLocal: (message: DuelMessage) => void,
  ) {}

  snapshot(): DuelPlayerInfo[] {
    return [0, 1].map((slot) => ({
      slot: slot as 0 | 1,
      name: slot === 0 ? "Naranja" : "Cian",
      connected: Boolean(this.seats[slot as 0 | 1]),
    }));
  }

  welcomeAdmin(): DuelMessage {
    return {
      t: "welcome",
      role: "admin",
      slot: null,
      room: this.room,
      phase: this.phase,
      players: this.snapshot(),
    };
  }

  join(send: DuelSend, name: string): void {
    const slot: 0 | 1 | null = !this.seats[0] ? 0 : !this.seats[1] ? 1 : null;
    if (slot === null) {
      send({ t: "error", message: "La sala ya tiene dos jugadores." });
      return;
    }
    this.seats[slot] = {
      send,
      name: name || (slot === 0 ? "Naranja" : "Cian"),
    };
    send({
      t: "welcome",
      role: "player",
      slot,
      room: this.room,
      phase: this.phase,
      players: this.snapshot(),
    });
    this.broadcastLobby();
    this.queueAutoStart();
  }

  leave(send: DuelSend): void {
    this.clearAutoStart();
    for (let i = 0; i < 2; i++) {
      if (this.seats[i]?.send === send) {
        this.seats[i] = null;
        if (this.phase === "racing" || this.phase === "countdown") {
          this.phase = "lobby";
          this.stop();
        }
      }
    }
    this.broadcastLobby();
  }

  start(): void {
    this.clearAutoStart();
    if (!this.seats[0] || !this.seats[1] || this.phase === "countdown" || this.phase === "racing") {
      return;
    }
    this.times = [null, null];
    this.phase = "countdown";
    let n = 3;
    this.broadcast({ t: "lobby", phase: "countdown", count: n, players: this.snapshot() });
    this.stop();
    this.timer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        this.stop();
        this.phase = "racing";
        this.broadcast({ t: "lobby", phase: "racing", players: this.snapshot() });
        return;
      }
      this.broadcast({ t: "lobby", phase: "countdown", count: n, players: this.snapshot() });
    }, 1000);
  }

  reset(): void {
    this.stop();
    this.clearAutoStart();
    this.phase = "lobby";
    this.times = [null, null];
    this.broadcast({ t: "lobby", phase: "lobby", players: this.snapshot() });
    this.queueAutoStart();
  }

  incoming(from: DuelSend, message: DuelMessage): void {
    if (message.t === "hello") {
      this.join(from, message.name ?? "");
      return;
    }
    if (message.t === "pose") {
      this.relayPose(from, message);
    }
  }

  dispose(): void {
    this.stop();
    this.clearAutoStart();
    this.seats[0] = null;
    this.seats[1] = null;
  }

  private relayPose(from: DuelSend, message: DuelPose): void {
    const slot = this.seats[0]?.send === from ? 0 : this.seats[1]?.send === from ? 1 : null;
    if (slot === null) {
      return;
    }
    const pose: DuelPose = { ...message, slot };
    this.emitLocal(pose);
    for (const seat of this.seats) {
      if (seat && seat.send !== from) {
        seat.send(pose);
      }
    }
    if (pose.done && this.times[slot] === null && this.phase === "racing") {
      this.times[slot] = pose.time;
      this.phase = "finished";
      this.broadcast({ t: "over", winner: slot, times: this.times });
    }
  }

  private queueAutoStart(): void {
    this.clearAutoStart();
    if (!this.seats[0] || !this.seats[1] || this.phase !== "lobby") {
      return;
    }
    this.autoStart = setTimeout(() => this.start(), 3500);
  }

  private clearAutoStart(): void {
    if (this.autoStart) {
      clearTimeout(this.autoStart);
      this.autoStart = null;
    }
  }

  private broadcast(message: DuelMessage): void {
    this.emitLocal(message);
    for (const seat of this.seats) {
      seat?.send(message);
    }
  }

  private broadcastLobby(): void {
    this.broadcast({ t: "lobby", phase: this.phase, players: this.snapshot() });
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export function peerRoomId(room: string): string {
  return `skyflight${room.toUpperCase()}`;
}
