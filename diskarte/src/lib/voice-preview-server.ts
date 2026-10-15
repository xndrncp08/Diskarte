import "server-only";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { z } from "zod";
import { getPublicEnv, getServerEnv } from "./env";
import { voiceRoomName } from "./livekit";
import type { ServerSupabase } from "./supabase/server";
import type { VoicePreview } from "./voice-preview";

async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("VOICE_UNAVAILABLE")), 5000); })]); }
  finally { clearTimeout(timer); }
}
/** Only room names authorized by the caller's RLS query ever reach LiveKit. No voice token is minted. */
export async function getVoicePreview(db: ServerSupabase, serverId: string, verified = true) : Promise<VoicePreview> {
  const { data: channels, error } = await db.from("channels").select("id,name,requires_verification").eq("server_id", serverId).eq("type", "voice").order("position").limit(201);
  if (error) throw error;
  const { livekitApiKey, livekitApiSecret } = getServerEnv();
  const client = new RoomServiceClient(getPublicEnv().livekitUrl.replace(/^ws/, "http"), livekitApiKey, livekitApiSecret, { requestTimeout: 5 });
  const visible = (channels ?? []).slice(0, 200).filter((channel) => verified || !channel.requires_verification);
  if (!visible.length) return { channels: [], limited: false };
  const rooms = await bounded(client.listRooms(visible.map((channel) => voiceRoomName(channel.id))));
  // Room summary counts can lag a join. Ask existing rooms for their authoritative participants.
  const active = visible.filter((channel) => rooms.some((room) => room.name === voiceRoomName(channel.id)))
    .sort((a,b) => Number(!!rooms.find((room) => room.name === voiceRoomName(b.id))?.numParticipants) - Number(!!rooms.find((room) => room.name === voiceRoomName(a.id))?.numParticipants));
  const found: VoicePreview["channels"] = [];
  // Bound server fan-out and avatar work while retaining full participant counts per shown room.
  for (let start = 0; start < Math.min(active.length, 30); start += 4) {
    const batch = await Promise.all(active.slice(start, Math.min(start + 4, 30)).map(async (channel) => {
      const live = await bounded(client.listParticipants(voiceRoomName(channel.id)));
      const unique = [...new Map(live.filter((p) => z.uuid().safeParse(p.identity).success).map((p) => [p.identity, p])).values()];
      const members = new Set<string>();
      for (let offset = 0; offset < unique.length; offset += 100) {
        const result = await db.from("members").select("user_id").eq("server_id", serverId).in("user_id", unique.slice(offset, offset + 100).map((p) => p.identity));
        if (result.error) throw result.error;
        result.data?.forEach((member) => members.add(member.user_id));
      }
      const peers = unique.filter((p) => members.has(p.identity));
      const showing = peers.slice(0, 8);
      const streams = peers.filter((p) => p.tracks.some((track) => track.source === TrackSource.SCREEN_SHARE && !track.muted)).slice(0, 8);
      const ids = [...new Set([...showing, ...streams].map((p) => p.identity))];
      const profiles = ids.length ? await db.from("profiles").select("id,username,display_name,avatar_url,avatar_preset,banner_url,banner_preset,bio,status,custom_status,custom_status_emoji").in("id", ids) : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const byId = new Map(profiles.data?.map((profile) => [profile.id, profile]));
      return { id: channel.id, name: channel.name, count: peers.length,
        participants: showing.flatMap((peer) => { const profile = byId.get(peer.identity); return profile ? [{ id: peer.identity, profile, muted: !peer.tracks.some((track) => track.source === TrackSource.MICROPHONE && !track.muted), screen: streams.some((stream) => stream.identity === peer.identity) }] : []; }),
        streamers: streams.flatMap((peer) => { const profile = byId.get(peer.identity); return profile ? [{ id: peer.identity, name: profile.display_name }] : []; }),
      };
    }));
    found.push(...batch.filter((channel) => channel.count > 0));
  }
  // Recheck visible channel IDs after slow upstream requests; do not return a revoked room's data.
  const allowed = await db.from("channels").select("id,requires_verification").eq("server_id", serverId).eq("type", "voice");
  if (allowed.error) throw allowed.error;
  const visibleIds = new Set(allowed.data?.filter((channel) => verified || !channel.requires_verification).map((channel) => channel.id));
  return { channels: found.filter((channel) => visibleIds.has(channel.id)), limited: active.length > 30 || (channels?.length ?? 0) > 200 };
}
