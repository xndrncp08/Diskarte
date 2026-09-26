import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { PublicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session cookies for this request and returns the signed-in user id.
 * `makeResponse` is called again whenever cookies change so the refreshed tokens reach both the
 * downstream render (request cookies) and the browser (response cookies).
 */
export async function refreshSession(
  request: NextRequest,
  env: PublicEnv,
  makeResponse: () => NextResponse,
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = makeResponse();

  const supabase = createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
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

  // getClaims() verifies the JWT signature (via JWKS when available) — never trust getSession() here.
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { response, userId };
}
