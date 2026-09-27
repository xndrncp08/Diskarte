// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkFormToken, hashIp, honeypotTripped, issueFormToken, MIN_FILL_MS } from "@/lib/antispam";
import { createMailer, EmailDeliveryError } from "@/lib/email/send";
import { escapeHtml, welcomeEmail } from "@/lib/email/template";
import { getApprovalEnv, getPortalEnv, MissingEnvError } from "@/lib/env";
import { CHARSETS, generateTempPassword, meetsPasswordPolicy } from "@/lib/password";
import { checkRate, clientIp, createRateLimiter, resetAllLimiters } from "@/lib/rate-limit";
import { applicationSchema, listQuerySchema } from "@/lib/schema";
import { buildCsp, safeRedirectPath } from "@/lib/security";
import { verifyTurnstile } from "@/lib/turnstile";

const SECRET = "test-secret-0123456789abcdef0123456789";

describe("temporary passwords", () => {
  it("always satisfies Diskarte's password policy and avoids look-alike characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const pw = generateTempPassword();
      expect(pw).toHaveLength(16);
      expect(meetsPasswordPolicy(pw)).toBe(true);
      expect(pw).not.toMatch(/[0O1lI]/);
      seen.add(pw);
    }
    expect(seen.size).toBe(500);
  });

  it("uses every character class even with a hostile random source", () => {
    const zeros = (b: Uint8Array) => b.fill(0);
    const pw = generateTempPassword(10, zeros);
    expect(meetsPasswordPolicy(pw)).toBe(true);
    for (const set of Object.values(CHARSETS)) expect([...pw].some((c) => set.includes(c))).toBe(true);
    expect(() => generateTempPassword(8)).toThrow();
  });
});

