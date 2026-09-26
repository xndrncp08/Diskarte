import { NextResponse, type NextRequest } from "next/server";
import { tryGetPublicEnv } from "@/lib/env";
import { buildCsp, createNonce, isSafeMethod, isSameOriginRequest } from "@/lib/security";
import { refreshSession } from "@/lib/supabase/proxy";

const PROTECTED_PREFIXES = ["/tambayan", "/settings", "/onboarding"];
const GUEST_ONLY = ["/login", "/signup"];

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // --- CORS / CSRF for route handlers -------------------------------------------------
  if (isApi) {
    if (request.method === "OPTIONS") {
      // No cross-origin API consumers: answer preflights without granting anything.
      return new NextResponse(null, { status: 204, headers: { Allow: "GET, POST, OPTIONS" } });
    }
    if (!isSafeMethod(request.method) && !isSameOriginRequest(request.headers, request.url, allowedOrigins())) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
  }

  const env = tryGetPublicEnv();
  const nonce = createNonce();
  const csp = buildCsp(nonce, { supabaseUrl: env?.supabaseUrl, livekitUrl: env?.livekitUrl }, process.env.NODE_ENV === "development");

  const makeResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (!env) {
    // Unconfigured deployment: still serve the landing page / health check with a CSP.
    return makeResponse();
  }

  const { response, userId } = await refreshSession(request, env, makeResponse);

  const withCookies = (target: NextResponse) => {
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set("Content-Security-Policy", csp);
    return target;
  };

  if (!userId && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
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
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|wordmark.svg|opengraph-image|twitter-image|manifest.webmanifest|robots.txt|sounds/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
