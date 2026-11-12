import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PulseYou } from "@/components/pulse/views/You";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";
import { resolveShell, SHELL_COOKIE } from "@/lib/shell";

export const metadata: Metadata = { title: "You" };

/** Pulse's You tab. Classic keeps its user panel and Profile tab, so it goes Home. */
export default async function YouPage() {
  const { profile } = await requireProfile("/tambayan/you");
  const [servers, platformRole, jar] = await Promise.all([getMyServers(profile.id), getPlatformRole(), cookies()]);
  if (resolveShell(jar.get(SHELL_COOKIE)?.value, platformRole, process.env.DISKARTE_PULSE_ROLLOUT === "opt-in") !== "pulse") redirect("/tambayan");
  return <PulseYou servers={servers} />;
}
