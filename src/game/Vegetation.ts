import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AssetManager } from "../assets/AssetManager";
import type { Terrain } from "./Terrain";
import { bakeGltfGeometry } from "../utils/GltfUtils";
import { VEGETATION, WORLD } from "../utils/Constants";
import { SeededRandom } from "../utils/MathUtils";

export const worldTimeUniform = { value: 0 };

export interface Hazard {
  x: number;
  y: number;
  z: number;
  radius: number;
  top: number;
  kind: "tree" | "rock";
}

const dummy = new Object3D();
const tint = new Color();

interface ScatterSpec {
  url: string;
  count: number;
  minHeight: number;
  maxHeight: number;
  maxSlope: number;
  minScale: number;
  maxScale: number;
  wind: boolean;
  preferSteep?: boolean;
  nearWater?: boolean;
}

const KENNEY_TREES: ScatterSpec[] = [
  {
    url: "/models/nature/tree_pineTallA.glb",
    count: 80,
    minHeight: WORLD.WATER_LEVEL + 2.6,
    maxHeight: 54,
    maxSlope: 0.38,
    minScale: 4.4,
    maxScale: 7.8,
    wind: true,
  },
  {
    url: "/models/nature/tree_pineTallC.glb",
    count: 70,
    minHeight: WORLD.WATER_LEVEL + 2.8,
    maxHeight: 58,
    maxSlope: 0.4,
    minScale: 4.6,
    maxScale: 8.2,
    wind: true,
  },
  {
    url: "/models/nature/tree_oak.glb",
    count: 48,
    minHeight: WORLD.WATER_LEVEL + 2.2,
    maxHeight: 38,
    maxSlope: 0.28,
    minScale: 3.6,
    maxScale: 6.2,
    wind: true,
  },
  {
    url: "/models/nature/tree_default.glb",
    count: 40,
    minHeight: WORLD.WATER_LEVEL + 2.4,
    maxHeight: 42,
    maxSlope: 0.3,
    minScale: 3.8,
    maxScale: 6.4,
    wind: true,
  },
  {
    url: "/models/nature/tree_fat.glb",
    count: 28,
    minHeight: WORLD.WATER_LEVEL + 2.2,
    maxHeight: 34,
    maxSlope: 0.26,
    minScale: 3.4,
    maxScale: 5.6,
    wind: true,
  },
];

const KENNEY_ROCKS: ScatterSpec[] = [
  {
    url: "/models/nature/rock_largeA.glb",
    count: 28,
    minHeight: WORLD.WATER_LEVEL + 0.5,
    maxHeight: 78,
    maxSlope: 0.95,
    minScale: 2.4,
    maxScale: 5.2,
    wind: false,
    preferSteep: true,
  },
  {
    url: "/models/nature/rock_largeC.glb",
    count: 24,
    minHeight: WORLD.WATER_LEVEL + 0.4,
    maxHeight: 72,
    maxSlope: 0.9,
    minScale: 2.2,
    maxScale: 4.8,
    wind: false,
    preferSteep: true,
  },
  {
    url: "/models/nature/rock_tallA.glb",
    count: 18,
    minHeight: WORLD.WATER_LEVEL + 1,
    maxHeight: 80,
    maxSlope: 0.95,
    minScale: 2.6,
    maxScale: 5.4,
    wind: false,
    preferSteep: true,
  },
  {
    url: "/models/nature/rock_smallA.glb",
    count: 36,
    minHeight: WORLD.WATER_LEVEL + 0.3,
    maxHeight: 64,
    maxSlope: 0.8,
    minScale: 1.8,
    maxScale: 3.6,
    wind: false,
  },
  {
    url: "/models/nature/rock_smallFlatA.glb",
    count: 22,
    minHeight: WORLD.WATER_LEVEL + 0.2,
    maxHeight: 36,
    maxSlope: 0.45,
    minScale: 1.6,
    maxScale: 3.2,
    wind: false,
  },
];

