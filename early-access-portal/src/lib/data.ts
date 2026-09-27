import "server-only";
import type { WaitlistRow } from "@/lib/approvals";
import { PAGE_SIZE, type ListQuery } from "@/lib/schema";
import type { ServerSupabase } from "@/lib/supabase/server";

export interface WaitlistStats {
  pending: number;
  approved: number;
  declined: number;
  email_failed: number;
  last7: { day: string; count: number }[];
}

export interface DashboardData {
  stats: WaitlistStats;
  rows: WaitlistRow[];
  total: number;
}

/** One dashboard page. Runs as the signed-in admin, so RLS is the final gate on every row. */
export async function loadDashboard(supabase: ServerSupabase, query: ListQuery): Promise<DashboardData> {
  let list = supabase.from("waitlist_applications").select("*", { count: "exact" });
  if (query.status !== "all") list = list.eq("status", query.status);
  if (query.q) {
    const term = `%${query.q}%`;
    list = list.or(`full_name.ilike.${term},email.ilike.${term},community_name.ilike.${term},preferred_username.ilike.${term}`);
  }
  // The pending queue is first-come, first-served; history views show the newest first.
  list = list.order("created_at", { ascending: query.status === "pending" }).range((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE - 1);

  const [{ data: rows, count }, { data: stats }] = await Promise.all([list, supabase.rpc("waitlist_stats")]);
  return {
    rows: (rows ?? []) as WaitlistRow[],
    total: count ?? 0,
    stats: (stats as WaitlistStats | null) ?? { pending: 0, approved: 0, declined: 0, email_failed: 0, last7: [] },
  };
}
