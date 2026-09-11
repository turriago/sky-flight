export function adminRoomFromLocation(): string | null {
  const params = new URLSearchParams(location.search);
  if (params.get("admin") !== "1") {
    return null;
  }
  const duel = params.get("duel");
  return duel ? duel.toUpperCase() : null;
}

export function duelRoomFromLocation(): string | null {
  const params = new URLSearchParams(location.search);
  if (params.get("admin") === "1") {
    return null;
  }
  const query = params.get("duel");
  if (query) {
    return query.toUpperCase();
  }
  const path = location.pathname.match(/\/j\/([A-Za-z0-9]+)/i);
  if (path?.[1]) {
    return path[1].toUpperCase();
  }
  const hash = location.hash.replace(/^#\/?/, "").trim();
  if (hash && /^[A-Za-z0-9]{3,8}$/.test(hash)) {
    return hash.toUpperCase();
  }
  return null;
}

export async function duelJoinUrl(room: string): Promise<string> {
  const code = room.toUpperCase();
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local) {
    try {
      const response = await fetch("/__sky/lan");
      const data = (await response.json()) as { publicUrl?: string; host?: string; port?: number };
      if (data.publicUrl?.startsWith("https://")) {
        return `${data.publicUrl.replace(/\/$/, "")}/j/${code}`;
      }
      const host = data.host;
      const port = data.port || 5173;
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        return `http://${host}:${port}/j/${code}`;
      }
    } catch {
      // el túnel HTTPS aún no está listo
    }
    return "";
  }
  if (location.protocol === "https:") {
    return `${location.origin}/j/${code}`;
  }
  return `https://jueguito-mu.vercel.app/j/${code}`;
}

export async function waitForHttpsJoinUrl(room: string, tries = 40): Promise<string> {
  for (let i = 0; i < tries; i++) {
    const url = await duelJoinUrl(room);
    if (url) {
      return url;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local) {
    return "";
  }
  return `https://jueguito-mu.vercel.app/j/${room.toUpperCase()}`;
}
