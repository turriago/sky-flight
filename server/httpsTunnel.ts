import { spawn, type ChildProcess } from "node:child_process";

let child: ChildProcess | null = null;
let publicUrl = "";
let started = false;
let stopping = false;
let killing = false;
let port = 5173;
let retryAt: ReturnType<typeof setTimeout> | null = null;

export function getHttpsPublicUrl(): string {
  return publicUrl;
}

export function startHttpsTunnel(nextPort: number): void {
  port = nextPort;
  stopping = false;
  if (started) {
    return;
  }
  launch();
}

export function stopHttpsTunnel(): void {
  stopping = true;
  if (retryAt) {
    clearTimeout(retryAt);
    retryAt = null;
  }
  killChild();
  started = false;
  publicUrl = "";
}

function launch(): void {
  started = true;
  const target = `http://127.0.0.1:${port}`;
  child = spawn("npx", [
    "--yes",
    "cloudflared",
    "--protocol",
    "http2",
    "--edge-ip-version",
    "4",
    "--no-autoupdate",
    "tunnel",
    "--url",
    target,
  ], {
    shell: true,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const onChunk = (buf: Buffer): void => {
    const text = buf.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (!match) {
      return;
    }
    const url = match[0].replace(/\/$/, "");
    if (publicUrl !== url) {
      publicUrl = url;
      console.info(`[sky-flight] QR del celular: ${publicUrl}`);
    }
  };
  child.stdout?.on("data", onChunk);
  child.stderr?.on("data", onChunk);
  child.on("exit", () => {
    child = null;
    started = false;
    publicUrl = "";
    const wasKilling = killing;
    killing = false;
    if (stopping || wasKilling) {
      return;
    }
    console.warn("[sky-flight] el túnel del QR se cayó. Reabriendo…");
    retryAt = setTimeout(() => startHttpsTunnel(port), 2000);
  });
}

function killChild(): void {
  killing = true;
  if (child?.pid && process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    child?.kill();
  }
  child = null;
}
