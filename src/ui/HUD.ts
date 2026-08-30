import type { FlightInput } from "../input/FlightInput";
import type { FlightController } from "../player/FlightController";
import type { CourseStatus, Medal } from "../game/Course";
import { COURSE } from "../utils/Constants";
import { headingToCompass } from "../utils/MathUtils";

export class HUD {
  readonly element: HTMLElement;
  private readonly speedValue: HTMLElement;
  private readonly altitudeValue: HTMLElement;
  private readonly headingValue: HTMLElement;
  private readonly cameraStatus: HTMLElement;
  private readonly cameraDot: HTMLElement;
  private readonly cameraButton: HTMLButtonElement;
  private readonly calibrateButton: HTMLButtonElement;
  private readonly restButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly posePanel: HTMLElement;
  private readonly poseYaw: HTMLElement;
  private readonly posePitch: HTMLElement;
  private readonly poseThrottle: HTMLElement;
  private readonly poseMode: HTMLElement;
  private readonly racePanel: HTMLElement;
  private readonly raceTime: HTMLElement;
  private readonly raceGates: HTMLElement;
  private readonly raceBest: HTMLElement;
  private readonly raceDistance: HTMLElement;
  private readonly raceHits: HTMLElement;
  private readonly medalGold: HTMLElement;
  private readonly medalSilver: HTMLElement;
  private readonly medalBronze: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerDetail: HTMLElement;

  private cameraOn = false;
  private resting = false;

