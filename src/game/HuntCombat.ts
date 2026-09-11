import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { HUNT } from "../utils/Constants";

interface Bolt {
  mesh: Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  local: boolean;
}

export class HuntCombat {
  readonly group = new Group();
  private readonly bolts: Bolt[] = [];
  private readonly geo = new SphereGeometry(0.36, 8, 8);
  private readonly localMat = new MeshBasicMaterial({ color: 0xffe08a });
  private readonly remoteMat = new MeshBasicMaterial({ color: 0xef7a6a });

  spawn(x: number, y: number, z: number, dx: number, dy: number, dz: number, local: boolean): void {
    const mesh = new Mesh(this.geo, local ? this.localMat : this.remoteMat);
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    const len = Math.hypot(dx, dy, dz) || 1;
    this.bolts.push({
      mesh,
      vx: (dx / len) * HUNT.PROJECTILE_SPEED,
      vy: (dy / len) * HUNT.PROJECTILE_SPEED,
      vz: (dz / len) * HUNT.PROJECTILE_SPEED,
      life: HUNT.PROJECTILE_LIFE,
      local,
    });
  }

  update(dt: number, target: Vector3 | null): boolean {
    let hit = false;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.life -= dt;
      bolt.mesh.position.x += bolt.vx * dt;
      bolt.mesh.position.y += bolt.vy * dt;
      bolt.mesh.position.z += bolt.vz * dt;
      if (bolt.local && target && bolt.mesh.position.distanceTo(target) <= HUNT.HIT_RADIUS) {
        hit = true;
        this.removeAt(i);
        continue;
      }
      if (bolt.life <= 0) {
        this.removeAt(i);
      }
    }
    return hit;
  }

  clear(): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.removeAt(i);
    }
  }

  private removeAt(index: number): void {
    const bolt = this.bolts[index];
    if (!bolt) {
      return;
    }
    this.group.remove(bolt.mesh);
    this.bolts.splice(index, 1);
  }
}
