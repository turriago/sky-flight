import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, PoseFrame } from "./PoseTypes";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

function toLandmark(point: { x: number; y: number; z: number; visibility?: number }): Landmark {
  const visibility = point.visibility && point.visibility > 0.01 ? point.visibility : 1;
  return {
    x: 1 - point.x,
    y: point.y,
    z: point.z,
    visibility,
  };
}

export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private lastTimestamp = 0;
  latest: PoseFrame | null = null;
  running = false;
  lastError: string | null = null;

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    if (video.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener("loadeddata", onReady);
          video.removeEventListener("error", onError);
          reject(new Error("El vídeo de la cámara no está listo."));
        };
        video.addEventListener("loadeddata", onReady);
        video.addEventListener("error", onError);
      });
    }

    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

    // CPU: Three.js ya usa WebGL y el delegate GPU suele fallar en detectForVideo.
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "CPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
      minTrackingConfidence: 0.3,
    });

    this.running = true;
    this.latest = null;
    this.lastTimestamp = 0;
    this.lastError = null;
  }

  detect(): PoseFrame | null {
    if (!this.running || !this.landmarker || !this.video) {
      this.latest = null;
      return null;
    }

    if (this.video.readyState < 2 || this.video.videoWidth < 8) {
      return this.latest;
    }

    let timestamp = performance.now();
    if (timestamp <= this.lastTimestamp) {
      timestamp = this.lastTimestamp + 1;
    }

    try {
      const result = this.landmarker.detectForVideo(this.video, timestamp);
      this.lastTimestamp = timestamp;
      this.lastError = null;
      const pose = result.landmarks[0];
      const world = result.worldLandmarks[0];
      if (!pose || pose.length < 17) {
        this.latest = null;
        return null;
      }

      this.latest = {
        timestamp,
        landmarks: pose.map(toLandmark),
        worldLandmarks: (world ?? []).map(toLandmark),
      };
      return this.latest;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Error al detectar pose";
      this.latest = null;
      return null;
    }
  }

  stop(): void {
    this.running = false;
    this.latest = null;
    this.lastError = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.video = null;
  }
}
