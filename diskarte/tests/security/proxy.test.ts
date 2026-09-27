// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiters } from "@/lib/rate-limit";

let sessionUser: string | null = null;
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSession: async (_req: NextRequest, _env: unknown, makeResponse: () => NextResponse) => ({ response: makeResponse(), userId: sessionUser }),
}));

const { proxy } = await import("@/proxy");

const SITE = "https://diskarte.onrender.com";
let ipCounter = 0;

function req(path: string, init: { method?: string; headers?: Record<string, string>; ip?: string } = {}) {
  return new NextRequest(`${SITE}${path}`, {
    method: init.method ?? "GET",
    headers: { host: "diskarte.onrender.com", "x-forwarded-proto": "https", "x-forwarded-for": init.ip ?? "203.0.113.1", ...init.headers },
  });
}

beforeEach(() => {
  sessionUser = null;
  for (const l of Object.values(limiters)) l.reset();
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-that-is-long-enough");
  vi.stubEnv("LIVEKIT_URL", "wss://proj.livekit.cloud");
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  ipCounter += 1;
});

describe("anti-brute-force", () => {
  it("caps auth attempts at 5 per minute per IP with 429 + Retry-After", async () => {
    const ip = `198.51.100.${ipCounter}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await proxy(req("/login", { method: "POST", ip, headers: { origin: SITE } }))).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    const blocked = await proxy(req("/login", { method: "POST", ip, headers: { origin: SITE } }));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("shares one budget across login, signup and password reset", async () => {
    const ip = `198.51.100.${ipCounter}`;
    for (const path of ["/login", "/signup", "/forgot-password", "/login", "/signup"]) await proxy(req(path, { method: "POST", ip }));
    expect((await proxy(req("/forgot-password", { method: "POST", ip }))).status).toBe(429);
    // A different client is unaffected.
    expect((await proxy(req("/login", { method: "POST", ip: "192.0.2.99" }))).status).not.toBe(429);
  });

  it("limits auth callback hammering", async () => {
    const ip = `198.51.100.${ipCounter}`;
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await proxy(req("/auth/callback?code=x", { ip }))).status;
    expect(last).toBe(429);
  });

  it("does not rate-limit ordinary page views", async () => {
    const ip = `198.51.100.${ipCounter}`;
    for (let i = 0; i < 10; i++) expect((await proxy(req("/login", { ip }))).status).not.toBe(429);
  });
});

describe("CORS and CSRF on /api", () => {
  it("answers preflights only for the site origin", async () => {
    const ok = await proxy(req("/api/livekit/token", { method: "OPTIONS", headers: { origin: SITE } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(SITE);
    expect(ok.headers.get("vary")).toBe("Origin");
    const evil = await proxy(req("/api/livekit/token", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(evil.status).toBe(403);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("blocks cross-site and origin-less POSTs", async () => {
    expect((await proxy(req("/api/livekit/token", { method: "POST", headers: { origin: "https://evil.example" } }))).status).toBe(403);
    expect((await proxy(req("/api/livekit/token", { method: "POST" }))).status).toBe(403);
  });

  it("requires a session for non-public API routes", async () => {
    const res = await proxy(req("/api/livekit/token", { method: "POST", headers: { origin: SITE } }));
    expect(res.status).toBe(401);
    sessionUser = "00000000-0000-4000-8000-000000000001";
    expect((await proxy(req("/api/livekit/token", { method: "POST", headers: { origin: SITE } }))).status).toBe(200);
  });

  it("keeps the health check public and uncached", async () => {
    const res = await proxy(req("/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rate-limits API floods with JSON 429s", async () => {
    sessionUser = "00000000-0000-4000-8000-000000000001";
    const ip = `198.51.100.${ipCounter}`;
    let res: NextResponse | Response = new Response();
    for (let i = 0; i < 121; i++) res = await proxy(req("/api/livekit/token", { method: "POST", ip, headers: { origin: SITE } }));
    expect(res.status).toBe(429);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("route guards and headers", () => {
  it("redirects signed-out users away from protected pages", async () => {
    for (const path of ["/tambayan/abc", "/settings/account", "/onboarding", "/reset-password"]) {
      const res = await proxy(req(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(`${SITE}/login?next=${encodeURIComponent(path)}`);
    }
  });

  it("sends signed-in users away from guest pages", async () => {
    sessionUser = "00000000-0000-4000-8000-000000000001";
    const res = await proxy(req("/login"));
    expect(res.headers.get("location")).toBe(`${SITE}/tambayan`);
  });

  it("sets a nonce CSP with upgrade-insecure-requests over HTTPS", async () => {
    const csp = (await proxy(req("/"))).headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co https://proj.livekit.cloud wss://proj.livekit.cloud");
    expect(csp).toContain("upgrade-insecure-requests");
  });
});
