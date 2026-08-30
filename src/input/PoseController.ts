import { createFlightInput, type FlightInput } from "./FlightInput";
import { POSE } from "../utils/Constants";
import { clamp, expDamp } from "../utils/MathUtils";
import { PoseLandmark, type PoseFrame } from "../vision/PoseTypes";

interface Calibration {
  armHeight: number;
  torsoWidth: number;
  torsoX: number;
  headDrop: number;
}

interface BodySample {
  armHeight: number;
  armSpan: number;
  tilt: number;
  wristRoll: number;
  torsoWidth: number;
  torsoX: number;
  headOffset: number;
  headDrop: number;
}

export class PoseController {
  readonly name = "pose";
  private readonly input = createFlightInput();
  private readonly smoothed = createFlightInput();
  private calibration: Calibration | null = null;
  private calibrating = false;
  private calibrationStarted = 0;
  private lostFor = 0;
  private forcedRest = false;
  private autoRest = false;
  private restHold = 0;
  private wakeHold = 0;
  private sawBody = false;
  private ignoreAutoRest = false;
  visible = false;

  get isCalibrating(): boolean {
    return this.calibrating;
  }

  get isCalibrated(): boolean {
    return this.calibration !== null && !this.calibrating;
  }

  get resting(): boolean {
    return this.forcedRest || this.autoRest;
  }

  get lastInput(): FlightInput {
    return this.input;
  }

  resetCalibration(): void {
    this.calibration = null;
    this.calibrating = false;
  }

  toggleRest(): void {
    if (this.resting) {
      this.forcedRest = false;
      this.autoRest = false;
      this.restHold = 0;
      this.wakeHold = 0;
      this.ignoreAutoRest = true;
      return;
    }
    this.forcedRest = true;
    this.autoRest = true;
    this.ignoreAutoRest = false;
  }

  setResting(value: boolean): void {
    this.forcedRest = value;
    this.autoRest = value;
    this.restHold = 0;
    this.wakeHold = 0;
    this.ignoreAutoRest = !value;
  }

  onTrackingStopped(): void {
    this.sawBody = false;
    this.lostFor = 0;
    this.visible = false;
    this.autoRest = this.forcedRest;
  }

  update(dt: number, frame: PoseFrame | null): FlightInput {
    const sample = frame ? this.readBody(frame) : null;
    if (!sample) {
      this.lostFor += dt;
      if (this.lostFor > 0.35) {
        this.visible = false;
      }
      if (this.sawBody && this.lostFor > 0.55) {
        this.autoRest = true;
      }
      this.smoothed.throttle = expDamp(this.smoothed.throttle, 0, this.resting ? 4 : 3, dt);
      this.smoothed.yaw = expDamp(this.smoothed.yaw, 0, this.resting ? 4 : 3, dt);
      this.smoothed.pitch = expDamp(this.smoothed.pitch, 0, this.resting ? 4 : 3, dt);
      this.smoothed.roll = expDamp(this.smoothed.roll, 0, this.resting ? 4 : 3, dt);
      return copy(this.smoothed, this.input);
    }

    this.lostFor = 0;
    this.sawBody = true;
    this.visible = true;
    this.captureRest(sample);
    this.updateRestState(dt, sample);

    const rest = this.calibration ?? sample;
    const handsPitch = (sample.armHeight - rest.armHeight) * 2.2;
    const divePitch = (sample.headDrop - rest.headDrop) * 2.1;
    const pitch = clamp(handsPitch - divePitch, -1, 1);
    const throttle = clamp((sample.torsoWidth - rest.torsoWidth) / Math.max(0.04, rest.torsoWidth) * 2.4, -1, 1);
    const shift = (sample.torsoX - rest.torsoX) * 6;
    const yaw = clamp(shift + sample.tilt * 2.2 + sample.headOffset * 1.6, -1, 1);
    const roll = clamp(sample.wristRoll * 1.4 + yaw * 0.35, -1, 1);

    const gliding = sample.armSpan > 2.6 && Math.abs(pitch) < 0.22;
    const target: FlightInput = this.resting
      ? { throttle: 0, yaw: 0, pitch: 0, roll: 0 }
      : {
          throttle: gliding ? throttle * 0.2 : throttle,
          yaw,
          pitch,
          roll,
        };

    this.smoothed.throttle = expDamp(this.smoothed.throttle, dead(target.throttle), POSE.SMOOTHING, dt);
    this.smoothed.yaw = expDamp(this.smoothed.yaw, dead(target.yaw), POSE.SMOOTHING, dt);
    this.smoothed.pitch = expDamp(this.smoothed.pitch, dead(target.pitch), POSE.SMOOTHING, dt);
    this.smoothed.roll = expDamp(this.smoothed.roll, dead(target.roll), POSE.SMOOTHING, dt);
    return copy(this.smoothed, this.input);
  }

  dispose(): void {
    this.resetCalibration();
    this.setResting(false);
  }

