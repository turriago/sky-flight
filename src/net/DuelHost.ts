import { HUNT } from "../utils/Constants";
import type { DuelMessage, DuelMode, DuelPhase, DuelPlayerInfo, DuelPose, HuntCrate, HuntEnd, HuntItemKind } from "./protocol";
import { crateBeside, huntStartHp, pickHuntKind } from "./protocol";

export type DuelSend = (message: DuelMessage) => void;

interface Seat {
  send: DuelSend;
  name: string;
}

export class DuelHost {
  phase: DuelPhase = "lobby";
  mode: DuelMode = "race";
  fleeSlot: 0 | 1 = 0;
  hp: [number, number] = [3, 2];
  private readonly seats: [Seat | null, Seat | null] = [null, null];
  private times: [number | null, number | null] = [null, null];
  private timer: ReturnType<typeof setInterval> | null = null;
  private autoStart: ReturnType<typeof setTimeout> | null = null;
  private crateTimer: ReturnType<typeof setInterval> | null = null;
  private hitAt = [0, 0];
  private crates: HuntCrate[] = [];
  private nextCrateId = 1;
  private held: [HuntItemKind | null, HuntItemKind | null] = [null, null];
  private holdAt = [0, 0];
  private poses: [DuelPose | null, DuelPose | null] = [null, null];

  constructor(
    private readonly room: string,
    private readonly emitLocal: (message: DuelMessage) => void,
  ) {}

