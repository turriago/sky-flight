export async function duelJoinUrl(room: string): Promise<string> {
  const query = `?duel=${encodeURIComponent(room.toUpperCase())}`;
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local) {
    try {
      const response = await fetch("/__sky/lan");
      const data = (await response.json()) as { host?: string };
      if (data.host && data.host !== "localhost") {
        const port = location.port ? `:${location.port}` : "";
        return `${location.protocol}//${data.host}${port}/${query}`;
      }
    } catch {
      // usa origin si no hay IP de red
    }
  }
  return `${location.origin}/${query}`;
}
