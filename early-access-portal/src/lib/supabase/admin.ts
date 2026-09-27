import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getApprovalEnv, getPortalEnv } from "@/lib/env";

/**
 * Service-role client — bypasses RLS and can create Auth users. Only ever constructed inside
 * approval server actions *after* the caller has been verified as a super admin, and never
 * imported by client components (`server-only`).
 */
export function createServiceClient() {
  const { supabaseUrl } = getPortalEnv();
  const { serviceRoleKey } = getApprovalEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
