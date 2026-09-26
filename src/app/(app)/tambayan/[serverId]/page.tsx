import { notFound, redirect } from "next/navigation";
import { EmptyServer } from "@/components/server/EmptyServer";
import { requireProfile } from "@/lib/auth";
import { getServerBundle } from "@/lib/data/servers";
import { firstTextChannel } from "@/lib/servers";

export default async function ServerIndex({ params }: PageProps<"/tambayan/[serverId]">) {
  const { serverId } = await params;
  const { profile } = await requireProfile();
  const bundle = await getServerBundle(serverId, profile.id);
  if (!bundle) notFound();
  const first = firstTextChannel(bundle.channels) ?? bundle.channels[0];
  if (first) redirect(`/tambayan/${serverId}/${first.id}`);
  return <EmptyServer />;
}
