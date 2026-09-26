import { AppShell } from "@/components/shell/AppShell";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { profile } = await requireProfile();
  const servers = await getMyServers(profile.id);
  return (
    <AppShell profile={profile} servers={servers}>
      {children}
    </AppShell>
  );
}