  snapshot(): DuelPlayerInfo[] {
    return [0, 1].map((slot) => ({
      slot: slot as 0 | 1,
      name: slot === 0 ? "Naranja" : "Cian",
      connected: Boolean(this.seats[slot as 0 | 1]),
      huntRole: slot === this.fleeSlot ? "flee" : "chase",
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
      mode: this.mode,
      fleeSlot: this.fleeSlot,
    };
  }

  setMode(mode: DuelMode): void {
    if (this.phase !== "lobby") {
      return;
    }
    this.mode = mode;
    this.broadcastLobby();
  }

  pilot(send: DuelSend): 0 | 1 | null {
    if (this.seats[0]?.send === send) {
      return 0;
    }
    if (this.seats[1]?.send === send) {
      return 1;
    }
    const slot: 0 | 1 | null = !this.seats[0] ? 0 : !this.seats[1] ? 1 : null;
    if (slot === null) {
      send({ t: "error", message: "La sala ya tiene dos jugadores." });
      return null;
    }
    this.seats[slot] = { send, name: "PC" };
    send({ t: "seated", slot });
    this.broadcastLobby();
    this.queueAutoStart();
    return slot;
  }

  join(send: DuelSend, name: string): void {
    if (this.seats[0]?.send === send || this.seats[1]?.send === send) {
      return;
    }
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
      mode: this.mode,
      fleeSlot: this.fleeSlot,
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
    if (this.playerCount() < 1 || this.phase === "countdown" || this.phase === "racing") {
      return;
    }
    this.times = [null, null];
    this.hp = huntStartHp(this.fleeSlot);
    this.hitAt = [0, 0];
    this.phase = "countdown";
    let n = 3;
    this.broadcast({ t: "lobby", phase: "countdown", count: n, players: this.snapshot(), mode: this.mode, fleeSlot: this.fleeSlot });
    this.stop();
    this.timer = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        this.stop();
        this.phase = "racing";
        this.broadcast({ t: "lobby", phase: "racing", players: this.snapshot(), mode: this.mode, fleeSlot: this.fleeSlot });
        this.startCrates();
        return;
      }
      this.broadcast({ t: "lobby", phase: "countdown", count: n, players: this.snapshot(), mode: this.mode, fleeSlot: this.fleeSlot });
    }, 1000);
  }

  reset(): void {
    this.stop();
    this.clearAutoStart();
    this.phase = "lobby";
    this.times = [null, null];
    if (this.mode === "hunt") {
      this.fleeSlot = this.fleeSlot === 0 ? 1 : 0;
    }
    this.hp = huntStartHp(this.fleeSlot);
    this.clearCrates();
    this.broadcast({ t: "lobby", phase: "lobby", players: this.snapshot(), mode: this.mode, fleeSlot: this.fleeSlot });
    this.queueAutoStart();
  }

  incoming(from: DuelSend, message: DuelMessage): void {
    if (message.t === "hello") {
      this.join(from, message.name ?? "");
      return;
    }
    if (message.t === "pose") {
      this.relayPose(from, message);
      return;
    }
    if (message.t === "shot") {
      this.relayShot(from, message);
      return;
    }
    if (message.t === "hit") {
      this.applyHit(from, message.target, message.kind === "catch" ? "catch" : "shot");
      return;
    }
    if (message.t === "grab") {
      this.grabCrate(from, message.id);
      return;
    }
    if (message.t === "use") {
      this.useHeld(from);
    }
  }

  dispose(): void {
    this.stop();
    this.clearAutoStart();
    this.clearCrates();
    this.seats[0] = null;
    this.seats[1] = null;
  }

  private relayShot(from: DuelSend, message: Extract<DuelMessage, { t: "shot" }>): void {
    const slot = this.slotOf(from);
    if (slot === null || this.phase !== "racing") {
      return;
    }
    const shot = { ...message, slot };
    this.emitLocal(shot);
    for (const seat of this.seats) {
      if (seat && seat.send !== from) {
        seat.send(shot);
      }
    }
  }

  private applyHit(from: DuelSend, target: 0 | 1, kind: "shot" | "catch"): void {
    const by = this.slotOf(from);
    if (by === null || this.mode !== "hunt" || this.phase !== "racing") {
      return;
    }
    if (target !== 0 && target !== 1) {
      return;
    }
    if (by === target || this.hp[target] <= 0) {
      return;
    }
    if (kind === "catch" && (by === this.fleeSlot || target !== this.fleeSlot)) {
      return;
    }
    const now = Date.now();
    if (now - this.hitAt[target] < HUNT.HIT_LOCK * 1000) {
      return;
    }
    this.hitAt[target] = now;
    this.hp[target] = Math.max(0, this.hp[target] - 1);
    this.broadcast({ t: "hit", target, hp: this.hp[target], by, kind });
    if (this.hp[target] <= 0) {
      const winner: 0 | 1 = target === this.fleeSlot ? (this.fleeSlot === 0 ? 1 : 0) : this.fleeSlot;
      this.finish(winner, kind === "catch" ? "catch" : "ko");
    }
  }

  private relayPose(from: DuelSend, message: DuelPose): void {
    const slot = this.slotOf(from);
    if (slot === null) {
      return;
    }
    const pose: DuelPose = { ...message, slot, hp: this.hp[slot] };
    this.poses[slot] = pose;
    this.maybeAutoUse();
    if (this.mode === "hunt" && this.phase === "racing" && this.crates.length === 0) {
      this.spawnCrate();
    }
    this.emitLocal(pose);
    for (const seat of this.seats) {
      if (seat && seat.send !== from) {
        seat.send(pose);
      }
    }
    if (this.phase !== "racing") {
      return;
    }
    if (this.mode === "race" && pose.done && this.times[slot] === null) {
      this.times[slot] = pose.time;
      this.finish(slot, "rings");
      return;
    }
    if (this.mode === "hunt" && slot === this.fleeSlot) {
      if (pose.done && this.times[slot] === null) {
        this.times[slot] = pose.time;
        this.finish(slot, "rings");
        return;
      }
      if (pose.time >= HUNT.MATCH_TIME) {
        this.finish(this.fleeSlot, "timeout");
      }
    }
  }

  private finish(winner: 0 | 1 | null, reason: HuntEnd): void {
    this.phase = "finished";
    this.clearCrates();
    this.broadcast({ t: "over", winner, times: this.times, reason });
  }

  private startCrates(): void {
    this.clearCrates();
    if (this.mode !== "hunt") {
      return;
    }
    this.spawnCrate();
    this.crateTimer = setInterval(() => this.spawnCrate(), HUNT.ITEM_SPAWN * 1000);
  }

  private spawnCrate(): void {
    if (this.phase !== "racing" || this.mode !== "hunt" || this.crates.length >= 2) {
      return;
    }
    const prey = this.poses[this.fleeSlot];
    const hunter = this.poses[this.fleeSlot === 0 ? 1 : 0];
    const anchor = hunter ?? prey;
    if (!anchor) {
      return;
    }
    const preyHurt = this.hp[this.fleeSlot] < 3;
    const crate = crateBeside(this.nextCrateId, pickHuntKind(preyHurt), anchor.x, anchor.y, anchor.z);
    this.nextCrateId += 1;
    this.crates.push(crate);
    this.broadcast({ t: "crates", crates: this.crates });
  }

  private grabCrate(from: DuelSend, id: number): void {
    const slot = this.slotOf(from);
    if (slot === null || this.phase !== "racing" || this.mode !== "hunt" || this.held[slot]) {
      return;
    }
    const index = this.crates.findIndex((crate) => crate.id === id);
    if (index < 0) {
      return;
    }
    const crate = this.crates[index];
    this.crates.splice(index, 1);
    this.held[slot] = crate.kind;
    this.holdAt[slot] = Date.now();
    this.broadcast({ t: "crates", crates: this.crates });
    this.broadcast({ t: "held", slot, kind: crate.kind });
  }

  private useHeld(from: DuelSend): void {
    const slot = this.slotOf(from);
    if (slot === null) {
      return;
    }
    this.applyUse(slot);
  }

  private maybeAutoUse(): void {
    const now = Date.now();
    for (const slot of [0, 1] as const) {
      if (this.held[slot] && now - this.holdAt[slot] >= HUNT.ITEM_HOLD * 1000) {
        this.applyUse(slot);
      }
    }
  }

  private applyUse(slot: 0 | 1): void {
    const kind = this.held[slot];
    if (!kind || this.phase !== "racing") {
      return;
    }
    this.held[slot] = null;
    this.holdAt[slot] = 0;
    this.broadcast({ t: "held", slot, kind: null });
    const other: 0 | 1 = slot === 0 ? 1 : 0;
    const target = kind === "wind" || kind === "ammo" ? other : slot;
    this.broadcast({ t: "fx", kind, by: slot, target });
  }

  private clearCrates(): void {
    if (this.crateTimer) {
      clearInterval(this.crateTimer);
      this.crateTimer = null;
    }
    this.crates = [];
    this.held = [null, null];
    this.holdAt = [0, 0];
    this.nextCrateId = 1;
    this.broadcast({ t: "crates", crates: [] });
    this.broadcast({ t: "held", slot: 0, kind: null });
    this.broadcast({ t: "held", slot: 1, kind: null });
  }

  private slotOf(from: DuelSend): 0 | 1 | null {
    return this.seats[0]?.send === from ? 0 : this.seats[1]?.send === from ? 1 : null;
  }

  private queueAutoStart(): void {
    this.clearAutoStart();
    if (this.playerCount() < 1 || this.phase !== "lobby") {
      return;
    }
    this.autoStart = setTimeout(() => this.start(), this.playerCount() >= 2 ? 3500 : 6000);
  }

  private playerCount(): number {
    return (this.seats[0] ? 1 : 0) + (this.seats[1] ? 1 : 0);
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
    this.broadcast({ t: "lobby", phase: this.phase, players: this.snapshot(), mode: this.mode, fleeSlot: this.fleeSlot });
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
