import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { getSessionUser, signedOutPath } from "@/lib/auth";
import { getPublicEnv, getServerEnv, MissingEnvError } from "@/lib/env";
import { PLATFORM_ROLES, type PlatformRole, type VoiceRoom, type VoiceTelemetry } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's platform role, verified by the database for this request (never a client
 * claim). Anything unexpected — signed out, RPC missing before the migration — is a standard member.
 */
export const getPlatformRole = cache(async (): Promise<PlatformRole> => {
  const user = await getSessionUser();
  if (!user) return "member";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_platform_role");
  if (error || !PLATFORM_ROLES.includes(data as PlatformRole)) return "member";
  return data as PlatformRole;
});

/**
 * Server-side gate for every Control Center page: signed-out visitors go to /login, everyone who
 * isn't a super admin straight back to the workspace canvas — before any admin UI renders.
 */
export async function requireSuperAdmin(nextPath = "/admin") {
  const user = await getSessionUser();
  if (!user) redirect(signedOutPath(nextPath));
  if ((await getPlatformRole()) !== "super_admin") redirect("/tambayan");
  return { user };
}

/** Non-redirecting check for route handlers and Server Actions. */
export async function isSuperAdmin(): Promise<boolean> {
  return (await getPlatformRole()) === "super_admin";
}

const LIVEKIT_TIMEOUT_MS = 2500;

function withTimeout<T>(p: Promise<T>, ms = LIVEKIT_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("LiveKit did not answer in time")), ms))]);
}

/**
 * Live LiveKit rooms and who is connected (identity = Supabase user id). Voice rooms are named after
 * their channel (`voice:<id>`), DM calls after the conversation (`dm:<id>`). Never throws: a missing
 * configuration or an unreachable server becomes `configured: false` / `error`.
 */
export async function listVoiceRooms(): Promise<VoiceTelemetry> {
  let client: RoomServiceClient;
  try {
    const { livekitApiKey, livekitApiSecret } = getServerEnv();
    const host = getPublicEnv().livekitUrl.replace(/^ws(s?):\/\//, "http$1://");
    client = new RoomServiceClient(host, livekitApiKey, livekitApiSecret);
  } catch (err) {
    if (err instanceof MissingEnvError) return { configured: false, error: null, rooms: [] };
    throw err;
  }
  try {
    const rooms = await withTimeout(client.listRooms());
    const detailed = await Promise.all(
      rooms.map(async (room): Promise<VoiceRoom> => {
        const [prefix, id] = room.name.split(":");
        const participants = await withTimeout(client.listParticipants(room.name)).catch(() => []);
        return {
          room: room.name,
          kind: prefix === "voice" ? "voice" : prefix === "dm" ? "dm" : "other",
          channelId: prefix === "voice" ? (id ?? null) : null,
          label: prefix === "dm" ? "Direct call" : room.name,
          participants: participants.map((p) => {
            const live = (source: TrackSource) => p.tracks.some((t) => t.source === source && !t.muted);
            return {
              identity: p.identity,
              name: p.name || p.identity,
              joinedAt: p.joinedAt ? new Date(Number(p.joinedAt) * 1000).toISOString() : null,
              micLive: live(TrackSource.MICROPHONE),
              camera: live(TrackSource.CAMERA),
              screen: live(TrackSource.SCREEN_SHARE),
            };
          }),
        };
      }),
    );
    return { configured: true, error: null, rooms: detailed };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : "LiveKit is unreachable", rooms: [] };
  }
}
