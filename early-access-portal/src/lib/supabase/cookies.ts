import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * The portal uses its own cookie name so its admin session can never collide with (or be
 * mistaken for) a Diskarte app session on the same host — e.g. localhost:3000 vs :3100.
 * HttpOnly: the portal never needs the session in browser JavaScript.
 */
export const PORTAL_AUTH_COOKIE = "diskarte-ea-auth";

export function portalCookieOptions(secure: boolean): CookieOptionsWithName {
  return { name: PORTAL_AUTH_COOKIE, path: "/", sameSite: "lax", secure, httpOnly: true };
}
