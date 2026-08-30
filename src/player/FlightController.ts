import { Euler, Quaternion, Vector3 } from "three";
import type { FlightInput } from "../input/FlightInput";
import { FLIGHT, WORLD } from "../utils/Constants";
import { clamp, expDamp, wrapAngle } from "../utils/MathUtils";

export type FlightPose = "plane" | "fly" | "turnLeft" | "turnRight" | "ascend" | "descend";

export class FlightController {
  readonly position = new Vector3(6, 40, 118);
  readonly quaternion = new Quaternion();
  readonly forward = new Vector3();
  readonly up = new Vector3(0, 1, 0);

  speed: number = FLIGHT.CRUISE_SPEED;
  pitch = 0.05;
  yaw = 0;
  roll = 0;

  private readonly euler = new Euler();
  private smoothThrottle = 0;
  private smoothYaw = 0;
  private smoothPitch = 0;
  private smoothRoll = 0;
  private cruising = false;
  private cruiseAltitude = 40;
  grounded = false;

  get altitude(): number {
    return this.position.y;
  }

  get headingRadians(): number {
    return this.yaw;
  }

  get headingDegrees(): number {
    const degrees = ((wrapAngle(this.yaw) * 180) / Math.PI + 360) % 360;
    return degrees;
  }

  get speedMps(): number {
    return this.speed;
  }

  get speedKmh(): number {
    return this.speed * 3.6;
  }

  get pose(): FlightPose {
    if (this.smoothPitch > 0.35) return "ascend";
    if (this.smoothPitch < -0.35) return "descend";
    if (this.smoothYaw < -0.28) return "turnLeft";
    if (this.smoothYaw > 0.28) return "turnRight";
    if (this.smoothThrottle > 0.2 || this.speed > FLIGHT.CRUISE_SPEED + 4) return "fly";
    return "plane";
  }

  reset(x: number, y: number, z: number, yaw = 0): void {
    this.position.set(x, y, z);
    this.speed = FLIGHT.CRUISE_SPEED;
    this.pitch = 0.04;
    this.yaw = yaw;
    this.roll = 0;
    this.smoothThrottle = 0;
    this.smoothYaw = 0;
    this.smoothPitch = 0;
    this.smoothRoll = 0;
    this.cruising = false;
    this.cruiseAltitude = y;
    this.grounded = false;
    this.rebuildOrientation();
  }

  applyHit(): void {
    this.speed = Math.max(FLIGHT.MIN_SPEED, this.speed * 0.52);
    this.pitch = Math.max(this.pitch, 0.28);
    this.position.addScaledVector(this.up, 2.4);
  }

  update(dt: number, input: FlightInput, sampleHeight: (x: number, z: number) => number, cruise = false): void {
    if (cruise && !this.cruising) {
      this.cruiseAltitude = this.position.y;
    }
    this.cruising = cruise;

    const smoothing = FLIGHT.INPUT_SMOOTHING;
    const throttle = cruise ? 0 : input.throttle;
    const yaw = cruise ? 0 : input.yaw;
    const pitch = cruise ? 0 : input.pitch;
    const roll = cruise ? 0 : input.roll;

    this.smoothThrottle = expDamp(this.smoothThrottle, throttle, smoothing, dt);
    this.smoothYaw = expDamp(this.smoothYaw, yaw, smoothing, dt);
    this.smoothPitch = expDamp(this.smoothPitch, pitch, smoothing, dt);
    this.smoothRoll = expDamp(this.smoothRoll, roll, smoothing, dt);

    const targetPitch = cruise ? 0.045 : this.smoothPitch * FLIGHT.MAX_PITCH;
    const assistedBank = this.smoothYaw * FLIGHT.MAX_ROLL * FLIGHT.BANK_FROM_YAW;
    const targetRoll = cruise ? 0 : this.smoothRoll * FLIGHT.MAX_ROLL + assistedBank;

    this.pitch = expDamp(this.pitch, targetPitch, FLIGHT.PITCH_RATE * 3.2, dt);
    this.roll = expDamp(this.roll, targetRoll, FLIGHT.ROLL_RATE * 2.4, dt);
    this.yaw += this.smoothYaw * FLIGHT.YAW_RATE * dt;
    this.yaw += this.roll * 0.22 * dt;

    if (this.smoothThrottle >= 0) {
      this.speed += this.smoothThrottle * FLIGHT.ACCELERATION * dt;
    } else {
      this.speed += this.smoothThrottle * FLIGHT.DECELERATION * dt;
    }

    this.speed -= this.pitch * FLIGHT.DIVE_BOOST * dt;
    this.speed -= (1 - this.speed / FLIGHT.MAX_SPEED) * 0.35 * dt;
    if (cruise) {
      this.speed = expDamp(this.speed, FLIGHT.CRUISE_SPEED, 1.8, dt);
    }
    this.speed = clamp(this.speed, FLIGHT.MIN_SPEED, FLIGHT.MAX_SPEED);

    const lift = (this.speed / FLIGHT.MAX_SPEED) * 0.55;
    const sink = cruise ? 0 : (1 - lift) * FLIGHT.GRAVITY * dt * 0.22;

    this.rebuildOrientation();
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);

    this.position.addScaledVector(this.forward, this.speed * dt);
    this.position.y -= sink;

    const half = WORLD.SIZE * 0.5 - WORLD.EDGE_MARGIN;
    this.position.x = clamp(this.position.x, -half, half);
    this.position.z = clamp(this.position.z, -half, half);

    const ground = sampleHeight(this.position.x, this.position.z);
    const minY = ground + FLIGHT.MIN_CLEARANCE;
    if (cruise) {
      this.cruiseAltitude = clamp(this.cruiseAltitude, minY, FLIGHT.MAX_ALTITUDE);
      this.position.y = expDamp(this.position.y, this.cruiseAltitude, 2.2, dt);
    }
    this.position.y = clamp(this.position.y, minY, FLIGHT.MAX_ALTITUDE);
    this.grounded = this.position.y <= minY + 0.28;

    if (this.grounded && this.pitch < 0) {
      this.pitch = expDamp(this.pitch, 0.12, 8, dt);
    }
  }

  private rebuildOrientation(): void {
    this.euler.set(this.pitch, -this.yaw, -this.roll, "YXZ");
    this.quaternion.setFromEuler(this.euler);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
  }
}