const KENNEY_PLANTS: ScatterSpec[] = [
  {
    url: "/models/nature/plant_bushLarge.glb",
    count: 50,
    minHeight: WORLD.WATER_LEVEL + 1.5,
    maxHeight: 32,
    maxSlope: 0.28,
    minScale: 2.4,
    maxScale: 4.2,
    wind: true,
  },
  {
    url: "/models/nature/plant_bushDetailed.glb",
    count: 40,
    minHeight: WORLD.WATER_LEVEL + 1.6,
    maxHeight: 30,
    maxSlope: 0.26,
    minScale: 2.2,
    maxScale: 3.8,
    wind: true,
  },
  {
    url: "/models/nature/grass_large.glb",
    count: 90,
    minHeight: WORLD.WATER_LEVEL + 1.4,
    maxHeight: 28,
    maxSlope: 0.22,
    minScale: 1.8,
    maxScale: 3.1,
    wind: true,
  },
  {
    url: "/models/nature/flower_yellowA.glb",
    count: 40,
    minHeight: WORLD.WATER_LEVEL + 1.8,
    maxHeight: 26,
    maxSlope: 0.2,
    minScale: 1.6,
    maxScale: 2.6,
    wind: true,
  },
  {
    url: "/models/nature/grass.glb",
    count: 70,
    minHeight: WORLD.WATER_LEVEL + 1.5,
    maxHeight: 26,
    maxSlope: 0.2,
    minScale: 1.7,
    maxScale: 2.8,
    wind: true,
  },
  {
    url: "/models/nature/flower_redA.glb",
    count: 28,
    minHeight: WORLD.WATER_LEVEL + 1.8,
    maxHeight: 24,
    maxSlope: 0.18,
    minScale: 1.5,
    maxScale: 2.4,
    wind: true,
  },
  {
    url: "/models/nature/lily_large.glb",
    count: 24,
    minHeight: WORLD.WATER_LEVEL - 0.4,
    maxHeight: WORLD.WATER_LEVEL + 1.1,
    maxSlope: 0.18,
    minScale: 1.8,
    maxScale: 3.2,
    wind: false,
    nearWater: true,
  },
];

function paintGeometry(
  geometry: ConeGeometry | CylinderGeometry | DodecahedronGeometry | IcosahedronGeometry,
  color: number,
  variation = 0.04,
): BufferGeometry {
  const painted = geometry.toNonIndexed();
  const count = painted.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const base = new Color(color);

  for (let i = 0; i < count; i++) {
    const shade = 1 - variation * 0.5 + ((i * 17) % 10) * variation * 0.1;
    colors[i * 3] = base.r * shade;
    colors[i * 3 + 1] = base.g * shade;
    colors[i * 3 + 2] = base.b * shade;
  }

  painted.setAttribute("color", new BufferAttribute(colors, 3));
  return painted;
}

function createPineGeometry() {
  const trunk = paintGeometry(new CylinderGeometry(0.18, 0.28, 2.2, 5), 0x6a4a2f);
  trunk.translate(0, 1.1, 0);
  const leavesA = paintGeometry(new ConeGeometry(1.55, 2.6, 6), 0x2f6a3a);
  leavesA.translate(0, 2.7, 0);
  const leavesB = paintGeometry(new ConeGeometry(1.15, 2.1, 6), 0x3a7d44);
  leavesB.translate(0, 3.8, 0);
  const leavesC = paintGeometry(new ConeGeometry(0.7, 1.5, 6), 0x4a8d52);
  leavesC.translate(0, 4.8, 0);
  return mergeGeometries([trunk, leavesA, leavesB, leavesC], false)!;
}

