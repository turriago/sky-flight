import { clampFlightInput, createFlightInput, type FlightInput } from "./FlightInput";
import type { InputController } from "./InputController";

type OrientationPermission = {
  requestPermission?: () => Promise<PermissionState>;
};

export class TiltController implements InputController {
  readonly name = "tilt";
  enabled = false;
  listening = false;
  lastEventAt = 0;

  private readonly input = createFlightInput();
  private beta0 = 55;
  private gamma0 = 0;
  private beta = 55;
  private gamma = 0;
  private samples = 0;

  async enable(): Promise<boolean> {
    const granted = await requestMotionPermission();
    if (!granted) {
      return false;
    }
    this.attach();
    this.enabled = true;
    await new Promise((resolve) => window.setTimeout(resolve, 280));
    this.calibrate();
    return true;
  }

  tryListen(): void {
    this.attach();
  }

  calibrate(): void {
    if (this.samples > 0) {
      this.beta0 = this.beta;
      this.gamma0 = this.gamma;
    }
  }

  get hasSignal(): boolean {
    return this.listening && performance.now() - this.lastEventAt < 1200;
  }

  update(): FlightInput {
    if (!this.enabled && !this.hasSignal) {
      this.input.throttle = 0;
      this.input.yaw = 0;
      this.input.pitch = 0;
      this.input.roll = 0;
      return this.input;
    }

    const yaw = deadzone(angleDelta(this.gamma, this.gamma0) / 28);
    const pitch = deadzone(angleDelta(this.beta0, this.beta) / 26);
    this.input.yaw = yaw;
    this.input.pitch = pitch;
    this.input.roll = yaw * 0.45;
    this.input.throttle = Math.max(-0.15, 0.28 - pitch * 0.4);
    return clampFlightInput(this.input);
  }

  dispose(): void {
    window.removeEventListener("deviceorientation", this.onOrientation);
    this.enabled = false;
    this.listening = false;
  }

  private attach(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    window.addEventListener("deviceorientation", this.onOrientation, true);
  }

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) {
      return;
    }
    this.beta = event.beta;
    this.gamma = event.gamma;
    this.lastEventAt = performance.now();
    this.samples += 1;
  };
}

async function requestMotionPermission(): Promise<boolean> {
  const orientation = DeviceOrientationEvent as unknown as OrientationPermission;
  if (typeof orientation.requestPermission !== "function") {
    return true;
  }
  try {
    const state = await orientation.requestPermission();
    return state === "granted";
  } catch {
    return false;
  }
}

function angleDelta(a: number, b: number): number {
  let delta = a - b;
  while (delta > 180) {
    delta -= 360;
  }
  while (delta < -180) {
    delta += 360;
  }
  return delta;
}

function deadzone(value: number, zone = 0.12): number {
  if (Math.abs(value) < zone) {
    return 0;
  }
  const sign = Math.sign(value);
  return Math.max(-1, Math.min(1, (value - sign * zone) / (1 - zone)));
}
