import { NextResponse, type NextRequest } from "next/server";
import type { AdminOverview, AdminSnapshot, AdminUser, AuditEntry, Broadcast } from "@/lib/admin";
import { isSuperAdmin, listVoiceRooms } from "@/lib/admin-server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };

/**
 * GET /api/admin/snapshot?q=<search>
 * Everything the Control Center shows in one round trip: headline numbers, the network roster
 * (server-side search by username, display name or email), live LiveKit rooms, the latest audit
 * entries and broadcasts. Super admins only — verified here and again by every RPC and RLS policy.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: noStore });
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });

  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 64) || null;
  const supabase = await createClient();
  const [overview, users, audit, broadcasts, voice] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_list_users", { p_query: q, p_limit: 500 }),
    supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("system_broadcasts").select("*").order("created_at", { ascending: false }).limit(25),
    listVoiceRooms(),
  ]);
  const failed = overview.error ?? users.error ?? audit.error ?? broadcasts.error;
  if (failed) return NextResponse.json({ error: "The Control Center couldn't load. Is the latest database migration applied?" }, { status: 500, headers: noStore });

  // Name the voice channels behind live rooms.
  const channelIds = voice.rooms.map((r) => r.channelId).filter((id): id is string => !!id);
  if (channelIds.length) {
    const { data: labels } = await supabase.rpc("admin_channel_labels", { p_ids: channelIds });
    const byId = new Map((labels ?? []).map((l) => [l.id, `${l.name} · ${l.server_name}`]));
    for (const room of voice.rooms) if (room.channelId) room.label = byId.get(room.channelId) ?? room.label;
  }

  const body: AdminSnapshot = {
    overview: overview.data as unknown as AdminOverview,
    users: (users.data ?? []) as unknown as AdminUser[],
    voice,
    audit: (audit.data ?? []) as unknown as AuditEntry[],
    broadcasts: (broadcasts.data ?? []) as unknown as Broadcast[],
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(body, { headers: noStore });
}
