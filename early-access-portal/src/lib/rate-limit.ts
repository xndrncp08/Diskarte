/**
 * Fixed-window in-memory limiter. One portal instance is plenty for a waitlist; the database adds
 * its own per-IP-hash and global flood caps that hold across replicas (see the migration).
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string): RateLimitResult {
      const t = now();
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
      }
      if (entry.count >= limit) return { ok: false, remaining: 0, retryAfterMs: entry.resetAt - t };
      entry.count += 1;
      return { ok: true, remaining: limit - entry.count, retryAfterMs: 0 };
    },
    reset() {
      hits.clear();
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

const globalLimiters = globalThis as unknown as { __portalLimiters?: Map<string, RateLimiter> };

/** Process-wide limiter registry (survives dev hot reloads). */
export function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  globalLimiters.__portalLimiters ??= new Map();
  const key = `${name}:${limit}:${windowMs}`;
  let l = globalLimiters.__portalLimiters.get(key);
  if (!l) {
    l = createRateLimiter(limit, windowMs);
    globalLimiters.__portalLimiters.set(key, l);
  }
  return l;
}

export function resetAllLimiters() {
  globalLimiters.__portalLimiters?.forEach((l) => l.reset());
}

/** Client IP behind Render / proxies (first X-Forwarded-For hop), falling back to X-Real-IP. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Limit check shared across instances when Upstash Redis is configured (Vercel runs many
 * short-lived instances, so in-memory counters alone are per-instance). Uses Upstash's REST
 * pipeline — INCR + PEXPIRE NX + PTTL — and falls back to the in-memory limiter if Redis is
 * unreachable, so an outage never locks everyone out.
 */
export async function checkRate(
  name: string,
  key: string,
  limit: number,
  windowMs: number,
  upstash: { url: string; token: string } | null,
  fetchImpl: typeof fetch = fetch,
): Promise<RateLimitResult> {
  if (upstash) {
    const redisKey = `diskarte-ea:rl:${name}:${key}`;
    try {
      const res = await fetchImpl(`${upstash.url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${upstash.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["PEXPIRE", redisKey, String(windowMs), "NX"],
          ["PTTL", redisKey],
        ]),
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const [count, , ttl] = (await res.json()) as { result: number }[];
        const hits = Number(count?.result);
        if (Number.isFinite(hits)) {
          const retry = Math.max(0, Number(ttl?.result) || windowMs);
          return hits > limit ? { ok: false, remaining: 0, retryAfterMs: retry } : { ok: true, remaining: limit - hits, retryAfterMs: 0 };
        }
      }
    } catch {
      // fall through to the local limiter
    }
  }
  return limiter(name, limit, windowMs).check(key);
}
