import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";
import type { GhostSample } from "../player/Ghost";
import type { Terrain } from "./Terrain";
import { COURSE, FLIGHT, WORLD } from "../utils/Constants";
import { clamp } from "../utils/MathUtils";

export type CoursePhase = "idle" | "armed" | "racing" | "finished";
export type Medal = "gold" | "silver" | "bronze" | null;

export interface CourseStatus {
  active: boolean;
  phase: CoursePhase;
  time: number;
  flown: number;
  passed: number;
  total: number;
  best: number | null;
  distance: number;
  newRecord: boolean;
  hits: number;
  penalties: number;
  penaltyFlash: number;
  goldTime: number;
  silverTime: number;
  bronzeTime: number;
  medal: Medal;
  bestMedal: Medal;
}

interface Gate {
  mesh: Mesh;
  material: MeshStandardMaterial;
  position: Vector3;
  passed: boolean;
}

interface StoredRun {
  time: number;
  ghost: number[];
}

const nextColor = new Color(0x7ed0c0);
const waitColor = new Color(0x6a8ea0);
const doneColor = new Color(0x3d4d55);
const goldColor = new Color(0xf3c27a);

export class Course {
  readonly group = new Group();
  readonly start = new Vector3(6, 42, 118);
  startYaw = 0;
  goldTime = 32;
  silverTime = 40;
  bronzeTime = 50;

  private readonly gates: Gate[] = [];
  private phase: CoursePhase = "idle";
  private nextIndex = 0;
  private flown = 0;
  private penalties = 0;
  private hits = 0;
  private pulse = 0;
  private recordAcc = 0;
  private penaltyFlash = 0;
  private best: number | null = null;
  private newRecord = false;
  private distance = 0;
  private recording: GhostSample[] = [];
  private ghostTape: GhostSample[] = [];

  constructor() {
    this.group.name = "Course";
    this.group.visible = false;
    const stored = loadRun();
    this.best = stored?.time ?? null;
    this.ghostTape = stored?.ghost ?? [];
  }

  get ghostPath(): GhostSample[] | null {
    return this.ghostTape.length > 1 ? this.ghostTape : null;
  }

  get status(): CourseStatus {
    const time = this.flown + this.penalties;
    return {
      active: this.phase !== "idle",
      phase: this.phase,
      time,
      flown: this.flown,
      passed: this.nextIndex,
      total: this.gates.length,
      best: this.best,
      distance: this.distance,
      newRecord: this.newRecord,
      hits: this.hits,
      penalties: this.penalties,
      penaltyFlash: this.penaltyFlash,
      goldTime: this.goldTime,
      silverTime: this.silverTime,
      bronzeTime: this.bronzeTime,
      medal: this.phase === "finished" ? medalFor(time, this.goldTime, this.silverTime, this.bronzeTime) : null,
      bestMedal: medalFor(this.best, this.goldTime, this.silverTime, this.bronzeTime),
    };
  }