  constructor(
    root: HTMLElement,
    onToggleCamera: () => void,
    onCalibrate: () => void,
    onToggleRest: () => void,
    onRestartRace: () => void,
  ) {
    this.element = document.createElement("div");
    this.element.className = "hud hidden";
    this.element.innerHTML = `
      <div class="hud-top-left hud-panel">
        <div class="hud-row">
          <div class="hud-label">Velocidad</div>
          <div class="hud-value"><span data-speed>0</span><span class="hud-unit">km/h</span></div>
        </div>
        <div class="hud-row">
          <div class="hud-label">Altitud</div>
          <div class="hud-value"><span data-altitude>0</span><span class="hud-unit">m</span></div>
        </div>
        <div class="hud-row">
          <div class="hud-label">Dirección</div>
          <div class="hud-value"><span data-heading>N 0°</span></div>
        </div>
        <div class="hud-race hidden" data-race>
          <div class="hud-row">
            <div class="hud-label">Tiempo</div>
            <div class="hud-value hud-value-sm"><span data-race-time>0.0</span></div>
          </div>
          <div class="hud-row">
            <div class="hud-label">Aros</div>
            <div class="hud-value hud-value-sm"><span data-race-gates>0/0</span></div>
          </div>
          <div class="hud-row">
            <div class="hud-label">Récord</div>
            <div class="hud-value hud-value-sm"><span data-race-best>—</span></div>
          </div>
          <div class="hud-row">
            <div class="hud-label">Siguiente</div>
            <div class="hud-value hud-value-sm"><span data-race-distance>—</span></div>
          </div>
          <div class="hud-row">
            <div class="hud-label">Toques</div>
            <div class="hud-value hud-value-sm"><span data-race-hits>0</span></div>
          </div>
          <div class="hud-medals" data-medals>
            <span class="medal gold" data-medal-gold>Oro</span>
            <span class="medal silver" data-medal-silver>Plata</span>
            <span class="medal bronze" data-medal-bronze>Bronce</span>
          </div>
        </div>
      </div>
      <div class="hud-top-right hud-panel">
        <div class="hud-label">Cámara</div>
        <div class="hud-value" style="font-size:18px">
          <span class="status-dot" data-camera-dot></span>
          <span data-camera-status>Desactivada</span>
        </div>
        <div class="hud-pose hidden" data-pose>
          <div><span>Gira</span><strong data-pose-yaw>0</strong></div>
          <div><span>Altura</span><strong data-pose-pitch>0</strong></div>
          <div><span>Vel</span><strong data-pose-throttle>0</strong></div>
          <div><span>Modo</span><strong data-pose-mode>Piloto</strong></div>
        </div>
      </div>
      <div class="hud-bottom-left hud-panel">
        <div class="hud-label">Controles</div>
        <div class="controls-list">
          <kbd>W</kbd><span>Acelerar</span>
          <kbd>S</kbd><span>Frenar</span>
          <kbd>A</kbd><span>Girar izquierda</span>
          <kbd>D</kbd><span>Girar derecha</span>
          <kbd>Espacio</kbd><span>Ascender</span>
          <kbd>Shift</kbd><span>Descender</span>
          <kbd>Q</kbd><span>Alabeo izq.</span>
          <kbd>E</kbd><span>Alabeo der.</span>
          <kbd>R</kbd><span>Descansar / planear</span>
          <kbd>Manos ↑</kbd><span>Subir</span>
          <kbd>Manos ↓</kbd><span>Bajar (brazos abiertos)</span>
          <kbd>Brazos pegados</kbd><span>Descansar</span>
          <kbd>T</kbd><span>Reiniciar circuito</span>
        </div>
      </div>
      <div class="hud-banner hidden" data-banner>
        <div class="hud-banner-title" data-banner-title></div>
        <div class="hud-banner-detail" data-banner-detail></div>
      </div>
      <div class="hud-bottom-right">
        <button class="ui-button" type="button" data-camera-button>
          Activar cámara
        </button>
        <button class="ui-button hidden" type="button" data-calibrate-button>
          Calibrar
        </button>
        <button class="ui-button" type="button" data-rest-button>
          Descansar
        </button>
        <button class="ui-button hidden" type="button" data-restart-button>
          Reiniciar
        </button>
      </div>
    `;

    root.appendChild(this.element);
    this.speedValue = this.element.querySelector("[data-speed]")!;
    this.altitudeValue = this.element.querySelector("[data-altitude]")!;
    this.headingValue = this.element.querySelector("[data-heading]")!;
    this.cameraStatus = this.element.querySelector("[data-camera-status]")!;
    this.cameraDot = this.element.querySelector("[data-camera-dot]")!;
    this.cameraButton = this.element.querySelector("[data-camera-button]")!;
    this.calibrateButton = this.element.querySelector("[data-calibrate-button]")!;
    this.restButton = this.element.querySelector("[data-rest-button]")!;
    this.posePanel = this.element.querySelector("[data-pose]")!;
    this.poseYaw = this.element.querySelector("[data-pose-yaw]")!;
    this.posePitch = this.element.querySelector("[data-pose-pitch]")!;
    this.poseThrottle = this.element.querySelector("[data-pose-throttle]")!;
    this.poseMode = this.element.querySelector("[data-pose-mode]")!;
    this.restartButton = this.element.querySelector("[data-restart-button]")!;
    this.racePanel = this.element.querySelector("[data-race]")!;
    this.raceTime = this.element.querySelector("[data-race-time]")!;
    this.raceGates = this.element.querySelector("[data-race-gates]")!;
    this.raceBest = this.element.querySelector("[data-race-best]")!;
    this.raceDistance = this.element.querySelector("[data-race-distance]")!;
    this.raceHits = this.element.querySelector("[data-race-hits]")!;
    this.medalGold = this.element.querySelector("[data-medal-gold]")!;
    this.medalSilver = this.element.querySelector("[data-medal-silver]")!;
    this.medalBronze = this.element.querySelector("[data-medal-bronze]")!;
    this.banner = this.element.querySelector("[data-banner]")!;
    this.bannerTitle = this.element.querySelector("[data-banner-title]")!;
    this.bannerDetail = this.element.querySelector("[data-banner-detail]")!;
    this.cameraButton.addEventListener("click", onToggleCamera);
    this.calibrateButton.addEventListener("click", onCalibrate);
    this.restButton.addEventListener("click", onToggleRest);
    this.restartButton.addEventListener("click", onRestartRace);
    this.setCameraActive(false);
    this.setResting(false);
  }

  show(): void {
    this.element.classList.remove("hidden");
  }

  hide(): void {
    this.element.classList.add("hidden");
  }

  setCameraActive(active: boolean, detail = ""): void {
    this.cameraOn = active;
    const label = detail || (this.resting ? "Descanso" : active ? "Activa" : "Desactivada");
    this.cameraStatus.textContent = this.resting && active ? "Descanso" : label;
    this.syncStatusDot();
    this.cameraButton.textContent = active ? "Cerrar cámara" : "Activar cámara";
    this.calibrateButton.classList.toggle("hidden", !active);
    this.posePanel.classList.toggle("hidden", !active);
  }

