import type { Metadata } from "next";
import { HomeView } from "@/components/shell/HomeView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Home" };

export default async function TambayanHome() {
  const { profile } = await requireProfile();
  const servers = await getMyServers(profile.id);
  return <HomeView servers={servers} />;
}
