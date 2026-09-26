// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";
import { credentialsSchema, passwordSchema, signUpSchema } from "@/lib/profile";
import { checkDistributed, checkLimit, limiters } from "@/lib/rate-limit";
import { allowedOriginSet, corsHeadersFor, withMinimumDuration } from "@/lib/security";
import { authCookieOptions } from "@/lib/supabase/cookies";

const root = path.resolve(__dirname, "../..");

describe("password policy", () => {
  it.each(["Short1!", "alllowercase1!", "ALLUPPERCASE1!", "NoNumbers!!xx", "NoSpecial123x", ""])("rejects %j", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it("accepts strong passwords and caps bcrypt's 72-byte input", () => {
    expect(passwordSchema.safeParse("Kape-Muna-2026").success).toBe(true);
    expect(passwordSchema.safeParse(`Aa1!${"x".repeat(69)}`).success).toBe(false);
    expect(passwordSchema.safeParse(`Aa1!${"ñ".repeat(35)}`).success).toBe(false); // 74 bytes in UTF-8
  });

  it("enforces the policy at sign-up but never leaks it at sign-in", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "weakpass", username: "juan", displayName: "Juan" }).success).toBe(false);
    expect(credentialsSchema.safeParse({ email: "a@b.co", password: "weakpass" }).success).toBe(true);
  });
});

describe("timing floor", () => {
  it("pads fast and failing paths to the same minimum duration", async () => {
    vi.useFakeTimers();
    let done = false;
    const fast = withMinimumDuration(450, async () => "ok").then(() => (done = true));
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    await fast;
    expect(done).toBe(true);
    const failing = withMinimumDuration(450, async () => {
      throw new Error("bad");
    });
    const settled = failing.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(460);
    expect(await settled).toBe("bad");
    vi.useRealTimers();
  });
});

describe("session cookies", () => {
  it("are host-only, SameSite=Lax and Secure on HTTPS", () => {
    expect(authCookieOptions(true)).toEqual({ path: "/", sameSite: "lax", secure: true, httpOnly: false });
    expect(authCookieOptions(false).secure).toBe(false);
    expect(authCookieOptions(true)).not.toHaveProperty("domain");
  });
});

describe("CORS helpers", () => {
  const allowed = allowedOriginSet("https://diskarte.ph/", ["https://app.diskarte.ph", "not a url"]);
  it("normalises the allow-list", () => {
    expect([...allowed]).toEqual(["https://diskarte.ph", "https://app.diskarte.ph"]);
  });
  it("echoes only allowed origins", () => {
    expect(corsHeadersFor("https://diskarte.ph", allowed)?.["Access-Control-Allow-Origin"]).toBe("https://diskarte.ph");
    expect(corsHeadersFor("https://evil.example", allowed)).toBeNull();
    expect(corsHeadersFor("null", allowed)).toBeNull();
    expect(corsHeadersFor(null, allowed)).toEqual({});
  });
});

describe("distributed rate limiting (Upstash REST)", () => {
  it("counts in Redis when configured", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ result: 6 }, { result: 1 }]), { status: 200 }));
    const res = await checkDistributed("auth:1.2.3.4", 5, 60_000, { fetchImpl: fetchImpl as unknown as typeof fetch, url: "https://redis.example", token: "t" });
    expect(res).toMatchObject({ ok: false, remaining: 0 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://redis.example/pipeline");
    expect(JSON.parse(init.body as string)[0][0]).toBe("INCR");
  });

  it("falls back to memory when Redis is absent or failing", async () => {
    expect(await checkDistributed("k", 5, 1000, { url: "", token: "" })).toBeNull();
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(await checkDistributed("k", 5, 1000, { fetchImpl: failing as unknown as typeof fetch, url: "https://r", token: "t" })).toBeNull();
    limiters.auth.reset();
    for (let i = 0; i < 5; i++) expect((await checkLimit("auth", "fallback-ip")).ok).toBe(true);
    expect((await checkLimit("auth", "fallback-ip")).ok).toBe(false);
  });
});

describe("secret handling", () => {
  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  }
  const sources = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"));

  it("client components never import server-only modules", () => {
    const serverOnly = [/from "@\/lib\/livekit"/, /from "@\/lib\/supabase\/server"/, /from "@\/lib\/auth"/, /from "@\/lib\/data\//];
    for (const file of sources) {
      const code = fs.readFileSync(file, "utf8");
      if (!code.startsWith('"use client"')) continue;
      for (const pattern of serverOnly) expect(code, `${file} must not import ${pattern}`).not.toMatch(pattern);
      expect(code, file).not.toMatch(/getServerEnv|LIVEKIT_API_SECRET|SERVICE_ROLE/);
    }
  });

  it("LIVEKIT_API_SECRET is only read in server-only code", () => {
    const readers = sources.filter((f) => fs.readFileSync(f, "utf8").includes("LIVEKIT_API_SECRET"));
    expect(readers.map((f) => path.relative(root, f)).sort()).toEqual(["src/lib/env.ts", "src/lib/health.ts"]);
    expect(fs.readFileSync(path.join(root, "src/lib/livekit.ts"), "utf8")).toMatch(/^import "server-only";/);
    expect(fs.readFileSync(path.join(root, "src/lib/supabase/server.ts"), "utf8")).toMatch(/^import "server-only";/);
  });

  it("never uses NEXT_PUBLIC_ for secrets", () => {
    for (const file of sources) expect(fs.readFileSync(file, "utf8"), file).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|API_KEY)/);
  });
});

describe("static security headers", async () => {
  const headers = (await nextConfig.headers!())[0].headers;
  const get = (k: string) => headers.find((h) => h.key === k)?.value;
  it("sets clickjacking, sniffing, referrer and HSTS protections", () => {
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Strict-Transport-Security")).toMatch(/max-age=\d{8}; includeSubDomains/);
    expect(get("Permissions-Policy")).toContain("geolocation=()");
  });
});
