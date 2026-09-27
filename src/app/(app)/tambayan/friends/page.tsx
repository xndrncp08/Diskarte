import type { Metadata } from "next";
import { FriendsView } from "@/components/social/FriendsView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const { profile } = await requireProfile("/tambayan/friends");
  const servers = await getMyServers(profile.id);
  return <FriendsView servers={servers} />;
}
