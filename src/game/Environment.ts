import {
  BackSide,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AssetManager } from "../assets/AssetManager";
import type { Terrain } from "./Terrain";
import { Vegetation, worldTimeUniform } from "./Vegetation";
import { COLORS, VEGETATION, WORLD } from "../utils/Constants";
import { SeededRandom } from "../utils/MathUtils";

const dummy = new Object3D();

function createCloudGeometry() {
  const a = new SphereGeometry(1.6, 6, 5);
  const b = new SphereGeometry(1.2, 6, 5);
  b.translate(1.4, 0.1, 0.2);
  const c = new SphereGeometry(1.05, 6, 5);
  c.translate(-1.3, -0.05, 0.15);
  const d = new SphereGeometry(0.9, 6, 5);
  d.translate(0.4, 0.35, -0.8);
  return mergeGeometries([a, b, c, d], false)!;
}

export class Environment {
  readonly group = new Group();
  readonly vegetation = new Vegetation();
  private readonly clouds: InstancedMesh;
  private readonly mist: InstancedMesh;
  private readonly cloudOrigins: Vector3[] = [];
  private readonly cloudSpeeds: number[] = [];
  private readonly mistOrigins: Vector3[] = [];
  private time = 0;

  constructor(scene: Scene, terrain: Terrain) {
    this.group.name = "Environment";
    this.group.add(this.createSky());

    const rng = new SeededRandom(21);
    this.clouds = this.createClouds(rng, VEGETATION.CLOUD_COUNT, 78, 124, 7, 14, 0.82);
    this.mist = this.createMist(terrain, rng);
    this.group.add(this.clouds, this.mist, this.vegetation.group);
    scene.add(this.group);
  }

  async populate(assets: AssetManager, terrain: Terrain): Promise<void> {
    await this.vegetation.populate(assets, terrain);
  }

  update(dt: number): void {
    this.time += dt;
    worldTimeUniform.value = this.time;
    this.drift(this.clouds, this.cloudOrigins, this.cloudSpeeds, 8);
    this.drift(this.mist, this.mistOrigins, this.cloudSpeeds, 14, 0.35);
  }

  private drift(
    mesh: InstancedMesh,
    origins: Vector3[],
    speeds: number[],
    baseScale: number,
    speedScale = 1,
  ): void {
    const half = WORLD.SIZE * 0.55;
    for (let i = 0; i < mesh.count; i++) {
      const origin = origins[i];
      if (!origin) {
        continue;
      }
      const speed = (speeds[i] ?? 2.2) * speedScale;
      const x = ((origin.x + this.time * speed + half) % (half * 2)) - half;
      dummy.position.set(x, origin.y, origin.z);
      dummy.rotation.set(0, i * 0.4, 0);
      dummy.scale.set(baseScale + (i % 5) * 1.4, (baseScale + (i % 5) * 1.4) * 0.55, baseScale + (i % 5) * 1.4);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private createSky(): Mesh {
    const material = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        zenith: { value: new Color(COLORS.SKY_ZENITH) },
        horizon: { value: new Color(COLORS.SKY_HORIZON) },
        sunColor: { value: new Color(0xffd7a0) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDir = normalize(world.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 zenith;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        void main() {
          float h = clamp(vDir.y * 0.72 + 0.28, 0.0, 1.0);
          vec3 color = mix(horizon, zenith, pow(h, 0.82));
          vec3 sunDir = normalize(vec3(0.42, 0.28, 0.22));
          float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 48.0);
          color += sunColor * sun * 0.55;
          color += sunColor * pow(max(dot(normalize(vDir), sunDir), 0.0), 6.0) * 0.12;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const sky = new Mesh(new SphereGeometry(380, 24, 16), material);
    sky.frustumCulled = false;
    sky.name = "Sky";
    return sky;
  }

  private createClouds(
    rng: SeededRandom,
    count: number,
    minY: number,
    maxY: number,
    minScale: number,
    maxScale: number,
    opacity: number,
  ): InstancedMesh {
    const mesh = new InstancedMesh(
      createCloudGeometry(),
      new MeshStandardMaterial({
        color: 0xf7fbff,
        roughness: 1,
        emissive: 0xf2f7fb,
        emissiveIntensity: 0.42,
        transparent: true,
        opacity,
        flatShading: true,
        depthWrite: false,
      }),
      count,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const origin = new Vector3(
        rng.range(-WORLD.SIZE * 0.45, WORLD.SIZE * 0.45),
        rng.range(minY, maxY),
        rng.range(-WORLD.SIZE * 0.45, WORLD.SIZE * 0.45),
      );
      this.cloudOrigins.push(origin);
      this.cloudSpeeds.push(rng.range(1.4, 4.0));
      dummy.position.copy(origin);
      dummy.scale.setScalar(rng.range(minScale, maxScale));
      dummy.rotation.y = rng.range(0, Math.PI * 2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    return mesh;
  }

  private createMist(terrain: Terrain, rng: SeededRandom): InstancedMesh {
    const mesh = new InstancedMesh(
      createCloudGeometry(),
      new MeshStandardMaterial({
        color: 0xd7e8ee,
        roughness: 1,
        transparent: true,
        opacity: 0.22,
        flatShading: true,
        depthWrite: false,
      }),
      16,
    );
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;

    let placed = 0;
    let attempts = 0;
    while (placed < mesh.count && attempts < 80) {
      attempts += 1;
      const x = rng.range(-WORLD.SIZE * 0.4, WORLD.SIZE * 0.4);
      const z = rng.range(-WORLD.SIZE * 0.4, WORLD.SIZE * 0.4);
      const height = terrain.getHeightAt(x, z);
      if (height > 28) continue;
      const origin = new Vector3(x, height + rng.range(4, 11), z);
      this.mistOrigins.push(origin);
      dummy.position.copy(origin);
      dummy.scale.set(18, 6, 18);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    mesh.count = placed;
    return mesh;
  }
}
