import { NextResponse, type NextRequest } from "next/server";
import { tryGetPublicEnv } from "@/lib/env";
import { checkLimit, clientIp, retryAfterSeconds, type LimiterName, type RateLimitResult } from "@/lib/rate-limit";
import { allowedOriginSet, buildCsp, corsHeadersFor, createNonce, isSafeMethod, isSameOriginRequest } from "@/lib/security";
import { refreshSession } from "@/lib/supabase/proxy";

/** Pages that need a signed-in user (server components re-check with getUser()). */
const PROTECTED_PREFIXES = ["/tambayan", "/settings", "/onboarding", "/reset-password"];
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];
/** Pages whose POSTs are auth attempts (Server Actions post to the page URL). */
const AUTH_POST_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/settings/account"];
const AUTH_CALLBACK_PATHS = ["/auth/callback", "/auth/confirm"];
const FIRST_LOGIN_PATH = "/reset-password";
/** API routes reachable without a session. */
const PUBLIC_API = ["/api/health"];

/** Extra CORS origins: ALLOWED_ORIGINS plus the Early Access portal (it reads /api/health). */
function extraOrigins() {
  return [...(process.env.ALLOWED_ORIGINS ?? "").split(","), process.env.EARLY_ACCESS_URL ?? ""].map((o) => o.trim()).filter(Boolean);
}

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function tooManyRequests(result: RateLimitResult, json: boolean) {
  const headers = { "Retry-After": String(retryAfterSeconds(result)), "Cache-Control": "no-store" };
  return json
    ? NextResponse.json({ error: "Too many requests. Dahan-dahan lang, kabayan." }, { status: 429, headers })
    : new NextResponse("Too many requests. Dahan-dahan lang, kabayan — subukan ulit mamaya.", {
        status: 429,
        headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
      });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const env = tryGetPublicEnv();
  const ip = clientIp(request.headers);

  // --- CORS / CSRF / rate limiting for route handlers ------------------------------------
  let cors: Record<string, string> = {};
  if (isApi) {
    const allowed = allowedOriginSet(env?.siteUrl, [request.nextUrl.origin, ...extraOrigins()]);
    const headers = corsHeadersFor(request.headers.get("origin"), allowed);
    if (request.method === "OPTIONS") {
      return headers ? new NextResponse(null, { status: 204, headers }) : NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
    }
    if (!isSafeMethod(request.method) && (headers === null || !isSameOriginRequest(request.headers, request.url, [...allowed]))) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    cors = headers ?? {};
    if (!matches(pathname, PUBLIC_API)) {
      const limit = await checkLimit("api", ip);
      if (!limit.ok) return tooManyRequests(limit, true);
    }
  }

  // --- anti-brute-force on auth endpoints (per client IP) ----------------------------------
  let bucket: LimiterName | null = null;
  if (request.method === "POST" && matches(pathname, AUTH_POST_PATHS)) bucket = "auth";
  else if (request.method === "GET" && matches(pathname, AUTH_CALLBACK_PATHS)) bucket = "authCallback";
  if (bucket) {
    const limit = await checkLimit(bucket, ip);
    if (!limit.ok) return tooManyRequests(limit, false);
  }

  // --- per-request CSP ----------------------------------------------------------------------
  const nonce = createNonce();
  const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const csp = buildCsp(nonce, { supabaseUrl: env?.supabaseUrl, livekitUrl: env?.livekitUrl }, process.env.NODE_ENV === "development", secure);

  const makeResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  };

  // Liveness must answer even when upstreams are down or unconfigured.
  if (!env || matches(pathname, PUBLIC_API)) return makeResponse();

  // --- session refresh + route guards ------------------------------------------------------
  const { response, userId, mustChangePassword } = await refreshSession(request, env, makeResponse);

  const withCookies = (target: NextResponse) => {
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set("Content-Security-Policy", csp);
    return target;
  };

  if (isApi && !userId) {
    return withCookies(NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { ...cors, "Cache-Control": "no-store" } }));
  }

  if (!userId && matches(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url));
  }

  // Early Access accounts start with an emailed temporary password: nothing else until it's changed.
  if (mustChangePassword && matches(pathname, PROTECTED_PREFIXES) && pathname !== FIRST_LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = FIRST_LOGIN_PATH;
    url.search = "?first=1";
    return withCookies(NextResponse.redirect(url));
  }

  if (userId && GUEST_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/tambayan";
    url.search = "";
    return withCookies(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|wordmark.svg|opengraph-image|twitter-image|manifest.webmanifest|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
