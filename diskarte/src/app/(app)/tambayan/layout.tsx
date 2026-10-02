import { signInMethods } from "@/components/profile/AccountSettings";
import { AppShell } from "@/components/shell/AppShell";
import { isVerified, requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";

export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { user, profile } = await requireProfile();
  const servers = await getMyServers(profile.id);
  return (
    <AppShell profile={profile} account={{ email: user.email ?? null, providers: signInMethods(user.app_metadata) }} verified={isVerified(user)} servers={servers}>
      {children}
    </AppShell>
  );
}
