export const WORLD = {
  SIZE: 520,
  SEGMENTS: 160,
  MAX_HEIGHT: 86,
  BASE_HEIGHT: 14,
  WATER_LEVEL: 9.2,
  EDGE_MARGIN: 18,
} as const;

export const FLIGHT = {
  MIN_SPEED: 10,
  MAX_SPEED: 52,
  CRUISE_SPEED: 24,
  ACCELERATION: 16,
  DECELERATION: 14,
  YAW_RATE: 1.35,
  PITCH_RATE: 1.15,
  ROLL_RATE: 2.2,
  MAX_PITCH: 0.52,
  MAX_ROLL: 0.72,
  BANK_FROM_YAW: 0.55,
  DIVE_BOOST: 10,
  GRAVITY: 7.5,
  MIN_CLEARANCE: 5.5,
  MAX_ALTITUDE: 128,
  INPUT_SMOOTHING: 7,
  POSE_SMOOTHING: 5,
} as const;

export const CAMERA = {
  DISTANCE: 16,
  HEIGHT: 5.4,
  LOOK_AHEAD: 10,
  LOOK_HEIGHT: 1.4,
  POSITION_SMOOTHING: 4.2,
  ROTATION_SMOOTHING: 5.4,
} as const;

export const VEGETATION = {
  TREE_COUNT: 220,
  ROCK_COUNT: 110,
  BUSH_COUNT: 90,
  CLOUD_COUNT: 34,
} as const;

export const COURSE = {
  RING_RADIUS: 7.2,
  RING_TUBE: 0.42,
  PASS_RADIUS: 8.4,
  BEST_KEY: "sky-flight-best-run",
  HIT_PENALTY: 2.5,
  HIT_COOLDOWN: 1.15,
  GHOST_HZ: 12,
  ROUTE: [
    [8, 96],
    [18, 64],
    [36, 34],
    [62, 8],
    [82, -24],
    [58, -56],
    [22, -78],
    [-16, -72],
    [-48, -42],
    [-62, -6],
    [-40, 32],
    [-12, 68],
  ] as const,
} as const;

export const POSE = {
  DEAD_ZONE: 0.04,
  SMOOTHING: 10,
  CALIBRATION_SECONDS: 0.7,
  MIN_VISIBILITY: 0.08,
  KEYBOARD_OVERRIDE: 0.18,
  REST_ENTER_SECONDS: 0.45,
  REST_EXIT_SECONDS: 0.22,
  REST_ARM_HEIGHT: -0.32,
  REST_ARM_SPAN: 1.45,
  WAKE_ARM_HEIGHT: 0.08,
  WAKE_ARM_SPAN: 2.05,
} as const;

export const COLORS = {
  SKY_ZENITH: 0x1a4a70,
  SKY_HORIZON: 0xd7e8ef,
  FOG: 0xb7cfd8,
  GRASS: 0x4f8a4a,
  GRASS_DRY: 0x7d9a4e,
  DIRT: 0x7a6248,
  ROCK: 0x7b756c,
  SNOW: 0xeef3f6,
  WATER: 0x2f7d8f,
  WATER_DEEP: 0x1d5164,
} as const;
