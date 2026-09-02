import type { Landmark } from "../vision/PoseTypes";

const SKELETON: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

export class WebcamPanel {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly hideButton: HTMLButtonElement;
  private readonly errorLabel: HTMLElement;
  private stream: MediaStream | null = null;
  private previewHidden = false;

  constructor(root: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "webcam-panel hidden";
    this.element.innerHTML = `
      <div class="webcam-frame">
        <video class="webcam-video" autoplay playsinline muted></video>
        <canvas class="webcam-overlay"></canvas>
      </div>
      <div class="webcam-actions">
        <button class="ui-button" type="button" data-hide-preview>Ocultar preview</button>
      </div>
      <p class="webcam-error hidden" data-error></p>
    `;
    root.appendChild(this.element);
    this.video = this.element.querySelector("video")!;
    this.overlay = this.element.querySelector("canvas")!;
    this.hideButton = this.element.querySelector("[data-hide-preview]")!;
    this.errorLabel = this.element.querySelector("[data-error]")!;
    this.hideButton.addEventListener("click", () => this.togglePreview());
  }

  async startStream(): Promise<HTMLVideoElement> {
    this.clearError();
    this.stream = await this.openCamera();
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("webkit-playsinline", "true");
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.element.classList.remove("hidden");
    this.setPreviewHidden(false);
    this.setTracking(false);
    return this.video;
  }

  setPlayerLayout(on: boolean): void {
    this.element.classList.toggle("player", on);
  }

  private async openCamera(): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
      },
      { audio: false, video: { facingMode: "user" } },
      { audio: false, video: true },
    ];
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No se pudo abrir la cámara.");
  }

  stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.element.classList.add("hidden");
    this.setTracking(false);
    const context = this.overlay.getContext("2d");
    context?.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  setTracking(tracking: boolean): void {
    this.element.classList.toggle("tracking", tracking);
  }

  drawPose(landmarks: Landmark[] | null): void {
    const context = this.overlay.getContext("2d");
    if (!context) {
      return;
    }

    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    if (width < 2 || height < 2) {
      return;
    }
    if (this.overlay.width !== width || this.overlay.height !== height) {
      this.overlay.width = width;
      this.overlay.height = height;
    }

    context.clearRect(0, 0, width, height);
    if (!landmarks || landmarks.length < 17) {
      return;
    }

    context.strokeStyle = "rgba(126, 208, 192, 0.95)";
    context.fillStyle = "rgba(243, 194, 122, 0.95)";
    context.lineWidth = 2;

    for (const [a, b] of SKELETON) {
      const pa = landmarks[a];
      const pb = landmarks[b];
      if (!pa || !pb) continue;
      context.beginPath();
      context.moveTo(pa.x * width, pa.y * height);
      context.lineTo(pb.x * width, pb.y * height);
      context.stroke();
    }

    for (const index of [0, 11, 12, 13, 14, 15, 16, 23, 24]) {
      const point = landmarks[index];
      if (!point) continue;
      context.beginPath();
      context.arc(point.x * width, point.y * height, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  showError(message: string): void {
    this.errorLabel.textContent = message;
    this.errorLabel.classList.remove("hidden");
    this.element.classList.remove("hidden");
  }

  clearError(): void {
    this.errorLabel.textContent = "";
    this.errorLabel.classList.add("hidden");
  }

  private togglePreview(): void {
    this.setPreviewHidden(!this.previewHidden);
  }

  private setPreviewHidden(hidden: boolean): void {
    this.previewHidden = hidden;
    this.video.classList.toggle("hidden", hidden);
    this.hideButton.textContent = hidden ? "Mostrar preview" : "Ocultar preview";
  }
}
