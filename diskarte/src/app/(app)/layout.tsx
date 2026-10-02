import { redirect } from "next/navigation";
import { signInMethods } from "@/components/profile/AccountSettings";
import { SessionProviders } from "@/components/shell/SessionProviders";
import { isVerified, requireProfile } from "@/lib/auth";

/**
 * Everything under (app) needs a signed-in, onboarded user. This layout stays mounted across every
 * navigation inside the app, so it owns the session providers — including the LiveKit call, which
 * therefore survives moving between servers, DMs and the /settings pages.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile } = await requireProfile();
  if (!profile.onboarded) redirect("/onboarding");
  return (
    <SessionProviders profile={profile} account={{ email: user.email ?? null, providers: signInMethods(user.app_metadata) }} verified={isVerified(user)}>
      {children}
    </SessionProviders>
  );
}
