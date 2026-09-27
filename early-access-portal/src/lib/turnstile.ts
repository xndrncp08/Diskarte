import "server-only";

export const TURNSTILE_FIELD = "cf-turnstile-response";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Server-side Cloudflare Turnstile check. Network failures count as "not verified". */
export async function verifyTurnstile(token: unknown, opts: { secretKey: string; ip?: string; fetchImpl?: typeof fetch }): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: opts.secretKey, response: token });
  if (opts.ip && opts.ip !== "unknown") body.set("remoteip", opts.ip);
  try {
    const res = await (opts.fetchImpl ?? fetch)(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
