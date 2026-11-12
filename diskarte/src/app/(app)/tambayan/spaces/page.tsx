import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PulseSpaces } from "@/components/pulse/views/Spaces";
import { getPlatformRole } from "@/lib/admin-server";
import { requireProfile } from "@/lib/auth";
import { getMyServers } from "@/lib/data/servers";
import { resolveShell, SHELL_COOKIE } from "@/lib/shell";

export const metadata: Metadata = { title: "Spaces" };

/** Pulse's Spaces tab. Classic has no such screen (its rail lists the Spaces), so it goes Home. */
export default async function SpacesPage() {
  const { profile } = await requireProfile("/tambayan/spaces");
  const [servers, platformRole, jar] = await Promise.all([getMyServers(profile.id), getPlatformRole(), cookies()]);
  if (resolveShell(jar.get(SHELL_COOKIE)?.value, platformRole, process.env.DISKARTE_PULSE_ROLLOUT === "opt-in") !== "pulse") redirect("/tambayan");
  return <PulseSpaces servers={servers} />;
}
