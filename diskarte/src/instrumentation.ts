import type { Instrumentation } from "next";
import { requestErrorRecord } from "@/lib/server-observability";

/**
 * A server instance of this deployment is starting, i.e. the build succeeded and it is serving
 * traffic: announce its release (once — the database dedupes across instances and restarts). Not
 * awaited, so startup isn't delayed; a missed or failed attempt is retried by the next instance.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { releaseAnnouncementsEnabled, announceRelease } = await import("@/lib/releases-server");
  if (releaseAnnouncementsEnabled()) void announceRelease().catch(() => console.error(JSON.stringify({ event: "release_announcement", result: "failed", code: "exception" })));
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // Request/error payloads often contain credentials or private content; log only safe metadata.
  console.error(JSON.stringify(requestErrorRecord(error, request.method, context.routePath, context.routeType)));
};
