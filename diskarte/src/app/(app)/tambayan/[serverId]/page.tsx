import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CommunityLanding } from "@/components/pulse/community/CommunityLanding";
import { EmptyServer } from "@/components/server/EmptyServer";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getServerBundle } from "@/lib/data/servers";
import { activeEvents } from "@/lib/events";
import { firstTextChannel } from "@/lib/servers";
import { previewShell, SHELL_COOKIE } from "@/lib/shell";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export default async function ServerIndex({ params, searchParams }: PageProps<"/tambayan/[serverId]">) {
  const { serverId } = await params;
  const { profile } = await requireProfile();
  const bundle = await getServerBundle(serverId, profile.id);
  if (!bundle) notFound();
  const first = firstTextChannel(bundle.channels) ?? bundle.channels[0];
  const event = (await searchParams).event;
  const withEvent = z.uuid().safeParse(event).success;
  const [platformRole, jar] = await Promise.all([getPlatformRole(), cookies()]);
  // Pulse: the Space's landing page. Classic (and an event link, which opens in the first room) goes straight to a room.
  if (previewShell(jar.get(SHELL_COOKIE)?.value, platformRole) === "pulse" && !withEvent) {
    const at = new Date();
    const now = at.toISOString();
    const since = new Date(at.getTime() - 4 * 3600000).toISOString();
    const { data, error } = await (await createClient())
      .from("server_events")
      .select("id, name, starts_at, ends_at")
      .eq("server_id", serverId)
      .or(`starts_at.gte.${now},ends_at.gt.${now},and(ends_at.is.null,starts_at.gte.${since})`)
      .order("starts_at")
      .limit(10);
    return <CommunityLanding events={activeEvents(data ?? []).slice(0, 3)} eventsUnavailable={!!error} />;
  }
  if (first) redirect(`/tambayan/${serverId}/${first.id}${withEvent ? `?event=${event}` : ""}`);
  return <EmptyServer />;
}
