import { z } from "zod";

/**
 * Runtime configuration. Everything is read from `process.env` at request time (never inlined at
 * build time), so a single Docker image can be promoted across environments. The `NEXT_PUBLIC_*`
 * names are accepted as fallbacks for platforms that only expose those.
 */
const publicSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(20),
  livekitUrl: z.url().refine((u) => u.startsWith("wss://") || u.startsWith("ws://"), "LIVEKIT_URL must be a ws(s):// URL"),
  siteUrl: z.url(),
});

const serverSchema = z.object({
  livekitApiKey: z.string().min(3),
  livekitApiSecret: z.string().min(6), // `livekit-server --dev` uses "secret"
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function pick(...names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim() !== "") return value.trim();
  }
  return undefined;
}

export class MissingEnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Diskarte is missing configuration: ${issues.join("; ")}`);
    this.name = "MissingEnvError";
  }
}

function parse<T extends z.ZodType>(schema: T, raw: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new MissingEnvError(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  return result.data;
}

/** Values that are safe to ship to the browser. */
export function getPublicEnv(): PublicEnv {
  return parse(publicSchema, {
    supabaseUrl: pick("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: pick("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    livekitUrl: pick("LIVEKIT_URL", "NEXT_PUBLIC_LIVEKIT_URL"),
    siteUrl: pick("SITE_URL", "NEXT_PUBLIC_SITE_URL", "RENDER_EXTERNAL_URL") ?? "http://localhost:3000",
  });
}

/** Secrets that must never leave the server. */
export function getServerEnv(): ServerEnv {
  return parse(serverSchema, {
    livekitApiKey: pick("LIVEKIT_API_KEY"),
    livekitApiSecret: pick("LIVEKIT_API_SECRET"),
  });
}

/** Non-throwing variant used by the health check and the CSP builder. */
export function tryGetPublicEnv(): PublicEnv | null {
  try {
    return getPublicEnv();
  } catch {
    return null;
  }
}