  setResting(resting: boolean): void {
    this.resting = resting;
    this.restButton.textContent = resting ? "Pilotar" : "Descansar";
    this.restButton.classList.toggle("resting", resting);
    this.poseMode.textContent = resting ? "Descanso" : "Piloto";
    this.syncStatusDot();
    if (resting) {
      this.cameraStatus.textContent = "Descanso";
      return;
    }
    if (!this.cameraOn && this.cameraStatus.textContent === "Descanso") {
      this.cameraStatus.textContent = "Desactivada";
    }
    if (this.cameraOn && this.cameraStatus.textContent === "Descanso") {
      this.cameraStatus.textContent = "Activa";
    }
  }

  setPoseInput(input: FlightInput, tracking: boolean, resting = false): void {
    this.posePanel.classList.toggle("tracking", tracking && !resting);
    this.poseYaw.textContent = resting ? "·" : formatAxis(input.yaw, "I", "D");
    this.posePitch.textContent = resting ? "·" : formatAxis(input.pitch, "↓", "↑");
    this.poseThrottle.textContent = resting ? "·" : formatAxis(input.throttle, "−", "+");
    this.setResting(resting);
  }

  update(flight: FlightController): void {
    this.speedValue.textContent = Math.round(flight.speedKmh).toString();
    this.altitudeValue.textContent = Math.round(flight.altitude).toString();
    const heading = Math.round(flight.headingDegrees);
    this.headingValue.textContent = `${headingToCompass(heading)} ${heading}°`;
  }

  setRace(status: CourseStatus): void {
    this.racePanel.classList.toggle("hidden", !status.active);
    this.restartButton.classList.toggle("hidden", !status.active);
    if (!status.active) {
      this.banner.classList.add("hidden");
      return;
    }

    this.raceTime.textContent = formatTime(status.time);
    this.raceGates.textContent = `${status.passed}/${status.total}`;
    this.raceBest.textContent = status.best === null ? "—" : formatTime(status.best);
    this.raceDistance.textContent = status.phase === "finished" ? "Meta" : `${Math.round(status.distance)} m`;
    this.raceHits.textContent = status.hits === 0 ? "0" : `${status.hits} · +${status.penalties.toFixed(1)}s`;
    this.racePanel.classList.toggle("record", status.newRecord);
    this.racePanel.classList.toggle("penalty", status.penaltyFlash > 0);
    this.medalGold.textContent = `Oro ${formatTime(status.goldTime)}`;
    this.medalSilver.textContent = `Plata ${formatTime(status.silverTime)}`;
    this.medalBronze.textContent = `Bronce ${formatTime(status.bronzeTime)}`;
    this.markMedal(status.phase === "finished" ? status.medal : status.bestMedal);

    if (status.penaltyFlash > 0.12 && status.phase === "racing") {
      this.showBanner("TOQUE", `+${COURSE.HIT_PENALTY.toFixed(1)}s · suelo o árbol`);
      return;
    }

    if (status.phase === "armed") {
      this.showBanner("CIRCUITO", "Pasa el aro dorado. El fantasma es tu récord");
      return;
    }
    if (status.phase === "finished") {
      this.showBanner(
        status.newRecord ? "NUEVO RÉCORD" : medalTitle(status.medal),
        `${formatTime(status.time)}${status.hits ? ` · ${status.hits} toques` : ""} · T para repetir`,
      );
      return;
    }
    this.banner.classList.add("hidden");
  }

  private markMedal(medal: Medal): void {
    this.medalGold.classList.toggle("earned", medal === "gold");
    this.medalSilver.classList.toggle("earned", medal === "silver" || medal === "gold");
    this.medalBronze.classList.toggle("earned", medal === "bronze" || medal === "silver" || medal === "gold");
  }

  private showBanner(title: string, detail: string): void {
    this.banner.classList.remove("hidden");
    this.bannerTitle.textContent = title;
    this.bannerDetail.textContent = detail;
  }

  private syncStatusDot(): void {
    this.cameraDot.classList.toggle("active", this.cameraOn && !this.resting);
    this.cameraDot.classList.toggle("resting", this.resting);
  }
}

function medalTitle(medal: Medal): string {
  if (medal === "gold") return "ORO";
  if (medal === "silver") return "PLATA";
  if (medal === "bronze") return "BRONCE";
  return "META";
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole - minutes * 60;
  if (minutes > 0) {
    return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
  }
  return `${rest.toFixed(1)}s`;
}

function formatAxis(value: number, negative: string, positive: string): string {
  if (Math.abs(value) < 0.08) {
    return "·";
  }
  const mark = value > 0 ? positive : negative;
  return `${mark} ${Math.abs(value).toFixed(1)}`;
}
