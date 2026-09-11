import { Group, Mesh, MeshBasicMaterial, SphereGeometry, TorusGeometry } from "three";
import type { HuntCrate, HuntItemKind } from "../net/protocol";

const COLORS: Record<HuntItemKind, number> = {
  turbo: 0x7ed0c0,
  wind: 0xf3c27a,
  ammo: 0xef7a6a,
};

export class HuntPickups {
  readonly group = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly ball = new SphereGeometry(1.15, 10, 10);
  private readonly ring = new TorusGeometry(1.7, 0.16, 8, 18);
  private pulse = 0;

  setCrates(crates: HuntCrate[]): void {
    const keep = new Set(crates.map((crate) => crate.id));
    for (const [id, mesh] of this.meshes) {
      if (!keep.has(id)) {
        this.group.remove(mesh);
        this.meshes.delete(id);
      }
    }
    for (const crate of crates) {
      let mesh = this.meshes.get(crate.id);
      if (!mesh) {
        mesh = new Mesh(this.ball, new MeshBasicMaterial({ color: COLORS[crate.kind], transparent: true, opacity: 0.88 }));
        const halo = new Mesh(this.ring, new MeshBasicMaterial({ color: COLORS[crate.kind] }));
        halo.rotation.x = Math.PI / 2;
        mesh.add(halo);
        this.group.add(mesh);
        this.meshes.set(crate.id, mesh);
      }
      mesh.position.set(crate.x, crate.y, crate.z);
    }
  }

  update(dt: number): void {
    this.pulse += dt;
    for (const mesh of this.meshes.values()) {
      mesh.rotation.y += dt * 1.6;
      mesh.scale.setScalar(1 + Math.sin(this.pulse * 3) * 0.08);
    }
  }

  clear(): void {
    this.setCrates([]);
  }
}
