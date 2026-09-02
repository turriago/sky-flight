import { clampFlightInput, createFlightInput, type FlightInput } from "./FlightInput";
import type { InputController } from "./InputController";

export class TouchController implements InputController {
  readonly name = "touch";
  readonly element: HTMLElement;
  private readonly input = createFlightInput();
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private stickX = 0;
  private stickY = 0;
  private throttleOn = false;
  private brakeOn = false;

  constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "touch-pad hidden";
    this.element.innerHTML = `
      <div class="touch-stick" data-stick>
        <div class="touch-knob" data-knob></div>
        <span>Girar / altura</span>
      </div>
      <div class="touch-actions">
        <button type="button" class="touch-btn" data-brake>Freno</button>
        <button type="button" class="touch-btn primary" data-gas>Acelerar</button>
      </div>
    `;
    root.appendChild(this.element);

    const stick = this.element.querySelector("[data-stick]")!;
    const gas = this.element.querySelector("[data-gas]")!;
    const brake = this.element.querySelector("[data-brake]")!;

    stick.addEventListener("pointerdown", this.onStickDown);
    window.addEventListener("pointermove", this.onStickMove);
    window.addEventListener("pointerup", this.onStickUp);
    window.addEventListener("pointercancel", this.onStickUp);
    this.bindHold(gas, (on) => { this.throttleOn = on; });
    this.bindHold(brake, (on) => { this.brakeOn = on; });
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
    this.stickX = 0;
    this.stickY = 0;
    this.throttleOn = false;
    this.brakeOn = false;
  }

  update(): FlightInput {
    this.input.yaw = this.stickX;
    this.input.pitch = -this.stickY;
    this.input.throttle = this.throttleOn ? 1 : this.brakeOn ? -0.85 : 0.12;
    this.input.roll = this.stickX * 0.35;
    return clampFlightInput(this.input);
  }

  dispose(): void {
    window.removeEventListener("pointermove", this.onStickMove);
    window.removeEventListener("pointerup", this.onStickUp);
    window.removeEventListener("pointercancel", this.onStickUp);
    this.element.remove();
  }

  private onStickDown = (event: Event): void => {
    const pointer = event as PointerEvent;
    pointer.preventDefault();
    this.pointerId = pointer.pointerId;
    this.originX = pointer.clientX;
    this.originY = pointer.clientY;
    (pointer.target as HTMLElement | null)?.setPointerCapture?.(pointer.pointerId);
  };

  private bindHold(element: Element, set: (on: boolean) => void): void {
    const onDown = (event: Event): void => {
      const pointer = event as PointerEvent;
      pointer.preventDefault();
      set(true);
      (pointer.target as HTMLElement | null)?.setPointerCapture?.(pointer.pointerId);
    };
    const onUp = (): void => {
      set(false);
    };
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
  }

  private onStickMove = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    const dx = (event.clientX - this.originX) / 70;
    const dy = (event.clientY - this.originY) / 70;
    this.stickX = Math.max(-1, Math.min(1, dx));
    this.stickY = Math.max(-1, Math.min(1, dy));
    const knob = this.element.querySelector<HTMLElement>("[data-knob]");
    if (knob) {
      knob.style.transform = `translate(${this.stickX * 28}px, ${this.stickY * 28}px)`;
    }
  };

  private onStickUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return;
    }
    this.pointerId = null;
    this.stickX = 0;
    this.stickY = 0;
    const knob = this.element.querySelector<HTMLElement>("[data-knob]");
    if (knob) {
      knob.style.transform = "translate(0, 0)";
    }
  };
}
