import "server-only";
import { cache } from "react";
import type { ServerBadge } from "@/lib/community";
import type { Channel, MemberWithProfile, Server } from "@/lib/servers";
import { uuidSchema } from "@/lib/servers";
import type { MemberRole } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Servers the signed-in user belongs to (RLS returns nothing else), oldest membership first. */
export const getMyServers = cache(async (userId: string): Promise<Server[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("joined_at, server:servers!inner(*)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  return (data ?? []).map((row) => row.server as Server);
});

export interface ServerBundle {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  badges: ServerBadge[];
  myRole: MemberRole;
}

export const getServerBundle = cache(async (serverId: string, userId: string): Promise<ServerBundle | null> => {
  if (!uuidSchema.safeParse(serverId).success) return null;
  const supabase = await createClient();
  const [serverRes, channelsRes, membersRes, badgesRes] = await Promise.all([
    supabase.from("servers").select("*").eq("id", serverId).maybeSingle(),
    supabase.from("channels").select("*").eq("server_id", serverId).order("position").order("created_at"),
    supabase.from("members").select("*, profile:profiles!inner(*)").eq("server_id", serverId).order("joined_at"),
    supabase.from("server_badges").select("*").eq("server_id", serverId).order("created_at"),
  ]);
  if (!serverRes.data) return null;
  const members = (membersRes.data ?? []) as MemberWithProfile[];
  const me = members.find((m) => m.user_id === userId);
  if (!me) return null;
  return { server: serverRes.data, channels: channelsRes.data ?? [], members, badges: badgesRes.data ?? [], myRole: me.role };
});
