import { AppShell } from "@/components/shell/AppShell";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { user, profile } = await requireProfile();
  const [servers, platformRole] = await Promise.all([getMyServers(profile.id), getPlatformRole()]);
  // The saved workspace arrangement travels with the account (validated client-side before use).
  return (
    <AppShell servers={servers} workspace={user.user_metadata?.workspace} platformRole={platformRole}>
      {children}
    </AppShell>
  );
}
