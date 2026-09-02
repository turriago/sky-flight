export class BodyCoach {
  readonly element: HTMLElement;
  private readonly status: HTMLElement;
  private readonly cameraButton: HTMLButtonElement;
  private readonly touchButton: HTMLButtonElement;
  private readonly setup: HTMLElement;

  constructor(root: HTMLElement, onCamera: () => void, onTouch: () => void) {
    this.element = document.createElement("div");
    this.element.className = "body-coach hidden";
    this.element.innerHTML = `
      <div class="body-coach-card">
        <div class="body-coach-kicker">Cómo jugar</div>
        <h2>Vuela con el cuerpo</h2>
        <p class="body-coach-lead">Igual que en el PC: el celular es la cámara. No lo agarres.</p>
        <ol class="body-coach-steps">
          <li>Apóyalo en una mesa, cámara frontal hacia ti.</li>
          <li>Siéntate a un metro, hombros y brazos a la vista.</li>
          <li>Activa la cámara y espera a “Listo”.</li>
        </ol>
        <div class="body-coach-gestures">
          <span>Manos ↑ subir</span>
          <span>Manos ↓ bajar</span>
          <span>Inclínate para girar</span>
          <span>Acércate = más rápido</span>
        </div>
        <p class="body-coach-status" data-status>Permite la cámara cuando el navegador lo pida.</p>
        <div class="body-coach-actions">
          <button class="ui-button primary" type="button" data-camera>Activar cámara</button>
          <button class="ui-button" type="button" data-touch>Jugar con palanca</button>
        </div>
      </div>
    `;
    root.appendChild(this.element);
    this.status = this.element.querySelector("[data-status]")!;
    this.cameraButton = this.element.querySelector("[data-camera]")!;
    this.touchButton = this.element.querySelector("[data-touch]")!;
    this.setup = this.element.querySelector(".body-coach-steps")!;
    this.cameraButton.addEventListener("click", onCamera);
    this.touchButton.addEventListener("click", onTouch);
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setCameraOn(on: boolean): void {
    this.cameraButton.textContent = on ? "Cerrar cámara" : "Activar cámara";
    this.element.classList.toggle("camera-on", on);
    this.setup.classList.toggle("hidden", on);
  }

  setHint(text: string): void {
    this.status.textContent = text;
  }
}
