import type { Metadata } from "next";
import { ExploreView } from "@/components/shell/ExploreView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage() {
  const { profile } = await requireProfile("/tambayan/explore");
  const servers = await getMyServers(profile.id);
  return <ExploreView servers={servers} />;
}
