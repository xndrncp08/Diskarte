import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import { authCookieOptions, isSecureUrl } from "./cookies";
import type { Database } from "./database.types";

/**
 * Per-request Supabase client for Server Components, Server Actions and Route Handlers.
 * Runs as the signed-in user, so every query is subject to Row-Level Security.
 */
export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: authCookieOptions(isSecureUrl(env.siteUrl)),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there and proxy.ts refreshes the session.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
