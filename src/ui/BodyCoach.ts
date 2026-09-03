export class BodyCoach {
  readonly element: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tiltButton: HTMLButtonElement;
  private readonly touchButton: HTMLButtonElement;
  private readonly setup: HTMLElement;

  constructor(root: HTMLElement, onTilt: () => void, onTouch: () => void) {
    this.element = document.createElement("div");
    this.element.className = "body-coach hidden";
    this.element.innerHTML = `
      <div class="body-coach-card">
        <div class="body-coach-kicker">Cómo jugar</div>
        <h2>El celular es el ave</h2>
        <p class="body-coach-lead">Inclínalo con las manos. No hace falta cámara ni sentarte lejos.</p>
        <ol class="body-coach-steps">
          <li>Sostén el celular derecho, como un mando.</li>
          <li>Inclina izquierda / derecha para girar.</li>
          <li>Inclina hacia ti para subir, hacia adelante para bajar.</li>
        </ol>
        <div class="body-coach-gestures">
          <span>Inclinar = girar</span>
          <span>Hacia ti = subir</span>
          <span>Adelante = bajar y más rápido</span>
        </div>
        <p class="body-coach-status" data-status>Pulsa el botón y permite el movimiento si el iPhone lo pide.</p>
        <div class="body-coach-actions">
          <button class="ui-button primary" type="button" data-tilt>Volar con el celular</button>
          <button class="ui-button" type="button" data-touch>Usar palanca</button>
        </div>
      </div>
    `;
    root.appendChild(this.element);
    this.status = this.element.querySelector("[data-status]")!;
    this.tiltButton = this.element.querySelector("[data-tilt]")!;
    this.touchButton = this.element.querySelector("[data-touch]")!;
    this.setup = this.element.querySelector(".body-coach-steps")!;
    this.tiltButton.addEventListener("click", onTilt);
    this.touchButton.addEventListener("click", onTouch);
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setArmed(on: boolean): void {
    this.tiltButton.textContent = on ? "Recalibrar (celular derecho)" : "Volar con el celular";
    this.element.classList.toggle("camera-on", on);
    this.setup.classList.toggle("hidden", on);
  }

  setHint(text: string): void {
    this.status.textContent = text;
  }
}
