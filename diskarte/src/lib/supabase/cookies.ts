import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Auth cookie policy shared by the server, proxy and browser clients.
 * - Host-only (no Domain attribute): never shared with sibling subdomains.
 * - SameSite=Lax + Path=/; Secure whenever the site is served over HTTPS.
 * - Not HttpOnly: @supabase/ssr's browser client must read the session to authorise Realtime,
 *   Storage uploads and RLS queries from the browser. XSS exposure is contained by the nonce CSP,
 *   escaped rendering and short-lived access tokens (see SECURITY.md).
 */
export function authCookieOptions(secure: boolean): CookieOptionsWithName {
  return { path: "/", sameSite: "lax", secure, httpOnly: false };
}

export function isSecureUrl(url: string | null | undefined) {
  return typeof url === "string" && url.startsWith("https://");
}