  build(terrain: Terrain): void {
    this.clear();
    const geometry = new TorusGeometry(COURSE.RING_RADIUS, COURSE.RING_TUBE, 12, 28);
    const points = COURSE.ROUTE.map(([x, z]) => {
      const ground = terrain.getHeightAt(x, z);
      const y = clamp(ground + 18, WORLD.WATER_LEVEL + 14, FLIGHT.MAX_ALTITUDE - 24);
      return new Vector3(x, y, z);
    });

    for (let i = 0; i < points.length; i++) {
      const position = points[i];
      const material = new MeshStandardMaterial({
        color: waitColor,
        emissive: waitColor,
        emissiveIntensity: 0.55,
        roughness: 0.28,
        metalness: 0.18,
        transparent: true,
        opacity: 0.92,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.castShadow = true;
      const look = points[i + 1] ?? position.clone().add(new Vector3(0, 0, -1));
      mesh.lookAt(look.x, position.y, look.z);
      this.group.add(mesh);
      this.gates.push({ mesh, material, position, passed: false });
    }

    if (this.gates[0]) {
      const first = this.gates[0].position;
      this.start.set(first.x, first.y, first.z + 22);
      const ground = terrain.getHeightAt(this.start.x, this.start.z);
      this.start.y = Math.max(first.y, ground + FLIGHT.MIN_CLEARANCE + 2);
      this.startYaw = Math.atan2(first.x - this.start.x, -(first.z - this.start.z));
    }

    let length = this.start.distanceTo(this.gates[0]?.position ?? this.start);
    for (let i = 0; i < this.gates.length - 1; i++) {
      length += this.gates[i].position.distanceTo(this.gates[i + 1].position);
    }
    this.goldTime = length / 18.5;
    this.silverTime = length / 14.8;
    this.bronzeTime = length / 12.2;
  }

  beginRace(): void {
    if (this.phase !== "armed") {
      return;
    }
    this.phase = "racing";
    this.flown = 0;
    this.recordAcc = 0;
    this.recording = [];
  }

  arm(): void {
    this.phase = "armed";
    this.nextIndex = 0;
    this.flown = 0;
    this.penalties = 0;
    this.hits = 0;
    this.recordAcc = 0;
    this.penaltyFlash = 0;
    this.newRecord = false;
    this.recording = [];
    this.group.visible = true;
    for (const gate of this.gates) {
      gate.passed = false;
    }
    this.paint();
  }

  hide(): void {
    this.phase = "idle";
    this.group.visible = false;
    this.nextIndex = 0;
    this.flown = 0;
    this.penalties = 0;
    this.hits = 0;
    this.newRecord = false;
    this.recording = [];
  }

  addHit(): boolean {
    if (this.phase !== "racing") {
      return false;
    }
    this.hits += 1;
    this.penalties += COURSE.HIT_PENALTY;
    this.penaltyFlash = 0.9;
    return true;
  }

  update(dt: number, birdPosition: Vector3, birdRotation: Quaternion): void {
    this.pulse += dt;
    this.penaltyFlash = Math.max(0, this.penaltyFlash - dt);
    if (this.phase === "idle") {
      return;
    }

    const current = this.gates[this.nextIndex];
    this.distance = current ? birdPosition.distanceTo(current.position) : 0;

    if (this.phase === "racing") {
      this.flown += dt;
      this.recordAcc += dt;
      if (this.recordAcc >= 1 / COURSE.GHOST_HZ) {
        this.recordAcc = 0;
        this.recording.push({
          t: this.flown,
          x: birdPosition.x,
          y: birdPosition.y,
          z: birdPosition.z,
          qx: birdRotation.x,
          qy: birdRotation.y,
          qz: birdRotation.z,
          qw: birdRotation.w,
        });
      }
    }

    if ((this.phase === "armed" || this.phase === "racing") && current && this.distance <= COURSE.PASS_RADIUS) {
      current.passed = true;
      this.nextIndex += 1;
      if (this.phase === "armed") {
        this.phase = "racing";
        this.flown = 0;
        this.recordAcc = 0;
        this.recording = [{
          t: 0,
          x: birdPosition.x,
          y: birdPosition.y,
          z: birdPosition.z,
          qx: birdRotation.x,
          qy: birdRotation.y,
          qz: birdRotation.z,
          qw: birdRotation.w,
        }];
      }
      if (this.nextIndex >= this.gates.length) {
        this.finish(birdPosition, birdRotation);
      }
    }

    this.paint();
  }

  private finish(birdPosition: Vector3, birdRotation: Quaternion): void {
    this.phase = "finished";
    this.distance = 0;
    this.recording.push({
      t: this.flown,
      x: birdPosition.x,
      y: birdPosition.y,
      z: birdPosition.z,
      qx: birdRotation.x,
      qy: birdRotation.y,
      qz: birdRotation.z,
      qw: birdRotation.w,
    });
    const time = this.flown + this.penalties;
    if (this.best === null || time < this.best) {
      this.best = time;
      this.newRecord = true;
      this.ghostTape = this.recording.slice();
      saveRun({ time, ghost: packGhost(this.ghostTape) });
    }
  }

  private paint(): void {
    for (let i = 0; i < this.gates.length; i++) {
      const gate = this.gates[i];
      const isNext = i === this.nextIndex && this.phase !== "finished" && this.phase !== "idle";
      if (gate.passed) {
        gate.material.color.copy(doneColor);
        gate.material.emissive.copy(doneColor);
        gate.material.emissiveIntensity = 0.12;
        gate.material.opacity = 0.28;
        gate.mesh.scale.setScalar(0.92);
        continue;
      }
      if (isNext) {
        const beat = 0.72 + Math.sin(this.pulse * 7.5) * 0.28;
        gate.material.color.copy(goldColor);
        gate.material.emissive.copy(goldColor);
        gate.material.emissiveIntensity = beat;
        gate.material.opacity = 1;
        gate.mesh.scale.setScalar(1 + Math.sin(this.pulse * 7.5) * 0.04);
        continue;
      }
      gate.material.color.copy(waitColor);
      gate.material.emissive.copy(nextColor);
      gate.material.emissiveIntensity = 0.28;
      gate.material.opacity = 0.72;
      gate.mesh.scale.setScalar(1);
    }
  }

  private clear(): void {
    for (const gate of this.gates) {
      gate.material.dispose();
    }
    this.gates.length = 0;
    this.group.clear();
  }
}

export function medalFor(time: number | null, gold: number, silver: number, bronze: number): Medal {
  if (time === null) {
    return null;
  }
  if (time <= gold) return "gold";
  if (time <= silver) return "silver";
  if (time <= bronze) return "bronze";
  return null;
}

function packGhost(samples: GhostSample[]): number[] {
  const packed: number[] = [];
  for (const sample of samples) {
    packed.push(sample.t, sample.x, sample.y, sample.z, sample.qx, sample.qy, sample.qz, sample.qw);
  }
  return packed;
}

function unpackGhost(packed: number[]): GhostSample[] {
  const samples: GhostSample[] = [];
  for (let i = 0; i + 7 < packed.length; i += 8) {
    samples.push({
      t: packed[i],
      x: packed[i + 1],
      y: packed[i + 2],
      z: packed[i + 3],
      qx: packed[i + 4],
      qy: packed[i + 5],
      qz: packed[i + 6],
      qw: packed[i + 7],
    });
  }
  return samples;
}

function loadRun(): { time: number; ghost: GhostSample[] } | null {
  try {
    const raw = localStorage.getItem(COURSE.BEST_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("sky-flight-best-time");
      const time = legacy ? Number(legacy) : NaN;
      return Number.isFinite(time) && time > 0 ? { time, ghost: [] } : null;
    }
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as StoredRun;
      if (!Number.isFinite(parsed.time) || parsed.time <= 0) {
        return null;
      }
      return { time: parsed.time, ghost: unpackGhost(parsed.ghost ?? []) };
    }
    const time = Number(raw);
    return Number.isFinite(time) && time > 0 ? { time, ghost: [] } : null;
  } catch {
    return null;
  }
}

function saveRun(run: StoredRun): void {
  try {
    localStorage.setItem(COURSE.BEST_KEY, JSON.stringify(run));
  } catch {
    // ignore private-mode storage failures
  }
}
