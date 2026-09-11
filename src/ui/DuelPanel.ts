import QRCode from "qrcode";
import type { DuelMode, DuelPhase, DuelPlayerInfo, HuntEnd, HuntItemKind } from "../net/protocol";
import { ITEM_LABEL } from "../net/protocol";

interface DuelView {
  role: "admin" | "player";
  room: string;
  phase: DuelPhase;
  countdown: number;
  players: DuelPlayerInfo[];
  joinUrl: string;
  error: string;
  winner: 0 | 1 | null;
  winnerReason: HuntEnd | "";
  times: [number | null, number | null];
  rings: [number, number];
  total: number;
  matchMode: DuelMode;
  fleeSlot: 0 | 1;
  hp: [number, number];
  localSlot: 0 | 1 | null;
  heat: number;
  overheated: boolean;
  huntHold: number;
  huntTimeLeft: number;
  rivalDist: number;
  canPilot: boolean;
  heldKind: HuntItemKind | null;
  huntArrow: string;
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
  private readonly modes: HTMLElement;
  private readonly huntHud: HTMLElement;
  private readonly pilotButton: HTMLButtonElement;
  private lastQrUrl = "";

  constructor(root: HTMLElement, onStart: () => void, onReset: () => void, onMode: (mode: DuelMode) => void, onPilot: () => void) {
    this.element = document.createElement("div");
    this.element.className = "duel-panel hidden";
    this.element.innerHTML = `
      <div class="duel-card">
        <div class="duel-kicker">1 vs 1</div>
        <h2 class="duel-title" data-title>Sala</h2>
        <p class="duel-code hidden" data-code></p>
        <div class="duel-modes hidden" data-modes>
          <button class="ui-button" type="button" data-mode="race">Carrera</button>
          <button class="ui-button" type="button" data-mode="hunt">Cacería</button>
        </div>
        <p class="duel-status" data-status>Esperando</p>
        <img class="duel-qr hidden" alt="Código QR para unirse" data-qr />
        <p class="duel-url hidden" data-url></p>
        <div class="duel-slots" data-slots></div>
        <div class="duel-score hidden" data-score></div>
        <div class="hunt-hud hidden" data-hunt></div>
        <div class="duel-banner hidden" data-banner></div>
        <div class="duel-actions">
          <button class="ui-button hidden" type="button" data-pilot>Volar con teclado</button>
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
    this.modes = this.element.querySelector("[data-modes]")!;
    this.huntHud = this.element.querySelector("[data-hunt]")!;
    this.pilotButton = this.element.querySelector("[data-pilot]")!;
    this.startButton.addEventListener("click", onStart);
    this.resetButton.addEventListener("click", onReset);
    this.pilotButton.addEventListener("click", onPilot);
    this.modes.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => onMode(button.dataset.mode === "hunt" ? "hunt" : "race"));
    });
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setHeat(heat: number, overheated: boolean): void {
    const wrap = this.element.querySelector(".heat-wrap");
    if (!(wrap instanceof HTMLElement)) {
      return;
    }
    wrap.classList.toggle("locked", overheated);
    wrap.classList.toggle("warm", !overheated && heat > 0.7);
    const label = wrap.querySelector(".heat-label");
    if (label) {
      label.textContent = overheated ? "Caliente" : "Arma";
    }
    const bar = wrap.querySelector("i");
    if (bar instanceof HTMLElement) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, heat)) * 100)}%`;
    }
  }

  async render(view: DuelView): Promise<void> {
    this.element.classList.remove("hidden");
    this.element.classList.toggle("player", view.role === "player");
    this.element.classList.toggle("hunt", view.matchMode === "hunt");
    this.element.querySelector("[data-title]")!.textContent = `Sala ${view.room}`;
    const codeLabel = this.element.querySelector("[data-code]")!;
    codeLabel.textContent = view.room ? `Código ${view.room}` : "";
    codeLabel.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby" || !view.room);
    const urlLabel = this.element.querySelector("[data-url]")!;
    urlLabel.textContent = view.joinUrl;
    urlLabel.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby" || !view.joinUrl);
    this.qrImage.classList.toggle("hidden", view.role !== "admin" || view.phase !== "lobby" || !view.joinUrl);

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

    const showModes = view.role === "admin" && view.phase === "lobby";
    this.modes.classList.toggle("hidden", !showModes);
    this.modes.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
      button.classList.toggle("primary", button.dataset.mode === view.matchMode);
    });

    const joined = view.players.filter((player) => player.connected).length;
    const preyName = view.fleeSlot === 0 ? "Naranja" : "Cian";
    const hunterName = view.fleeSlot === 0 ? "Cian" : "Naranja";
    if (view.error) {
      this.status.textContent = view.error;
    } else if (view.phase === "lobby") {
      this.status.textContent = huntLobbyStatus(view, joined, preyName, hunterName);
    } else if (view.phase === "countdown") {
      this.status.textContent = view.matchMode === "hunt" ? `${preyName} huye · ${hunterName} espera 3 s` : "Preparados";
    } else if (view.phase === "racing") {
      this.status.textContent = view.matchMode === "hunt" ? "Cacería" : "En carrera";
    } else {
      this.status.textContent = finishText(view, preyName, hunterName);
    }

    const seats = view.players.length >= 2
      ? view.players
      : [
        { slot: 0 as const, name: "Naranja", connected: false },
        { slot: 1 as const, name: "Cian", connected: false },
      ];
    this.slots.innerHTML = seats.map((player) => {
      const role = view.matchMode === "hunt"
        ? (player.slot === view.fleeSlot ? "Huye" : "Persigue")
        : (player.connected ? "Conectado" : "Libre");
      return `
      <div class="duel-slot ${player.connected ? "on" : ""} slot-${player.slot}">
        <strong>${player.name}</strong>
        <span>${player.connected ? role : "Libre"}</span>
      </div>`;
    }).join("");

    const showScore = view.matchMode === "race" && (view.phase === "racing" || view.phase === "finished");
    this.score.classList.toggle("hidden", !showScore);
    if (showScore) {
      this.score.innerHTML = `
        <div>Naranja <strong>${view.rings[0]}/${view.total}</strong></div>
        <div>Cian <strong>${view.rings[1]}/${view.total}</strong></div>
      `;
    }

    const showHunt = view.matchMode === "hunt" && view.phase !== "lobby";
    this.huntHud.classList.toggle("hidden", !showHunt);
    if (showHunt) {
      this.huntHud.innerHTML = huntHudHtml(view, preyName, hunterName);
    }

    this.banner.classList.toggle("hidden", view.phase !== "countdown");
    this.banner.textContent = view.countdown > 0 ? String(view.countdown) : "YA";

    const canStart = view.role === "admin" && view.phase === "lobby" && joined >= 1;
    this.startButton.classList.toggle("hidden", !canStart);
    this.pilotButton.classList.toggle("hidden", !view.canPilot);
    this.resetButton.classList.toggle("hidden", !(view.role === "admin" && view.phase === "finished"));
    this.element.classList.toggle("compact", view.phase === "racing" || view.phase === "countdown");
  }

  setRings(rings: [number, number], total: number): void {
    this.score.classList.remove("hidden");
    this.score.innerHTML = `
      <div>Naranja <strong>${rings[0]}/${total}</strong></div>
      <div>Cian <strong>${rings[1]}/${total}</strong></div>
    `;
  }
}

