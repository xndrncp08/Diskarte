// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicEnv, getServerEnv, MissingEnvError, tryGetPublicEnv } from "@/lib/env";
import { buildHealthReport } from "@/lib/health";

const VALID = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-that-is-long-enough",
  LIVEKIT_URL: "wss://proj.livekit.cloud",
  LIVEKIT_API_KEY: "APIkey",
  LIVEKIT_API_SECRET: "super-secret-value",
};

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const key of [...Object.keys(VALID), "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_LIVEKIT_URL", "SITE_URL", "RENDER_EXTERNAL_URL"]) {
    vi.stubEnv(key, "");
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubValid() {
  for (const [k, v] of Object.entries(VALID)) vi.stubEnv(k, v);
}

describe("env", () => {
  it("parses runtime config and defaults the site URL", () => {
    stubValid();
    expect(getPublicEnv()).toEqual({
      supabaseUrl: VALID.SUPABASE_URL,
      supabaseAnonKey: VALID.SUPABASE_ANON_KEY,
      livekitUrl: VALID.LIVEKIT_URL,
      siteUrl: "http://localhost:3000",
    });
    expect(getServerEnv()).toEqual({ livekitApiKey: "APIkey", livekitApiSecret: "super-secret-value" });
  });

  it("accepts NEXT_PUBLIC_* fallbacks and Render's external URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", VALID.SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", VALID.SUPABASE_ANON_KEY);
    vi.stubEnv("NEXT_PUBLIC_LIVEKIT_URL", VALID.LIVEKIT_URL);
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://diskarte.onrender.com");
    expect(getPublicEnv().siteUrl).toBe("https://diskarte.onrender.com");
  });

  it("reports every missing variable", () => {
    expect(() => getPublicEnv()).toThrow(MissingEnvError);
    expect(tryGetPublicEnv()).toBeNull();
    try {
      getPublicEnv();
    } catch (err) {
      expect((err as MissingEnvError).issues.join(" ")).toMatch(/supabaseUrl.*supabaseAnonKey.*livekitUrl/);
    }
  });

  it("rejects http LiveKit URLs", () => {
    stubValid();
    vi.stubEnv("LIVEKIT_URL", "https://proj.livekit.cloud");
    expect(() => getPublicEnv()).toThrow(/ws\(s\)/);
  });
});

describe("buildHealthReport", () => {
  it("is ok when fully configured", async () => {
    stubValid();
    const report = await buildHealthReport();
    expect(report).toMatchObject({ status: "ok", service: "diskarte", checks: { config: "ok", livekitSecrets: "ok" } });
  });

  it("is degraded when configuration is missing", async () => {
    const report = await buildHealthReport({ deep: true });
    expect(report.status).toBe("degraded");
    expect(report.checks).toEqual({ config: "missing", livekitSecrets: "missing", supabase: "skipped" });
  });

  it("pings Supabase on deep checks", async () => {
    stubValid();
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const report = await buildHealthReport({ deep: true, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://proj.supabase.co/auth/v1/health", expect.anything());
    expect(report.checks.supabase).toBe("ok");

    const failing = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const down = await buildHealthReport({ deep: true, fetchImpl: failing });
    expect(down).toMatchObject({ status: "degraded", checks: { supabase: "unreachable" } });
  });
});