function createRoundTreeGeometry() {
  const trunk = paintGeometry(new CylinderGeometry(0.2, 0.3, 1.7, 5), 0x735334);
  trunk.translate(0, 0.85, 0);
  const crown = paintGeometry(new IcosahedronGeometry(1.55, 0), 0x4d8f46);
  crown.translate(0, 2.45, 0);
  const crownB = paintGeometry(new IcosahedronGeometry(1.15, 0), 0x3d7a3c);
  crownB.translate(0.35, 2.15, 0.15);
  return mergeGeometries([trunk, crown, crownB], false)!;
}

function createBushGeometry() {
  const a = paintGeometry(new IcosahedronGeometry(0.55, 0), 0x4d7d3c);
  const b = paintGeometry(new IcosahedronGeometry(0.4, 0), 0x3e6b32);
  b.translate(0.28, 0.05, 0.1);
  return mergeGeometries([a, b], false)!;
}

function createRockGeometry(seed: number) {
  const geometry = paintGeometry(new DodecahedronGeometry(1, 0), seed === 0 ? 0x7d776d : 0x8a8174, 0.08);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const squash = 0.55 + (seed % 2) * 0.2;
    position.setXYZ(i, x * (0.85 + (i % 5) * 0.04), y * squash, z * (0.9 + (i % 3) * 0.05));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function foliageMaterial(wind: boolean): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    flatShading: true,
  });

  if (!wind) {
    return material;
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float sway = sin(uTime * 1.15 + transformed.x * 0.35 + transformed.z * 0.28) * max(transformed.y, 0.0) * 0.042;
         transformed.x += sway;
         transformed.z += sway * 0.55;`,
      );
  };
  material.customProgramCacheKey = () => "skyflight-foliage-wind";
  return material;
}

export class Vegetation {
  readonly group = new Group();
  readonly hazards: Hazard[] = [];

  constructor() {
    this.group.name = "Vegetation";
  }

  async populate(assets: AssetManager, terrain: Terrain): Promise<void> {
    const rng = new SeededRandom(42);
    const kenneyLoaded = await this.scatterKenney(assets, terrain, rng);
    if (!kenneyLoaded) {
      this.scatterProcedural(terrain, rng);
    }
  }

  private async scatterKenney(assets: AssetManager, terrain: Terrain, rng: SeededRandom): Promise<boolean> {
    const specs = [...KENNEY_TREES, ...KENNEY_ROCKS, ...KENNEY_PLANTS];
    let placedAny = false;

    for (const spec of specs) {
      const gltf = await assets.tryLoadModel(spec.url);
      if (!gltf) {
        continue;
      }
      const geometry = bakeGltfGeometry(gltf.scene);
      if (!geometry) {
        continue;
      }

      const mesh = new InstancedMesh(geometry, foliageMaterial(spec.wind), spec.count);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = spec.url.split("/").pop() ?? "kenney";
      this.placeOnLand(mesh, terrain, rng, spec);
      this.group.add(mesh);
      placedAny = true;
    }

    return placedAny;
  }

  private scatterProcedural(terrain: Terrain, rng: SeededRandom): void {
    const pines = new InstancedMesh(createPineGeometry(), foliageMaterial(true), Math.floor(VEGETATION.TREE_COUNT * 0.6));
    const rounds = new InstancedMesh(createRoundTreeGeometry(), foliageMaterial(true), Math.floor(VEGETATION.TREE_COUNT * 0.4));
    const bushes = new InstancedMesh(createBushGeometry(), foliageMaterial(true), VEGETATION.BUSH_COUNT);
    const rocksA = new InstancedMesh(createRockGeometry(0), foliageMaterial(false), Math.floor(VEGETATION.ROCK_COUNT * 0.55));
    const rocksB = new InstancedMesh(createRockGeometry(1), foliageMaterial(false), Math.floor(VEGETATION.ROCK_COUNT * 0.45));

    this.placeOnLand(pines, terrain, rng, {
      count: pines.count,
      minHeight: WORLD.WATER_LEVEL + 2.4,
      maxHeight: 52,
      maxSlope: 0.38,
      minScale: 1.1,
      maxScale: 2.1,
      wind: true,
      url: "pine",
    });
    this.placeOnLand(rounds, terrain, rng, {
      count: rounds.count,
      minHeight: WORLD.WATER_LEVEL + 2.2,
      maxHeight: 42,
      maxSlope: 0.32,
      minScale: 0.95,
      maxScale: 1.7,
      wind: true,
      url: "round",
    });
    this.placeOnLand(bushes, terrain, rng, {
      count: bushes.count,
      minHeight: WORLD.WATER_LEVEL + 1.6,
      maxHeight: 34,
      maxSlope: 0.3,
      minScale: 0.8,
      maxScale: 1.6,
      wind: true,
      url: "bush",
    });
    this.placeOnLand(rocksA, terrain, rng, {
      count: rocksA.count,
      minHeight: WORLD.WATER_LEVEL + 0.6,
      maxHeight: 78,
      maxSlope: 0.9,
      minScale: 0.7,
      maxScale: 2.4,
      wind: false,
      preferSteep: true,
      url: "rock-a",
    });
    this.placeOnLand(rocksB, terrain, rng, {
      count: rocksB.count,
      minHeight: WORLD.WATER_LEVEL + 0.4,
      maxHeight: 70,
      maxSlope: 0.85,
      minScale: 0.5,
      maxScale: 1.8,
      wind: false,
      preferSteep: true,
      url: "rock-b",
    });

    pines.castShadow = true;
    rounds.castShadow = true;
    bushes.castShadow = true;
    rocksA.castShadow = true;
    rocksB.castShadow = true;
    this.group.add(pines, rounds, bushes, rocksA, rocksB);
  }

  private placeOnLand(mesh: InstancedMesh, terrain: Terrain, rng: SeededRandom, spec: ScatterSpec): void {
    let placed = 0;
    let attempts = 0;
    const maxAttempts = spec.count * 20;

    while (placed < spec.count && attempts < maxAttempts) {
      attempts += 1;
      const x = rng.range(-WORLD.SIZE * 0.46, WORLD.SIZE * 0.46);
      const z = rng.range(-WORLD.SIZE * 0.46, WORLD.SIZE * 0.46);
      const height = terrain.getHeightAt(x, z);
      const slope = terrain.getSlopeAt(x, z);

      if (height < spec.minHeight || height > spec.maxHeight) continue;
      if (slope > spec.maxSlope) continue;
      if (!spec.preferSteep && slope > spec.maxSlope * 0.85 && rng.next() < 0.55) continue;
      if (spec.nearWater && Math.abs(height - WORLD.WATER_LEVEL) > 1.2) continue;

      const scale = rng.range(spec.minScale, spec.maxScale);
      dummy.position.set(x, height, z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(scale, scale * rng.range(0.94, 1.08), scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);

      const hazard = hazardFor(spec.url, scale, height);
      if (hazard) {
        this.hazards.push(hazard);
      }

      tint.setRGB(0.92 + rng.range(0, 0.08), 0.94 + rng.range(0, 0.06), 0.9 + rng.range(0, 0.08));
      mesh.setColorAt(placed, tint);
      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }
}

function hazardFor(url: string, scale: number, height: number): Hazard | null {
  const name = url.toLowerCase();
  if (name.includes("tree") || name.includes("pine") || name.includes("oak") || name === "pine" || name === "round") {
    return {
      x: dummy.position.x,
      y: height,
      z: dummy.position.z,
      radius: Math.max(1.8, scale * 0.36),
      top: height + Math.max(16, scale * 2.6),
      kind: "tree",
    };
  }
  if (name.includes("rock_large") || name.includes("rock_tall") || name.startsWith("rock-")) {
    return {
      x: dummy.position.x,
      y: height,
      z: dummy.position.z,
      radius: Math.max(1.4, scale * 0.58),
      top: height + scale * 0.85,
      kind: "rock",
    };
  }
  return null;
}
