import type { Metadata } from "next";
import { MessagesView } from "@/components/social/MessagesView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const { profile } = await requireProfile("/tambayan/messages");
  const servers = await getMyServers(profile.id);
  return <MessagesView servers={servers} />;
}
