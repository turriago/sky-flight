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
import { PoseController } from "../input/PoseController";
import { Bird } from "../player/Bird";
import { Ghost } from "../player/Ghost";
import { FlightController } from "../player/FlightController";
import { HUD } from "../ui/HUD";
import { MainMenu } from "../ui/MainMenu";
import { WebcamPanel } from "../ui/WebcamPanel";
import { PoseDetector } from "../vision/PoseDetector";
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
  private readonly ghost: Ghost;
  private readonly followCamera: FollowCamera;
  private readonly world: World;
  private readonly hud: HUD;
  private readonly menu: MainMenu;
  private readonly webcam: WebcamPanel;
  private readonly demoInput: FlightInput = createFlightInput();
  private readonly mixedInput: FlightInput = createFlightInput();
  private readonly size = new Vector2();

  private playing = false;
  private running = false;
  private cameraBusy = false;
  private mode: "free" | "race" = "free";
  private hitCooldown = 0;

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
      () => { void this.toggleCamera(); },
    );
    this.webcam = new WebcamPanel(uiRoot);

    this.flight.reset(6, 42, 118, 0);
    this.followCamera.snapTo(this.flight);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleHotkeys);
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
    this.assets.clear();
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleHotkeys);
    this.renderer.dispose();
  }

  private startPlay = async (mode: "free" | "race"): Promise<void> => {
    this.playing = true;
    this.mode = mode;
    this.menu.hide();
    this.hud.show();
    this.pose.setResting(false);
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

  private restartRace(): void {
    if (!this.playing || this.mode !== "race") {
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
    if (this.detector.running) {
      this.detector.detect();
    }
    const pose = this.pose.update(dt, this.detector.running ? this.detector.latest : null);
    this.webcam.setTracking(this.detector.running && this.pose.visible && !this.pose.resting);
    this.webcam.drawPose(this.detector.latest?.landmarks ?? null);
    const keyboard = this.keyboard.update();
    const usingKeys = inputActive(keyboard);
    const input = this.playing
      ? (this.detector.running ? preferOverride(pose, keyboard, this.mixedInput, POSE.KEYBOARD_OVERRIDE) : keyboard)
      : this.updateDemoInput();
    const cruise = this.playing && this.pose.resting && !usingKeys;

    this.flight.update(dt, input, (x, z) => this.world.getHeightAt(x, z), cruise);
    this.bird.update(dt, this.flight);
    this.followCamera.update(dt, this.flight);
    if (this.playing && this.mode === "race") {
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      const racing = this.world.course.status.phase === "racing";
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
      this.ghost.update(this.world.course.status.flown, dt);
    }
    this.world.update(dt);
    this.hud.update(this.flight);
    this.hud.setRace(this.world.course.status);
    this.hud.setPoseInput(pose, this.detector.running && this.pose.visible, this.pose.resting);
    this.updateCameraStatus();
    this.audio.setFlightLevel(this.flight.speedKmh, this.flight.altitude);
    this.renderer.render(this.scene, this.camera);
  };

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
        return;
      }

      this.hud.setCameraActive(false, "Iniciando");
      const video = await this.webcam.startStream();
      await this.detector.start(video);
      this.pose.resetCalibration();
      this.hud.setCameraActive(true, "Calibrando");
      this.menu.setCameraActive(true);
    } catch (error) {
      this.detector.stop();
      this.webcam.stopStream();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      this.webcam.showError(denied ? "Sin permiso de cámara. Sigue con teclado." : "No se pudo iniciar la cámara. Sigue con teclado.");
      this.hud.setCameraActive(false, denied ? "Sin permiso" : "Error");
      this.menu.setCameraActive(false);
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
