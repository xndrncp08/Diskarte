import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bot defences that cost humans nothing:
 * - a signed "form issued at" token: submissions faster than MIN_FILL_MS, older than MAX_AGE_MS,
 *   or with a forged/missing signature are rejected (stops blind POST replay and scripted fills);
 * - a honeypot field hidden from people and assistive tech;
 * - per-IP limits keyed by a salted hash (the raw IP is never stored).
 * Cloudflare Turnstile is layered on top when configured (lib/turnstile.ts).
 */
export const MIN_FILL_MS = 3_000;
export const MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const HONEYPOT_FIELD = "website";

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(`form:${payload}`).digest("base64url");
}

export function issueFormToken(secret: string, now = Date.now()): string {
  const issued = String(now);
  return `${issued}.${sign(secret, issued)}`;
}

export type FormTokenProblem = "missing" | "invalid" | "too_fast" | "expired";

export function checkFormToken(token: unknown, secret: string, now = Date.now()): FormTokenProblem | null {
  if (typeof token !== "string" || !token.includes(".")) return "missing";
  const [issued, signature] = token.split(".", 2);
  const expected = Buffer.from(sign(secret, issued));
  const actual = Buffer.from(signature ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "invalid";
  const age = now - Number(issued);
  if (!Number.isFinite(age) || age < 0) return "invalid";
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_AGE_MS) return "expired";
  return null;
}

export function honeypotTripped(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Salted SHA-256 of the client IP: enough to rate-limit per network without storing the IP. */
export function hashIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${secret}:ip:${ip}`).digest("hex");
}