  private readBody(frame: PoseFrame): BodySample | null {
    const nose = frame.landmarks[PoseLandmark.NOSE];
    const lShoulder = frame.landmarks[PoseLandmark.LEFT_SHOULDER];
    const rShoulder = frame.landmarks[PoseLandmark.RIGHT_SHOULDER];
    if (!usable(lShoulder) || !usable(rShoulder)) {
      return null;
    }

    const lHand = handOf(frame, "left");
    const rHand = handOf(frame, "right");
    const lHip = frame.landmarks[PoseLandmark.LEFT_HIP];
    const rHip = frame.landmarks[PoseLandmark.RIGHT_HIP];
    const torsoWidth = Math.hypot(lShoulder.x - rShoulder.x, lShoulder.y - rShoulder.y);
    if (torsoWidth < 0.025) {
      return null;
    }

    const hipsVisible = usable(lHip) && usable(rHip);
    const torsoHeight = hipsVisible
      ? Math.max(0.07, (lHip.y + rHip.y) * 0.5 - (lShoulder.y + rShoulder.y) * 0.5)
      : Math.max(0.07, torsoWidth * 1.6);

    const shoulderY = (lShoulder.y + rShoulder.y) * 0.5;
    const handsY = lHand && rHand ? (lHand.y + rHand.y) * 0.5 : lHand?.y ?? rHand?.y ?? shoulderY + torsoHeight * 0.4;
    const torsoX = (lShoulder.x + rShoulder.x) * 0.5;

    return {
      armHeight: (shoulderY - handsY) / torsoHeight,
      armSpan: lHand && rHand ? Math.hypot(lHand.x - rHand.x, lHand.y - rHand.y) / torsoWidth : 1,
      tilt: (rShoulder.y - lShoulder.y) / torsoWidth,
      wristRoll: lHand && rHand ? (rHand.y - lHand.y) / torsoHeight : 0,
      torsoWidth,
      torsoX,
      headOffset: usable(nose) ? (nose.x - torsoX) / torsoWidth : 0,
      headDrop: usable(nose) ? (nose.y - shoulderY) / torsoHeight : 0,
    };
  }

  private captureRest(sample: BodySample): void {
    if (!this.calibration) {
      this.calibration = {
        armHeight: sample.armHeight,
        torsoWidth: sample.torsoWidth,
        torsoX: sample.torsoX,
        headDrop: sample.headDrop,
      };
      this.calibrating = true;
      this.calibrationStarted = performance.now();
      return;
    }

    if (!this.calibrating) {
      return;
    }

    this.calibration.armHeight += (sample.armHeight - this.calibration.armHeight) * 0.12;
    this.calibration.torsoWidth += (sample.torsoWidth - this.calibration.torsoWidth) * 0.12;
    this.calibration.torsoX += (sample.torsoX - this.calibration.torsoX) * 0.12;
    this.calibration.headDrop += (sample.headDrop - this.calibration.headDrop) * 0.12;

    if (performance.now() - this.calibrationStarted >= POSE.CALIBRATION_SECONDS * 1000) {
      this.calibrating = false;
    }
  }

  private updateRestState(dt: number, sample: BodySample): void {
    if (this.isWakePose(sample)) {
      this.wakeHold += dt;
      this.restHold = 0;
      this.ignoreAutoRest = false;
      if (this.wakeHold >= POSE.REST_EXIT_SECONDS) {
        this.autoRest = false;
        this.forcedRest = false;
      }
      return;
    }

    if (this.isRelaxed(sample)) {
      this.restHold += dt;
      this.wakeHold = 0;
      if (!this.ignoreAutoRest && this.restHold >= POSE.REST_ENTER_SECONDS) {
        this.autoRest = true;
      }
      return;
    }

    this.restHold = Math.max(0, this.restHold - dt);
    this.wakeHold = Math.max(0, this.wakeHold - dt);
  }

  private isRelaxed(sample: BodySample): boolean {
    return sample.armHeight < POSE.REST_ARM_HEIGHT && sample.armSpan < POSE.REST_ARM_SPAN;
  }

  private isWakePose(sample: BodySample): boolean {
    return sample.armHeight > POSE.WAKE_ARM_HEIGHT || sample.armSpan > POSE.WAKE_ARM_SPAN;
  }
}

function handOf(frame: PoseFrame, side: "left" | "right"): { x: number; y: number } | null {
  const wrist = frame.landmarks[side === "left" ? PoseLandmark.LEFT_WRIST : PoseLandmark.RIGHT_WRIST];
  const elbow = frame.landmarks[side === "left" ? PoseLandmark.LEFT_ELBOW : PoseLandmark.RIGHT_ELBOW];
  if (usable(wrist)) return wrist;
  if (usable(elbow)) return elbow;
  return null;
}

function dead(value: number): number {
  if (Math.abs(value) < POSE.DEAD_ZONE) {
    return 0;
  }
  const sign = value > 0 ? 1 : -1;
  return sign * Math.min(1, (Math.abs(value) - POSE.DEAD_ZONE) / (1 - POSE.DEAD_ZONE));
}

function usable(point: { x: number; y: number; visibility: number } | undefined): point is { x: number; y: number; visibility: number } {
  return Boolean(point && point.visibility >= POSE.MIN_VISIBILITY && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function copy(source: FlightInput, target: FlightInput): FlightInput {
  target.throttle = source.throttle;
  target.yaw = source.yaw;
  target.pitch = source.pitch;
  target.roll = source.roll;
  return target;
}
