import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Scene,
} from "three";
import { COLORS, WORLD } from "../utils/Constants";

export class Lighting {
  readonly sun: DirectionalLight;
  readonly hemi: HemisphereLight;

  constructor(scene: Scene) {
    scene.background = new Color(COLORS.FOG);
    scene.fog = new Fog(COLORS.FOG, 48, 330);

    this.hemi = new HemisphereLight(0xb7d6ea, 0x6e5a40, 0.78);
    scene.add(this.hemi);

    this.sun = new DirectionalLight(0xffe4b0, 1.72);
    this.sun.position.set(140, 128, 46);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;

    const extent = WORLD.SIZE * 0.55;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 520;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }
}
