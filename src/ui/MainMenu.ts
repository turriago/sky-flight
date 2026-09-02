export class MainMenu {
  readonly element: HTMLElement;
  private readonly controlsSheet: HTMLElement;
  private readonly cameraButton: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    onRace: () => void,
    onFree: () => void,
    onDuel: () => void,
    onToggleCamera: () => void,
  ) {
    this.element = document.createElement("div");
    this.element.className = "menu";
    this.element.innerHTML = `
      <div class="menu-card">
        <div class="menu-kicker">Prototipo</div>
        <h1 class="menu-title">SKY FLIGHT</h1>
        <p class="menu-tagline">${import.meta.env.DEV ? "Circuito, 1 vs 1 y medallas" : "Circuito y vuelo libre"}</p>
        <div class="menu-actions">
          ${import.meta.env.DEV ? `<button class="ui-button primary" type="button" data-duel>1 vs 1 · Admin</button>` : ""}
          <button class="ui-button primary" type="button" data-race>Circuito</button>
          <button class="ui-button" type="button" data-free>Vuelo libre</button>
          <button class="ui-button" type="button" data-controls>Controles</button>
          <button class="ui-button" type="button" data-camera>Activar cámara</button>
        </div>
        <div class="controls-sheet hidden" data-controls-sheet>
          <div class="controls-list">
            <kbd>W</kbd><span>Acelerar / avanzar</span>
            <kbd>S</kbd><span>Reducir velocidad</span>
            <kbd>A</kbd><span>Girar izquierda</span>
            <kbd>D</kbd><span>Girar derecha</span>
            <kbd>Espacio</kbd><span>Ascender</span>
            <kbd>Shift</kbd><span>Descender</span>
            <kbd>Q / E</kbd><span>Alabeo</span>
            <kbd>R</kbd><span>Descansar: el ave planea sola</span>
            <kbd>T</kbd><span>Reiniciar circuito</span>
            <kbd>Manos ↑</kbd><span>Subir</span>
            <kbd>Manos ↓</kbd><span>Bajar, brazos abiertos o inclinarte</span>
            <kbd>Brazos pegados</kbd><span>Descansar y planear</span>
          </div>
        </div>
      </div>
    `;

    root.appendChild(this.element);
    this.controlsSheet = this.element.querySelector("[data-controls-sheet]")!;
    this.cameraButton = this.element.querySelector("[data-camera]")!;

    this.element.querySelector("[data-duel]")?.addEventListener("click", onDuel);
    this.element.querySelector("[data-race]")?.addEventListener("click", onRace);
    this.element.querySelector("[data-free]")?.addEventListener("click", onFree);
    this.element.querySelector("[data-controls]")?.addEventListener("click", () => {
      this.controlsSheet.classList.toggle("hidden");
    });
    this.cameraButton.addEventListener("click", onToggleCamera);
  }

  setCameraActive(active: boolean): void {
    this.cameraButton.textContent = active ? "Cerrar cámara" : "Activar cámara";
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  show(): void {
    this.element.classList.remove("hidden");
  }
}
