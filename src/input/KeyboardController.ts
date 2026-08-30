import { clampFlightInput, createFlightInput, type FlightInput } from "./FlightInput";
import type { InputController } from "./InputController";

const TRACKED_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "Space",
  "ShiftLeft",
  "ShiftRight",
]);

export class KeyboardController implements InputController {
  readonly name = "keyboard";
  private readonly keys = new Set<string>();
  private readonly input = createFlightInput();
  private readonly onKeyDown = (event: KeyboardEvent) => this.handleKey(event, true);
  private readonly onKeyUp = (event: KeyboardEvent) => this.handleKey(event, false);
  private readonly onBlur = () => this.keys.clear();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  update(): FlightInput {
    const throttle = (this.isDown("KeyW") ? 1 : 0) + (this.isDown("KeyS") ? -1 : 0);
    const yaw = (this.isDown("KeyD") ? 1 : 0) + (this.isDown("KeyA") ? -1 : 0);
    const pitch = (this.isDown("Space") ? 1 : 0) + (this.isDown("ShiftLeft") || this.isDown("ShiftRight") ? -1 : 0);
    const roll = (this.isDown("KeyE") ? 1 : 0) + (this.isDown("KeyQ") ? -1 : 0);

    this.input.throttle = throttle;
    this.input.yaw = yaw;
    this.input.pitch = pitch;
    this.input.roll = roll;
    return clampFlightInput(this.input);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.keys.clear();
  }

  private isDown(code: string): boolean {
    return this.keys.has(code);
  }

  private handleKey(event: KeyboardEvent, pressed: boolean): void {
    if (!TRACKED_KEYS.has(event.code)) {
      return;
    }

    event.preventDefault();

    if (pressed) {
      this.keys.add(event.code);
    } else {
      this.keys.delete(event.code);
    }
  }
}
