"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useOptionalUnreads } from "@/components/providers/UnreadsProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServerPresence } from "@/components/providers/PresenceProvider";
import type { ServerBadge } from "@/lib/community";
import type { PresencePayload, RealtimeHealth } from "@/lib/presence";
import { subscribeDbChanges } from "@/lib/realtime";
import type { Channel, MemberWithProfile, Server, ServerRole } from "@/lib/servers";
import type { BadgeKind, MemberRole, Tables } from "@/lib/supabase/database.types";

export interface ServerContextValue {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  myRole: MemberRole;
  /** Supporter badges per user id. */
  badges: Map<string, BadgeKind[]>;
  presence: Map<string, PresencePayload>;
  health: RealtimeHealth;
  upsertChannel: (channel: Channel) => void;
  removeChannel: (id: string) => void;
  /** Custom roles, lowest position first. */
  roles: ServerRole[];
  /** Custom role ids per user id. */
  memberRoles: Map<string, string[]>;
  /** Re-read roles and who has them (after an admin changes them; realtime also calls it). */
  reloadRoles: () => void;
  /** Custom emoji: name (without colons) → public image URL. */
  emojis: Map<string, string>;
}

/** Exported for tests and storybook-style fixtures; app code should use <ServerProvider>. */
export const ServerContext = createContext<ServerContextValue | null>(null);

export interface ServerProviderProps {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  badges?: ServerBadge[];
  myRole: MemberRole;
  roles?: ServerRole[];
  memberRoles?: { user_id: string; role_id: string }[];
  children: ReactNode;
}

const NO_BADGES: ServerBadge[] = [];
const NO_ROLES: ServerRole[] = [];
const NO_MEMBER_ROLES: { user_id: string; role_id: string }[] = [];

function memberRoleMap(rows: { user_id: string; role_id: string }[]) {
  const map = new Map<string, string[]>();
  for (const row of rows) map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.role_id]);
  return map;
}

function badgeMap(rows: ServerBadge[]) {
  const map = new Map<string, BadgeKind[]>();
  for (const row of rows) map.set(row.user_id, [...(map.get(row.user_id) ?? []), row.badge]);
  return map;
}

/**
 * Live state for one Tambayan: channels, members and presence are seeded from the server render
 * and then kept current with Supabase Realtime postgres_changes; presence comes from PresenceProvider.
 */
