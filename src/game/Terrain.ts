import {
  BufferAttribute,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import { COLORS, WORLD } from "../utils/Constants";
import { clamp, lerp, smoothstep } from "../utils/MathUtils";
import { fbm2D, ridged2D } from "../utils/Noise";

export class Terrain {
  readonly mesh: Mesh;
  readonly water: Mesh;
  private readonly resolution: number;
  private readonly heights: Float32Array;
  private readonly color = new Color();
  private readonly grass = new Color(COLORS.GRASS);
  private readonly grassDry = new Color(COLORS.GRASS_DRY);
  private readonly dirt = new Color(COLORS.DIRT);
  private readonly rock = new Color(COLORS.ROCK);
  private readonly snow = new Color(COLORS.SNOW);
  private readonly sand = new Color(0xc2b07a);
  private waterTime = 0;
  private readonly waterTimeUniform = { value: 0 };

  constructor() {
    this.resolution = WORLD.SEGMENTS + 1;
    this.heights = new Float32Array(this.resolution * this.resolution);

    const geometry = new PlaneGeometry(WORLD.SIZE, WORLD.SIZE, WORLD.SEGMENTS, WORLD.SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const height = this.computeHeight(x, z);
      position.setY(i, height);

      const u = Math.round(((x / WORLD.SIZE) + 0.5) * WORLD.SEGMENTS);
      const v = Math.round(((z / WORLD.SIZE) + 0.5) * WORLD.SEGMENTS);
      this.heights[v * this.resolution + u] = height;
    }

    geometry.computeVertexNormals();

    const normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      this.shadeVertex(
        position.getY(i),
        normal.getY(i),
        position.getX(i),
        position.getZ(i),
      );
      colors[i * 3] = this.color.r;
      colors[i * 3 + 1] = this.color.g;
      colors[i * 3 + 2] = this.color.b;
    }

    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });

    this.mesh = new Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = "Terrain";
    this.water = this.createWater();
  }

  update(dt: number): void {
    this.waterTime += dt;
    this.waterTimeUniform.value = this.waterTime;
  }

  getHeightAt(x: number, z: number): number {
    const half = WORLD.SIZE * 0.5;
    const u = ((x + half) / WORLD.SIZE) * WORLD.SEGMENTS;
    const v = ((z + half) / WORLD.SIZE) * WORLD.SEGMENTS;
    const u0 = clamp(Math.floor(u), 0, WORLD.SEGMENTS - 1);
    const v0 = clamp(Math.floor(v), 0, WORLD.SEGMENTS - 1);
    const u1 = u0 + 1;
    const v1 = v0 + 1;
    const su = u - u0;
    const sv = v - v0;

    const h00 = this.heights[v0 * this.resolution + u0];
    const h10 = this.heights[v0 * this.resolution + u1];
    const h01 = this.heights[v1 * this.resolution + u0];
    const h11 = this.heights[v1 * this.resolution + u1];

    return lerp(lerp(h00, h10, su), lerp(h01, h11, su), sv);
  }

  getSlopeAt(x: number, z: number): number {
    const step = WORLD.SIZE / WORLD.SEGMENTS;
    const hL = this.getHeightAt(x - step, z);
    const hR = this.getHeightAt(x + step, z);
    const hD = this.getHeightAt(x, z - step);
    const hU = this.getHeightAt(x, z + step);
    const dx = (hR - hL) / (step * 2);
    const dz = (hU - hD) / (step * 2);
    return Math.hypot(dx, dz);
  }

  computeHeight(x: number, z: number): number {
    const nx = x / (WORLD.SIZE * 0.5);
    const nz = z / (WORLD.SIZE * 0.5);

    const hills = (fbm2D(nx * 2.05 + 4.1, nz * 2.05 + 1.7, 5, 2, 0.5, 3) - 0.5) * 17;
    const detail = (fbm2D(nx * 7.5, nz * 7.5, 3, 2.1, 0.46, 12) - 0.5) * 3.4;
    const ridge = ridged2D(nx * 1.32 + 1.15, nz * 1.08 + 0.18, 4, 8);
    const mountainMask = smoothstep(0.1, 0.66, -nx * 0.58 + nz * 0.14 + 0.4);
    const mountains = Math.pow(Math.max(0, ridge - 0.3), 1.26) * WORLD.MAX_HEIGHT * mountainMask;

    const ridgeB = ridged2D(nx * 1.7 - 0.8, nz * 1.4 + 1.1, 3, 19);
    const hillRange = Math.pow(Math.max(0, ridgeB - 0.42), 1.35) * 28 * smoothstep(0.15, 0.55, nx * 0.7 - nz * 0.2 + 0.2);

    let height = WORLD.BASE_HEIGHT + hills + detail + mountains + hillRange;

    const valley = Math.exp(-(nx * nx) / 0.2 - ((nz - 0.12) * (nz - 0.12)) / 0.78);
    height -= valley * 11;

    const meadow = Math.exp(-((nx + 0.08) ** 2) / 0.12 - ((nz - 0.42) ** 2) / 0.16);
    height = lerp(height, WORLD.WATER_LEVEL + 8.5, meadow * 0.55);

    const lakeX = nx - 0.4;
    const lakeZ = nz + 0.06;
    const lakeD = lakeX * lakeX * 1.15 + lakeZ * lakeZ * 1.55;
    if (lakeD < 0.11) {
      const basin = smoothstep(0.11, 0.016, lakeD);
      height = lerp(height, WORLD.WATER_LEVEL - 3.4, basin);
    }

    const riverCenter = 0.4 + 0.09 * Math.sin(nz * 7.2) + 0.035 * Math.sin(nz * 3.1);
    const riverWidth = 0.048 + 0.014 * Math.sin(nz * 4.4);
    const onRiver = nz > -0.88 && nz < 0.28 && nx > 0.12;
    if (onRiver) {
      const riverDistance = Math.abs(nx - riverCenter);
      const carve = smoothstep(riverWidth, 0.006, riverDistance);
      height = lerp(height, WORLD.WATER_LEVEL - 1.7, carve);
    }

    return height;
  }

  private createWater(): Mesh {
    const geometry = new PlaneGeometry(WORLD.SIZE * 0.98, WORLD.SIZE * 0.98, 48, 48);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshStandardMaterial({
      color: COLORS.WATER,
      roughness: 0.12,
      metalness: 0.18,
      transparent: true,
      opacity: 0.82,
      flatShading: true,
    });

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterTimeUniform;
      shader.uniforms.uDeep = { value: new Color(COLORS.WATER_DEEP) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vWave;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           vWave = sin(uTime * 0.75 + position.x * 0.09 + position.z * 0.07) * 0.22
                 + sin(uTime * 1.25 + position.z * 0.16) * 0.09;
           transformed.y += vWave;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vWave;\nuniform vec3 uDeep;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           diffuseColor.rgb = mix(diffuseColor.rgb, uDeep, smoothstep(-0.12, 0.22, vWave) * 0.35);`,
        );
    };
    material.customProgramCacheKey = () => "skyflight-water";

    const water = new Mesh(geometry, material);
    water.position.y = WORLD.WATER_LEVEL;
    water.receiveShadow = true;
    water.name = "Water";
    return water;
  }

  private shadeVertex(height: number, normalY: number, x: number, z: number): void {
    const slope = 1 - clamp(normalY, 0, 1);
    const moisture = fbm2D(x * 0.018, z * 0.018, 3, 2, 0.5, 21);

    if (height < WORLD.WATER_LEVEL + 1.6) {
      this.color.copy(this.sand).lerp(this.dirt, smoothstep(WORLD.WATER_LEVEL - 1, WORLD.WATER_LEVEL + 1.6, height));
    } else if (slope > 0.5 || height > 60) {
      this.color.copy(this.rock);
      if (height > 70) {
        this.color.lerp(this.snow, smoothstep(70, 80, height));
      }
    } else {
      this.color.copy(this.grass).lerp(this.grassDry, moisture * 0.75);
      this.color.lerp(this.rock, smoothstep(0.28, 0.5, slope) * 0.7);
      this.color.lerp(this.dirt, smoothstep(WORLD.WATER_LEVEL + 1.6, WORLD.WATER_LEVEL + 5, height) * 0.18);
    }
  }
}
