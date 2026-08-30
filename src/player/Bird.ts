import {
  AnimationMixer,
  BoxGeometry,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type Object3DEventMap,
} from "three";
import { BirdAnimation } from "./BirdAnimation";
import type { FlightController } from "./FlightController";

export class Bird {
  readonly group = new Group();
  private readonly visual = new Group();
  private animation: BirdAnimation;
  private mixer: AnimationMixer | null = null;
  private usingPlaceholder = true;

  constructor() {
    this.visual.name = "BirdVisual";
    this.group.name = "Bird";
    this.group.add(this.visual);
    this.buildPlaceholder();
    this.animation = new BirdAnimation(this.visual);
  }

  get isPlaceholder(): boolean {
    return this.usingPlaceholder;
  }

  get visualRoot(): Group {
    return this.visual;
  }

  setModel(root: Object3D, mixer?: AnimationMixer): void {
    this.disposeVisual();
    this.visual.add(root);
    this.mixer = mixer ?? new AnimationMixer(root);
    this.usingPlaceholder = false;
    this.animation = new BirdAnimation(this.visual);
  }

  update(dt: number, flight: FlightController): void {
    this.group.position.copy(flight.position);
    this.group.quaternion.copy(flight.quaternion);
    this.mixer?.update(dt);
    this.animation.update(dt, flight);
  }

  private buildPlaceholder(): void {
    const bodyMat = new MeshStandardMaterial({
      color: 0xc4783a,
      roughness: 0.62,
      metalness: 0.04,
    });
    const bellyMat = new MeshStandardMaterial({
      color: 0xf0d7b0,
      roughness: 0.72,
    });
    const darkMat = new MeshStandardMaterial({
      color: 0x2b2118,
      roughness: 0.5,
    });
    const wingMat = new MeshStandardMaterial({
      color: 0x8a4d28,
      roughness: 0.58,
    });

    const body = new Mesh(new SphereGeometry(0.46, 7, 6), bodyMat);
    body.scale.set(0.95, 0.62, 1.85);
    body.castShadow = true;
    this.visual.add(body);

    const belly = new Mesh(new SphereGeometry(0.38, 7, 6), bellyMat);
    belly.scale.set(0.82, 0.4, 1.55);
    belly.position.set(0, -0.12, 0.05);
    this.visual.add(belly);

    const head = new Mesh(new SphereGeometry(0.28, 7, 6), bodyMat);
    head.position.set(0, 0.18, -0.78);
    head.scale.set(1, 0.9, 1.08);
    head.castShadow = true;
    this.visual.add(head);

    const beak = new Mesh(new ConeGeometry(0.08, 0.28, 5), darkMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.12, -1.08);
    this.visual.add(beak);

    const eyeGeom = new SphereGeometry(0.045, 6, 5);
    const leftEye = new Mesh(eyeGeom, darkMat);
    leftEye.position.set(-0.14, 0.24, -0.94);
    const rightEye = leftEye.clone();
    rightEye.position.x *= -1;
    this.visual.add(leftEye, rightEye);

    const tail = new Mesh(new BoxGeometry(0.42, 0.06, 0.55), wingMat);
    tail.position.set(0, 0.04, 0.92);
    tail.rotation.x = 0.22;
    tail.castShadow = true;
    this.visual.add(tail);

    this.visual.add(this.createWing("WingLeft", -1, wingMat));
    this.visual.add(this.createWing("WingRight", 1, wingMat));
  }

  private createWing(name: string, side: number, material: MeshStandardMaterial): Group {
    const pivot = new Group();
    pivot.name = name;
    pivot.position.set(0.22 * side, 0.08, -0.08);

    const inner = new Mesh(new BoxGeometry(1.15, 0.07, 0.42), material);
    inner.position.set(0.58 * side, 0, 0);
    inner.rotation.y = -0.12 * side;
    inner.castShadow = true;

    const tip = new Mesh(new BoxGeometry(0.72, 0.05, 0.28), material);
    tip.position.set(1.18 * side, 0.01, 0.08);
    tip.rotation.y = -0.28 * side;
    tip.rotation.z = 0.08 * side;
    tip.castShadow = true;

    pivot.add(inner, tip);
    return pivot;
  }

  private disposeVisual(): void {
    this.visual.traverse((child: Object3D<Object3DEventMap>) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.visual.clear();
  }
}
