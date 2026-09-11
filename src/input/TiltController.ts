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
  private ax0 = 0;
  private ay0 = 0;
  private beta = 55;
  private gamma = 0;
  private ax = 0;
  private ay = 0;
  private fYaw = 0;
  private fPitch = 0;
  private samples = 0;
  private lastOrientAt = 0;
  private lastMotionAt = 0;
  private lastUpdateAt = 0;

  async enable(): Promise<boolean> {
    const granted = await requestMotionPermission();
    if (!granted) {
      return false;
    }
    this.attach();
    this.enabled = true;
    await new Promise((resolve) => window.setTimeout(resolve, 350));
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
      this.ax0 = this.ax;
      this.ay0 = this.ay;
      this.fYaw = 0;
      this.fPitch = 0;
    }
  }

  get hasSignal(): boolean {
    return this.listening && performance.now() - this.lastEventAt < 1800;
  }

  update(): FlightInput {
    if (!this.enabled && !this.hasSignal) {
      this.input.throttle = 0;
      this.input.yaw = 0;
      this.input.pitch = 0;
      this.input.roll = 0;
      return this.input;
    }

    const now = performance.now();
    const dt = this.lastUpdateAt ? Math.min(0.05, (now - this.lastUpdateAt) / 1000) : 0.016;
    this.lastUpdateAt = now;

    let yaw: number;
    let pitch: number;
    const orientFresh = now - this.lastOrientAt < 500;
    if (orientFresh) {
      const mapped = mapPhoneTilt(this.beta, this.beta0, this.gamma, this.gamma0);
      yaw = mapped.yaw;
      pitch = mapped.pitch;
    } else {
      const mapped = mapPhoneTilt(this.ay, this.ay0, this.ax, this.ax0);
      yaw = mapped.yaw * 0.35;
      pitch = mapped.pitch * 0.35;
    }

    yaw = deadzone(yaw, 0.05);
    pitch = deadzone(pitch, 0.05);
    const follow = 1 - Math.exp(-16 * dt);
    this.fYaw += (yaw - this.fYaw) * follow;
    this.fPitch += (pitch - this.fPitch) * follow;

    this.input.yaw = clamp(this.fYaw);
    this.input.pitch = clamp(this.fPitch);
    this.input.roll = this.input.yaw * 0.35;
    this.input.throttle = this.input.pitch < -0.12 ? 0.38 : this.input.pitch > 0.12 ? 0.08 : 0.22;
    return clampFlightInput(this.input);
  }

  dispose(): void {
    window.removeEventListener("deviceorientation", this.onOrientation);
    window.removeEventListener("deviceorientationabsolute", this.onOrientation);
    window.removeEventListener("devicemotion", this.onMotion);
    this.enabled = false;
    this.listening = false;
  }

  private attach(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    window.addEventListener("deviceorientation", this.onOrientation, true);
    window.addEventListener("deviceorientationabsolute", this.onOrientation, true);
    window.addEventListener("devicemotion", this.onMotion, true);
  }

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) {
      return;
    }
    this.beta = event.beta;
    this.gamma = event.gamma;
    this.lastOrientAt = performance.now();
    this.lastEventAt = this.lastOrientAt;
    this.samples += 1;
  };

  private onMotion = (event: DeviceMotionEvent): void => {
    const grav = event.accelerationIncludingGravity;
    if (!grav || grav.x === null || grav.y === null) {
      return;
    }
    this.ax = grav.x;
    this.ay = grav.y;
    this.lastMotionAt = performance.now();
    if (performance.now() - this.lastOrientAt > 400) {
      this.lastEventAt = this.lastMotionAt;
      this.samples += 1;
    }
  };
}

async function requestMotionPermission(): Promise<boolean> {
  const orientation = DeviceOrientationEvent as unknown as OrientationPermission;
  const motion = DeviceMotionEvent as unknown as OrientationPermission;
  try {
    if (typeof orientation.requestPermission === "function") {
      const state = await orientation.requestPermission();
      if (state !== "granted") {
        return false;
      }
    }
    if (typeof motion.requestPermission === "function") {
      await motion.requestPermission();
    }
    return true;
  } catch {
    return typeof orientation.requestPermission !== "function";
  }
}

function mapPhoneTilt(beta: number, beta0: number, gamma: number, gamma0: number): { yaw: number; pitch: number } {
  // LOCKED: direcciones validadas. No invertir yaw ni pitch.
  const dBeta = angleDelta(beta, beta0);
  const dGamma = angleDelta(gamma, gamma0);
  const angle = screenAngle();
  if (angle === 90) {
    return { yaw: dBeta / 16, pitch: -dGamma / 14 };
  }
  if (angle === 270 || angle === -90) {
    return { yaw: -dBeta / 16, pitch: dGamma / 14 };
  }
  return { yaw: dGamma / 16, pitch: -dBeta / 14 };
}

function screenAngle(): number {
  if (typeof screen.orientation?.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  if (typeof window.orientation === "number") {
    return ((window.orientation % 360) + 360) % 360;
  }
  return window.innerWidth > window.innerHeight ? 90 : 0;
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

function deadzone(value: number, zone = 0.07): number {
  if (Math.abs(value) < zone) {
    return 0;
  }
  const sign = Math.sign(value);
  return Math.max(-1, Math.min(1, (value - sign * zone) / (1 - zone)));
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
