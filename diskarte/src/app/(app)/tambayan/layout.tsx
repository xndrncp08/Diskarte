import { cookies } from "next/headers";
import { ShellProviders } from "@/components/shell/AppShell";
import { AppFrame } from "@/components/shell/AppFrame";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";
import { resolveShell, SHELL_COOKIE } from "@/lib/shell";

/**
 * The one mount of the app frame. ShellProviders stays mounted when `setShell` refreshes with a new cookie;
 * only the frame inside it swaps (Classic's rail and columns, or Pulse's navigator and canvas).
 */
export default async function TambayanLayout({ children }: LayoutProps<"/tambayan">) {
  const { profile } = await requireProfile();
  const [servers, platformRole, jar] = await Promise.all([getMyServers(profile.id), getPlatformRole(), cookies()]);
  // Public opt-in is an explicit deployment gate; an absent cookie always keeps Classic.
  const shell = resolveShell(jar.get(SHELL_COOKIE)?.value, platformRole, process.env.DISKARTE_PULSE_ROLLOUT === "opt-in");
  return (
    <ShellProviders platformRole={platformRole} shell={shell}>
      <AppFrame shell={shell} servers={servers}>{children}</AppFrame>
    </ShellProviders>
  );
}
