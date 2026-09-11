export type DuelRole = "admin" | "player";
export type DuelPhase = "lobby" | "countdown" | "racing" | "finished";
export type DuelMode = "race" | "hunt";
export type HuntRole = "flee" | "chase";
export type HuntEnd = "rings" | "ko" | "timeout" | "catch";
export type HuntItemKind = "turbo" | "wind" | "ammo";

export interface HuntCrate {
  id: number;
  kind: HuntItemKind;
  x: number;
  y: number;
  z: number;
}

export interface DuelPlayerInfo {
  slot: 0 | 1;
  name: string;
  connected: boolean;
  huntRole?: HuntRole;
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
  hp?: number;
  ammo?: number;
}

export type DuelMessage =
  | { t: "hello"; role: DuelRole; room: string; name?: string }
  | { t: "welcome"; role: DuelRole; slot: 0 | 1 | null; room: string; phase: DuelPhase; players: DuelPlayerInfo[]; mode?: DuelMode; fleeSlot?: 0 | 1 }
  | { t: "lobby"; phase: DuelPhase; count?: number; players: DuelPlayerInfo[]; mode?: DuelMode; fleeSlot?: 0 | 1 }
  | { t: "mode"; mode: DuelMode }
  | { t: "pilot" }
  | { t: "seated"; slot: 0 | 1 }
  | { t: "start" }
  | { t: "reset" }
  | DuelPose
  | { t: "shot"; slot: 0 | 1; x: number; y: number; z: number; dx: number; dy: number; dz: number }
  | { t: "hit"; target: 0 | 1; hp: number; by: 0 | 1; kind?: "shot" | "catch" }
  | { t: "crates"; crates: HuntCrate[] }
  | { t: "grab"; id: number }
  | { t: "held"; slot: 0 | 1; kind: HuntItemKind | null }
  | { t: "use" }
  | { t: "fx"; kind: HuntItemKind; by: 0 | 1; target?: 0 | 1 }
  | { t: "over"; winner: 0 | 1 | null; times: [number | null, number | null]; reason?: HuntEnd }
  | { t: "error"; message: string };

export const ITEM_LABEL: Record<HuntItemKind, string> = {
  turbo: "Turbo",
  wind: "Viento",
  ammo: "Calor",
};

export function pickHuntKind(preyHurt: boolean): HuntItemKind {
  const roll = Math.random();
  if (preyHurt) {
    if (roll < 0.45) {
      return "wind";
    }
    if (roll < 0.78) {
      return "ammo";
    }
    return "turbo";
  }
  if (roll < 0.4) {
    return "turbo";
  }
  if (roll < 0.72) {
    return "ammo";
  }
  return "wind";
}

export function crateBeside(id: number, kind: HuntItemKind, x: number, y: number, z: number): HuntCrate {
  const angle = Math.random() * Math.PI * 2;
  return {
    id,
    kind,
    x: x + Math.cos(angle) * 14,
    y: y + 1.6,
    z: z + Math.sin(angle) * 14,
  };
}

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function huntStartHp(fleeSlot: 0 | 1): [number, number] {
  return fleeSlot === 0 ? [3, 2] : [2, 3];
}

