export class BodyCoach {
  readonly element: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tiltButton: HTMLButtonElement;
  private readonly touchButton: HTMLButtonElement;
  private readonly chromeButton: HTMLButtonElement;
  private readonly setup: HTMLElement;
  private readonly browserWarn: HTMLElement;
  private readonly browserText: HTMLElement;
  private lastHint = "";

  constructor(root: HTMLElement, onTilt: () => void, onTouch: () => void, onChrome: () => void) {
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
          <li>Inclina hacia abajo para bajar, hacia ti para subir.</li>
        </ol>
        <div class="body-coach-gestures">
          <span>Inclinar = girar</span>
          <span>Hacia ti / arriba = subir</span>
          <span>Abajo = bajar</span>
        </div>
        <p class="body-coach-status" data-status>Elige cómo quieres volar.</p>
        <div class="browser-warn hidden" data-browser-warn>
          <p data-browser-text></p>
          <button class="ui-button chrome-open" type="button" data-chrome>Abrir en Chrome o Safari</button>
        </div>
        <div class="body-coach-actions">
          <button class="ui-button primary" type="button" data-tilt>Celular</button>
          <button class="ui-button" type="button" data-touch>Botones</button>
        </div>
      </div>
    `;
    root.appendChild(this.element);
    this.status = this.element.querySelector("[data-status]")!;
    this.tiltButton = this.element.querySelector("[data-tilt]")!;
    this.touchButton = this.element.querySelector("[data-touch]")!;
    this.chromeButton = this.element.querySelector("[data-chrome]")!;
    this.setup = this.element.querySelector(".body-coach-steps")!;
    this.browserWarn = this.element.querySelector("[data-browser-warn]")!;
    this.browserText = this.element.querySelector("[data-browser-text]")!;
    this.tiltButton.addEventListener("click", onTilt);
    this.touchButton.addEventListener("click", onTouch);
    this.chromeButton.addEventListener("click", onChrome);
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setSteer(mode: "pick" | "tilt" | "touch"): void {
    const compact = mode !== "pick";
    this.element.classList.toggle("compact", compact);
    this.element.classList.toggle("camera-on", mode === "tilt");
    this.setup.classList.toggle("hidden", compact);
    this.tiltButton.classList.toggle("primary", mode !== "touch");
    this.touchButton.classList.toggle("primary", mode === "touch");
    this.tiltButton.textContent = mode === "tilt" ? "Recalibrar" : "Celular";
    this.touchButton.textContent = "Botones";
  }

  setHint(text: string): void {
    if (text === this.lastHint) {
      return;
    }
    this.lastHint = text;
    this.status.textContent = text;
  }

  setChromeHint(on: boolean, text = ""): void {
    this.browserWarn.classList.toggle("hidden", !on);
    this.element.classList.toggle("needs-browser", on);
    if (on && text) {
      this.browserText.textContent = text;
    }
  }
}
