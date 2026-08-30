export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, value: number): number {
  if (Math.abs(b - a) < 1e-8) {
    return 0;
  }
  return (value - a) / (b - a);
}

export function saturate(value: number): number {
  return clamp(value, 0, 1);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = saturate(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

export function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function wrapAngle(radians: number): number {
  let value = radians;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

export function headingToCompass(degrees: number): string {
  const labels = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const index = Math.round(degrees / 45) % 8;
  return labels[(index + 8) % 8];
}

/**
 * Frame-rate independent exponential smoothing.
 * Higher `decay` reaches the target faster.
 */
export function expDamp(current: number, target: number, decay: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-decay * dt));
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
