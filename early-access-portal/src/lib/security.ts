/** Per-request Content-Security-Policy for the portal (nonce-based, no inline scripts). */
export function buildCsp(nonce: string, opts: { turnstile: boolean; isDev: boolean; upgradeInsecure: boolean }): string {
  const cf = opts.turnstile ? ["https://challenges.cloudflare.com"] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...cf, ...(opts.isDev ? ["ws://localhost:*"] : [])],
    "frame-src": cf.length ? cf : ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (opts.upgradeInsecure && !opts.isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Only same-site relative paths (blocks open redirects through ?next=). */
export function safeRedirectPath(next: unknown, fallback = "/admin"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://portal.local");
    return url.origin === "http://portal.local" ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}