describe("anti-spam", () => {
  it("accepts a signed token after the minimum fill time and rejects forgeries, bots and stale forms", () => {
    const t0 = 1_000_000;
    const token = issueFormToken(SECRET, t0);
    expect(checkFormToken(token, SECRET, t0 + MIN_FILL_MS + 1)).toBeNull();
    expect(checkFormToken(token, SECRET, t0 + 500)).toBe("too_fast");
    expect(checkFormToken(token, SECRET, t0 + 3 * 60 * 60 * 1000)).toBe("expired");
    expect(checkFormToken(token, "another-secret-another-secret-xx", t0 + 5000)).toBe("invalid");
    expect(checkFormToken(`${t0 - 60_000}.${token.split(".")[1]}`, SECRET, t0 + 5000)).toBe("invalid");
    expect(checkFormToken(null, SECRET)).toBe("missing");
  });

  it("detects the honeypot and hashes IPs without storing them", () => {
    expect(honeypotTripped("http://spam.example")).toBe(true);
    expect(honeypotTripped("")).toBe(false);
    expect(honeypotTripped(null)).toBe(false);
    const h = hashIp("203.0.113.9", SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("203");
    expect(hashIp("203.0.113.9", SECRET)).toBe(h);
    expect(hashIp("203.0.113.9", "different-secret-different-secret")).not.toBe(h);
  });

  it("limits per key and reads the client IP", () => {
    let now = 0;
    const l = createRateLimiter(2, 1000, () => now);
    expect(l.check("a").ok).toBe(true);
    expect(l.check("a").ok).toBe(true);
    expect(l.check("a")).toMatchObject({ ok: false, retryAfterMs: 1000 });
    expect(l.check("b").ok).toBe(true);
    now = 1001;
    expect(l.check("a").ok).toBe(true);
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("shares counters through Upstash on serverless, falling back to memory if Redis is down", async () => {
    resetAllLimiters();
    const upstash = { url: "https://redis.example", token: "tok" };
    let count = 0;
    const redis = vi.fn(async (_url: string, init: RequestInit) => {
      const commands = JSON.parse(init.body as string) as string[][];
      expect(commands.map((c) => c[0])).toEqual(["INCR", "PEXPIRE", "PTTL"]);
      return new Response(JSON.stringify([{ result: ++count }, { result: 1 }, { result: 42_000 }]));
    });
    expect(await checkRate("t", "ip", 2, 60_000, upstash, redis as unknown as typeof fetch)).toMatchObject({ ok: true, remaining: 1 });
    expect((await checkRate("t", "ip", 2, 60_000, upstash, redis as unknown as typeof fetch)).ok).toBe(true);
    expect(await checkRate("t", "ip", 2, 60_000, upstash, redis as unknown as typeof fetch)).toEqual({ ok: false, remaining: 0, retryAfterMs: 42_000 });
    expect((redis.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe("https://redis.example/pipeline");

    const down = async () => Promise.reject(new Error("ECONNREFUSED"));
    expect((await checkRate("t2", "ip", 1, 60_000, upstash, down)).ok).toBe(true);
    expect((await checkRate("t2", "ip", 1, 60_000, upstash, down)).ok).toBe(false); // local limiter still applies
  });

  it("verifies Turnstile server-side and fails closed", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    expect(await verifyTurnstile("token", { secretKey: "s", ip: "1.2.3.4", fetchImpl: ok })).toBe(true);
    const body = (ok.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("remoteip")).toBe("1.2.3.4");
    expect(await verifyTurnstile("token", { secretKey: "s", fetchImpl: async () => new Response(JSON.stringify({ success: false })) })).toBe(false);
    expect(await verifyTurnstile("token", { secretKey: "s", fetchImpl: async () => Promise.reject(new Error("offline")) })).toBe(false);
    expect(await verifyTurnstile("", { secretKey: "s", fetchImpl: ok })).toBe(false);
  });
});

describe("application schema", () => {
  const valid = {
    fullName: "  Maria   Clara ",
    email: " Maria@Example.PH ",
    preferredUsername: "@Maria.C",
    communityType: "school",
    communityName: "UP Gamers",
    communitySize: "51-200",
    referralSource: "",
    reason: "Kailangan namin ng tambayan para sa org namin na hindi nagsha-shutdown.",
    consent: "on",
  };

  it("normalises valid applications", () => {
    expect(applicationSchema.parse(valid)).toMatchObject({ fullName: "Maria Clara", email: "maria@example.ph", preferredUsername: "maria.c", communityType: "school" });
    expect(applicationSchema.parse({ ...valid, preferredUsername: "" }).preferredUsername).toBeNull();
  });

  it("rejects missing consent, short reasons, bad usernames and unknown types", () => {
    for (const patch of [{ consent: undefined }, { reason: "short" }, { preferredUsername: "a b" }, { communityType: "cult" }, { email: "nope" }, { fullName: "x" }]) {
      expect(applicationSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    }
  });

  it("sanitises dashboard query params", () => {
    expect(listQuerySchema.parse({ status: "bogus", q: "juan%,(x)", page: "-3" })).toEqual({ status: "pending", q: "juan   x ", page: 1 });
    expect(listQuerySchema.parse({ status: "approved", q: "", page: "2" })).toEqual({ status: "approved", q: "", page: 2 });
  });
});

describe("configuration & headers", () => {
  const base = { SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_ANON_KEY: "anon-key-that-is-long-enough", PORTAL_SECRET: SECRET, APP_URL: "https://diskarte.ph" };

  it("parses env and requires a strong secret and paired Turnstile keys", () => {
    expect(getPortalEnv(base)).toMatchObject({ supabaseUrl: "https://proj.supabase.co", appUrl: "https://diskarte.ph", turnstile: null });
    expect(() => getPortalEnv({ ...base, PORTAL_SECRET: "short" })).toThrow(MissingEnvError);
    expect(() => getPortalEnv({ ...base, TURNSTILE_SITE_KEY: "x" })).toThrow(/TURNSTILE/);
  });

  it("accepts Vercel + Supabase-integration variable names and Vercel's URL", () => {
    const vercel = { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-that-is-long-enough", PORTAL_SECRET: SECRET, VERCEL_PROJECT_PRODUCTION_URL: "early.diskarte.ph" };
    expect(getPortalEnv(vercel)).toMatchObject({ supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon-key-that-is-long-enough", siteUrl: "https://early.diskarte.ph" });
    expect(getPortalEnv({ ...vercel, SITE_URL: "https://custom.example" }).siteUrl).toBe("https://custom.example");
    expect(getPortalEnv({ ...vercel, VERCEL_PROJECT_PRODUCTION_URL: undefined, VERCEL_URL: "ea-abc.vercel.app" }).siteUrl).toBe("https://ea-abc.vercel.app");
    expect(getPortalEnv({ ...base, UPSTASH_REDIS_REST_URL: "https://eu1.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }).upstash).toEqual({ url: "https://eu1.upstash.io", token: "t" });
  });

  it("requires a real email provider in production", () => {
    const key = { SUPABASE_SERVICE_ROLE_KEY: "service-role-key-long-enough" };
    expect(getApprovalEnv({ ...key, NODE_ENV: "development" }).email.transport).toBe("log");
    expect(() => getApprovalEnv({ ...key, NODE_ENV: "production" })).toThrow(/RESEND_API_KEY/);
    expect(getApprovalEnv({ ...key, NODE_ENV: "production", RESEND_API_KEY: "re_123" }).email).toMatchObject({ transport: "resend" });
    expect(() => getApprovalEnv({ EMAIL_TRANSPORT: "log" })).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("builds a nonce CSP that only opens Cloudflare when Turnstile is on", () => {
    const off = buildCsp("abc", { turnstile: false, isDev: false, upgradeInsecure: true });
    expect(off).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(off).toContain("frame-src 'none'");
    expect(off).toContain("frame-ancestors 'none'");
    expect(off).toContain("upgrade-insecure-requests");
    expect(buildCsp("abc", { turnstile: true, isDev: false, upgradeInsecure: false })).toContain("frame-src https://challenges.cloudflare.com");
    // The landing page may read the Diskarte app's health endpoint (its CORS allows the portal).
    expect(buildCsp("abc", { turnstile: false, isDev: false, upgradeInsecure: false, appUrl: "https://diskarte.onrender.com/login" })).toContain("connect-src 'self' https://diskarte.onrender.com");
    expect(safeRedirectPath("//evil.example")).toBe("/admin");
    expect(safeRedirectPath("/admin?status=all")).toBe("/admin?status=all");
  });
});

describe("welcome email", () => {
  const input = { name: "Juan <script>Dela Cruz", email: "juan@example.ph", tempPassword: "Ab3$<x>Kz9!mQ2#p", loginUrl: "https://diskarte.ph/login", assetBaseUrl: "https://early.diskarte.ph/" };

  it("contains the credentials, login link and first-login prompt, safely escaped", () => {
    const mail = welcomeEmail(input);
    expect(mail.subject).toContain("Maligayang Pagdating sa Diskarte");
    expect(mail.to).toBe("juan@example.ph");
    expect(mail.html).toContain("Maligayang Pagdating sa Diskarte!");
    expect(mail.html).toContain(escapeHtml(input.tempPassword));
    expect(mail.html).not.toContain("<x>");
    expect(mail.html).toContain('href="https://diskarte.ph/login"');
    expect(mail.html).toContain('src="https://early.diskarte.ph/email/salakot.png"');
    expect(mail.html).toMatch(/Palitan agad ang password mo/);
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain(`Temporary password: ${input.tempPassword}`);
    expect(mail.text).toContain("https://diskarte.ph/login");
  });

  it("has a no-password variant for people who already have an account", () => {
    const mail = welcomeEmail({ ...input, tempPassword: "", existingAccount: true });
    expect(mail.html).not.toContain("PLAYER CREDENTIALS");
    expect(mail.text).toMatch(/May account ka na/);
  });
});

describe("mail transports", () => {
  const message = { to: "a@b.ph", subject: "Hi", html: "<p>secret-pass</p>", text: "secret-pass" };

  it("writes one private JSON file per message in file mode", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "outbox-"));
    const { id } = await createMailer({ transport: "file", dir, from: "Diskarte <x@y.ph>" })(message);
    const files = readdirSync(dir);
    expect(files).toEqual([`${id}.json`]);
    expect(JSON.parse(readFileSync(path.join(dir, files[0]), "utf8"))).toMatchObject({ to: "a@b.ph", text: "secret-pass" });
  });

  it("calls Resend and surfaces provider errors", async () => {
    const fetchOk = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    expect(await createMailer({ transport: "resend", apiKey: "re_key", from: "D <x@y.ph>" }, fetchOk)(message)).toEqual({ id: "re_1" });
    const [url, init] = fetchOk.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["a@b.ph"], subject: "Hi" });
    const fetchBad = async () => new Response(JSON.stringify({ message: "domain not verified" }), { status: 403 });
    await expect(createMailer({ transport: "resend", apiKey: "k", from: "f" }, fetchBad)(message)).rejects.toThrow(EmailDeliveryError);
  });

  it("never logs the message body in log mode", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await createMailer({ transport: "log", from: "f" })(message);
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-pass");
    log.mockRestore();
  });
});
