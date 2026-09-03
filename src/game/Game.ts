import {
  ACESFilmicToneMapping,
  Clock,
  Color,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import { AssetManager } from "../assets/AssetManager";
import { AudioManager } from "../audio/AudioManager";
import { FollowCamera } from "../camera/FollowCamera";
import { KeyboardController } from "../input/KeyboardController";
import type { InputController } from "../input/InputController";
import { preferOverride, createFlightInput, type FlightInput } from "../input/FlightInput";
import { TouchController } from "../input/TouchController";
import { TiltController } from "../input/TiltController";
import { PoseController } from "../input/PoseController";
import { Bird } from "../player/Bird";
import { Ghost } from "../player/Ghost";
import { FlightController } from "../player/FlightController";
import { HUD } from "../ui/HUD";
import { MainMenu } from "../ui/MainMenu";
import { DuelPanel } from "../ui/DuelPanel";
import { BodyCoach } from "../ui/BodyCoach";
import { WebcamPanel } from "../ui/WebcamPanel";
import { PoseDetector } from "../vision/PoseDetector";
import { MatchClient } from "../net/MatchClient";
import { duelJoinUrl, duelRoomFromLocation } from "../net/joinUrl";
import { randomRoomCode, type DuelMessage } from "../net/protocol";
import { COURSE, POSE } from "../utils/Constants";
import { World } from "./World";

export class Game {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly clock = new Clock();
  private readonly assets = new AssetManager();
  private readonly audio = new AudioManager();
  private readonly keyboard: InputController = new KeyboardController();
  private readonly pose = new PoseController();
  private readonly detector = new PoseDetector();
  private readonly flight = new FlightController();
  private readonly bird = new Bird();
  private readonly rival = new Bird(0x2aa8c4, 0x1a6a78);
  private readonly ghost: Ghost;
  private readonly followCamera: FollowCamera;
  private readonly world: World;
  private readonly hud: HUD;
  private readonly menu: MainMenu;
  private readonly duelPanel: DuelPanel;
  private readonly coach: BodyCoach;
  private readonly webcam: WebcamPanel;
  private readonly touch: TouchController;
  private readonly tilt = new TiltController();
  private readonly match = new MatchClient();
  private readonly demoInput: FlightInput = createFlightInput();
  private readonly mixedInput: FlightInput = createFlightInput();
  private readonly size = new Vector2();

  private playing = false;
  private running = false;
  private cameraBusy = false;
  private mode: "free" | "race" = "free";
  private session: "solo" | "admin" | "player" = "solo";
  private hitCooldown = 0;
  private joinUrl = "";
  private lastMatchPhase = "";
  private playerSteer: "none" | "tilt" | "touch" = "none";

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.scene.background = new Color(0xa9c6d2);

    this.camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
    this.followCamera = new FollowCamera(this.camera);

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.world = new World(this.scene);
    void this.world.populate(this.assets);
    this.scene.add(this.bird.group);
    this.rival.group.visible = false;
    this.scene.add(this.rival.group);
    this.ghost = new Ghost(this.bird.visualRoot);
    this.scene.add(this.ghost.group);

    this.hud = new HUD(
      uiRoot,
      () => { void this.toggleCamera(); },
      () => this.recalibrate(),
      () => this.toggleRest(),
      () => this.restartRace(),
    );
    this.menu = new MainMenu(
      uiRoot,
      () => { void this.startPlay("race"); },
      () => { void this.startPlay("free"); },
      () => { void this.startAdminDuel(); },
      () => { void this.toggleCamera(); },
    );
    this.duelPanel = new DuelPanel(uiRoot, () => this.match.startMatch(), () => this.match.resetMatch());
    this.coach = new BodyCoach(
      uiRoot,
      () => { void this.enableTilt(); },
      () => this.playWithTouch(),
    );
    this.webcam = new WebcamPanel(uiRoot);
    this.touch = new TouchController(uiRoot);
    this.match.on((message) => { void this.onMatchMessage(message); });

    this.flight.reset(6, 42, 118, 0);
    this.followCamera.snapTo(this.flight);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleHotkeys);

    const room = duelRoomFromLocation();
    if (room) {
      void this.joinAsPlayer(room);
    }
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  dispose(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.keyboard.dispose();
    this.pose.dispose();
    this.detector.stop();
    this.webcam.stopStream();
    this.audio.dispose();
    this.touch.dispose();
    this.tilt.dispose();
    this.match.close();
    this.assets.clear();
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleHotkeys);
    this.renderer.dispose();
  }

  private startPlay = async (mode: "free" | "race"): Promise<void> => {
    if (this.session !== "solo") {
      return;
    }
    this.playing = true;
    this.mode = mode;
    this.menu.hide();
    this.hud.show();
    this.pose.setResting(false);
    this.rival.group.visible = false;
    this.touch.hide();
    if (mode === "race") {
      this.world.course.arm();
      this.ghost.setTape(this.world.course.ghostPath);
      this.hitCooldown = 0.6;
      const start = this.world.course.start;
      this.flight.reset(start.x, start.y, start.z, this.world.course.startYaw);
    } else {
      this.world.course.hide();
      this.ghost.hide();
      this.flight.reset(6, 42, 118, 0);
    }
    this.followCamera.snapTo(this.flight);
    await this.audio.start();
  };

  private startAdminDuel = async (): Promise<void> => {
    const room = randomRoomCode();
    history.replaceState(null, "", `?admin=1&duel=${room}`);
    this.session = "admin";
    this.mode = "race";
    this.playing = true;
    this.menu.hide();
    this.hud.hide();
    this.ghost.hide();
    this.rival.group.visible = true;
    this.world.course.arm();
    this.joinUrl = await duelJoinUrl(room);
    this.match.connect("admin", room);
    this.placeAtSlot(0);
    this.placeRivalAtSlot(1);
    this.followCamera.updatePair(
      0.016,
      this.bird.group.position.x, this.bird.group.position.y, this.bird.group.position.z,
      this.rival.group.position.x, this.rival.group.position.y, this.rival.group.position.z,
    );
    await this.refreshDuelPanel();
    try {
      await this.audio.start();
    } catch {
      // el admin en PC suele permitir audio
    }
  };

  private joinAsPlayer = async (room: string): Promise<void> => {
    this.session = "player";
    this.mode = "race";
    this.playing = true;
    this.menu.hide();
    this.hud.hide();
    this.ghost.hide();
    this.rival.group.visible = true;
    this.touch.hide();
    this.webcam.setPlayerLayout(false);
    this.playerSteer = "none";
    this.tilt.tryListen();
    this.coach.show();
    this.world.course.arm();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.match.connect("player", room.toUpperCase());
    const unlockAudio = (): void => {
      void this.audio.start();
      window.removeEventListener("pointerdown", unlockAudio);
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    try {
      await this.audio.start();
    } catch {
      // iOS pide un toque antes de activar el audio
    }
    await this.refreshDuelPanel();
  };

  private async onMatchMessage(message: DuelMessage): Promise<void> {
    if (this.session === "solo") {
      return;
    }
    if (this.match.phase !== this.lastMatchPhase) {
      this.lastMatchPhase = this.match.phase;
      if (this.match.phase === "lobby" || this.match.phase === "countdown") {
        this.resetDuelCrafts();
      }
      if (this.match.phase === "racing") {
        this.world.course.beginRace();
      }
    }
    if (message.t === "pose") {
      if (this.match.phase === "racing" || this.match.phase === "finished") {
        this.duelPanel.setRings(this.liveRings(), this.world.course.status.total);
      }
      return;
    }
    await this.refreshDuelPanel();
  }

  private resetDuelCrafts(): void {
    const slot = this.session === "player" ? (this.match.slot ?? 0) : 0;
    this.placeAtSlot(slot);
    this.placeRivalAtSlot(slot === 0 ? 1 : 0);
    this.world.course.arm();
    this.hitCooldown = 0.6;
  }

  private placeAtSlot(slot: 0 | 1): void {
    const pose = this.slotStart(slot);
    this.flight.reset(pose.x, pose.y, pose.z, pose.yaw);
    this.bird.group.position.set(pose.x, pose.y, pose.z);
  }

  private placeRivalAtSlot(slot: 0 | 1): void {
    const pose = this.slotStart(slot);
    this.rival.group.position.set(pose.x, pose.y, pose.z);
  }

  private slotStart(slot: 0 | 1): { x: number; y: number; z: number; yaw: number } {
    const start = this.world.course.start;
    const side = slot === 0 ? -3.4 : 3.4;
    return {
      x: start.x + Math.cos(this.world.course.startYaw) * side,
      y: start.y,
      z: start.z + Math.sin(this.world.course.startYaw) * side,
      yaw: this.world.course.startYaw,
    };
  }

  private async refreshDuelPanel(): Promise<void> {
    if (this.session === "solo") {
      this.duelPanel.hide();
      return;
    }
    await this.duelPanel.render({
      role: this.session,
      room: this.match.room,
      phase: this.match.phase,
      countdown: this.match.countdown,
      players: this.match.players,
      joinUrl: this.joinUrl,
      error: this.match.error,
      winner: this.match.winner,
      times: this.match.times,
      rings: this.liveRings(),
      total: this.world.course.status.total,
    });
  }

  private liveRings(): [number, number] {
    const localRings = this.world.course.status.passed;
    const other = this.match.slot === 0 ? this.match.lastPose[1] : this.match.lastPose[0];
    if (this.session === "admin") {
      return [this.match.lastPose[0]?.rings ?? 0, this.match.lastPose[1]?.rings ?? 0];
    }
    return this.match.slot === 0
      ? [localRings, other?.rings ?? 0]
      : [other?.rings ?? 0, localRings];
  }

  private restartRace(): void {
    if (!this.playing || this.mode !== "race" || this.session !== "solo") {
      return;
    }
    this.pose.setResting(false);
    this.world.course.arm();
    this.ghost.setTape(this.world.course.ghostPath);
    this.hitCooldown = 0.6;
    const start = this.world.course.start;
    this.flight.reset(start.x, start.y, start.z, this.world.course.startYaw);
    this.followCamera.snapTo(this.flight);
  }

  private tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.session === "admin") {
      this.tickAdmin(dt);
      return;
    }
    if (this.detector.running) {
      this.detector.detect();
    }
    const pose = this.pose.update(dt, this.detector.running ? this.detector.latest : null);
    this.webcam.setTracking(this.detector.running && this.pose.visible && !this.pose.resting);
    this.webcam.drawPose(this.detector.latest?.landmarks ?? null);
    if (this.session === "player") {
      this.updatePlayerCoach();
    }
    const keyboard = this.keyboard.update();
    const usingKeys = inputActive(keyboard);
    const touch = this.touch.update();
    if (this.session === "player" && this.match.phase !== "racing") {
      this.demoInput.throttle = 0;
      this.demoInput.yaw = 0;
      this.demoInput.pitch = 0;
      this.demoInput.roll = 0;
    }
    const live = this.session === "player"
      ? this.playerInput(pose, touch, keyboard)
      : this.playing
        ? (this.detector.running ? preferOverride(pose, keyboard, this.mixedInput, POSE.KEYBOARD_OVERRIDE) : keyboard)
        : this.updateDemoInput();
    const usingTouch = inputActive(touch);
    const cruise = this.playing && this.pose.resting && this.detector.running && !usingKeys && !usingTouch;

    this.flight.update(dt, live, (x, z) => this.world.getHeightAt(x, z), cruise);
    this.bird.update(dt, this.flight);
    this.followCamera.update(dt, this.flight);
    if (this.session === "player") {
      this.syncDuelPlayer(dt);
    }
    if (this.playing && this.mode === "race" && (this.session === "solo" || this.match.phase === "racing")) {
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      const racing = this.world.course.status.phase === "racing" || this.session === "player";
      if (racing && this.hitCooldown <= 0) {
        const hit = this.world.hitTest(
          this.flight.position.x,
          this.flight.position.y,
          this.flight.position.z,
          this.flight.grounded,
        );
        if (hit && this.world.course.addHit()) {
          this.flight.applyHit();
          this.hitCooldown = COURSE.HIT_COOLDOWN;
        }
      }
      this.world.course.update(dt, this.flight.position, this.flight.quaternion);
      if (this.session === "solo") {
        this.ghost.update(this.world.course.status.flown, dt);
      }
    }
    this.world.update(dt);
    if (this.session === "solo") {
      this.hud.update(this.flight);
      this.hud.setRace(this.world.course.status);
      this.hud.setPoseInput(pose, this.detector.running && this.pose.visible, this.pose.resting);
      this.updateCameraStatus();
    }
    this.audio.setFlightLevel(this.flight.speedKmh, this.flight.altitude);
    this.renderer.render(this.scene, this.camera);
  };

  private tickAdmin(dt: number): void {
    const a = this.match.lastPose[0];
    const b = this.match.lastPose[1];
    if (a) {
      this.bird.updateRemote(dt, a.x, a.y, a.z, a.qx, a.qy, a.qz, a.qw, a.spd);
    }
    if (b) {
      this.rival.updateRemote(dt, b.x, b.y, b.z, b.qx, b.qy, b.qz, b.qw, b.spd);
    }
    this.followCamera.updatePair(
      dt,
      this.bird.group.position.x, this.bird.group.position.y, this.bird.group.position.z,
      this.rival.group.position.x, this.rival.group.position.y, this.rival.group.position.z,
    );
    this.world.update(dt);
    this.audio.setFlightLevel(((a?.spd ?? 20) + (b?.spd ?? 20)) * 1.8, this.bird.group.position.y);
    this.renderer.render(this.scene, this.camera);
  }

  private syncDuelPlayer(dt: number): void {
    const otherSlot = this.match.slot === 0 ? 1 : 0;
    const other = this.match.lastPose[otherSlot];
    if (other) {
      this.rival.updateRemote(dt, other.x, other.y, other.z, other.qx, other.qy, other.qz, other.qw, other.spd);
    }
    if (this.match.slot === null) {
      return;
    }
    const status = this.world.course.status;
    this.match.sendPose(dt, {
      slot: this.match.slot,
      x: this.flight.position.x,
      y: this.flight.position.y,
      z: this.flight.position.z,
      qx: this.flight.quaternion.x,
      qy: this.flight.quaternion.y,
      qz: this.flight.quaternion.z,
      qw: this.flight.quaternion.w,
      spd: this.flight.speed,
      rings: status.passed,
      time: status.time,
      done: status.phase === "finished" ? 1 : 0,
    });
  }

  private playerInput(pose: FlightInput, touch: FlightInput, keyboard: FlightInput): FlightInput {
    if (this.match.phase !== "racing") {
      return this.demoInput;
    }
    if (this.playerSteer === "tilt" || (this.playerSteer !== "touch" && this.tilt.enabled)) {
      preferOverride(this.tilt.update(), touch, this.mixedInput, 0.38);
      return preferOverride(this.mixedInput, keyboard, this.mixedInput, POSE.KEYBOARD_OVERRIDE);
    }
    if (this.detector.running) {
      preferOverride(pose, touch, this.mixedInput, 0.22);
      return preferOverride(this.mixedInput, keyboard, this.mixedInput, POSE.KEYBOARD_OVERRIDE);
    }
    return preferOverride(touch, keyboard, this.mixedInput, 0.12);
  }

  private async enableTilt(): Promise<void> {
    if (this.tilt.enabled) {
      this.tilt.calibrate();
      this.coach.setHint("Calibrado. Celular derecho es el centro. Inclina para volar.");
      return;
    }
    this.coach.setHint("Activando el sensor de movimiento…");
    const ok = await this.tilt.enable();
    if (!ok) {
      this.coach.setHint("El iPhone pidió permiso y no se concedió. Usa palanca, o pulsa de nuevo y acepta.");
      return;
    }
    this.playerSteer = "tilt";
    this.touch.show();
    this.touch.element.classList.add("fallback", "tilt-mode");
    this.coach.setArmed(true);
    this.coach.setHint("Listo. Inclina el celular. Recalibrar si el ave se desvía sola.");
    try {
      await this.audio.start();
    } catch {
      // iOS desbloquea audio con este toque
    }
  }

  private playWithTouch(): void {
    this.playerSteer = "touch";
    this.tilt.enabled = false;
    this.touch.show();
    this.touch.element.classList.remove("fallback", "tilt-mode");
    this.coach.setArmed(false);
    this.coach.setHint("Palanca para girar y altura. Acelerar a la derecha.");
  }

  private updatePlayerCoach(): void {
    const racing = this.match.phase === "racing" || this.match.phase === "finished";
    const tiltOn = this.playerSteer === "tilt" && this.tilt.enabled;
    this.coach.setArmed(tiltOn);
    this.coach.element.classList.toggle("racing", racing);
    if (tiltOn) {
      this.touch.show();
      this.touch.element.classList.add("fallback", "tilt-mode");
      this.coach.setHint(racing
        ? (this.tilt.hasSignal ? "Inclina el celular para volar." : "No llega el sensor. Recalibra o usa palanca.")
        : "Listo. Con un celular basta. Inclina cuando empiece.";
      return;
    }
    if (this.playerSteer === "touch") {
      this.touch.show();
      this.touch.element.classList.remove("fallback", "tilt-mode");
      return;
    }
    if (racing) {
      this.touch.show();
      this.touch.element.classList.remove("fallback", "tilt-mode");
      this.coach.setHint("Usa la palanca, o pulsa Volar con el celular.");
      return;
    }
    this.coach.setHint("Pulsa Volar con el celular e inclínalo. Palanca solo si lo prefieres.");
  }

  private async toggleCamera(): Promise<void> {
    if (this.cameraBusy) {
      return;
    }
    this.cameraBusy = true;

    try {
      if (this.detector.running) {
        this.detector.stop();
        this.webcam.stopStream();
        this.pose.resetCalibration();
        this.pose.onTrackingStopped();
        this.hud.setCameraActive(false);
        this.menu.setCameraActive(false);
        if (this.session === "player") {
          this.touch.show();
          this.touch.element.classList.remove("fallback");
        }
        return;
      }

      this.hud.setCameraActive(false, "Iniciando");
      if (this.session === "player") {
        this.coach.setHint("Abriendo cámara… la primera vez puede tardar unos segundos.");
      }
      const video = await this.webcam.startStream();
      await this.detector.start(video);
      this.pose.resetCalibration();
      this.hud.setCameraActive(true, "Calibrando");
      this.menu.setCameraActive(true);
      if (this.session === "player") {
        this.touch.show();
        this.touch.element.classList.add("fallback");
      }
    } catch (error) {
      this.detector.stop();
      this.webcam.stopStream();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      const fallback = this.session === "player" ? "Sigue con la palanca." : "Sigue con teclado.";
      this.webcam.showError(denied ? `Sin permiso de cámara. ${fallback}` : `No se pudo iniciar la cámara. ${fallback}`);
      this.hud.setCameraActive(false, denied ? "Sin permiso" : "Error");
      this.menu.setCameraActive(false);
      if (this.session === "player") {
        this.touch.show();
        this.touch.element.classList.remove("fallback");
      }
    } finally {
      this.cameraBusy = false;
    }
  }

  private recalibrate(): void {
    this.pose.resetCalibration();
  }

  private toggleRest(): void {
    if (!this.playing) {
      return;
    }
    this.pose.toggleRest();
    this.hud.setResting(this.pose.resting);
  }

  private handleHotkeys = (event: KeyboardEvent): void => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      this.toggleRest();
      return;
    }
    if (event.code === "KeyT") {
      event.preventDefault();
      this.restartRace();
    }
  };

  private updateCameraStatus(): void {
    if (this.pose.resting) {
      this.hud.setCameraActive(this.detector.running, "Descanso");
      return;
    }
    if (!this.detector.running) {
      return;
    }
    if (this.pose.isCalibrating) {
      this.hud.setCameraActive(true, "Calibrando");
      return;
    }
    if (this.detector.lastError) {
      this.hud.setCameraActive(true, "Error pose");
      return;
    }
    if (!this.pose.visible) {
      this.hud.setCameraActive(true, "Sin pose");
      return;
    }
    this.hud.setCameraActive(true, "Activa");
  }

  private updateDemoInput(): FlightInput {
    this.demoInput.throttle = 0.18;
    this.demoInput.yaw = 0.22;
    this.demoInput.pitch = 0.08;
    this.demoInput.roll = 0.05;
    return this.demoInput;
  }

  private handleResize = (): void => {
    this.size.set(window.innerWidth, window.innerHeight);
    this.camera.aspect = this.size.x / this.size.y;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.size.x, this.size.y);
  };
}

function inputActive(input: FlightInput, threshold = 0.12): boolean {
  return Math.max(
    Math.abs(input.throttle),
    Math.abs(input.yaw),
    Math.abs(input.pitch),
    Math.abs(input.roll),
  ) > threshold;
}
