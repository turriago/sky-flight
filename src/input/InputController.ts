import type { FlightInput } from "./FlightInput";

export interface InputController {
  readonly name: string;
  update(): FlightInput;
  dispose(): void;
}
