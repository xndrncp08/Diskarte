import type { Metadata } from "next";
import { HomeView } from "@/components/shell/HomeView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";
import { createClient } from "@/lib/supabase/server";
import { activeEvents } from "@/lib/events";

export const metadata: Metadata = { title: "Home" };

export default async function TambayanHome() {
  const { profile } = await requireProfile();
  const servers = await getMyServers(profile.id);
  const now = new Date();
  const since = new Date(now);
  since.setHours(since.getHours() - 4);
  const { data, error } = servers.length
    ? await (
        await createClient()
      )
        .from("server_events")
        .select("id, server_id, name, starts_at, ends_at")
        .in(
          "server_id",
          servers.map((server) => server.id),
        )
        .or(
          `starts_at.gte.${now.toISOString()},ends_at.gt.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${since.toISOString()})`,
        )
        .order("starts_at")
        .limit(20)
    : { data: [], error: null };
  return (
    <HomeView
      servers={servers}
      events={activeEvents(data ?? []).slice(0, 4)}
      eventsUnavailable={!!error}
    />
  );
}
