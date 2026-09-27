import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPortalEnv } from "@/lib/env";
import { portalCookieOptions } from "./cookies";

/**
 * Per-request client that acts as the signed-in admin (or anonymously on the public form), so
 * Row-Level Security applies to every query it makes.
 */
export async function createClient() {
  const env = getPortalEnv();
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookieOptions: portalCookieOptions(env.siteUrl.startsWith("https://")),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session.
        }
      },
    },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** The signed-in user if (and only if) they hold the super_admin role — checked in the database. */
export async function getSuperAdmin(supabase?: ServerSupabase) {
  const client = supabase ?? (await createClient());
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;
  const { data: isAdmin } = await client.rpc("is_super_admin");
  return isAdmin === true ? auth.user : null;
}
