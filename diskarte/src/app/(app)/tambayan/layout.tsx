import { AppShell } from "@/components/shell/AppShell";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { profile } = await requireProfile();
  const [servers, platformRole] = await Promise.all([getMyServers(profile.id), getPlatformRole()]);
  return (
    <AppShell servers={servers} platformRole={platformRole}>
      {children}
    </AppShell>
  );
}
