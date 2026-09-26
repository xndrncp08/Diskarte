/** Pure security helpers shared by proxy.ts, route handlers and tests. */

export interface CspSources {
  supabaseUrl?: string | null;
  livekitUrl?: string | null;
}

function origin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Swap ws(s) <-> http(s) so both the signalling socket and REST/region endpoints are allowed. */
function pairedOrigins(url: string | null | undefined): string[] {
  const o = origin(url);
  if (!o) return [];
  const u = new URL(o);
  const secure = u.protocol === "https:" || u.protocol === "wss:";
  return [`${secure ? "https" : "http"}://${u.host}`, `${secure ? "wss" : "ws"}://${u.host}`];
}

export function buildCsp(nonce: string, sources: CspSources, isDev: boolean): string {
  const supabase = pairedOrigins(sources.supabaseUrl);
  const livekit = pairedOrigins(sources.livekitUrl);
  const supabaseHttp = supabase[0] ? [supabase[0]] : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // React emits style attributes and Framer Motion / LiveKit animate inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...supabaseHttp, "https://avatars.githubusercontent.com", "https://lh3.googleusercontent.com", "https://cdn.discordapp.com"],
    "media-src": ["'self'", "blob:", "mediastream:", ...supabaseHttp],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabase, ...livekit, ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : [])],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...supabaseHttp],
    "frame-ancestors": ["'none'"],
  };

  const parts = Object.entries(directives).map(([k, v]) => `${k} ${Array.from(new Set(v)).join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string) {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * CSRF defence for route handlers: a state-changing request must carry an Origin (or, failing that,
 * a Referer) whose host matches the host the request was sent to, or one of `allowedOrigins`.
 */
export function isSameOriginRequest(
  headers: Headers,
  requestUrl: string,
  allowedOrigins: readonly string[] = [],
): boolean {
  const source = headers.get("origin") ?? headers.get("referer");
  if (!source || source === "null") return false;
  const sourceOrigin = origin(source);
  if (!sourceOrigin) return false;

  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto");
  const url = new URL(requestUrl);
  const host = forwardedHost ?? headers.get("host") ?? url.host;
  const proto = forwardedProto ?? url.protocol.replace(":", "");
  const expected = `${proto}://${host}`;

  if (sourceOrigin === expected) return true;
  // Behind TLS-terminating proxies the scheme may not be forwarded; compare hosts as a fallback.
  if (new URL(sourceOrigin).host === host && !forwardedProto) return true;
  return allowedOrigins.some((o) => origin(o) === sourceOrigin);
}

/** Only allow redirects to same-site relative paths (prevents open redirects via ?next=). */
export function safeRedirectPath(next: string | null | undefined, fallback = "/tambayan"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://diskarte.local");
    if (url.origin !== "http://diskarte.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
