import { tryGetPublicEnv } from "@/lib/env";

export interface HealthReport {
  status: "ok" | "degraded";
  service: "diskarte";
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    config: "ok" | "missing";
    livekitSecrets: "ok" | "missing";
    supabase?: "ok" | "unreachable" | "skipped";
  };
}

/** Liveness is always 200 so the container is not restarted for a transient upstream blip. */
export async function buildHealthReport({ deep = false, fetchImpl = fetch }: { deep?: boolean; fetchImpl?: typeof fetch } = {}): Promise<HealthReport> {
  const env = tryGetPublicEnv();
  const livekitSecrets = process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET ? "ok" : "missing";
  const checks: HealthReport["checks"] = { config: env ? "ok" : "missing", livekitSecrets };

  if (deep) {
    if (!env) {
      checks.supabase = "skipped";
    } else {
      try {
        const res = await fetchImpl(`${env.supabaseUrl}/auth/v1/health`, {
          headers: { apikey: env.supabaseAnonKey },
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });
        checks.supabase = res.ok ? "ok" : "unreachable";
      } catch {
        checks.supabase = "unreachable";
      }
    }
  }

  const healthy = checks.config === "ok" && checks.livekitSecrets === "ok" && checks.supabase !== "unreachable";
  return {
    status: healthy ? "ok" : "degraded",
    service: "diskarte",
    version: process.env.APP_VERSION ?? process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  };
}
