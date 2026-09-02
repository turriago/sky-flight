import type { MqttClient } from "mqtt";
import mqtt from "mqtt";
import { DuelHost, type DuelSend } from "./DuelHost";
import type { DuelMessage, DuelPhase, DuelPlayerInfo, DuelPose, DuelRole } from "./protocol";

type Handler = (message: DuelMessage) => void;

const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
];

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
  private mqtt: MqttClient | null = null;
  private host: DuelHost | null = null;
  private readonly handlers = new Set<Handler>();
  private readonly senders = new Map<string, DuelSend>();
  private sendPoseAcc = 0;
  private usingMqtt = false;
  private closed = false;
  private joinName?: string;
  private clientId = "";
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private brokerIndex = 0;

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  connect(role: DuelRole, room: string, name?: string): void {
    this.close();
    this.closed = false;
    this.role = role;
    this.room = room.toUpperCase();
    this.joinName = name;
    this.error = "";
    this.brokerIndex = 0;
    this.usingMqtt = import.meta.env.PROD;
    if (this.usingMqtt) {
      this.error = "Abriendo la sala…";
      this.emit({ t: "error", message: this.error });
      this.connectMqtt();
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
    if (this.sendPoseAcc < 0.08) {
      return;
    }
    this.sendPoseAcc = 0;
    this.send({ t: "pose", ...pose });
  }

  close(): void {
    this.closed = true;
    this.stopHello();
    this.socket?.close();
    this.socket = null;
    this.host?.dispose();
    this.host = null;
    this.senders.clear();
    this.mqtt?.end(true);
    this.mqtt = null;
    this.connected = false;
    this.usingMqtt = false;
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

  private connectMqtt(): void {
    if (this.closed) {
      return;
    }
    const url = BROKERS[this.brokerIndex] ?? BROKERS[0];
    this.clientId = mqttId(this.role === "admin" ? "a" : "p", this.room);
    const client = mqtt.connect(url, {
      clientId: this.clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 2000,
      connectTimeout: 10000,
      protocolVersion: 4,
    });
    this.mqtt = client;

    client.on("connect", () => {
      if (this.closed) {
        return;
      }
      this.connected = true;
      this.error = "";
      if (this.role === "admin") {
        this.host ??= new DuelHost(this.room, (message) => this.handle(message));
        client.subscribe(this.topicUp(), { qos: 0 }, () => {
          if (this.host) {
            this.handle(this.host.welcomeAdmin());
          }
        });
        return;
      }
      client.subscribe([this.topicDown(), this.topicPlayer(this.clientId)], { qos: 0 }, () => {
        this.sendHello();
        this.startHello();
      });
    });

    client.on("message", (topic, payload) => {
      if (this.closed) {
        return;
      }
      const text = payload.toString();
      if (this.role === "admin" && topic === this.topicUp()) {
        this.onAdminUp(text);
        return;
      }
      if (this.role === "player") {
        this.parseIncoming(text);
      }
    });

    client.on("error", () => {
      if (this.closed || this.connected) {
        return;
      }
      this.tryNextBroker();
    });

    client.on("close", () => {
      if (this.closed) {
        return;
      }
      this.connected = false;
    });

    window.setTimeout(() => {
      if (!this.closed && !this.connected) {
        this.tryNextBroker();
      }
    }, 9000);
  }

  private tryNextBroker(): void {
    if (this.closed || this.connected) {
      return;
    }
    this.mqtt?.end(true);
    this.mqtt = null;
    this.brokerIndex += 1;
    if (this.brokerIndex >= BROKERS.length) {
      this.error = "No se pudo abrir la sala. Recarga en 10 segundos.";
      this.emit({ t: "error", message: this.error });
      return;
    }
    this.error = "Reintentando sala…";
    this.emit({ t: "error", message: this.error });
    this.connectMqtt();
  }

  private onAdminUp(text: string): void {
    const packet = decodePacket(text);
    if (!packet || !this.host) {
      return;
    }
    const send = this.senderFor(packet.from);
    this.host.incoming(send, packet.body);
  }

  private senderFor(from: string): DuelSend {
    const existing = this.senders.get(from);
    if (existing) {
      return existing;
    }
    const send: DuelSend = (message) => {
      this.mqtt?.publish(this.topicPlayer(from), JSON.stringify(message), { qos: 0 });
    };
    this.senders.set(from, send);
    return send;
  }

  private sendHello(): void {
    this.publishUp({ t: "hello", role: "player", room: this.room, name: this.joinName });
  }

  private startHello(): void {
    this.stopHello();
    this.helloTimer = setInterval(() => {
      if (this.slot !== null || this.closed) {
        this.stopHello();
        return;
      }
      this.sendHello();
    }, 2000);
  }

  private stopHello(): void {
    if (this.helloTimer) {
      clearInterval(this.helloTimer);
      this.helloTimer = null;
    }
  }

  private handle(message: DuelMessage): void {
    if (message.t === "welcome") {
      this.role = message.role;
      this.slot = message.slot;
      this.room = message.room;
      this.phase = message.phase;
      this.players = message.players;
      this.error = "";
      if (message.role === "player") {
        this.stopHello();
      }
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
    if (this.usingMqtt && this.role === "player") {
      this.publishUp(message);
    }
  }

  private publishUp(message: DuelMessage): void {
    const packet = JSON.stringify({ from: this.clientId, body: message });
    this.mqtt?.publish(this.topicUp(), packet, { qos: 0 });
  }

  private parseIncoming(raw: unknown): void {
    const message = decodeMessage(raw);
    if (message) {
      this.handle(message);
    }
  }

  private topicUp(): string {
    return `skyflight/${this.room}/up`;
  }

  private topicDown(): string {
    return `skyflight/${this.room}/down`;
  }

  private topicPlayer(id: string): string {
    return `skyflight/${this.room}/p/${id}`;
  }
}

function mqttId(role: string, room: string): string {
  return `sf${room}${role}${Math.random().toString(36).slice(2, 8)}`.slice(0, 23);
}

function decodePacket(raw: string): { from: string; body: DuelMessage } | null {
  try {
    const parsed = JSON.parse(raw) as { from?: string; body?: DuelMessage };
    if (typeof parsed.from === "string" && parsed.body && typeof parsed.body.t === "string") {
      return { from: parsed.from, body: parsed.body };
    }
  } catch {
    return null;
  }
  return null;
}

function decodeMessage(raw: unknown): DuelMessage | null {
  try {
    const text = typeof raw === "string" ? raw : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : "";
    const parsed = text ? JSON.parse(text) : raw;
    if (parsed && typeof parsed === "object" && "t" in parsed) {
      return parsed as DuelMessage;
    }
  } catch {
    return null;
  }
  return null;
}
