import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  it("allows up to the limit then blocks with a retry hint", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => limiter.check("u").ok)).toEqual([true, true, true]);
    const blocked = limiter.check("u");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("slides the window", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.check("u");
    limiter.check("u");
    expect(limiter.check("u").ok).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter.check("u").ok).toBe(true);
  });

  it("tracks keys independently and can reset", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a").ok).toBe(true);
    expect(limiter.check("b").ok).toBe(true);
    expect(limiter.check("a").ok).toBe(false);
    limiter.reset("a");
    expect(limiter.check("a").ok).toBe(true);
  });

  it("bounds memory by evicting old keys", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d", "e"]) limiter.check(k);
    // "a" was evicted, so it is allowed again.
    expect(limiter.check("a").ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