export function ServerProvider({
  server: initialServer,
  channels: initialChannels,
  members: initialMembers,
  badges: initialBadges = NO_BADGES,
  myRole: initialRole,
  roles: initialRoles = NO_ROLES,
  memberRoles: initialMemberRoles = NO_MEMBER_ROLES,
  children,
}: ServerProviderProps) {
  const supabase = useSupabase();
  const router = useRouter();
  // Stable callback only: depending on the whole unreads value would resubscribe realtime on every change.
  const noteActivity = useOptionalUnreads()?.noteActivity;
  const { me } = useMe();

  const [server, setServer] = useState(initialServer);
  const [channels, setChannels] = useState(initialChannels);
  const [members, setMembers] = useState(initialMembers);
  const [badgeRows, setBadgeRows] = useState(initialBadges);
  const [roles, setRoles] = useState(initialRoles);
  const [memberRoleRows, setMemberRoleRows] = useState(initialMemberRoles);
  const [health, setHealth] = useState<RealtimeHealth>("connecting");
  const [emojiRows, setEmojiRows] = useState<{ name: string; path: string }[]>([]);

  // Re-seed whenever the server component re-renders with fresh data.
  const [seed, setSeed] = useState({ initialServer, initialChannels, initialMembers, initialBadges, initialRoles, initialMemberRoles });
  if (
    seed.initialServer !== initialServer ||
    seed.initialChannels !== initialChannels ||
    seed.initialMembers !== initialMembers ||
    seed.initialBadges !== initialBadges ||
    seed.initialRoles !== initialRoles ||
    seed.initialMemberRoles !== initialMemberRoles
  ) {
    setSeed({ initialServer, initialChannels, initialMembers, initialBadges, initialRoles, initialMemberRoles });
    setServer(initialServer);
    setChannels(initialChannels);
    setMembers(initialMembers);
    setBadgeRows(initialBadges);
    setRoles(initialRoles);
    setMemberRoleRows(initialMemberRoles);
  }
  const memberRoles = useMemo(() => memberRoleMap(memberRoleRows), [memberRoleRows]);
  const badges = useMemo(() => badgeMap(badgeRows), [badgeRows]);
  const emojis = useMemo(() => new Map(emojiRows.map((e) => [e.name, supabase.storage.from("emoji").getPublicUrl(e.path).data.publicUrl])), [emojiRows, supabase]);

  const myRole = members.find((m) => m.user_id === me.id)?.role ?? initialRole;
  const serverId = server.id;

  const reloadRoles = useCallback(() => {
    void Promise.all([
      supabase.from("server_roles").select("*").eq("server_id", serverId).order("position").order("created_at"),
      supabase.from("member_roles").select("user_id, role_id").eq("server_id", serverId),
    ]).then(([r, m]) => {
      if (r.data) setRoles(r.data);
      if (m.data) setMemberRoleRows(m.data);
    });
  }, [supabase, serverId]);

  const reloadEmojis = useCallback(() => {
    void supabase
      .from("server_emojis")
      .select("name, path")
      .eq("server_id", serverId)
      .order("name")
      .then(({ data }) => data && setEmojiRows(data));
  }, [supabase, serverId]);

  // The rail prefetches each server's shell, so this render's data can be a few minutes old: catch up once
  // in the background (realtime keeps it current from here).
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.from("channels").select("*").eq("server_id", serverId).order("position").order("created_at"),
      supabase.from("members").select("*, profile:profiles!inner(*)").eq("server_id", serverId).order("joined_at"),
    ]).then(([c, m]) => {
      if (!live) return;
      if (c.data) setChannels(c.data);
      if (m.data) setMembers(m.data as MemberWithProfile[]);
    });
    reloadRoles();
    reloadEmojis();
    return () => {
      live = false;
    };
  }, [supabase, serverId, reloadRoles, reloadEmojis]);

  // ---- postgres_changes: channels / members / server row --------------------------------
  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    };

    return subscribeDbChanges(
      supabase,
      `server:${serverId}`,
      (channel) =>
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
            setChannels((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row as Channel]));
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
            setChannels((prev) => prev.map((c) => (c.id === row.id ? (row as Channel) : c)));
            const at = (row as Channel).last_message_at;
            if (at) noteActivity?.(row.id as string, serverId, at);
          })
          // DELETE events cannot be filtered server-side; the payload only carries the primary key.
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "channels" }, ({ old }) => {
            setChannels((prev) => prev.filter((c) => c.id !== (old as { id?: string }).id));
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "members", filter: `server_id=eq.${serverId}` }, async ({ new: row }) => {
            const member = row as Tables<"members">;
            const profile = await fetchProfile(member.user_id);
            if (!profile) return;
            setMembers((prev) => (prev.some((m) => m.user_id === member.user_id) ? prev : [...prev, { ...member, profile }]));
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "members", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
            const member = row as Tables<"members">;
            setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, ...member } : m)));
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "members" }, ({ old }) => {
            const key = old as { server_id?: string; user_id?: string };
            if (key.server_id !== serverId || !key.user_id) return;
            if (key.user_id === me.id) {
              toast.error("You were removed from this server.");
              router.replace("/tambayan");
              router.refresh();
              return;
            }
            setMembers((prev) => prev.filter((m) => m.user_id !== key.user_id));
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "server_badges", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
            const badge = row as ServerBadge;
            setBadgeRows((prev) => (prev.some((b) => b.user_id === badge.user_id && b.badge === badge.badge) ? prev : [...prev, badge]));
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "server_badges" }, ({ old }) => {
            const key = old as Partial<ServerBadge>;
            if (key.server_id !== serverId) return;
            setBadgeRows((prev) => prev.filter((b) => !(b.user_id === key.user_id && b.badge === key.badge)));
          })
          .on("postgres_changes", { event: "*", schema: "public", table: "server_roles", filter: `server_id=eq.${serverId}` }, reloadRoles)
          .on("postgres_changes", { event: "*", schema: "public", table: "member_roles", filter: `server_id=eq.${serverId}` }, reloadRoles)
          .on("postgres_changes", { event: "*", schema: "public", table: "server_emojis", filter: `server_id=eq.${serverId}` }, reloadEmojis)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "servers", filter: `id=eq.${serverId}` }, ({ new: row }) => {
            setServer(row as Server);
          })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "servers" }, ({ old }) => {
            if ((old as { id?: string }).id !== serverId) return;
            toast("This server was deleted.");
            router.replace("/tambayan");
            router.refresh();
          }),
      (status) => {
        if (status === "SUBSCRIBED") setHealth((h) => (h === "offline" ? h : "connected"));
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setHealth("degraded");
        else if (status === "CLOSED") setHealth("offline");
      },
    );
  }, [supabase, serverId, me.id, router, reloadRoles, reloadEmojis, noteActivity]);

  // ---- presence (shared, ref-counted channel from PresenceProvider) ---------------------
  const presence = useServerPresence(serverId);

  const upsertChannel = useCallback((channel: Channel) => {
    setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev.map((c) => (c.id === channel.id ? channel : c)) : [...prev, channel]));
  }, []);
  const removeChannel = useCallback((id: string) => setChannels((prev) => prev.filter((c) => c.id !== id)), []);

  const value = useMemo<ServerContextValue>(
    () => ({ server, channels, members, myRole, badges, presence, health, upsertChannel, removeChannel, roles, memberRoles, reloadRoles, emojis }),
    [server, channels, members, myRole, badges, presence, health, upsertChannel, removeChannel, roles, memberRoles, reloadRoles, emojis],
  );

  return <ServerContext.Provider value={value}>{children}</ServerContext.Provider>;
}

export function useServer(): ServerContextValue {
  const value = useContext(ServerContext);
  if (!value) throw new Error("useServer must be used inside <ServerProvider>");
  return value;
}

export function useOptionalServer(): ServerContextValue | null {
  return useContext(ServerContext);
}
