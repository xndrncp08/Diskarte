import "server-only";
import { cache } from "react";
import type { ServerBadge } from "@/lib/community";
import type { Channel, MemberWithProfile, Server, ServerRole } from "@/lib/servers";
import { firstTextChannel } from "@/lib/servers";
import { uuidSchema } from "@/lib/schemas/servers";
import type { MemberRole } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Servers the signed-in user belongs to (RLS returns nothing else), oldest membership first, each with
    the channel the rail should open (its first text channel). */
export const getMyServers = cache(async (userId: string): Promise<(Server & { entryChannelId: string | null })[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("joined_at, server:servers!inner(*, channels(*))")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  return (data ?? []).map((row) => {
    const { channels, ...server } = row.server as Server & { channels: Channel[] | null };
    const entry = firstTextChannel(channels ?? []) ?? channels?.[0];
    return { ...server, entryChannelId: entry?.id ?? null };
  });
});

export interface ServerBundle {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  badges: ServerBadge[];
  myRole: MemberRole;
  roles: ServerRole[];
  /** Custom role ids per member. */
  memberRoles: { user_id: string; role_id: string }[];
}

export const getServerBundle = cache(async (serverId: string, userId: string): Promise<ServerBundle | null> => {
  if (!uuidSchema.safeParse(serverId).success) return null;
  const supabase = await createClient();
  const [serverRes, channelsRes, membersRes, badgesRes, rolesRes, memberRolesRes] = await Promise.all([
    supabase.from("servers").select("*").eq("id", serverId).maybeSingle(),
    supabase.from("channels").select("*").eq("server_id", serverId).order("position").order("created_at"),
    supabase.from("members").select("*, profile:profiles!inner(*)").eq("server_id", serverId).order("joined_at"),
    supabase.from("server_badges").select("*").eq("server_id", serverId).order("created_at"),
    supabase.from("server_roles").select("*").eq("server_id", serverId).order("position").order("created_at"),
    supabase.from("member_roles").select("user_id, role_id").eq("server_id", serverId),
  ]);
  if (!serverRes.data) return null;
  const members = (membersRes.data ?? []) as MemberWithProfile[];
  const me = members.find((m) => m.user_id === userId);
  if (!me) return null;
  // Roles come back empty (not an error page) until the roles migration is applied.
  return {
    server: serverRes.data,
    channels: channelsRes.data ?? [],
    members,
    badges: badgesRes.data ?? [],
    myRole: me.role,
    roles: rolesRes.data ?? [],
    memberRoles: memberRolesRes.data ?? [],
  };
});

/** One channel by id (RLS returns it only to members): what a channel page needs, without the whole bundle. */
export const getChannel = cache(async (serverId: string, channelId: string): Promise<Channel | null> => {
  if (!uuidSchema.safeParse(serverId).success || !uuidSchema.safeParse(channelId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("channels").select("*").eq("id", channelId).eq("server_id", serverId).maybeSingle();
  return data;
});

/** Just the server's name, for page titles (metadata re-runs on every navigation; the bundle is heavy). */
export const getServerName = cache(async (serverId: string): Promise<string | null> => {
  if (!uuidSchema.safeParse(serverId).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("servers").select("name").eq("id", serverId).maybeSingle();
  return data?.name ?? null;
});
