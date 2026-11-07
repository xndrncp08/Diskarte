import "server-only";
import { getPublicEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/service";
import { formatReleasePost, RELEASES, type Release } from "@/lib/releases";

export type AnnounceResult = "published" | "already-published" | "superseded" | "disabled" | "none" | "failed";

/** Opt-in per environment (set RELEASE_ANNOUNCEMENTS=on for Production only), never on preview builds. */
export function releaseAnnouncementsEnabled(env: Record<string, string | undefined> = process.env) {
  return env.RELEASE_ANNOUNCEMENTS === "on" && (!env.VERCEL_ENV || env.VERCEL_ENV === "production") && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Posts `release` (default: the newest in releases.json) to Diskarte HQ #announcements. Safe to call
 * from every server instance: the database publishes each release once, under a lock, and refuses an
 * older release after a newer one. A failure leaves nothing recorded, so the next start retries.
 */
export async function announceRelease(release: Release | undefined = RELEASES[0], db = createServiceClient(), siteUrl = getPublicEnv().siteUrl): Promise<AnnounceResult> {
  if (!release) return "none";
  const { data, error } = await db.rpc("publish_release_announcement", {
    p_release_id: release.id,
    p_released_on: release.date,
    p_title: release.title,
    p_content: formatReleasePost(release, siteUrl),
  });
  const result: AnnounceResult = error ? "failed" : (data as AnnounceResult);
  // Release id and outcome only; never message content or keys.
  console.info(JSON.stringify({ event: "release_announcement", release: release.id, result, ...(error ? { code: error.code ?? "unknown" } : {}) }));
  return result;
}
