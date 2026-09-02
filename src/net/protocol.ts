export type DuelRole = "admin" | "player";
export type DuelPhase = "lobby" | "countdown" | "racing" | "finished";

export interface DuelPlayerInfo {
  slot: 0 | 1;
  name: string;
  connected: boolean;
}

export interface DuelPose {
  t: "pose";
  slot: 0 | 1;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  spd: number;
  rings: number;
  time: number;
  done: 0 | 1;
}

export type DuelMessage =
  | { t: "hello"; role: DuelRole; room: string; name?: string }
  | { t: "welcome"; role: DuelRole; slot: 0 | 1 | null; room: string; phase: DuelPhase; players: DuelPlayerInfo[] }
  | { t: "lobby"; phase: DuelPhase; count?: number; players: DuelPlayerInfo[] }
  | { t: "start" }
  | { t: "reset" }
  | DuelPose
  | { t: "over"; winner: 0 | 1 | null; times: [number | null, number | null] }
  | { t: "error"; message: string };

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
