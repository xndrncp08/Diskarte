import { NextResponse, type NextRequest } from "next/server";
import { tryGetPortalEnv } from "@/lib/env";
import { checkRate, clientIp } from "@/lib/rate-limit";
import { buildCsp, createNonce } from "@/lib/security";
import { checkAdminSession } from "@/lib/supabase/proxy";

const ADMIN_LOGIN = "/admin/login";

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function tooMany(retryAfterMs: number) {
  return new NextResponse("Too many requests. Dahan-dahan lang, kabayan — subukan ulit mamaya.", {
    status: 429,
    headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * 1. Per-IP limits on the two POST surfaces (the public form and the admin login) — Server
 *    Actions post to their page URL, so this runs before any action code.
 * 2. A per-request CSP nonce.
 * 3. /admin/**: a valid Supabase session *and* a super_admin row in the database, checked on
 *    every request. Everything else is redirected to the admin login.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const env = tryGetPortalEnv();
  const ip = clientIp(request.headers);

  if (request.method === "POST") {
    const bucket: [string, number] | null =
      pathname === ADMIN_LOGIN ? ["login", env?.limits.loginPerMinute ?? 5] : pathname === "/" ? ["apply-burst", 10] : isAdminPath(pathname) ? ["admin-actions", 120] : null;
    if (bucket) {
      const result = await checkRate(bucket[0], ip, bucket[1], 60_000, env?.upstash ?? null);
      if (!result.ok) return tooMany(result.retryAfterMs);
    }
  }

  const nonce = createNonce();
  const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp(nonce, { turnstile: Boolean(env?.turnstile), isDev: process.env.NODE_ENV === "development", upgradeInsecure: secure });

  const makeResponse = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (!env || !isAdminPath(pathname)) return makeResponse();

  const { response, userId, isSuperAdmin } = await checkAdminSession(request, env, makeResponse);
  response.headers.set("Cache-Control", "no-store");
  const withCookies = (target: NextResponse) => {
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set("Content-Security-Policy", csp);
    target.headers.set("Cache-Control", "no-store");
    return target;
  };

  if (pathname === ADMIN_LOGIN) {
    if (isSuperAdmin) return withCookies(NextResponse.redirect(new URL("/admin", request.url)));
    return response;
  }

  if (!isSuperAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = ADMIN_LOGIN;
    url.search = userId ? "?error=not_admin" : `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url));
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|email/|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
