/**
 * In-memory sliding-window rate limiter for Server Actions and Route Handlers.
 * Diskarte runs as a single container on the free tier, so process memory is the shared store;
 * the database additionally enforces its own limits (see messages_before_insert) for anything
 * that bypasses the app server.
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

/** Per-minute budget overridable via env (e.g. RATE_LIMIT_AUTH_PER_MINUTE=200 for E2E runs from one IP). */
function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/** Shared limiters, keyed per user id or client IP. */
export const limiters = {
  auth: createRateLimiter({ limit: envLimit("RATE_LIMIT_AUTH_PER_MINUTE", 10), windowMs: 60_000 }),
  mutation: createRateLimiter({ limit: 60, windowMs: 60_000 }),
  message: createRateLimiter({ limit: 20, windowMs: 10_000 }),
  voiceToken: createRateLimiter({ limit: 20, windowMs: 60_000 }),
  upload: createRateLimiter({ limit: 30, windowMs: 60_000 }),
};

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? headers.get("cf-connecting-ip") ?? "unknown";
}
