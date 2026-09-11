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
import { FlightGuide, guideFromInput } from "../ui/FlightGuide";
import { WebcamPanel } from "../ui/WebcamPanel";
import { PoseDetector } from "../vision/PoseDetector";
import { MatchClient } from "../net/MatchClient";
import { adminRoomFromLocation, duelJoinUrl, duelRoomFromLocation, waitForHttpsJoinUrl } from "../net/joinUrl";
import { HuntPickups } from "./HuntPickups";
import { ITEM_LABEL, randomRoomCode, type DuelMessage, type DuelPose } from "../net/protocol";
import { COURSE, HUNT, POSE } from "../utils/Constants";
import { browserIssueMessage, detectBrowserIssue } from "../utils/Browser";
import { HuntCombat } from "./HuntCombat";
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
  private readonly flightGuide: FlightGuide;
  private readonly webcam: WebcamPanel;
  private readonly touch: TouchController;
  private readonly tilt = new TiltController();
  private readonly rotateHint: HTMLElement;
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
  private joinPoll: number | null = null;
  private lastMatchPhase = "";
  private playerSteer: "none" | "tilt" | "touch" = "none";
  private adminFollowSlot: 0 | 1 | null = null;
  private adminPilot = false;
  private readonly combat = new HuntCombat();
  private readonly pickups = new HuntPickups();
  private huntStartAt = 0;
  private heat = 0;
  private overheated = false;
  private fireCool = 0;
  private catchAcc = 0;
  private fireKey = false;
  private huntHudAcc = 0;
  private turboUntil = 0;
  private windUntil = 0;
  private lastGrabId = -1;

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
    this.scene.add(this.combat.group);
    this.scene.add(this.pickups.group);
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
    this.duelPanel = new DuelPanel(
      uiRoot,
      () => this.match.startMatch(),
      () => this.match.resetMatch(),
      (mode) => {
        this.match.setMode(mode);
        void this.refreshDuelPanel();
      },
      () => this.pilotFromAdmin(),
    );
    this.coach = new BodyCoach(
      uiRoot,
      () => { void this.enableTilt(); },
      () => this.playWithTouch(),
      () => { void this.openInChrome(); },
    );
    this.flightGuide = new FlightGuide(uiRoot);
    this.webcam = new WebcamPanel(uiRoot);
    this.touch = new TouchController(uiRoot);
    this.rotateHint = document.createElement("div");
    this.rotateHint.className = "rotate-hint";
    this.rotateHint.innerHTML = `
      <div class="rotate-phone" aria-hidden="true"></div>
      <p class="rotate-title">Gira el celular</p>
      <p class="rotate-lead">El juego solo funciona en horizontal. Ponte en horizontal para volar.</p>
    `;
    uiRoot.appendChild(this.rotateHint);
    this.match.on((message) => { void this.onMatchMessage(message); });

    this.flight.reset(6, 42, 118, 0);
    this.followCamera.snapTo(this.flight);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("orientationchange", this.handleResize);
    screen.orientation?.addEventListener("change", this.handleResize);
    window.addEventListener("keydown", this.handleHotkeys);
    window.addEventListener("pointerdown", this.onHuntTap);

    const adminRoom = adminRoomFromLocation();
    if (adminRoom) {
      void this.startAdminDuel(adminRoom);
    } else {
      const room = duelRoomFromLocation();
      if (room) {
        void this.joinAsPlayer(room);
      }
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
    window.removeEventListener("orientationchange", this.handleResize);
    screen.orientation?.removeEventListener("change", this.handleResize);
    window.removeEventListener("keydown", this.handleHotkeys);
    window.removeEventListener("pointerdown", this.onHuntTap);
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

  private startAdminDuel = async (existingRoom?: string): Promise<void> => {
    if (this.session === "admin") {
      return;
    }
    const room = existingRoom ?? randomRoomCode();
    history.replaceState(null, "", `?admin=1&duel=${room}`);
    this.session = "admin";
    this.mode = "race";
    this.playing = true;
    this.menu.hide();
    this.hud.hide();
    this.ghost.hide();
    this.rival.group.visible = true;
    this.world.course.arm();
    this.joinUrl = "";
    this.match.connect("admin", room);
    this.watchJoinUrl(room);
    await this.refreshDuelPanel();
    this.joinUrl = await waitForHttpsJoinUrl(room);
    this.placeAtSlot(0);
    this.placeRivalAtSlot(1);
    this.adminFollowSlot = null;
    this.followCamera.snapTarget(
      this.bird.group.position.x,
      this.bird.group.position.y,
      this.bird.group.position.z,
      this.bird.group.quaternion.x,
      this.bird.group.quaternion.y,
      this.bird.group.quaternion.z,
      this.bird.group.quaternion.w,
    );
    await this.refreshDuelPanel();
    try {
      await this.audio.start();
    } catch {
      // el admin en PC suele permitir audio
    }
  };

  private watchJoinUrl(room: string): void {
    if (this.joinPoll !== null) {
      window.clearInterval(this.joinPoll);
    }
    this.joinPoll = window.setInterval(() => {
      void this.refreshJoinUrl(room);
    }, 1000);
    void this.refreshDuelPanel();
  }

  private async refreshJoinUrl(room: string): Promise<void> {
    if (this.session !== "admin" || this.match.phase !== "lobby") {
      return;
    }
    const url = await duelJoinUrl(room);
    if (url && url !== this.joinUrl) {
      this.joinUrl = url;
      await this.refreshDuelPanel();
    }
  }

  private joinAsPlayer = async (room: string): Promise<void> => {
    this.session = "player";
    this.mode = "race";
    this.playing = true;
    this.menu.hide();
    this.hud.hide();
    this.ghost.hide();
    this.rival.group.visible = true;
    this.touch.show();
    this.webcam.setPlayerLayout(false);
    this.playerSteer = "none";
    this.tilt.tryListen();
    this.coach.show();
    this.flightGuide.show();
    document.body.classList.add("player-session");
    this.updateOrientationHint();
    void lockLandscape();
    const unlock = (): void => {
      void this.audio.start();
      void lockLandscape();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    if (window.isSecureContext) {
      const orientation = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof orientation.requestPermission !== "function") {
        void this.enableTilt();
      }
    } else {
      this.coach.setHint("Este enlace es http y Brave bloquea el sensor. Cierra la pestaña, en el PC espera el QR con candado y vuelve a escanear.");
    }
    this.world.course.arm();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.match.connect("player", room.toUpperCase());
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
        this.adminFollowSlot = null;
      }
      if (this.match.phase === "racing") {
        this.world.course.beginRace();
        this.beginHuntRound();
      }
    }
    if (message.t === "seated") {
      this.adminPilot = true;
      this.placeAtSlot(message.slot);
      this.followCamera.snapTo(this.flight);
      if (this.match.phase === "racing" || this.match.phase === "countdown") {
        this.beginHuntRound();
      }
    }
    if (message.t === "shot" && message.slot !== this.match.slot) {
      this.combat.spawn(message.x, message.y, message.z, message.dx, message.dy, message.dz, false);
    }
    if (message.t === "hit" && message.target === this.match.slot && (this.session === "player" || this.adminPilot)) {
      this.flight.applyHit();
    }
    if (message.t === "crates") {
      this.pickups.setCrates(message.crates);
    }
    if (message.t === "fx") {
      this.applyHuntFx(message.kind, message.by, message.target);
    }
    if (message.t === "pose") {
      if (this.match.mode === "race" && (this.match.phase === "racing" || this.match.phase === "finished")) {
        this.duelPanel.setRings(this.liveRings(), this.world.course.status.total);
      }
      return;
    }
    await this.refreshDuelPanel();
  }

  private beginHuntRound(): void {
    this.huntStartAt = performance.now();
    this.fireCool = 0;
    this.catchAcc = 0;
    this.combat.clear();
    this.heat = 0;
    this.overheated = false;
    this.turboUntil = 0;
    this.windUntil = 0;
    this.lastGrabId = -1;
    this.pickups.clear();
  }

  private resetDuelCrafts(): void {
    const slot = this.match.slot ?? 0;
    this.placeAtSlot(slot);
    this.placeRivalAtSlot(slot === 0 ? 1 : 0);
    this.world.course.arm();
    this.hitCooldown = 0.6;
  }

  private pilotFromAdmin(): void {
    if (this.session !== "admin" || this.adminPilot) {
      return;
    }
    this.match.pilot();
  }

  private adminPilotInput(keyboard: FlightInput): FlightInput {
    if (this.huntHoldLeft() > 0) {
      this.demoInput.throttle = 0;
      this.demoInput.yaw = 0;
      this.demoInput.pitch = 0;
      this.demoInput.roll = 0;
      return this.demoInput;
    }
    return keyboard;
  }

  private localMesh(): Bird {
    return this.match.slot === 1 ? this.rival : this.bird;
  }

  private remoteMesh(): Bird {
    return this.match.slot === 1 ? this.bird : this.rival;
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
      matchMode: this.match.mode,
      fleeSlot: this.match.fleeSlot,
      hp: this.match.hp,
      winnerReason: this.match.winnerReason,
      localSlot: this.match.slot,
      heat: this.heat,
      overheated: this.overheated,
      huntHold: this.huntHoldLeft(),
      huntTimeLeft: Math.max(0, HUNT.MATCH_TIME - this.world.course.status.flown),
      rivalDist: this.remoteMesh().group.visible
        ? this.flight.position.distanceTo(this.remoteMesh().group.position)
        : 0,
      canPilot: this.session === "admin"
        && !this.adminPilot
        && this.match.slot === null
        && this.match.phase !== "finished"
        && this.match.players.some((player) => !player.connected),
      heldKind: this.match.slot !== null ? this.match.held[this.match.slot] : null,
      huntArrow: this.huntArrow(),
    });
  }

  private liveRings(): [number, number] {
    const localRings = this.world.course.status.passed;
    const other = this.match.slot === 0 ? this.match.lastPose[1] : this.match.lastPose[0];
    if (this.session === "admin" && !this.adminPilot) {
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
    if (this.session === "admin" && !this.adminPilot) {
      this.tickAdmin(dt);
      return;
    }
    const isPilot = this.session === "player" || this.adminPilot;
    if (this.session !== "admin") {
      if (this.detector.running) {
        this.detector.detect();
      }
    }
    const pose = this.session === "admin"
      ? this.demoInput
      : this.pose.update(dt, this.detector.running ? this.detector.latest : null);
    if (this.session !== "admin") {
      this.webcam.setTracking(this.detector.running && this.pose.visible && !this.pose.resting);
      this.webcam.drawPose(this.detector.latest?.landmarks ?? null);
    }
    if (this.session === "player") {
      this.updatePlayerCoach();
    }
    const keyboard = this.keyboard.update();
    const usingKeys = inputActive(keyboard);
    const touch = this.touch.update();
    const live = this.session === "player"
      ? this.playerInput(pose, touch, keyboard)
      : this.adminPilot
        ? this.adminPilotInput(keyboard)
        : this.playing
          ? (this.detector.running ? preferOverride(pose, keyboard, this.mixedInput, POSE.KEYBOARD_OVERRIDE) : keyboard)
          : this.updateDemoInput();
    const usingTouch = inputActive(touch);
    const cruise = this.playing && this.pose.resting && this.detector.running && !usingKeys && !usingTouch;
    const blocked = this.session === "player" && this.isPortraitPlay();

    if (!blocked) {
      this.flight.update(dt, live, (x, z) => this.world.getHeightAt(x, z), cruise && !this.adminPilot, this.huntFlightMods());
    }
    if (this.session === "player") {
      this.flightGuide.setMove(guideFromInput(live.yaw, live.pitch, live.throttle));
    }
    this.localMesh().update(dt, this.flight);
    this.localMesh().group.visible = true;
    this.followCamera.update(dt, this.flight);
    this.tickHunt(dt);
    if (isPilot) {
      this.syncDuelPlayer(dt);
    }
    if (!blocked && this.playing && this.mode === "race" && (this.session === "solo" || this.match.phase === "racing")) {
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      const racing = this.world.course.status.phase === "racing" || isPilot;
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
    const now = performance.now();
    const a = this.match.lastPose[0] && now - this.match.lastPoseAt[0] < 900 ? this.match.lastPose[0] : null;
    const b = this.match.lastPose[1] && now - this.match.lastPoseAt[1] < 900 ? this.match.lastPose[1] : null;
    this.bird.group.visible = Boolean(a) || (!a && !b);
    this.rival.group.visible = Boolean(b);
    if (a) {
      this.bird.snapRemote(a.x, a.y, a.z, a.qx, a.qy, a.qz, a.qw, a.spd, dt);
    }
    if (b) {
      this.rival.snapRemote(b.x, b.y, b.z, b.qx, b.qy, b.qz, b.qw, b.spd, dt);
    }
    const live = pickLivePose(a, b);
    if (live) {
      const slot: 0 | 1 = live === a ? 0 : 1;
      if (this.adminFollowSlot !== slot) {
        this.followCamera.snapTarget(live.x, live.y, live.z, live.qx, live.qy, live.qz, live.qw);
        this.adminFollowSlot = slot;
      } else {
        this.followCamera.updateTarget(dt, live.x, live.y, live.z, live.qx, live.qy, live.qz, live.qw);
      }
    }
    this.combat.update(dt, null);
    this.pickups.update(dt);
    this.world.update(dt);
    this.audio.setFlightLevel(((a?.spd ?? 20) + (b?.spd ?? 20)) * 1.8, this.bird.group.position.y);
    if (this.match.mode === "hunt" && this.match.phase === "racing") {
      this.pulseHuntHud(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private syncDuelPlayer(dt: number): void {
    const otherSlot = this.match.slot === 0 ? 1 : 0;
    const other = this.match.lastPose[otherSlot];
    const remote = this.remoteMesh();
    if (other) {
      remote.updateRemote(dt, other.x, other.y, other.z, other.qx, other.qy, other.qz, other.qw, other.spd);
      remote.group.visible = true;
    } else if (this.adminPilot || this.session === "player") {
      remote.group.visible = Boolean(other);
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
      time: this.match.mode === "hunt" ? status.flown : status.time,
      done: (this.match.mode !== "hunt" || this.isHuntPrey()) && status.phase === "finished" ? 1 : 0,
      hp: this.match.hp[this.match.slot],
      ammo: Math.round(this.heat * 100),
    });
  }

  private playerInput(pose: FlightInput, touch: FlightInput, keyboard: FlightInput): FlightInput {
    if (this.huntHoldLeft() > 0) {
      this.demoInput.throttle = 0;
      this.demoInput.yaw = 0;
      this.demoInput.pitch = 0;
      this.demoInput.roll = 0;
      return this.demoInput;
    }
    if (this.isPortraitPlay()) {
      this.demoInput.throttle = 0;
      this.demoInput.yaw = 0;
      this.demoInput.pitch = 0;
      this.demoInput.roll = 0;
      return this.demoInput;
    }
    if (this.playerSteer !== "touch" && (this.playerSteer === "tilt" || this.tilt.enabled || this.tilt.hasSignal)) {
      const tilt = this.tilt.update();
      const boost = this.touch.heldThrottle();
      if (boost !== null) {
        tilt.throttle = boost;
      }
      return tilt;
    }
    if (this.playerSteer === "touch") {
      return preferOverride(touch, keyboard, this.mixedInput, 0.12);
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
      this.coach.setSteer("pick");
      this.coach.setHint("El iPhone pidió permiso. Pulsa Celular otra vez y acepta, o usa Botones.");
      return;
    }
    this.playerSteer = "tilt";
    this.touch.showThrottleOnly();
    this.coach.setSteer("tilt");
    await lockLandscape();
    this.coach.setHint("Inclina el celular. Toca Botones si quieres la palanca.");
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
    this.coach.setSteer("touch");
    this.coach.setHint("Palanca y botones. Toca Celular para volver a inclinar.");
  }

  private async openInChrome(): Promise<void> {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      this.coach.setHint("Enlace copiado. Si no abre solo, pégalo en Chrome.");
    } catch {
      this.coach.setHint("Copia el enlace de la barra y ábrelo en Chrome.");
    }
    const parsed = new URL(url);
    const path = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    location.href = `intent://${path}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.setTimeout(() => {
      location.href = `googlechrome://navigate?url=${encodeURIComponent(url)}`;
    }, 400);
  }

  private updatePlayerCoach(): void {
    this.updateOrientationHint();
    const livePhase = this.match.phase === "countdown" || this.match.phase === "racing" || this.match.phase === "finished";
    const tiltOn = this.playerSteer === "tilt";
    this.coach.setSteer(this.playerSteer === "none" ? "pick" : this.playerSteer);
    this.coach.element.classList.toggle("racing", livePhase || this.playerSteer !== "none");
    if (tiltOn) {
      this.touch.showThrottleOnly();
    } else {
      this.touch.show();
      this.touch.element.classList.remove("fallback", "tilt-mode");
    }
    this.syncHuntButtons();
    const issue = detectBrowserIssue();
    const warnBrowser = this.session === "player" && Boolean(issue) && !this.tilt.hasSignal;
    this.coach.setChromeHint(warnBrowser, browserIssueMessage(issue));
    this.coach.element.classList.toggle("needs-browser", warnBrowser);
    if (!window.isSecureContext && this.playerSteer !== "touch") {
      this.coach.setHint("En http el sensor está bloqueado. Usa Botones, o el QR con candado.");
      return;
    }
    if (tiltOn) {
      this.coach.setHint("Celular: inclina para volar. Botones cuando quieras.");
      return;
    }
    if (this.playerSteer === "touch") {
      this.coach.setHint("Botones: palanca y acelerar. Celular cuando quieras.");
      return;
    }
    this.coach.setHint("Elige Celular para inclinar, o Botones para la palanca.");
  }

  private updateOrientationHint(): void {
    const portrait = this.isPortraitPlay();
    const wasPortrait = document.body.classList.contains("portrait");
    document.body.classList.toggle("portrait", portrait);
    if (wasPortrait && !portrait && this.tilt.enabled) {
      this.tilt.calibrate();
    }
    if (!portrait && this.session === "player") {
      void lockLandscape();
    }
  }

  private isPortraitPlay(): boolean {
    if (this.session !== "player") {
      return false;
    }
    return window.innerHeight > window.innerWidth + 80;
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
      return;
    }
    if (event.code === "KeyF") {
      event.preventDefault();
      this.fireKey = true;
      return;
    }
    if (event.code === "KeyC") {
      event.preventDefault();
      this.tryUseItem();
    }
  }

  private onHuntTap = (event: PointerEvent): void => {
    if (this.session !== "player" || this.match.mode !== "hunt" || this.playerSteer !== "tilt") {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, .touch-pad, .body-coach, .duel-panel, .flight-guide")) {
      return;
    }
    if (event.clientX < window.innerWidth * 0.68) {
      return;
    }
    this.tryHuntFire();
  };

  private tickHunt(dt: number): void {
    this.pickups.update(dt);
    if ((this.session !== "player" && !this.adminPilot) || this.match.mode !== "hunt") {
      this.combat.update(dt, null);
      return;
    }
    this.fireCool = Math.max(0, this.fireCool - dt);
    this.tickWeaponHeat(dt);
    this.duelPanel.setHeat(this.heat, this.overheated);
    if (this.touch.consumeFire() || this.fireKey) {
      this.fireKey = false;
      this.tryHuntFire();
    }
    if (this.touch.consumeItem()) {
      this.tryUseItem();
    }
    this.tryGrabCrate();
    this.syncHuntButtons();
    const remote = this.remoteMesh();
    const aim = this.match.phase === "racing" && remote.group.visible ? remote.group.position : null;
    if (this.combat.update(dt, aim) && this.match.slot !== null) {
      this.match.sendHit(this.match.slot === 0 ? 1 : 0, "shot");
    }
    if (this.match.phase === "racing" && this.isHuntHunter() && this.huntHoldLeft() <= 0 && aim) {
      if (this.flight.position.distanceTo(aim) <= HUNT.CATCH_RADIUS) {
        this.catchAcc += dt;
        if (this.catchAcc >= HUNT.CATCH_HOLD) {
          this.catchAcc = 0;
          this.match.sendHit(this.match.fleeSlot, "catch");
        }
      } else {
        this.catchAcc = 0;
      }
    }
    if (this.match.phase === "racing" || this.match.phase === "countdown") {
      this.pulseHuntHud(dt);
    }
  }

  private pulseHuntHud(dt: number): void {
    this.huntHudAcc += dt;
    if (this.huntHudAcc < 0.25) {
      return;
    }
    this.huntHudAcc = 0;
    void this.refreshDuelPanel();
  }

  private tickWeaponHeat(dt: number): void {
    const rate = this.overheated ? HUNT.HEAT_COOL_LOCK : HUNT.HEAT_COOL;
    this.heat = Math.max(0, this.heat - rate * dt);
    if (this.overheated && this.heat <= HUNT.HEAT_RECOVER) {
      this.overheated = false;
    }
  }

  private tryHuntFire(): void {
    if (
      this.match.mode !== "hunt"
      || this.match.phase !== "racing"
      || (this.session !== "player" && !this.adminPilot)
      || this.overheated
      || this.fireCool > 0
      || this.huntHoldLeft() > 0
      || this.isPortraitPlay()
    ) {
      return;
    }
    this.heat = Math.min(1, this.heat + HUNT.HEAT_SHOT);
    if (this.heat >= 1) {
      this.heat = 1;
      this.overheated = true;
    }
    this.fireCool = HUNT.FIRE_COOLDOWN;
    const dir = this.flight.forward;
    const x = this.flight.position.x + dir.x * 2.2;
    const y = this.flight.position.y + dir.y * 2.2;
    const z = this.flight.position.z + dir.z * 2.2;
    this.combat.spawn(x, y, z, dir.x, dir.y, dir.z, true);
    if (this.match.slot !== null) {
      this.match.sendShot({ slot: this.match.slot, x, y, z, dx: dir.x, dy: dir.y, dz: dir.z });
    }
  }

  private huntHoldLeft(): number {
    if (this.match.mode !== "hunt" || this.match.phase !== "racing" || !this.isHuntHunter()) {
      return 0;
    }
    return Math.max(0, HUNT.HEAD_START - (performance.now() - this.huntStartAt) / 1000);
  }

  private isHuntPrey(): boolean {
    return this.match.mode === "hunt" && this.match.slot === this.match.fleeSlot;
  }

  private isHuntHunter(): boolean {
    return this.match.mode === "hunt" && this.match.slot !== null && this.match.slot !== this.match.fleeSlot;
  }

  private syncHuntButtons(): void {
    const racing = this.match.mode === "hunt" && this.match.phase === "racing" && this.huntHoldLeft() <= 0;
    this.touch.setFireVisible(racing);
    this.touch.setFireHot(this.overheated);
    const kind = this.match.slot !== null ? this.match.held[this.match.slot] : null;
    this.touch.setItemVisible(Boolean(kind) && racing, kind ? ITEM_LABEL[kind] : "Ítem");
  }

  private tryGrabCrate(): void {
    if (this.match.phase !== "racing" || this.match.slot === null || this.match.held[this.match.slot]) {
      return;
    }
    for (const crate of this.match.crates) {
      const dx = crate.x - this.flight.position.x;
      const dy = crate.y - this.flight.position.y;
      const dz = crate.z - this.flight.position.z;
      if (dx * dx + dy * dy + dz * dz <= HUNT.ITEM_RADIUS * HUNT.ITEM_RADIUS) {
        if (this.lastGrabId !== crate.id) {
          this.lastGrabId = crate.id;
          this.match.sendGrab(crate.id);
        }
        return;
      }
    }
  }

  private tryUseItem(): void {
    if (this.match.mode !== "hunt" || this.match.phase !== "racing" || this.match.slot === null) {
      return;
    }
    if (!this.match.held[this.match.slot] || this.huntHoldLeft() > 0) {
      return;
    }
    this.match.sendUse();
  }

  private applyHuntFx(kind: "turbo" | "wind" | "ammo", by: 0 | 1, target?: 0 | 1): void {
    const me = this.match.slot;
    const now = performance.now();
    if (kind === "turbo" && by === me) {
      this.turboUntil = now + HUNT.TURBO_TIME * 1000;
    }
    if (kind === "wind" && target === me) {
      this.windUntil = now + HUNT.WIND_TIME * 1000;
    }
    if (kind === "ammo" && target === me) {
      this.heat = 1;
      this.overheated = true;
      this.duelPanel.setHeat(1, true);
      this.touch.setFireHot(true);
    }
  }

  private huntFlightMods(): { speedMul: number; inputMul: number } | undefined {
    if (this.match.mode !== "hunt") {
      return undefined;
    }
    const now = performance.now();
    const turbo = now < this.turboUntil;
    const wind = now < this.windUntil;
    if (!turbo && !wind) {
      return undefined;
    }
    return {
      speedMul: turbo ? HUNT.TURBO_MUL : wind ? HUNT.WIND_MUL : 1,
      inputMul: wind ? HUNT.WIND_STEER : 1,
    };
  }

  private huntArrow(): string {
    if (!this.isHuntHunter()) {
      return "";
    }
    const remote = this.remoteMesh().group;
    if (!remote.visible) {
      return "";
    }
    const dx = remote.position.x - this.flight.position.x;
    const dz = remote.position.z - this.flight.position.z;
    const want = Math.atan2(dx, -dz);
    const look = Math.atan2(this.flight.forward.x, -this.flight.forward.z);
    let deg = ((want - look) * 180) / Math.PI;
    if (deg < 0) {
      deg += 360;
    }
    const faces = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    return faces[Math.round(deg / 45) % 8] ?? "↑";
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
    this.updateOrientationHint();
  };
}

function pickLivePose(a: DuelPose | null, b: DuelPose | null): DuelPose | null {
  if (a && b) {
    return a.spd >= b.spd ? a : b;
  }
  return a ?? b;
}

async function lockLandscape(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    if (typeof orientation.lock !== "function") {
      return;
    }
    await orientation.lock("landscape").catch(() => orientation.lock?.("landscape-primary"));
  } catch {
    // iOS y algunos Android no permiten bloquear la orientación
  }
}

function inputActive(input: FlightInput, threshold = 0.12): boolean {
  return Math.max(
    Math.abs(input.throttle),
    Math.abs(input.yaw),
    Math.abs(input.pitch),
    Math.abs(input.roll),
  ) > threshold;
}
