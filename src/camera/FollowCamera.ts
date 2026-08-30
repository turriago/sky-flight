import { PerspectiveCamera, Vector3 } from "three";
import type { FlightController } from "../player/FlightController";
import { CAMERA } from "../utils/Constants";
import { expDamp } from "../utils/MathUtils";

export class FollowCamera {
  readonly camera: PerspectiveCamera;
  private readonly currentPosition = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly desiredLook = new Vector3();
  private readonly back = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);
  private initialized = false;

  constructor(camera: PerspectiveCamera) {
    this.camera = camera;
  }

  snapTo(flight: FlightController): void {
    this.computeDesired(flight);
    this.currentPosition.copy(this.desiredPosition);
    this.lookAt.copy(this.desiredLook);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.lookAt);
    this.initialized = true;
  }

  update(dt: number, flight: FlightController): void {
    this.computeDesired(flight);

    if (!this.initialized) {
      this.snapTo(flight);
      return;
    }

    const posT = 1 - Math.exp(-CAMERA.POSITION_SMOOTHING * dt);
    this.currentPosition.lerp(this.desiredPosition, posT);

    this.lookAt.x = expDamp(this.lookAt.x, this.desiredLook.x, CAMERA.ROTATION_SMOOTHING, dt);
    this.lookAt.y = expDamp(this.lookAt.y, this.desiredLook.y, CAMERA.ROTATION_SMOOTHING, dt);
    this.lookAt.z = expDamp(this.lookAt.z, this.desiredLook.z, CAMERA.ROTATION_SMOOTHING, dt);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.lookAt);
  }

  private computeDesired(flight: FlightController): void {
    this.back.copy(flight.forward).multiplyScalar(-CAMERA.DISTANCE);
    this.back.y = 0;
    if (this.back.lengthSq() < 0.0001) {
      this.back.set(0, 0, CAMERA.DISTANCE);
    } else {
      this.back.setLength(CAMERA.DISTANCE);
    }

    this.desiredPosition.copy(flight.position).add(this.back);
    this.desiredPosition.y = flight.position.y + CAMERA.HEIGHT;

    this.desiredLook.copy(flight.position).addScaledVector(flight.forward, CAMERA.LOOK_AHEAD);
    this.desiredLook.y = flight.position.y + CAMERA.LOOK_HEIGHT;

    this.camera.up.copy(this.worldUp);
  }
}
