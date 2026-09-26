"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { useServerPresence } from "@/components/providers/PresenceProvider";
import type { PresencePayload, RealtimeHealth } from "@/lib/presence";
import type { Channel, MemberWithProfile, Server } from "@/lib/servers";
import type { MemberRole, Tables } from "@/lib/supabase/database.types";

export interface ServerContextValue {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  myRole: MemberRole;
  presence: Map<string, PresencePayload>;
  health: RealtimeHealth;
  upsertChannel: (channel: Channel) => void;
  removeChannel: (id: string) => void;
}

/** Exported for tests and storybook-style fixtures; app code should use <ServerProvider>. */
export const ServerContext = createContext<ServerContextValue | null>(null);

export interface ServerProviderProps {
  server: Server;
  channels: Channel[];
  members: MemberWithProfile[];
  myRole: MemberRole;
  children: ReactNode;
}

/**
 * Live state for one Tambayan: channels, members and presence are seeded from the server render
 * and then kept current with Supabase Realtime postgres_changes; presence comes from PresenceProvider.
 */
export function ServerProvider({ server: initialServer, channels: initialChannels, members: initialMembers, myRole: initialRole, children }: ServerProviderProps) {
  const supabase = useSupabase();
  const router = useRouter();
  const { me } = useMe();

  const [server, setServer] = useState(initialServer);
  const [channels, setChannels] = useState(initialChannels);
  const [members, setMembers] = useState(initialMembers);
  const [health, setHealth] = useState<RealtimeHealth>("connecting");

  // Re-seed whenever the server component re-renders with fresh data.
  const [seed, setSeed] = useState({ initialServer, initialChannels, initialMembers });
  if (seed.initialServer !== initialServer || seed.initialChannels !== initialChannels || seed.initialMembers !== initialMembers) {
    setSeed({ initialServer, initialChannels, initialMembers });
    setServer(initialServer);
    setChannels(initialChannels);
    setMembers(initialMembers);
  }

  const myRole = members.find((m) => m.user_id === me.id)?.role ?? initialRole;
  const serverId = server.id;

  // ---- postgres_changes: channels / members / server row --------------------------------
  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return data;
    };

    const db = supabase
      .channel(`db:server:${serverId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
        setChannels((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row as Channel]));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "channels", filter: `server_id=eq.${serverId}` }, ({ new: row }) => {
        setChannels((prev) => prev.map((c) => (c.id === row.id ? (row as Channel) : c)));
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
          toast.error("Na-remove ka sa tambayan na 'to.");
          router.replace("/tambayan");
          router.refresh();
          return;
        }
        setMembers((prev) => prev.filter((m) => m.user_id !== key.user_id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "servers", filter: `id=eq.${serverId}` }, ({ new: row }) => {
        setServer(row as Server);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "servers" }, ({ old }) => {
        if ((old as { id?: string }).id !== serverId) return;
        toast("Na-delete ang tambayan na 'to.");
        router.replace("/tambayan");
        router.refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setHealth((h) => (h === "offline" ? h : "connected"));
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setHealth("degraded");
        else if (status === "CLOSED") setHealth("offline");
      });

    return () => {
      supabase.removeChannel(db);
    };
  }, [supabase, serverId, me.id, router]);

  // ---- presence (shared, ref-counted channel from PresenceProvider) ---------------------
  const presence = useServerPresence(serverId);

  const upsertChannel = useCallback((channel: Channel) => {
    setChannels((prev) => (prev.some((c) => c.id === channel.id) ? prev.map((c) => (c.id === channel.id ? channel : c)) : [...prev, channel]));
  }, []);
  const removeChannel = useCallback((id: string) => setChannels((prev) => prev.filter((c) => c.id !== id)), []);

  const value = useMemo<ServerContextValue>(
    () => ({ server, channels, members, myRole, presence, health, upsertChannel, removeChannel }),
    [server, channels, members, myRole, presence, health, upsertChannel, removeChannel],
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
