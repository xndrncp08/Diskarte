import { z } from "zod";

/**
 * Runtime configuration (read per request, so one Docker image works everywhere).
 * Secrets never get a NEXT_PUBLIC_ prefix: the browser only ever sees the Turnstile site key.
 */
export class MissingEnvError extends Error {
  constructor(detail: string) {
    super(`Early access portal is missing configuration: ${detail}`);
    this.name = "MissingEnvError";
  }
}

/** process.env, or a plain object in tests. */
export type EnvSource = Record<string, string | undefined>;

const url = z.url().transform((v) => v.replace(/\/$/, ""));

const baseSchema = z.object({
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: z.string().min(20),
  SITE_URL: url.optional(),
  RENDER_EXTERNAL_URL: url.optional(),
  UPSTASH_REDIS_REST_URL: url.optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  APP_URL: url.default("http://localhost:3000"),
  PORTAL_SECRET: z.string().min(32, "PORTAL_SECRET must be at least 32 characters"),
  TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  RATE_LIMIT_APPLY_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().positive().default(5),
});

export interface PortalEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
  appUrl: string;
  secret: string;
  turnstile: { siteKey: string; secretKey: string } | null;
  limits: { applyPerHour: number; loginPerMinute: number };
  /** Shared rate-limit counters (recommended on Vercel, where instances don't share memory). */
  upstash: { url: string; token: string } | null;
}

/**
 * Accept the names Vercel's Supabase integration sets (NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY / publishable key) and derive the site URL from Vercel's system
 * variables, so a fresh Vercel project works with the minimum configuration.
 */
function normalise(source: EnvSource): EnvSource {
  const vercelHost = source.VERCEL_PROJECT_PRODUCTION_URL ?? source.VERCEL_URL;
  return {
    ...source,
    SUPABASE_URL: source.SUPABASE_URL || source.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY:
      source.SUPABASE_ANON_KEY || source.SUPABASE_PUBLISHABLE_KEY || source.NEXT_PUBLIC_SUPABASE_ANON_KEY || source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SITE_URL: source.SITE_URL || (vercelHost ? `https://${vercelHost}` : undefined),
  };
}

function read(source: EnvSource) {
  const cleaned = Object.fromEntries(Object.entries(normalise(source)).filter(([, v]) => v !== "" && v !== undefined));
  return baseSchema.safeParse(cleaned);
}

export function getPortalEnv(source: EnvSource = process.env): PortalEnv {
  const parsed = read(source);
  if (!parsed.success) throw new MissingEnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const e = parsed.data;
  if (Boolean(e.TURNSTILE_SITE_KEY) !== Boolean(e.TURNSTILE_SECRET_KEY)) throw new MissingEnvError("set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or neither");
  return {
    supabaseUrl: e.SUPABASE_URL,
    supabaseAnonKey: e.SUPABASE_ANON_KEY,
    siteUrl: e.SITE_URL ?? e.RENDER_EXTERNAL_URL ?? "http://localhost:3100",
    appUrl: e.APP_URL,
    secret: e.PORTAL_SECRET,
    turnstile: e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? { siteKey: e.TURNSTILE_SITE_KEY, secretKey: e.TURNSTILE_SECRET_KEY } : null,
    limits: { applyPerHour: e.RATE_LIMIT_APPLY_PER_HOUR, loginPerMinute: e.RATE_LIMIT_LOGIN_PER_MINUTE },
    upstash: e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN ? { url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN } : null,
  };
}

export function tryGetPortalEnv(source: EnvSource = process.env): PortalEnv | null {
  try {
    return getPortalEnv(source);
  } catch {
    return null;
  }
}

// ---- server-only secrets for approvals ---------------------------------------------------

export type EmailTransport = "resend" | "log" | "file";

export interface ApprovalEnv {
  serviceRoleKey: string;
  email: { transport: "resend"; apiKey: string; from: string } | { transport: "log"; from: string } | { transport: "file"; dir: string; from: string };
}

const approvalSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20, "SUPABASE_SERVICE_ROLE_KEY is required to create accounts"),
  EMAIL_TRANSPORT: z.enum(["resend", "log", "file"]).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default("Diskarte <early-access@diskarte.ph>"),
  EMAIL_OUTBOX_DIR: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
});

export function getApprovalEnv(source: EnvSource = process.env): ApprovalEnv {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ""));
  const parsed = approvalSchema.safeParse(cleaned);
  if (!parsed.success) throw new MissingEnvError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const e = parsed.data;
  const transport: EmailTransport = e.EMAIL_TRANSPORT ?? (e.NODE_ENV === "production" ? "resend" : "log");
  if (transport === "resend") {
    if (!e.RESEND_API_KEY) throw new MissingEnvError("RESEND_API_KEY is required when EMAIL_TRANSPORT=resend");
    return { serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY, email: { transport, apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM } };
  }
  if (transport === "file") {
    if (!e.EMAIL_OUTBOX_DIR) throw new MissingEnvError("EMAIL_OUTBOX_DIR is required when EMAIL_TRANSPORT=file");
    return { serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY, email: { transport, dir: e.EMAIL_OUTBOX_DIR, from: e.EMAIL_FROM } };
  }
  return { serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY, email: { transport, from: e.EMAIL_FROM } };
}
