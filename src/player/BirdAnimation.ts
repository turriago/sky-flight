import { Object3D } from "three";
import type { FlightPose } from "./FlightController";
import { expDamp } from "../utils/MathUtils";

export interface FlapSource {
  pose: FlightPose;
  speedMps: number;
  roll: number;
}

interface WingRefs {
  left?: Object3D;
  right?: Object3D;
}

export class BirdAnimation {
  private readonly wings: WingRefs;
  private time = 0;
  private flap = 0;
  private bank = 0;
  private lift = 0;

  constructor(visual: Object3D) {
    this.wings = {
      left: visual.getObjectByName("WingLeft") ?? undefined,
      right: visual.getObjectByName("WingRight") ?? undefined,
    };
  }

  retarget(visual: Object3D): void {
    this.wings.left = visual.getObjectByName("WingLeft") ?? undefined;
    this.wings.right = visual.getObjectByName("WingRight") ?? undefined;
  }

  update(dt: number, flight: FlapSource): void {
    this.time += dt;

    const pose = flight.pose;
    const effort = Math.max(0, (flight.speedMps - 16) / 36);
    let flapSpeed = 6.4 + effort * 5.5;
    let amplitude = 0.42 + effort * 0.18;

    if (pose === "plane") {
      flapSpeed = 3.2;
      amplitude = 0.18;
    } else if (pose === "ascend") {
      flapSpeed = 8.6;
      amplitude = 0.55;
    } else if (pose === "descend") {
      flapSpeed = 2.6;
      amplitude = 0.14;
    }

    this.flap = expDamp(this.flap, Math.sin(this.time * flapSpeed) * amplitude, 10, dt);
    this.bank = expDamp(this.bank, flight.roll * 0.22, 8, dt);
    this.lift = expDamp(this.lift, pose === "ascend" ? 0.12 : pose === "descend" ? -0.08 : 0, 7, dt);

    const left = this.wings.left;
    const right = this.wings.right;
    if (!left || !right) {
      return;
    }

    left.rotation.z = 0.18 + this.flap + this.bank;
    right.rotation.z = -0.18 - this.flap + this.bank;
    left.rotation.x = this.lift;
    right.rotation.x = this.lift;
    left.rotation.y = -0.08;
    right.rotation.y = 0.08;
  }
}
