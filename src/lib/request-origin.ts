/** Protect browser writes while allowing local server-to-server jobs without Origin. */
export function allowsRequestOrigin(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
    return ["https:", "http:"].includes(source.protocol) && source.host === host;
  } catch {
    return false;
  }
}
