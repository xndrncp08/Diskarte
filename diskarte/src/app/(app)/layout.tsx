import { redirect } from "next/navigation";
import { AdminAccessProvider } from "@/components/admin/AdminAccess";
import { signInMethods } from "@/components/profile/AccountSettings";
import { SessionProviders } from "@/components/shell/SessionProviders";
import { getPlatformRole } from "@/lib/admin-server";
import { isVerified, requireProfile } from "@/lib/auth";

/**
 * Everything under (app) needs a signed-in, onboarded user. This layout stays mounted across every
 * navigation inside the app, so it owns the session providers — including the LiveKit call, which
 * therefore survives moving between servers, DMs and the /settings pages. The platform role (cached per
 * request) is provided here too so the Settings dialog can show super-admin-only previews.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [{ user, profile }, platformRole] = await Promise.all([requireProfile(), getPlatformRole()]);
  if (!profile.onboarded) redirect("/onboarding");
  return (
    <AdminAccessProvider role={platformRole}>
      <SessionProviders profile={profile} account={{ email: user.email ?? null, providers: signInMethods(user.app_metadata) }} verified={isVerified(user)}>
        {children}
      </SessionProviders>
    </AdminAccessProvider>
  );
}
