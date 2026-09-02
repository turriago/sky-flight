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
      const data = (await response.json()) as { host?: string };
      if (data.host && data.host !== "localhost") {
        const port = location.port ? `:${location.port}` : "";
        return `${location.protocol}//${data.host}${port}/j/${code}`;
      }
    } catch {
      // usa origin si no hay IP de red
    }
  }
  return `${location.origin}/j/${code}`;
}
