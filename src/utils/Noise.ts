import { fade, lerp } from "./MathUtils";

function hash2(x: number, z: number, seed: number): number {
  let n = x * 374761393 + z * 668265263 + seed * 1274126177;
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) & 0x7fffffff) / 0x7fffffff;
}

export function valueNoise2D(x: number, z: number, seed = 1): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);

  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);

  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function fbm2D(
  x: number,
  z: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5,
  seed = 1,
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, z * frequency, seed + i * 19);
    total += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / total;
}

export function ridged2D(x: number, z: number, octaves = 4, seed = 7): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;

  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * frequency, z * frequency, seed + i * 31) * 2 - 1);
    value += n * n * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.05;
  }

  return value / total;
}
