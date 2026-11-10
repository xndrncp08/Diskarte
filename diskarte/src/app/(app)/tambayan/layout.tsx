import { cookies } from "next/headers";
import { ClassicFrame, ShellProviders } from "@/components/shell/AppShell";
import { PulseShell } from "@/components/pulse/shell/PulseShell";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";
import { previewShell, SHELL_COOKIE } from "@/lib/shell";

/**
 * The one mount of the app frame. ShellProviders stays mounted when `setShell` refreshes with a new cookie;
 * only the frame inside it swaps (Classic's rail and columns, or Pulse's navigator and canvas).
 */
export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { profile } = await requireProfile();
  const [servers, platformRole, jar] = await Promise.all([getMyServers(profile.id), getPlatformRole(), cookies()]);
  // Pulse is a super-admin preview for now (the role is the server's; the cookie alone is not enough).
  const shell = previewShell(jar.get(SHELL_COOKIE)?.value, platformRole);
  return (
    <ShellProviders platformRole={platformRole} shell={shell}>
      {shell === "pulse" ? <PulseShell servers={servers}>{children}</PulseShell> : <ClassicFrame servers={servers}>{children}</ClassicFrame>}
    </ShellProviders>
  );
}
