import { describe, expect, it } from "vitest";
import { buildCsp, createNonce, isSafeMethod, isSameOriginRequest, safeRedirectPath } from "@/lib/security";

describe("buildCsp", () => {
  const csp = buildCsp("abc123", { supabaseUrl: "https://proj.supabase.co", livekitUrl: "wss://proj.livekit.cloud" }, false);

  it("pins scripts to the nonce with strict-dynamic", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows Supabase and LiveKit over both HTTP and WebSocket", () => {
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src"));
    expect(connect).toContain("https://proj.supabase.co");
    expect(connect).toContain("wss://proj.supabase.co");
    expect(connect).toContain("wss://proj.livekit.cloud");
    expect(connect).toContain("https://proj.livekit.cloud");
  });

  it("forbids framing and plugins", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("adds eval and localhost sockets only in development", () => {
    const dev = buildCsp("n", {}, true);
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("only upgrades insecure requests on https origins", () => {
    expect(buildCsp("n", {}, false, false)).not.toContain("upgrade-insecure-requests");
    expect(buildCsp("n", {}, false, true)).toContain("upgrade-insecure-requests");
  });

  it("allows plain ws/http for local Supabase and LiveKit", () => {
    const local = buildCsp("n", { supabaseUrl: "http://127.0.0.1:54321", livekitUrl: "ws://localhost:7880" }, false, false);
    expect(local).toContain("http://127.0.0.1:54321 ws://127.0.0.1:54321");
    expect(local).toContain("http://localhost:7880 ws://localhost:7880");
  });

  it("ignores malformed URLs", () => {
    expect(() => buildCsp("n", { supabaseUrl: "not a url" }, false)).not.toThrow();
  });
});

describe("createNonce", () => {
  it("produces unique base64 values", () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe("isSameOriginRequest", () => {
  const url = "https://diskarte.onrender.com/api/livekit/token";
  const headers = (h: Record<string, string>) => new Headers({ host: "diskarte.onrender.com", ...h });

  it("accepts matching origins", () => {
    expect(isSameOriginRequest(headers({ origin: "https://diskarte.onrender.com" }), url)).toBe(true);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOriginRequest(headers({ referer: "https://diskarte.onrender.com/tambayan/x" }), url)).toBe(true);
  });

  it("rejects foreign, missing and null origins", () => {
    expect(isSameOriginRequest(headers({ origin: "https://evil.example" }), url)).toBe(false);
    expect(isSameOriginRequest(headers({}), url)).toBe(false);
    expect(isSameOriginRequest(headers({ origin: "null" }), url)).toBe(false);
  });

  it("honours proxy forwarding headers and the allow-list", () => {
    const h = new Headers({ host: "10.0.0.4:3000", "x-forwarded-host": "diskarte.ph", "x-forwarded-proto": "https", origin: "https://diskarte.ph" });
    expect(isSameOriginRequest(h, "http://10.0.0.4:3000/api/x")).toBe(true);
    expect(isSameOriginRequest(headers({ origin: "https://app.diskarte.ph" }), url, ["https://app.diskarte.ph"])).toBe(true);
  });
});

describe("isSafeMethod", () => {
  it("treats only read methods as safe", () => {
    expect(isSafeMethod("get")).toBe(true);
    expect(isSafeMethod("POST")).toBe(false);
    expect(isSafeMethod("DELETE")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeRedirectPath("/tambayan/abc?x=1#m")).toBe("/tambayan/abc?x=1#m");
  });

  it("blocks open redirects", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeRedirectPath(bad as string)).toBe("/tambayan");
    }
  });
});
