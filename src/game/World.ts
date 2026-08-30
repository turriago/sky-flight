import { Group, Scene } from "three";
import type { AssetManager } from "../assets/AssetManager";
import { Course } from "./Course";
import { Environment } from "./Environment";
import { Lighting } from "./Lighting";
import { Terrain } from "./Terrain";

export class World {
  readonly group = new Group();
  readonly terrain: Terrain;
  readonly environment: Environment;
  readonly lighting: Lighting;
  readonly course: Course;

  constructor(scene: Scene) {
    this.group.name = "World";
    this.lighting = new Lighting(scene);
    this.terrain = new Terrain();
    this.environment = new Environment(scene, this.terrain);
    this.course = new Course();
    this.course.build(this.terrain);
    this.group.add(this.terrain.mesh, this.terrain.water, this.course.group);
    scene.add(this.group);
  }

  async populate(assets: AssetManager): Promise<void> {
    await this.environment.populate(assets, this.terrain);
  }

  getHeightAt(x: number, z: number): number {
    return this.terrain.getHeightAt(x, z);
  }

  hitTest(x: number, y: number, z: number, grounded: boolean): "ground" | "tree" | "rock" | null {
    if (grounded) {
      return "ground";
    }
    const birdRadius = 1.15;
    for (const hazard of this.environment.vegetation.hazards) {
      if (y > hazard.top || y < hazard.y - 0.4) {
        continue;
      }
      const dx = x - hazard.x;
      const dz = z - hazard.z;
      const reach = hazard.radius + birdRadius;
      if (dx * dx + dz * dz <= reach * reach) {
        return hazard.kind;
      }
    }
    return null;
  }

  update(dt: number): void {
    this.terrain.update(dt);
    this.environment.update(dt);
  }
}
