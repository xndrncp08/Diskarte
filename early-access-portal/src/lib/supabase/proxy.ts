import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { PortalEnv } from "@/lib/env";
import { portalCookieOptions } from "./cookies";

/**
 * Refreshes the admin session cookies and reports whether the caller is a super admin.
 * The role is looked up in the database on every admin request (not trusted from a cookie/JWT
 * claim), so revoking a grant takes effect immediately.
 */
export async function checkAdminSession(
  request: NextRequest,
  env: PortalEnv,
  makeResponse: () => NextResponse,
): Promise<{ response: NextResponse; userId: string | null; isSuperAdmin: boolean }> {
  let response = makeResponse();
  const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: portalCookieOptions(secure),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = makeResponse();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) return { response, userId, isSuperAdmin: false };
  const { data: isAdmin } = await supabase.rpc("is_super_admin");
  return { response, userId, isSuperAdmin: isAdmin === true };
}
