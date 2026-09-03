import QRCode from "qrcode";
import type { DuelPhase, DuelPlayerInfo } from "../net/protocol";

interface DuelView {
  role: "admin" | "player";
  room: string;
  phase: DuelPhase;
  countdown: number;
  players: DuelPlayerInfo[];
  joinUrl: string;
  error: string;
  winner: 0 | 1 | null;
  times: [number | null, number | null];
  rings: [number, number];
  total: number;
}

export class DuelPanel {
  readonly element: HTMLElement;
  private readonly qrImage: HTMLImageElement;
  private readonly status: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly score: HTMLElement;
  private lastQrUrl = "";

  constructor(root: HTMLElement, onStart: () => void, onReset: () => void) {
    this.element = document.createElement("div");
    this.element.className = "duel-panel hidden";
    this.element.innerHTML = `
      <div class="duel-card">
        <div class="duel-kicker">1 vs 1</div>
        <h2 class="duel-title" data-title>Sala</h2>
        <p class="duel-code hidden" data-code></p>
        <p class="duel-status" data-status>Esperando</p>
        <img class="duel-qr hidden" alt="Código QR para unirse" data-qr />
        <p class="duel-url hidden" data-url></p>
        <div class="duel-slots" data-slots></div>
        <div class="duel-score hidden" data-score></div>
        <div class="duel-banner hidden" data-banner></div>
        <div class="duel-actions">
          <button class="ui-button primary hidden" type="button" data-start>Empezar ya</button>
          <button class="ui-button hidden" type="button" data-reset>Otra ronda</button>
        </div>
      </div>
    `;
    root.appendChild(this.element);
    this.qrImage = this.element.querySelector("[data-qr]")!;
    this.status = this.element.querySelector("[data-status]")!;
    this.slots = this.element.querySelector("[data-slots]")!;
    this.banner = this.element.querySelector("[data-banner]")!;
    this.startButton = this.element.querySelector("[data-start]")!;
    this.resetButton = this.element.querySelector("[data-reset]")!;
    this.score = this.element.querySelector("[data-score]")!;
    this.startButton.addEventListener("click", onStart);
    this.resetButton.addEventListener("click", onReset);
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  async render(view: DuelView): Promise<void> {
    this.element.classList.remove("hidden");
    this.element.classList.toggle("player", view.role === "player");
    this.element.querySelector("[data-title]")!.textContent = `Sala ${view.room}`;
    const codeLabel = this.element.querySelector("[data-code]")!;
    codeLabel.textContent = view.room ? `Código ${view.room}` : "";
    codeLabel.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby" || !view.room);
    const urlLabel = this.element.querySelector("[data-url]")!;
    urlLabel.textContent = view.joinUrl;
    urlLabel.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby");
    this.qrImage.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby");

    if (view.role === "admin" && view.phase === "lobby" && view.joinUrl && view.joinUrl !== this.lastQrUrl) {
      this.lastQrUrl = view.joinUrl;
      try {
        this.qrImage.src = await QRCode.toDataURL(view.joinUrl, {
          width: 420,
          margin: 4,
          errorCorrectionLevel: "H",
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch {
        this.qrImage.removeAttribute("src");
      }
    }

    const joined = view.players.filter((player) => player.connected).length;
    if (view.error) {
      this.status.textContent = view.error;
    } else if (view.phase === "lobby") {
      this.status.textContent = view.role === "admin"
        ? joined === 0
          ? "Escanea el QR con un celular. Sirve con uno solo para probar."
          : joined === 1
            ? "Hay un jugador. La prueba arranca sola; el segundo puede unirse después."
            : "Los dos ya están. La carrera arranca sola…"
        : joined < 2
          ? "Pulsa Volar con el celular. Con uno basta para probar."
          : "Listo. La carrera arranca sola…";
    } else if (view.phase === "countdown") {
      this.status.textContent = "Preparados";
    } else if (view.phase === "racing") {
      this.status.textContent = "En carrera";
    } else {
      this.status.textContent = view.winner === 0 ? "Gana Naranja" : view.winner === 1 ? "Gana Cian" : "Empate";
    }

    this.slots.innerHTML = view.players.map((player) => `
      <div class="duel-slot ${player.connected ? "on" : ""} slot-${player.slot}">
        <strong>${player.name}</strong>
        <span>${player.connected ? "Conectado" : "Libre"}</span>
      </div>
    `).join("");

    const showScore = view.phase === "racing" || view.phase === "finished";
    this.score.classList.toggle("hidden", !showScore);
    if (showScore) {
      this.score.innerHTML = `
        <div>Naranja <strong>${view.rings[0]}/${view.total}</strong></div>
        <div>Cian <strong>${view.rings[1]}/${view.total}</strong></div>
      `;
    }

    this.banner.classList.toggle("hidden", view.phase !== "countdown");
    this.banner.textContent = view.countdown > 0 ? String(view.countdown) : "YA";

    const canStart = view.role === "admin" && view.phase === "lobby" && joined >= 1;
    this.startButton.classList.toggle("hidden", !canStart);
    this.resetButton.classList.toggle("hidden", !(view.role === "admin" && view.phase === "finished"));
    this.element.classList.toggle("compact", view.phase === "racing");
  }

  setRings(rings: [number, number], total: number): void {
    this.score.classList.remove("hidden");
    this.score.innerHTML = `
      <div>Naranja <strong>${rings[0]}/${total}</strong></div>
      <div>Cian <strong>${rings[1]}/${total}</strong></div>
    `;
  }
}
