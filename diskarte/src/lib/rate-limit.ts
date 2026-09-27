/**
 * Sliding-window rate limiting for proxy.ts, Server Actions and Route Handlers.
 * - Default store: process memory (Diskarte runs as a single container on the free tier).
 * - Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to share limits across instances
 *   (see `checkDistributed`).
 * The database additionally enforces its own limits (messages_before_insert) for anything that
 * bypasses the app server.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key?: string): void;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    if (hits.size <= maxKeys) return;
    for (const [key, stamps] of hits) {
      if (stamps.length === 0 || now - stamps[stamps.length - 1] > windowMs) hits.delete(key);
      if (hits.size <= maxKeys) return;
    }
    // Still over budget: evict oldest insertion-order keys.
    const overflow = hits.size - maxKeys;
    let i = 0;
    for (const key of hits.keys()) {
      if (i++ >= overflow) break;
      hits.delete(key);
    }
  }

  return {
    check(key: string) {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - recent[0]) };
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      prune(now);
      return { ok: true, remaining: limit - recent.length, retryAfterMs: 0 };
    },
    reset(key?: string) {
      if (key) hits.delete(key);
      else hits.clear();
    },
  };
}

export function retryAfterSeconds(result: RateLimitResult) {
  return Math.max(1, Math.ceil(result.retryAfterMs / 1000));
}

/** Per-minute budget overridable via env (e.g. RATE_LIMIT_AUTH_PER_MINUTE=200 for E2E runs from one IP). */
function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Budgets for every limiter, keyed per user id or client IP. */
export const LIMITS = {
  /** Login, sign-up, OAuth start, password reset/change — per client IP (OWASP brute-force guidance). */
  auth: { limit: envLimit("RATE_LIMIT_AUTH_PER_MINUTE", 5), windowMs: 60_000 },
  /** Auth callbacks (code exchange / email links) — per client IP. */
  authCallback: { limit: envLimit("RATE_LIMIT_AUTH_CALLBACK_PER_MINUTE", 20), windowMs: 60_000 },
  /** Any /api/* request — per client IP. */
  api: { limit: envLimit("RATE_LIMIT_API_PER_MINUTE", 120), windowMs: 60_000 },
  mutation: { limit: 60, windowMs: 60_000 },
  message: { limit: 20, windowMs: 10_000 },
  voiceToken: { limit: 20, windowMs: 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
} as const;

export type LimiterName = keyof typeof LIMITS;

export const limiters = Object.fromEntries(Object.entries(LIMITS).map(([name, cfg]) => [name, createRateLimiter(cfg)])) as Record<LimiterName, RateLimiter>;

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown";
}

/**
 * Fixed-window counter in Upstash Redis via its REST API (no SDK needed). Returns null when Upstash
 * isn't configured or is unreachable so callers fall back to the in-memory limiter.
 */
export async function checkDistributed(
  key: string,
  limit: number,
  windowMs: number,
  { fetchImpl = fetch, url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN } = {},
): Promise<RateLimitResult | null> {
  if (!url || !token) return null;
  const window = Math.floor(Date.now() / windowMs);
  const redisKey = `diskarte:rl:${key}:${window}`;
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["PEXPIRE", redisKey, String(windowMs)],
      ]),
      signal: AbortSignal.timeout(800),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const [incr] = (await res.json()) as [{ result: number }];
    const count = Number(incr?.result ?? 0);
    const retryAfterMs = windowMs - (Date.now() % windowMs);
    return count > limit ? { ok: false, remaining: 0, retryAfterMs } : { ok: true, remaining: limit - count, retryAfterMs: 0 };
  } catch {
    return null;
  }
}

/** Distributed limit when Upstash is configured, otherwise the in-memory limiter. */
export async function checkLimit(name: LimiterName, key: string): Promise<RateLimitResult> {
  const { limit, windowMs } = LIMITS[name];
  return (await checkDistributed(`${name}:${key}`, limit, windowMs)) ?? limiters[name].check(key);
}
