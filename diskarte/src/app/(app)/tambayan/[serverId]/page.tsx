import { notFound, redirect } from "next/navigation";
import { EmptyServer } from "@/components/server/EmptyServer";
import { requireProfile } from "@/lib/auth";
import { getServerBundle } from "@/lib/data/servers";
import { firstTextChannel } from "@/lib/servers";
import { z } from "zod";

export default async function ServerIndex({ params, searchParams }: PageProps<"/tambayan/[serverId]">) {
  const { serverId } = await params;
  const { profile } = await requireProfile();
  const bundle = await getServerBundle(serverId, profile.id);
  if (!bundle) notFound();
  const first = firstTextChannel(bundle.channels) ?? bundle.channels[0];
  const event = (await searchParams).event;
  if (first) redirect(`/tambayan/${serverId}/${first.id}${z.uuid().safeParse(event).success ? `?event=${event}` : ""}`);
  return <EmptyServer />;
}
