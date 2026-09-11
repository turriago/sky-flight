export type GuideMove = "forward" | "up" | "down" | "left" | "right";

export class FlightGuide {
  readonly element: HTMLElement;
  private readonly items: Record<GuideMove, HTMLElement>;
  private last: GuideMove | "" = "";

  constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "flight-guide hidden";
    this.element.innerHTML = `
      <div class="guide-pad">
        <div class="guide-cell" data-move="up" aria-label="Sube">↑</div>
        <div class="guide-mid">
          <div class="guide-cell" data-move="left" aria-label="Izquierda">←</div>
          <div class="guide-cell guide-center" data-move="forward" aria-label="Adelante">●</div>
          <div class="guide-cell" data-move="right" aria-label="Derecha">→</div>
        </div>
        <div class="guide-cell" data-move="down" aria-label="Baja">↓</div>
      </div>
    `;
    root.appendChild(this.element);
    this.items = {
      up: this.element.querySelector('[data-move="up"]')!,
      down: this.element.querySelector('[data-move="down"]')!,
      left: this.element.querySelector('[data-move="left"]')!,
      right: this.element.querySelector('[data-move="right"]')!,
      forward: this.element.querySelector('[data-move="forward"]')!,
    };
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setMove(move: GuideMove): void {
    if (move === this.last) {
      return;
    }
    this.last = move;
    for (const [key, node] of Object.entries(this.items)) {
      node.classList.toggle("on", key === move);
    }
  }
}

export function guideFromInput(yaw: number, pitch: number, throttle: number): GuideMove {
  // LOCKED: yaw < 0 izquierda, yaw > 0 derecha, pitch > 0 sube, pitch < 0 baja.
  const turn = Math.abs(yaw);
  const climb = Math.abs(pitch);
  if (turn < 0.08 && climb < 0.08) {
    return throttle < -0.3 ? "down" : "forward";
  }
  if (turn >= climb) {
    return yaw < 0 ? "left" : "right";
  }
  return pitch > 0 ? "up" : "down";
}
