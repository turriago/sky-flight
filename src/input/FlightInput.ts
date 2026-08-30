export interface FlightInput {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export function createFlightInput(): FlightInput {
  return {
    throttle: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
  };
}

export function clampFlightInput(input: FlightInput): FlightInput {
  input.throttle = Math.max(-1, Math.min(1, input.throttle));
  input.yaw = Math.max(-1, Math.min(1, input.yaw));
  input.pitch = Math.max(-1, Math.min(1, input.pitch));
  input.roll = Math.max(-1, Math.min(1, input.roll));
  return input;
}

export function copyFlightInput(source: FlightInput, target: FlightInput): FlightInput {
  target.throttle = source.throttle;
  target.yaw = source.yaw;
  target.pitch = source.pitch;
  target.roll = source.roll;
  return target;
}

export function preferOverride(base: FlightInput, override: FlightInput, out: FlightInput, threshold = 0.12): FlightInput {
  out.throttle = Math.abs(override.throttle) > threshold ? override.throttle : base.throttle;
  out.yaw = Math.abs(override.yaw) > threshold ? override.yaw : base.yaw;
  out.pitch = Math.abs(override.pitch) > threshold ? override.pitch : base.pitch;
  out.roll = Math.abs(override.roll) > threshold ? override.roll : base.roll;
  return clampFlightInput(out);
}
