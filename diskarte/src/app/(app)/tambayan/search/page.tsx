import type { Metadata } from "next";
import { GlobalSearchView } from "@/components/shell/GlobalSearchView";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export const metadata: Metadata = { title: "Search" };
export default async function SearchPage() {
  const { profile } = await requireProfile("/tambayan/search");
  return <GlobalSearchView servers={await getMyServers(profile.id)} />;
}
