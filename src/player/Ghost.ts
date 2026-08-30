import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Object3DEventMap,
} from "three";

export interface GhostSample {
  t: number;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export class Ghost {
  readonly group = new Group();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly qa = new Quaternion();
  private readonly qb = new Quaternion();
  private tape: GhostSample[] = [];
  private flap = 0;

  constructor(template: Object3D) {
    this.group.name = "Ghost";
    const visual = template.clone(true);
    visual.traverse((child: Object3D<Object3DEventMap>) => {
      if (!(child instanceof Mesh)) {
        return;
      }
      const material = Array.isArray(child.material) ? child.material[0] : child.material;
      const ghostMat = (material as MeshStandardMaterial).clone();
      ghostMat.transparent = true;
      ghostMat.opacity = 0.38;
      ghostMat.depthWrite = false;
      ghostMat.emissive = new Color(0x7ed0c0);
      ghostMat.emissiveIntensity = 0.55;
      ghostMat.blending = AdditiveBlending;
      child.material = ghostMat;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    this.group.add(visual);
    this.group.visible = false;
  }

  setTape(tape: GhostSample[] | null): void {
    this.tape = tape && tape.length > 1 ? tape : [];
    this.group.visible = this.tape.length > 1;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(time: number, dt: number): void {
    if (!this.group.visible || this.tape.length < 2) {
      return;
    }

    const sample = this.sampleAt(Math.max(0, time));
    this.group.position.set(sample.x, sample.y, sample.z);
    this.group.quaternion.set(sample.qx, sample.qy, sample.qz, sample.qw);

    this.flap += dt * 5.2;
    const left = this.group.getObjectByName("WingLeft");
    const right = this.group.getObjectByName("WingRight");
    const wing = Math.sin(this.flap) * 0.16;
    if (left) left.rotation.z = 0.18 + wing;
    if (right) right.rotation.z = -0.18 - wing;
  }

  private sampleAt(time: number): GhostSample {
    const tape = this.tape;
    if (time <= tape[0].t) {
      return tape[0];
    }
    const last = tape[tape.length - 1];
    if (time >= last.t) {
      return last;
    }

    let high = tape.length - 1;
    let low = 0;
    while (high - low > 1) {
      const mid = (high + low) >> 1;
      if (tape[mid].t <= time) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const a = tape[low];
    const b = tape[high];
    const alpha = (time - a.t) / Math.max(0.0001, b.t - a.t);
    this.from.set(a.x, a.y, a.z);
    this.to.set(b.x, b.y, b.z);
    this.from.lerp(this.to, alpha);
    this.qa.set(a.qx, a.qy, a.qz, a.qw);
    this.qb.set(b.qx, b.qy, b.qz, b.qw);
    this.qa.slerp(this.qb, alpha);
    return {
      t: time,
      x: this.from.x,
      y: this.from.y,
      z: this.from.z,
      qx: this.qa.x,
      qy: this.qa.y,
      qz: this.qa.z,
      qw: this.qa.w,
    };
  }
}