function huntLobbyStatus(view: DuelView, joined: number, preyName: string, hunterName: string): string {
  if (view.role === "admin") {
    if (joined === 0) {
      if (!view.joinUrl) {
        return "Preparando el QR para los celulares… espera unos segundos.";
      }
      return view.joinUrl.startsWith("https://")
        ? "Escanea el QR con los dos celulares. Cuando entren, Naranja y Cian se ponen en verde."
        : "Escanea el QR (mismo WiFi). Si usas datos móviles, espera a que el enlace tenga candado https.";
    }
    if (view.matchMode === "hunt") {
      return joined === 1
        ? `Cacería: ${preyName} huye, ${hunterName} persigue. Arranca sola; el segundo puede unirse.`
        : `Cacería lista. ${preyName} sale 3 s antes.`;
    }
    return joined === 1
      ? "Hay un jugador. La prueba arranca sola; el segundo puede unirse después."
      : "Los dos ya están. La carrera arranca sola…";
  }
  if (view.matchMode === "hunt") {
    return joined < 2
      ? `Cacería: ${preyName} huye. Pulsa Volar.`
      : `Listo. ${preyName} huye, ${hunterName} persigue.`;
  }
  return joined < 2
    ? "Pulsa Volar con el celular. Con uno basta para probar."
    : "Listo. La carrera arranca sola…";
}

function finishText(view: DuelView, preyName: string, hunterName: string): string {
  if (view.matchMode === "hunt") {
    if (view.winnerReason === "rings" || view.winnerReason === "timeout") {
      return `Gana ${preyName}: escapó`;
    }
    if (view.winnerReason === "catch") {
      return `Gana ${hunterName}: lo alcanzó`;
    }
    if (view.winnerReason === "ko") {
      return view.winner === view.fleeSlot ? `Gana ${preyName}` : `Gana ${hunterName}`;
    }
  }
  return view.winner === 0 ? "Gana Naranja" : view.winner === 1 ? "Gana Cian" : "Empate";
}

function hearts(count: number): string {
  return "♥".repeat(Math.max(0, count)) || "·";
}

function heatBarHtml(heat: number, overheated: boolean): string {
  const pct = Math.round(Math.max(0, Math.min(1, heat)) * 100);
  const tone = overheated ? "locked" : heat > 0.7 ? "warm" : "";
  return `
    <span class="heat-wrap ${tone}">
      <span class="heat-label">${overheated ? "Caliente" : "Arma"}</span>
      <span class="heat-track"><i style="width:${pct}%"></i></span>
    </span>
  `;
}

function huntHudHtml(view: DuelView, preyName: string, hunterName: string): string {
  const youFlee = view.localSlot === view.fleeSlot;
  const youHunt = view.localSlot !== null && view.localSlot !== view.fleeSlot;
  const role = view.role === "admin"
    ? `${preyName} huye`
    : youFlee
      ? "Huyes"
      : youHunt
        ? "Persigues"
        : "Cacería";
  const hold = view.huntHold > 0 ? ` · Espera ${Math.ceil(view.huntHold)}` : "";
  const time = view.phase === "racing" ? ` · ${formatClock(view.huntTimeLeft)}` : "";
  const dist = view.rivalDist > 0 ? ` · ${Math.round(view.rivalDist)} m` : "";
  const arrow = youHunt && view.huntArrow ? ` · ${view.huntArrow}` : "";
  const item = view.heldKind ? ` · ${ITEM_LABEL[view.heldKind]}` : "";
  return `
    <div class="hunt-role">${role}${hold}${time}${dist}${arrow}${item}</div>
    <div class="hunt-stats">
      <span class="slot-0">${preyName} ${hearts(view.hp[view.fleeSlot])}</span>
      <span class="slot-1">${hunterName} ${hearts(view.hp[view.fleeSlot === 0 ? 1 : 0])}</span>
      ${view.localSlot !== null ? heatBarHtml(view.heat, view.overheated) : ""}
    </div>
  `;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
